# Script de instalação do WSL e Ubuntu para o LoQQuei PrintManagement
# Este script deve ser executado com privilégios de administrador

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

# Iniciar processo de instalação
Write-Log "Iniciando instalação do WSL e Ubuntu..."

# Verificar se o script está sendo executado como administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Log "ERRO: Este script deve ser executado como administrador."
    exit 1
}

# Verificar se a virtualização está habilitada
Write-Log "Verificando se a virtualização está habilitada..."
$virtualizationEnabled = (Get-ComputerInfo -Property HyperVRequirementVirtualizationFirmwareEnabled).HyperVRequirementVirtualizationFirmwareEnabled

if (-not $virtualizationEnabled) {
    Write-Log "AVISO: A virtualização parece não estar habilitada na BIOS/UEFI do seu computador."
    Write-Log "O WSL2 requer que a virtualização esteja habilitada para funcionar corretamente."
    Write-Log "Recomendamos que você reinicie o computador, entre na BIOS/UEFI e habilite a virtualização antes de continuar."
    
    $proceed = Read-Host "Deseja continuar mesmo assim? (S/N)"
    if ($proceed -ne "S") {
        Write-Log "Instalação do WSL cancelada pelo usuário."
        exit 0
    }
}

# Verificar e instalar WSL
Write-Log "Verificando se o WSL já está instalado..."
$wslInstalled = $false

try {
    $wslVersion = wsl --status 2>$null
    if ($LASTEXITCODE -eq 0) {
        $wslInstalled = $true
        Write-Log "WSL já está instalado no sistema."
    }
}
catch {
    $wslInstalled = $false
}

if (-not $wslInstalled) {
    Write-Log "Instalando WSL..."
    try {
        # Habilitar o recurso opcional WSL
        Write-Log "Habilitando recurso do Windows: Microsoft-Windows-Subsystem-Linux"
        dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
        
        # Habilitar o recurso de Máquina Virtual
        Write-Log "Habilitando recurso do Windows: VirtualMachinePlatform"
        dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
        
        # Instalar o WSL usando o comando wsl --install
        Write-Log "Executando instalação do WSL..."
        wsl --install --no-distribution
        
        # Verificar se a instalação foi bem-sucedida
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao instalar o WSL. Código de saída: $LASTEXITCODE"
        }
        
        Write-Log "WSL instalado com sucesso."
    }
    catch {
        Write-Log "ERRO ao instalar o WSL: $_"
        exit 1
    }
}

# Configurar o WSL2 como padrão
Write-Log "Configurando WSL2 como padrão..."
try {
    wsl --set-default-version 2
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao configurar WSL2 como padrão. Código de saída: $LASTEXITCODE"
    }
    Write-Log "WSL2 configurado como padrão."
}
catch {
    Write-Log "ERRO ao configurar WSL2: $_"
    exit 1
}

# Verificar e instalar o Ubuntu
Write-Log "Verificando se o Ubuntu já está instalado..."
$ubuntuInstalled = $false

try {
    $distributions = wsl --list
    if ($distributions -match "Ubuntu") {
        $ubuntuInstalled = $true
        Write-Log "Ubuntu já está instalado no WSL."
    }
}
catch {
    $ubuntuInstalled = $false
}

if (-not $ubuntuInstalled) {
    Write-Log "Instalando Ubuntu..."
    try {
        # Instalar o Ubuntu
        wsl --install -d Ubuntu
        
        # Verificar se a instalação foi bem-sucedida
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao instalar o Ubuntu. Código de saída: $LASTEXITCODE"
        }
        
        Write-Log "Ubuntu instalado com sucesso."
    }
    catch {
        Write-Log "ERRO ao instalar o Ubuntu: $_"
        exit 1
    }
}

# Verificar a instalação do CUPS no Ubuntu
Write-Log "Verificando e instalando o CUPS no Ubuntu..."
try {
    $cupsCheckCmd = 'wsl -d Ubuntu -u root bash -c "dpkg -l | grep cups || echo \"not-installed\""'
    $cupsCheck = Invoke-Expression $cupsCheckCmd
    
    if ($cupsCheck -match "not-installed") {
        Write-Log "CUPS não encontrado, instalando..."
        
        # Atualizar repositórios
        Write-Log "Atualizando repositórios do Ubuntu..."
        wsl -d Ubuntu -u root bash -c "apt update -y"
        
        # Instalar CUPS
        Write-Log "Instalando o CUPS..."
        wsl -d Ubuntu -u root bash -c "DEBIAN_FRONTEND=noninteractive apt install -y cups"
        
        # Habilitar o serviço CUPS
        Write-Log "Habilitando o serviço CUPS..."
        wsl -d Ubuntu -u root bash -c "systemctl enable cups"
        
        # Configurar o CUPS para aceitar conexões da rede
        Write-Log "Configurando o CUPS para aceitar conexões da rede..."
        wsl -d Ubuntu -u root bash -c "sed -i 's/Listen localhost:631/Listen 0.0.0.0:631/' /etc/cups/cupsd.conf"
        
        # Reiniciar o serviço CUPS
        Write-Log "Reiniciando o serviço CUPS..."
        wsl -d Ubuntu -u root bash -c "systemctl restart cups || service cups restart"
        
        Write-Log "CUPS instalado e configurado com sucesso."
    }
    else {
        Write-Log "CUPS já está instalado no Ubuntu."
    }
}
catch {
    Write-Log "ERRO ao verificar/instalar o CUPS: $_"
    Write-Log "A aplicação pode precisar instalar o CUPS manualmente."
}

# Configuração concluída
Write-Log "Instalação e configuração do WSL e Ubuntu concluídas com sucesso."
Write-Log "O sistema de gerenciamento de impressão agora pode usar o CUPS através do WSL."

# Criar um arquivo de sinalização para indicar que a instalação foi concluída
$InstallDoneFile = Join-Path $env:ProgramFiles "LoQQuei\PrintManagement\wsl_installed.txt"
"Instalação do WSL e Ubuntu concluída em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $InstallDoneFile

# Registrar saída do log
$logContent = Get-Content -Path "$env:TEMP\wsl_install_log.txt" -ErrorAction SilentlyContinue
if ($logContent) {
    $logContent | Out-File -FilePath "$env:ProgramFiles\LoQQuei\PrintManagement\wsl_install_log.txt" -Force
}

# Reiniciar o computador é necessário após a instalação do WSL
$restart = Read-Host "A instalação do WSL e Ubuntu foi concluída. É necessário reiniciar o computador para finalizar a configuração. Deseja reiniciar agora? (S/N)"
if ($restart -eq "S") {
    Restart-Computer -Force
}
else {
    Write-Log "ATENÇÃO: Lembre-se de reiniciar o computador antes de usar o sistema de gerenciamento de impressão."
    Write-Host "ATENÇÃO: Lembre-se de reiniciar o computador antes de usar o sistema de gerenciamento de impressão." -ForegroundColor Yellow
    Read-Host "Pressione Enter para fechar"
}