$ErrorActionPreference = 'SilentlyContinue'
$logFile = "$env:ProgramData\LoQQuei\WSL\permissions.log"

# Criar diretório de log
if (-not (Test-Path "$env:ProgramData\LoQQuei\WSL")) {
    New-Item -Path "$env:ProgramData\LoQQuei\WSL" -ItemType Directory -Force | Out-Null
}

# Função para registrar log
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File -Append -FilePath $logFile
    Write-Host $Message
}

Write-Log "Iniciando configuração global do WSL"

# 1. Configurar serviço WSL para iniciar automaticamente
Write-Log "Configurando serviço LxssManager"
sc.exe config LxssManager type= own | Out-Null
sc.exe config LxssManager start= auto | Out-Null
sc.exe sdset LxssManager "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BU)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;WD)" | Out-Null

# 2. Configurar variáveis de ambiente
Write-Log "Configurando variáveis de ambiente"
[System.Environment]::SetEnvironmentVariable("WSL_DISABLE_ADMIN_CHECK", "1", "Machine")
[System.Environment]::SetEnvironmentVariable("WSL_IGNORE_PERMISSION_ERRORS", "1", "Machine")

# 3. Configurar registro para acesso global
Write-Log "Configurando registro para acesso global"
New-Item -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Subsystem for Linux" -Force | Out-Null
New-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Subsystem for Linux" -Name "AllowNonAdminAccess" -Value 1 -PropertyType DWord -Force | Out-Null

# 4. Conceder permissões extremas aos binários do WSL
Write-Log "Concedendo permissões aos binários do WSL"
$wslFiles = @("C:\Windows\System32\wsl.exe", "C:\Windows\System32\wslapi.dll", "C:\Windows\System32\wslhost.exe", "C:\Windows\System32\wslservice.dll")

foreach ($file in $wslFiles) {
    if (Test-Path $file) {
        Write-Log "Configurando $file"
        takeown.exe /f $file | Out-Null
        icacls.exe $file /grant Everyone:F | Out-Null
    }
}

# 5. Encontrar e configurar permissões para todas as instalações do Ubuntu
Write-Log "Procurando instalações do Ubuntu em todos os perfis"
foreach ($user in Get-ChildItem 'C:\Users') {
    $ubuntuDirs = Get-ChildItem (Join-Path $user.FullName 'AppData\Local\Packages\*Ubuntu*') -Directory -ErrorAction SilentlyContinue
    
    foreach ($dir in $ubuntuDirs) {
        Write-Log "Encontrado Ubuntu em: $($dir.FullName)"
        
        # Dar permissões extremas
        Write-Log "Concedendo permissões para $($dir.FullName)"
        takeown.exe /f $dir.FullName /r /d y | Out-Null
        icacls.exe $dir.FullName /grant Everyone:(OI)(CI)F /T /C | Out-Null
        icacls.exe $dir.FullName /grant *S-1-5-32-545:(OI)(CI)F /T /C | Out-Null
    }
}

# 6. Criar arquivos de inicialização automática
Write-Log "Criando script de inicialização automática"
$startupDir = "$env:ProgramData\LoQQuei\WSL"
$startupScript = @"
@echo off
REM Script para iniciar WSL/Ubuntu em qualquer perfil de usuário
echo %date% %time% - Iniciando WSL/Ubuntu >> "$startupDir\startup.log"

REM Iniciar WSL - Método direto
start /b wsl -d Ubuntu

REM Aguardar inicialização
timeout /t 15 /nobreak > nul

REM Executar script de serviços
wsl -d Ubuntu -e bash -c "if [ -f /opt/loqquei/print_server_desktop/start-services.sh ]; then sudo -n /opt/loqquei/print_server_desktop/start-services.sh; fi"

echo %date% %time% - WSL/Ubuntu iniciado >> "$startupDir\startup.log"
exit 0
"@

# Salvar script
$startupBatPath = "$startupDir\wsl-startup.bat"
Set-Content -Path $startupBatPath -Value $startupScript -Encoding ASCII

# Criar versão VBS para execução silenciosa
$vbsScript = @"
' Script para iniciar o WSL sem mostrar janelas
Option Explicit
Dim WshShell, fso, logFile

Set fso = CreateObject("Scripting.FileSystemObject")
logFile = "$($startupDir -replace '\\', '\\')\\vbs_log.txt"

On Error Resume Next
Set logFile = fso.OpenTextFile(logFile, 8, True, 0)
If Err.Number = 0 Then
    logFile.WriteLine Now & " - Iniciando script de inicialização do WSL"
    logFile.Close
End If

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""$($startupBatPath -replace '\\', '\\')""", 0, False

Set WshShell = Nothing
Set fso = Nothing
"@

# Salvar VBS
$vbsPath = "$startupDir\wsl-startup-hidden.vbs"
Set-Content -Path $vbsPath -Value $vbsScript -Encoding ASCII

# 7. Adicionar script à inicialização do Windows
Write-Log "Adicionando script à inicialização do sistema"
New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" -Name "LoQQuei_WSL_Startup" -Value "wscript.exe `"$vbsPath`"" -PropertyType String -Force | Out-Null

# 8. Adicionar à pasta de inicialização comum
$commonStartupDir = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp"
if (Test-Path $commonStartupDir) {
    Copy-Item -Path $vbsPath -Destination "$commonStartupDir\LoQQuei_WSL_Startup.vbs" -Force
    Write-Log "Script adicionado à pasta de inicialização comum"
}

# 9. Criar tarefa agendada para maior confiabilidade
Write-Log "Criando tarefa agendada para inicialização do WSL"
$taskAction = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`""
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Unregister-ScheduledTask -TaskName "LoQQueiWSLStartup" -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName "LoQQueiWSLStartup" -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Description "Inicia o WSL/Ubuntu para o sistema LoQQuei"

# 10. Reiniciar serviço WSL para aplicar configurações
Write-Log "Reiniciando serviço WSL"
net stop LxssManager
net start LxssManager

# 11. Testar inicialização do WSL imediatamente
Write-Log "Testando inicialização do WSL"
Start-Process -FilePath "wsl.exe" -ArgumentList "-d Ubuntu" -NoNewWindow

Write-Log "Configuração global do WSL concluída com sucesso!"