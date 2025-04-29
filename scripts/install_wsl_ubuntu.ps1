# Script de instalação do WSL e Ubuntu para o LoQQuei PrintManagement
# Este script deve ser executado com privilégios de administrador
param(
    [switch]$NonInteractive
)

# Função para registrar log
function Write-Log {
    param(
        [string]$Message,
        [string]$LogFile = "$env:TEMP\wsl_install_log.txt"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File -Append -FilePath $LogFile
    Write-Host $Message
}

# Função para solicitações interativas (com fallback para não-interativo)
function Ask-Question {
    param (
        [string]$Question,
        [string]$Default = "S"
    )
    
    if ($NonInteractive) {
        Write-Log "Modo não-interativo: Respondendo '$Default' automaticamente para: $Question"
        return $Default
    } else {
        $answer = Read-Host -Prompt $Question
        if ([string]::IsNullOrWhiteSpace($answer)) {
            return $Default
        }
        return $answer
    }
}

# Criar um job para executar em segundo plano e não bloquear o instalador
$backgroundJob = Start-Job -ScriptBlock {
    param($NonInteractive)
    
    # Função local para log no job
    function Job-Log {
        param(
            [string]$Message,
            [string]$LogFile = "$env:TEMP\wsl_install_job_log.txt"
        )
        
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        "$timestamp - $Message" | Out-File -Append -FilePath $LogFile
    }
    
    # Função para simular Ask-Question no job
    function Job-Ask {
        param (
            [string]$Question,
            [string]$Default = "S"
        )
        
        Job-Log "Pergunta: $Question (Resposta automática: $Default)"
        return $Default
    }
    
    Job-Log "Iniciando job de instalação do WSL e Ubuntu..."
    
    # Verificar se o script está sendo executado como administrador
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Job-Log "ERRO: Este script deve ser executado como administrador."
        return
    }
    
    # Verificar se a virtualização está habilitada
    Job-Log "Verificando se a virtualização está habilitada..."
    try {
        $virtualizationEnabled = (Get-ComputerInfo -Property HyperVRequirementVirtualizationFirmwareEnabled).HyperVRequirementVirtualizationFirmwareEnabled
        
        if (-not $virtualizationEnabled) {
            Job-Log "AVISO: A virtualização parece não estar habilitada na BIOS/UEFI do seu computador."
            Job-Log "O WSL2 requer que a virtualização esteja habilitada para funcionar corretamente."
            Job-Log "Recomendamos que você reinicie o computador, entre na BIOS/UEFI e habilite a virtualização."
            
            # No modo não-interativo, sempre prosseguir
            $proceed = Job-Ask -Question "Deseja continuar mesmo assim? (S/N)" -Default "S"
            if ($proceed -ne "S") {
                Job-Log "Instalação do WSL cancelada pelo usuário."
                return
            }
        }
    } catch {
        Job-Log "Erro ao verificar virtualização: $_"
        Job-Log "Continuando com a instalação mesmo assim..."
    }
    
    # Verificar e instalar WSL
    Job-Log "Verificando se o WSL já está instalado..."
    $wslInstalled = $false
    
    try {
        $wslResult = wsl --status 2>&1
        if (-not $LASTEXITCODE) {
            $wslInstalled = $true
            Job-Log "WSL já está instalado no sistema."
        }
    }
    catch {
        $wslInstalled = $false
        Job-Log "WSL não encontrado: $_"
    }
    
    if (-not $wslInstalled) {
        Job-Log "Instalando WSL..."
        try {
            # Habilitar o recurso opcional WSL
            Job-Log "Habilitando recurso do Windows: Microsoft-Windows-Subsystem-Linux"
            dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
            
            # Habilitar o recurso de Máquina Virtual
            Job-Log "Habilitando recurso do Windows: VirtualMachinePlatform"
            dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
            
            # Instalar o WSL usando o comando wsl --install
            Job-Log "Executando instalação do WSL..."
            wsl --install --no-distribution
            
            # Verificar se a instalação foi bem-sucedida
            if ($LASTEXITCODE -ne 0) {
                throw "Falha ao instalar o WSL. Código de saída: $LASTEXITCODE"
            }
            
            Job-Log "WSL instalado com sucesso."
        }
        catch {
            Job-Log "ERRO ao instalar o WSL: $_"
            Job-Log "Tentando continuar mesmo assim..."
        }
    }
    
    # Configurar o WSL2 como padrão
    Job-Log "Configurando WSL2 como padrão..."
    try {
        wsl --set-default-version 2
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao configurar WSL2 como padrão. Código de saída: $LASTEXITCODE"
        }
        Job-Log "WSL2 configurado como padrão."
    }
    catch {
        Job-Log "ERRO ao configurar WSL2: $_"
        Job-Log "Tentando continuar mesmo assim..."
    }
    
    # Verificar e instalar o Ubuntu
    Job-Log "Verificando se o Ubuntu já está instalado..."
    $ubuntuInstalled = $false
    
    try {
        $distributions = wsl --list
        if ($distributions -match "Ubuntu") {
            $ubuntuInstalled = $true
            Job-Log "Ubuntu já está instalado no WSL."
        }
    }
    catch {
        $ubuntuInstalled = $false
        Job-Log "Erro ao verificar distribuições WSL: $_"
    }
    
    if (-not $ubuntuInstalled) {
        Job-Log "Instalando Ubuntu..."
        try {
            # Instalar o Ubuntu
            wsl --install -d Ubuntu
            
            # Verificar se a instalação foi bem-sucedida
            if ($LASTEXITCODE -ne 0) {
                throw "Falha ao instalar o Ubuntu. Código de saída: $LASTEXITCODE"
            }
            
            Job-Log "Ubuntu instalado com sucesso."
            Job-Log "Aguardando inicialização do Ubuntu..."
            Start-Sleep -Seconds 10
        }
        catch {
            Job-Log "ERRO ao instalar o Ubuntu: $_"
            Job-Log "A instalação pode estar incompleta."
        }
    }
    
    # Verificar a instalação do CUPS no Ubuntu
    Job-Log "Verificando e instalando o CUPS no Ubuntu..."
    try {
        $cupsCheckCmd = 'wsl -d Ubuntu -u root bash -c "dpkg -l | grep cups || echo \"not-installed\""'
        $cupsCheck = Invoke-Expression $cupsCheckCmd
        
        if ($cupsCheck -match "not-installed") {
            Job-Log "CUPS não encontrado, instalando..."
            
            # Atualizar repositórios
            Job-Log "Atualizando repositórios do Ubuntu..."
            wsl -d Ubuntu -u root bash -c "apt update -y"
            
            # Instalar CUPS
            Job-Log "Instalando o CUPS..."
            wsl -d Ubuntu -u root bash -c "DEBIAN_FRONTEND=noninteractive apt install -y cups"
            
            # Habilitar o serviço CUPS
            Job-Log "Habilitando o serviço CUPS..."
            wsl -d Ubuntu -u root bash -c "systemctl enable cups || true"
            
            # Configurar o CUPS para aceitar conexões da rede
            Job-Log "Configurando o CUPS para aceitar conexões da rede..."
            wsl -d Ubuntu -u root bash -c "sed -i 's/Listen localhost:631/Listen 0.0.0.0:631/' /etc/cups/cupsd.conf || true"
            
            # Reiniciar o serviço CUPS
            Job-Log "Reiniciando o serviço CUPS..."
            wsl -d Ubuntu -u root bash -c "systemctl restart cups || service cups restart || true"
            
            Job-Log "CUPS instalado e configurado com sucesso."
        }
        else {
            Job-Log "CUPS já está instalado no Ubuntu."
        }
    }
    catch {
        Job-Log "ERRO ao verificar/instalar o CUPS: $_"
        Job-Log "A aplicação pode precisar instalar o CUPS manualmente."
    }
    
    # Configuração concluída
    Job-Log "Instalação e configuração do WSL e Ubuntu concluídas com sucesso."
    Job-Log "O sistema de gerenciamento de impressão agora pode usar o CUPS através do WSL."
    
    # Criar um arquivo de sinalização para indicar que a instalação foi concluída
    $InstallDoneFile = Join-Path $env:ProgramFiles "LoQQuei\PrintManagement\wsl_installed.txt"
    "Instalação do WSL e Ubuntu concluída em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $InstallDoneFile -Force
    
    # Registrar saída do log
    $logContent = Get-Content -Path "$env:TEMP\wsl_install_job_log.txt" -ErrorAction SilentlyContinue
    if ($logContent) {
        $logContent | Out-File -FilePath "$env:ProgramFiles\LoQQuei\PrintManagement\wsl_install_log.txt" -Force
    }
    
    if (-not $NonInteractive) {
        Job-Log "ATENÇÃO: Lembre-se de reiniciar o computador antes de usar o sistema de gerenciamento de impressão."
    }
    
    # Finalizado
    Job-Log "Job de instalação concluído."
} -ArgumentList $NonInteractive

# Iniciar processo de instalação
Write-Log "Iniciando processo de instalação de WSL em segundo plano..."
Write-Log "A instalação continuará mesmo depois que o instalador concluir."
Write-Log "Registros serão salvos em $env:TEMP\wsl_install_log.txt e $env:TEMP\wsl_install_job_log.txt"

# Aguardar até 10 segundos pelo job para iniciar realmente
$timeout = New-TimeSpan -Seconds 10
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

while ($backgroundJob.State -eq "NotStarted" -and $stopwatch.Elapsed -lt $timeout) {
    Start-Sleep -Milliseconds 100
}

if ($backgroundJob.State -eq "NotStarted") {
    Write-Log "AVISO: Job demorou muito para iniciar. O instalador prosseguirá, mas o job pode estar com problemas."
} else {
    Write-Log "Job iniciado com sucesso. Estado: $($backgroundJob.State)"
}

# Sair sem aguardar a conclusão do job - isso permite que o instalador continue
Write-Log "Script principal concluído. A instalação continuará em segundo plano."
exit 0