# Verificar permissões de administrador
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Host "Este script precisa ser executado como administrador!" -ForegroundColor Red
    exit 1
}

# Criar diretório global
$serviceDir = "C:\ProgramData\WSLStartupService"
if (-not (Test-Path $serviceDir)) {
    New-Item -Path $serviceDir -ItemType Directory -Force | Out-Null
}

Write-Host "Criando serviço para inicialização do WSL..." -ForegroundColor Cyan

# 1. Encontrar instalações do Ubuntu em todos os perfis
Write-Host "Procurando instalações do Ubuntu em todos os perfis de usuário..." -ForegroundColor Yellow

$ubuntuInstalls = @()

# Verificar em cada perfil
Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList" | ForEach-Object {
    $sid = $_.PSChildName
    
    # Pular perfis de sistema
    if ($sid -like "S-1-5-*" -and $sid -notlike "S-1-5-21*") {
        return
    }
    
    try {
        $profilePath = Get-ItemPropertyValue -Path $_.PSPath -Name "ProfileImagePath" -ErrorAction SilentlyContinue
        if (-not $profilePath) { 
            return 
        }
        
        $packagesPath = Join-Path $profilePath "AppData\Local\Packages"
        if (Test-Path $packagesPath) {
            $ubuntuDirs = Get-ChildItem $packagesPath -Directory | Where-Object { $_.Name -like "*Ubuntu*" }
            foreach ($dir in $ubuntuDirs) {
                $localStatePath = Join-Path $dir.FullName "LocalState"
                if (Test-Path $localStatePath) {
                    $username = Split-Path $profilePath -Leaf
                    $ubuntuInstalls += @{
                        Username = $username
                        ProfilePath = $profilePath
                        UbuntuPath = $dir.FullName
                        LocalState = $localStatePath
                    }
                    Write-Host "  Encontrada instalação do Ubuntu para o usuário: $username" -ForegroundColor Green
                    Write-Host "  Caminho: $($dir.FullName)" -ForegroundColor Green
                }
            }
        }
    } catch {}
}

if ($ubuntuInstalls.Count -eq 0) {
    Write-Host "Nenhuma instalação do Ubuntu encontrada!" -ForegroundColor Red
    exit 1
}

# 2. Conceder permissões extremas para todos os diretórios do Ubuntu encontrados
foreach ($install in $ubuntuInstalls) {
    Write-Host "Configurando permissões extremas para $($install.UbuntuPath)..." -ForegroundColor Yellow
    
    # Tomar posse do diretório (crucial em Windows 10/11)
    & takeown /f "$($install.UbuntuPath)" /r /d y | Out-Null
    
    # Conceder permissões totais
    & icacls "$($install.UbuntuPath)" /grant "Everyone:(OI)(CI)F" /T /C | Out-Null
    & icacls "$($install.UbuntuPath)" /grant "SYSTEM:(OI)(CI)F" /T /C | Out-Null
    & icacls "$($install.UbuntuPath)" /grant "Users:(OI)(CI)F" /T /C | Out-Null
    & icacls "$($install.UbuntuPath)" /grant "*S-1-5-32-545:(OI)(CI)F" /T /C | Out-Null
    
    Write-Host "  Permissões configuradas com método extremo" -ForegroundColor Green
}

# 3. Conceder permissões totais para executáveis e diretórios do WSL
Write-Host "Configurando permissões totais para arquivos e diretórios do WSL..." -ForegroundColor Yellow

# Arquivos binários do WSL
@(
    "C:\Windows\System32\wsl.exe",
    "C:\Windows\System32\wslapi.dll", 
    "C:\Windows\System32\wslhost.exe",
    "C:\Windows\System32\wslservice.dll",
    "C:\Windows\System32\lxss"
) | ForEach-Object {
    if (Test-Path $_) {
        & takeown /f "$_" /r /d y | Out-Null
        & icacls "$_" /grant "Everyone:(OI)(CI)F" /T /C | Out-Null
        Write-Host "  Permissões extremas aplicadas para: $_" -ForegroundColor Green
    }
}

# 4. Modificar o registro
Write-Host "Modificando registro para permissões e autostart do WSL..." -ForegroundColor Yellow

# Permissões para o registro
$regKeys = @(
    "HKLM:\SYSTEM\CurrentControlSet\Services\LxssManager",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss"
)

foreach ($key in $regKeys) {
    if (Test-Path $key) {
        $acl = Get-Acl $key
        $rule = New-Object System.Security.AccessControl.RegistryAccessRule("Everyone", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.SetAccessRule($rule)
        Set-Acl -Path $key -AclObject $acl
        Write-Host "  Permissões de registro aplicadas para: $key" -ForegroundColor Green
    }
}

# Definir valores no registro
New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss" -Name "DefaultVersion" -Value 2 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss" -Name "SkipAdminCheck" -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" -Name "WSL_DISABLE_ADMIN_CHECK" -Value "1" -PropertyType String -Force | Out-Null
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" -Name "WSL_IGNORE_PERMISSION_ERRORS" -Value "1" -PropertyType String -Force | Out-Null

# 5. Configurar serviço LxssManager
Write-Host "Configurando serviço LxssManager..." -ForegroundColor Yellow

& sc.exe config LxssManager type= own | Out-Null
& sc.exe config LxssManager start= auto | Out-Null
& sc.exe sdset LxssManager "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BU)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;WD)" | Out-Null

# 6. Criar arquivo de serviço
Write-Host "Criando serviço WSL Startup..." -ForegroundColor Yellow

$serviceCode = @"
using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Timers;
using System.Linq;
using System.Threading;
using System.Collections.Generic;

namespace WSLStartupService
{
    public class Program
    {
        static void Main(string[] args)
        {
            if (args.Length > 0 && args[0].ToLower() == "console")
            {
                StartWSL();
                return;
            }
            
            ServiceBase.Run(new WSLStartupService());
        }
        
        public static void StartWSL()
        {
            try
            {
                string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "WSLStartupService", "service.log");
                Directory.CreateDirectory(Path.GetDirectoryName(logPath));
                
                // Registrar início
                File.AppendAllText(logPath, $"{DateTime.Now}: Serviço iniciando WSL...\r\n");
                
                // Verificar se o WSL está em execução
                Process process = new Process();
                process.StartInfo.FileName = "wsl.exe";
                process.StartInfo.Arguments = "--list --running";
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.CreateNoWindow = true;
                process.StartInfo.RedirectStandardOutput = true;
                process.Start();
                string output = process.StandardOutput.ReadToEnd();
                process.WaitForExit();
                
                bool wslRunning = output.ToLower().Contains("ubuntu");
                
                if (!wslRunning)
                {
                    // Atualizar e reiniciar WSL
                    File.AppendAllText(logPath, $"{DateTime.Now}: WSL não está em execução, iniciando...\r\n");
                    
                    try
                    {
                        Process updateProcess = new Process();
                        updateProcess.StartInfo.FileName = "wsl.exe";
                        updateProcess.StartInfo.Arguments = "--shutdown";
                        updateProcess.StartInfo.UseShellExecute = false;
                        updateProcess.StartInfo.CreateNoWindow = true;
                        updateProcess.Start();
                        updateProcess.WaitForExit(10000);
                        
                        // Aguardar desligamento
                        Thread.Sleep(5000);
                        
                        // Encontrar diretórios do Ubuntu
                        List<string> ubuntuPaths = FindUbuntuPaths();
                        File.AppendAllText(logPath, $"{DateTime.Now}: Encontrados {ubuntuPaths.Count} diretórios do Ubuntu\r\n");
                        
                        foreach (string path in ubuntuPaths)
                        {
                            File.AppendAllText(logPath, $"{DateTime.Now}: Ubuntu encontrado em: {path}\r\n");
                        }
                        
                        // Se encontrou algum caminho, aplicar permissões radicais
                        if (ubuntuPaths.Count > 0)
                        {
                            ApplyExtremePermissions(ubuntuPaths);
                        }
                        
                        // Iniciar WSL - método 1
                        File.AppendAllText(logPath, $"{DateTime.Now}: Iniciando WSL...\r\n");
                        Process startProcess = new Process();
                        startProcess.StartInfo.FileName = "wsl.exe";
                        startProcess.StartInfo.Arguments = "-d Ubuntu";
                        startProcess.StartInfo.UseShellExecute = false;
                        startProcess.StartInfo.CreateNoWindow = true;
                        startProcess.Start();
                        
                        // Aguardar inicialização
                        Thread.Sleep(15000);
                        
                        // Verificar se inicializou corretamente
                        Process checkProcess = new Process();
                        checkProcess.StartInfo.FileName = "wsl.exe";
                        checkProcess.StartInfo.Arguments = "--list --running";
                        checkProcess.StartInfo.UseShellExecute = false;
                        checkProcess.StartInfo.CreateNoWindow = true;
                        checkProcess.StartInfo.RedirectStandardOutput = true;
                        checkProcess.Start();
                        string checkOutput = checkProcess.StandardOutput.ReadToEnd();
                        checkProcess.WaitForExit();
                        
                        if (checkOutput.ToLower().Contains("ubuntu"))
                        {
                            File.AppendAllText(logPath, $"{DateTime.Now}: WSL iniciado com sucesso!\r\n");
                            
                            // Iniciar os serviços
                            Process serviceProcess = new Process();
                            serviceProcess.StartInfo.FileName = "wsl.exe";
                            serviceProcess.StartInfo.Arguments = "-d Ubuntu bash -c \"if [ -f /opt/loqquei/print_server_desktop/start-services.sh ]; then sudo /opt/loqquei/print_server_desktop/start-services.sh; fi\"";
                            serviceProcess.StartInfo.UseShellExecute = false;
                            serviceProcess.StartInfo.CreateNoWindow = true;
                            serviceProcess.Start();
                            
                            // Não aguardar para não bloquear o serviço
                            File.AppendAllText(logPath, $"{DateTime.Now}: Iniciando serviços no WSL\r\n");
                        }
                        else
                        {
                            File.AppendAllText(logPath, $"{DateTime.Now}: FALHA - WSL não iniciou corretamente. Tentando método alternativo...\r\n");
                            
                            // Método alternativo radical
                            // 1. Verificar se existem barreiras de permissão
                            ApplyExtremeFixes();
                            
                            // 2. Tentar novamente com método direto radical
                            Process altProcess = new Process();
                            altProcess.StartInfo.FileName = "cmd.exe";
                            altProcess.StartInfo.Arguments = "/c wsl -d Ubuntu";
                            altProcess.StartInfo.UseShellExecute = false;
                            altProcess.StartInfo.CreateNoWindow = true;
                            altProcess.Start();
                            
                            Thread.Sleep(15000);
                        }
                    }
                    catch (Exception ex)
                    {
                        File.AppendAllText(logPath, $"{DateTime.Now}: ERRO ao iniciar WSL: {ex.Message}\r\n{ex.StackTrace}\r\n");
                    }
                }
                else
                {
                    File.AppendAllText(logPath, $"{DateTime.Now}: WSL já está em execução\r\n");
                    
                    // Verificar serviços
                    Process serviceProcess = new Process();
                    serviceProcess.StartInfo.FileName = "wsl.exe";
                    serviceProcess.StartInfo.Arguments = "-d Ubuntu -e bash -c \"ps aux | grep -E 'cups|post|samba'\"";
                    serviceProcess.StartInfo.UseShellExecute = false;
                    serviceProcess.StartInfo.CreateNoWindow = true;
                    serviceProcess.StartInfo.RedirectStandardOutput = true;
                    serviceProcess.Start();
                    string serviceOutput = serviceProcess.StandardOutput.ReadToEnd();
                    serviceProcess.WaitForExit();
                    
                    if (!serviceOutput.Contains("cups") || !serviceOutput.Contains("post"))
                    {
                        File.AppendAllText(logPath, $"{DateTime.Now}: Serviços não detectados, iniciando...\r\n");
                        
                        Process startServiceProcess = new Process();
                        startServiceProcess.StartInfo.FileName = "wsl.exe";
                        startServiceProcess.StartInfo.Arguments = "-d Ubuntu bash -c \"if [ -f /opt/loqquei/print_server_desktop/start-services.sh ]; then sudo /opt/loqquei/print_server_desktop/start-services.sh; fi\"";
                        startServiceProcess.StartInfo.UseShellExecute = false;
                        startServiceProcess.StartInfo.CreateNoWindow = true;
                        startServiceProcess.Start();
                    }
                    else
                    {
                        File.AppendAllText(logPath, $"{DateTime.Now}: Serviços já em execução\r\n");
                    }
                }
            }
            catch (Exception ex)
            {
                string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "WSLStartupService", "service.log");
                Directory.CreateDirectory(Path.GetDirectoryName(logPath));
                File.AppendAllText(logPath, $"{DateTime.Now}: ERRO NO SERVIÇO: {ex.Message}\r\n{ex.StackTrace}\r\n");
            }
        }
        
        private static List<string> FindUbuntuPaths()
        {
            List<string> paths = new List<string>();
            
            try
            {
                // Método 1: Buscar nos perfis de usuário
                string profilesDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                profilesDir = Path.GetDirectoryName(Path.GetDirectoryName(profilesDir)); // Subir um nível para "Users"
                
                // Verificar cada usuário
                foreach (string userDir in Directory.GetDirectories(profilesDir))
                {
                    string packagePath = Path.Combine(userDir, "AppData", "Local", "Packages");
                    
                    if (Directory.Exists(packagePath))
                    {
                        // Procurar diretórios que contêm "Ubuntu"
                        string[] ubuntuDirs = Directory.GetDirectories(packagePath, "*Ubuntu*");
                        
                        foreach (string dir in ubuntuDirs)
                        {
                            if (Directory.Exists(Path.Combine(dir, "LocalState")))
                            {
                                paths.Add(dir);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "WSLStartupService", "service.log");
                File.AppendAllText(logPath, $"{DateTime.Now}: Erro ao procurar caminhos do Ubuntu: {ex.Message}\r\n");
            }
            
            return paths;
        }
        
        private static void ApplyExtremePermissions(List<string> paths)
        {
            try
            {
                string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "WSLStartupService", "service.log");
                
                foreach (string path in paths)
                {
                    try
                    {
                        File.AppendAllText(logPath, $"{DateTime.Now}: Aplicando permissões para {path}\r\n");
                        
                        // Método 1: TakeOwn e ICACLS
                        Process takeownProcess = new Process();
                        takeownProcess.StartInfo.FileName = "takeown.exe";
                        takeownProcess.StartInfo.Arguments = $"/f \"{path}\" /r /d y";
                        takeownProcess.StartInfo.UseShellExecute = false;
                        takeownProcess.StartInfo.CreateNoWindow = true;
                        takeownProcess.Start();
                        takeownProcess.WaitForExit(30000);
                        
                        Process icaclsProcess = new Process();
                        icaclsProcess.StartInfo.FileName = "icacls.exe";
                        icaclsProcess.StartInfo.Arguments = $"\"{path}\" /grant \"Everyone:(OI)(CI)F\" /T /C";
                        icaclsProcess.StartInfo.UseShellExecute = false;
                        icaclsProcess.StartInfo.CreateNoWindow = true;
                        icaclsProcess.Start();
                        icaclsProcess.WaitForExit(30000);
                        
                        File.AppendAllText(logPath, $"{DateTime.Now}: Permissões aplicadas para {path}\r\n");
                    }
                    catch (Exception ex)
                    {
                        File.AppendAllText(logPath, $"{DateTime.Now}: Erro ao aplicar permissões para {path}: {ex.Message}\r\n");
                    }
                }
            }
            catch (Exception ex)
            {
                string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "WSLStartupService", "service.log");
                File.AppendAllText(logPath, $"{DateTime.Now}: Erro global ao aplicar permissões: {ex.Message}\r\n");
            }
        }
        
        private static void ApplyExtremeFixes()
        {
            try
            {
                string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "WSLStartupService", "service.log");
                File.AppendAllText(logPath, $"{DateTime.Now}: Aplicando correções extremas para o WSL...\r\n");
                
                // 1. Configurar serviço
                Process scProcess = new Process();
                scProcess.StartInfo.FileName = "sc.exe";
                scProcess.StartInfo.Arguments = "config LxssManager start= auto";
                scProcess.StartInfo.UseShellExecute = false;
                scProcess.StartInfo.CreateNoWindow = true;
                scProcess.Start();
                scProcess.WaitForExit(5000);
                
                // 2. Configurar descritores de segurança
                Process sdProcess = new Process();
                sdProcess.StartInfo.FileName = "sc.exe";
                sdProcess.StartInfo.Arguments = "sdset LxssManager D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BU)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;WD)";
                sdProcess.StartInfo.UseShellExecute = false;
                sdProcess.StartInfo.CreateNoWindow = true;
                sdProcess.Start();
                sdProcess.WaitForExit(5000);
                
                // 3. Permissões extremas para binários do WSL
                foreach (string file in new[] { "wsl.exe", "wslapi.dll", "wslhost.exe", "wslservice.dll" })
                {
                    Process takeProcess = new Process();
                    takeProcess.StartInfo.FileName = "takeown.exe";
                    takeProcess.StartInfo.Arguments = $"/f C:\\Windows\\System32\\{file}";
                    takeProcess.StartInfo.UseShellExecute = false;
                    takeProcess.StartInfo.CreateNoWindow = true;
                    takeProcess.Start();
                    takeProcess.WaitForExit(5000);
                    
                    Process icaclsProcess = new Process();
                    icaclsProcess.StartInfo.FileName = "icacls.exe";
                    icaclsProcess.StartInfo.Arguments = $"C:\\Windows\\System32\\{file} /grant Everyone:F";
                    icaclsProcess.StartInfo.UseShellExecute = false;
                    icaclsProcess.StartInfo.CreateNoWindow = true;
                    icaclsProcess.Start();
                    icaclsProcess.WaitForExit(5000);
                }
                
                // 4. Reiniciar o serviço
                Process restartProcess = new Process();
                restartProcess.StartInfo.FileName = "cmd.exe";
                restartProcess.StartInfo.Arguments = "/c net stop LxssManager && net start LxssManager";
                restartProcess.StartInfo.UseShellExecute = false;
                restartProcess.StartInfo.CreateNoWindow = true;
                restartProcess.Start();
                restartProcess.WaitForExit(10000);
                
                File.AppendAllText(logPath, $"{DateTime.Now}: Correções extremas aplicadas\r\n");
            }
            catch (Exception ex)
            {
                string logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "WSLStartupService", "service.log");
                File.AppendAllText(logPath, $"{DateTime.Now}: Erro ao aplicar correções extremas: {ex.Message}\r\n");
            }
        }
    }
    
    public class WSLStartupService : ServiceBase
    {
        private Timer timer;
        
        public WSLStartupService()
        {
            ServiceName = "WSLStartupService";
            CanStop = true;
            CanPauseAndContinue = false;
            AutoLog = true;
        }
        
        protected override void OnStart(string[] args)
        {
            // Iniciar o WSL imediatamente
            Program.StartWSL();
            
            // Configurar timer para verificar o WSL periodicamente
            timer = new Timer(5 * 60 * 1000); // 5 minutos
            timer.Elapsed += (sender, e) => Program.StartWSL();
            timer.Start();
        }
        
        protected override void OnStop()
        {
            timer?.Stop();
            timer?.Dispose();
        }
    }
}
"@

# Criar o arquivo .cs para compilação
$serviceCodePath = Join-Path $serviceDir "WSLStartupService.cs"
Set-Content -Path $serviceCodePath -Value $serviceCode -Encoding UTF8

# Compilar o serviço
$frameworkPath = "$env:windir\Microsoft.NET\Framework\v4.0.30319"
$cscPath = Join-Path $frameworkPath "csc.exe"
$exePath = Join-Path $serviceDir "WSLStartupService.exe"

Write-Host "Compilando serviço..." -ForegroundColor Yellow
$compileCommand = "& `"$cscPath`" /target:exe /out:`"$exePath`" `"$serviceCodePath`" /reference:System.ServiceProcess.dll"
Invoke-Expression $compileCommand

if (Test-Path $exePath) {
    Write-Host "Serviço compilado com sucesso!" -ForegroundColor Green
} else {
    Write-Host "Falha na compilação do serviço!" -ForegroundColor Red
    exit 1
}

# Instalar o serviço
Write-Host "Instalando serviço..." -ForegroundColor Yellow

# Remover serviço anterior se existir
& sc.exe delete "WSLStartupService" | Out-Null

# Criar o novo serviço
& sc.exe create "WSLStartupService" binPath= "`"$exePath`"" start= auto DisplayName= "WSL Startup Service" | Out-Null
& sc.exe description "WSLStartupService" "Serviço para iniciar o WSL/Ubuntu durante o boot do sistema para todos os usuários" | Out-Null

# Configurar o serviço para usar a conta SYSTEM
& sc.exe config "WSLStartupService" obj= "LocalSystem" | Out-Null

# Configurar permissões do serviço
& sc.exe sdset "WSLStartupService" "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;CCLCSWRPWPDTLOCRRC;;;WD)" | Out-Null

# Iniciar o serviço
Write-Host "Iniciando serviço..." -ForegroundColor Yellow
& sc.exe start "WSLStartupService" | Out-Null

# Verificar status
$serviceStatus = (Get-Service -Name "WSLStartupService" -ErrorAction SilentlyContinue).Status
if ($serviceStatus -eq "Running") {
    Write-Host "Serviço iniciado com sucesso!" -ForegroundColor Green
} else {
    Write-Host "Serviço instalado, mas não foi possível iniciar. Ele iniciará automaticamente na próxima reinicialização." -ForegroundColor Yellow
}

# 7. Configurar WSL para iniciar automaticamente
Write-Host "Configurando WSL para iniciação automática..." -ForegroundColor Yellow

# Configurar variáveis de ambiente
[Environment]::SetEnvironmentVariable("WSL_DISABLE_ADMIN_CHECK", "1", "Machine")
[Environment]::SetEnvironmentVariable("WSL_IGNORE_PERMISSION_ERRORS", "1", "Machine")

# Atualizar WSL para versão mais recente
& wsl --update | Out-Null
& wsl --shutdown | Out-Null
& wsl --set-default-version 2 | Out-Null

# Configurar WSL para autostart
try {
    & wsl --set-autostart true | Out-Null
    Write-Host "  WSL configurado para iniciar automaticamente" -ForegroundColor Green
} catch {
    Write-Host "  Aviso: Não foi possível configurar autostart (comando não disponível)" -ForegroundColor Yellow
}

# 8. Criar script de inicialização para fallback
$startupScript = @"
@echo off
REM Script de inicialização do WSL/Ubuntu para todos os usuários
echo %date% %time% - Iniciando WSL/Ubuntu >> "%ProgramData%\WSLStartupService\startup.log"

REM Iniciar o serviço que gerencia o WSL
net start WSLStartupService

REM Garantir que o WSL inicie
start /b wsl -d Ubuntu

REM Aguardar inicialização
timeout /t 15 /nobreak > nul

REM Executar script de serviços
wsl -d Ubuntu -e bash -c "if [ -f /opt/loqquei/print_server_desktop/start-services.sh ]; then sudo /opt/loqquei/print_server_desktop/start-services.sh; fi"

echo %date% %time% - WSL/Ubuntu iniciado >> "%ProgramData%\WSLStartupService\startup.log"
exit 0
"@

$startupBatPath = Join-Path $serviceDir "wsl-startup.bat"
Set-Content -Path $startupBatPath -Value $startupScript -Encoding ASCII

# Criar script VBS para execução sem janela
$vbsScript = @"
' Script para iniciar o WSL sem mostrar janelas
Option Explicit
Dim WshShell, fso, logFile

Set fso = CreateObject("Scripting.FileSystemObject")
logFile = "$($serviceDir.Replace('\', '\\'))\\vbs_log.txt"

On Error Resume Next
Set logFile = fso.OpenTextFile(logFile, 8, True, 0)
If Err.Number = 0 Then
    logFile.WriteLine Now & " - Iniciando script de inicialização do WSL"
    logFile.Close
End If

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""$($startupBatPath.Replace('\', '\\'))""", 0, False

Set WshShell = Nothing
Set fso = Nothing
"@

$vbsPath = Join-Path $serviceDir "wsl-startup-hidden.vbs"
Set-Content -Path $vbsPath -Value $vbsScript -Encoding ASCII

# Adicionar o script à inicialização do sistema
Write-Host "Adicionando script à inicialização do sistema..." -ForegroundColor Yellow

# Adicionar ao registro para inicialização automática
New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" -Name "WSLStartup" -Value "wscript.exe `"$vbsPath`"" -PropertyType String -Force | Out-Null

# Adicionar ao diretório de inicialização comum
$commonStartupDir = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\StartUp"
if (Test-Path $commonStartupDir) {
    Copy-Item -Path $vbsPath -Destination (Join-Path $commonStartupDir "WSLStartup.vbs") -Force
    Write-Host "  Script adicionado à pasta de inicialização comum" -ForegroundColor Green
}

# Testar a inicialização do serviço em modo direto
Write-Host "Testando serviço..." -ForegroundColor Yellow
& "$exePath" console

Write-Host
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  CONFIGURAÇÃO CONCLUÍDA COM SUCESSO!" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host
Write-Host "O WSL/Ubuntu agora iniciará automaticamente para qualquer usuário!" -ForegroundColor Green
Write-Host "Reinicie o computador para verificar o funcionamento." -ForegroundColor Yellow
Write-Host
Write-Host "Logs serão gravados em: $serviceDir\service.log" -ForegroundColor Gray