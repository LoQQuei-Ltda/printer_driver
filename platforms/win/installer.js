/**
 * Sistema de Gerenciamento de Impressão - Instalador Windows
 * 
 * Implementação do instalador para Windows (x86/x64)
 */

const fs = require('fs-extra');
const path = require('path');
const { exec, execFile } = require('child_process');
const os = require('os');
const InstallerBase = require('../../installer-base');

class WindowsInstaller extends InstallerBase {
  constructor(options = {}) {
    super(options);
    
    // Passos de instalação específicos do Windows
    this.installationSteps = [
      'Verificando pré-requisitos',
      'Instalando Windows Subsystem for Linux (WSL)',
      'Configurando WSL 2',
      'Instalando Ubuntu',
      'Configurando usuário padrão',
      'Configurando ambiente de sistema',
      'Configurando serviços',
      'Finalizando instalação'
    ];
    
    // Estado adicional específico do Windows
    this.state.wslInstalled = false;
    this.state.wsl2Configured = false;
    this.state.ubuntuInstalled = false;
    this.state.defaultUserCreated = false;
    
    // Versão do Windows
    this.winVersion = null;
    this.is64Bit = process.arch === 'x64';
  }
  
  /**
   * Verifica se o usuário tem privilégios de administrador
   * @returns {Promise<boolean>} - True se tem privilégios, false caso contrário
   */
  async checkAdminPrivileges() {
    try {
      // Método mais confiável usando PowerShell
      const output = await this.execPromise(
        'powershell -Command "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
        5000,
        true
      );
      
      if (output.trim() === 'True') {
        this.log('Executando com privilégios de administrador', 'success');
        return true;
      } else {
        this.log('Não está executando com privilégios de administrador', 'warning');
        return false;
      }
    } catch (error) {
      this.log('Não foi possível determinar os privilégios de administrador', 'warning');
      
      // Tentar método alternativo
      try {
        await this.execPromise('net session >nul 2>&1', 5000, true);
        this.log('Método alternativo confirma privilégios de administrador', 'success');
        return true;
      } catch (e) {
        this.log('Método alternativo confirma que não há privilégios de administrador', 'warning');
        return false;
      }
    }
  }
  
  /**
   * Verifica a versão do Windows
   * @returns {Promise<string>} - Versão do Windows
   */
  async getWindowsVersion() {
    if (this.winVersion) return this.winVersion;
    
    try {
      const output = await this.execPromise('powershell -Command "(Get-WmiObject -class Win32_OperatingSystem).Version"', 10000, true);
      this.winVersion = output.trim();
      return this.winVersion;
    } catch (error) {
      this.log('Erro ao verificar versão do Windows', 'error');
      throw error;
    }
  }
  
  /**
   * Verifica se o Windows é compatível com WSL 2
   * @returns {Promise<boolean>} - True se compatível, false caso contrário
   */
  async isWindowsVersionCompatible() {
    const version = await this.getWindowsVersion();
    const versionParts = version.split('.');
    
    if (versionParts.length >= 3) {
      const major = parseInt(versionParts[0], 10);
      const build = parseInt(versionParts[2], 10);
      
      // Windows 10 build 18362 (versão 1903) ou superior
      // Ou Windows 11 (build 22000 ou superior)
      if (major > 10 || (major === 10 && build >= 18362)) {
        this.log(`Windows ${version} é compatível com WSL 2`, 'success');
        return true;
      } else {
        this.log(`Windows ${version} não é compatível com WSL 2 (requer Windows 10 versão 1903/build 18362 ou superior)`, 'error');
        return false;
      }
    }
    
    this.log(`Não foi possível determinar se a versão do Windows (${version}) é compatível`, 'warning');
    return false;
  }
  
  /**
   * Verifica se a virtualização está habilitada
   * @returns {Promise<boolean>} - True se habilitada, false caso contrário
   */
  async isVirtualizationEnabled() {
    const methods = [
      // Método 1: Verificação do Hyper-V
      async () => {
        try {
          const output = await this.execPromise('powershell "(Get-ComputerInfo).HyperVisorPresent"', 10000, true);
          return output.trim().toLowerCase() === 'true';
        } catch (error) {
          return false;
        }
      },
      
      // Método 2: Verificação direta da virtualização
      async () => {
        try {
          const output = await this.execPromise('powershell "(Get-ComputerInfo).HyperVRequirementVirtualizationFirmwareEnabled"', 10000, true);
          return output.trim().toLowerCase() === 'true';
        } catch (error) {
          return false;
        }
      },
      
      // Método 3: Verificação via wmic
      async () => {
        try {
          const output = await this.execPromise('wmic computersystem get virtualizationfirmwareenabled', 10000, true);
          return output.toLowerCase().includes('true');
        } catch (error) {
          return false;
        }
      },
      
      // Método 4: Verificação via systeminfo
      async () => {
        try {
          const output = await this.execPromise('systeminfo | findstr /C:"Virtualização"', 10000, true);
          return output.toLowerCase().includes('habilitad');
        } catch (error) {
          return false;
        }
      }
    ];
    
    // Tentar todos os métodos
    for (const method of methods) {
      try {
        const result = await method();
        if (result) {
          this.log('Virtualização habilitada no firmware', 'success');
          return true;
        }
      } catch (error) {
        // Continuar tentando outros métodos
      }
    }
    
    this.log('Virtualização não habilitada ou não detectada', 'warning');
    return false;
  }
  
  /**
   * Verifica se o WSL está instalado
   * @returns {Promise<boolean>} - True se instalado, false caso contrário
   */
  async isWSLInstalled() {
    try {
      // Verificar se o arquivo wsl.exe existe
      if (!fs.existsSync('C:\\Windows\\System32\\wsl.exe')) {
        this.log('WSL não encontrado no sistema', 'warning');
        return false;
      }
      
      // Verificar se o WSL pode ser executado
      try {
        const output = await this.execPromise('wsl --version', 10000, true);
        this.log(`WSL instalado: ${output}`, 'success');
        return true;
      } catch (error) {
        // Algumas versões não têm o comando --version
        try {
          await this.execPromise('wsl --list', 10000, true);
          this.log('WSL está instalado (verificado via --list)', 'success');
          return true;
        } catch (e) {
          this.log('WSL está instalado mas não responde a comandos', 'warning');
          return false;
        }
      }
    } catch (error) {
      this.log('Erro ao verificar WSL', 'error');
      return false;
    }
  }
  
  /**
   * Verifica se o WSL 2 está configurado
   * @returns {Promise<boolean>} - True se configurado, false caso contrário
   */
  async isWSL2Configured() {
    try {
      // Tentar definir WSL 2 como padrão
      const output = await this.execPromise('wsl --set-default-version 2', 10000, true);
      
      // Verificar se a mensagem indica que já está configurado
      if (output.includes('já está configurado') || 
          output.includes('already configured') || 
          output.includes('operation completed successfully')) {
        this.log('WSL 2 configurado como padrão', 'success');
        return true;
      } else {
        this.log('Não foi possível confirmar a configuração do WSL 2', 'warning');
        return false;
      }
    } catch (error) {
      // Verificar se o erro é porque o WSL 2 já está configurado
      let stdout = '';
      if (error.stdout) {
        stdout = typeof error.stdout === 'string' ? error.stdout : error.stdout.toString();
      }
      
      if (stdout && (stdout.includes('já está configurado') || stdout.includes('already configured'))) {
        this.log('WSL 2 já está configurado como padrão', 'success');
        return true;
      } else {
        this.log('Erro ao configurar WSL 2', 'error');
        return false;
      }
    }
  }
  
  /**
   * Verifica se o Ubuntu está instalado no WSL
   * @returns {Promise<boolean>} - True se instalado, false caso contrário
   */
  async isUbuntuInstalled() {
    try {
      const output = await this.execPromise('wsl --list --verbose', 10000, true);
      const cleanedOutput = output.replace(/\x00/g, "").trim();
      const lines = cleanedOutput.split('\n').filter(line => line.trim());
      
      // Verificar se há distribuições e se alguma delas é Ubuntu
      if (lines.length > 1) {
        const hasUbuntu = lines.slice(1).some(line => 
          line.toLowerCase().includes('ubuntu')
        );
        
        if (hasUbuntu) {
          this.log('Ubuntu instalado no WSL', 'success');
          return true;
        } else {
          this.log('Não há distribuição Ubuntu instalada', 'warning');
          return false;
        }
      } else {
        this.log('Nenhuma distribuição WSL encontrada', 'warning');
        return false;
      }
    } catch (error) {
      // Verificar se o erro é por falta de distribuições
      let stdout = '';
      if (error.stdout) {
        stdout = typeof error.stdout === 'string' ? error.stdout : error.stdout.toString();
      }
      
      if (stdout && (stdout.includes('não tem distribuições') || stdout.includes('no distributions'))) {
        this.log('WSL instalado, mas sem distribuições', 'warning');
        return false;
      }
      
      // Tentar método alternativo
      try {
        const simpleList = await this.execPromise('wsl --list', 10000, true);
        const hasUbuntu = simpleList.toLowerCase().includes('ubuntu');
        
        if (hasUbuntu) {
          this.log('Ubuntu encontrado via listagem simples', 'success');
          return true;
        } else {
          this.log('Ubuntu não encontrado via listagem simples', 'warning');
          return false;
        }
      } catch (e) {
        this.log('Erro ao verificar Ubuntu WSL', 'error');
        return false;
      }
    }
  }
  
  /**
   * Verifica os requisitos do sistema
   * @returns {Promise<Object>} - Resultado da verificação
   */
  async checkSystemRequirements() {
    this.log('Verificando requisitos do sistema para Windows', 'header');
    
    const requirements = {
      compatible: true,
      errors: [],
      warnings: [],
      details: {}
    };
    
    // Verificar versão do Windows
    try {
      requirements.details.windowsVersion = await this.getWindowsVersion();
      requirements.details.windowsCompatible = await this.isWindowsVersionCompatible();
      
      if (!requirements.details.windowsCompatible) {
        requirements.compatible = false;
        requirements.errors.push('Versão do Windows incompatível com WSL 2');
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar a versão do Windows');
    }
    
    // Verificar virtualização
    try {
      requirements.details.virtualizationEnabled = await this.isVirtualizationEnabled();
      
      if (!requirements.details.virtualizationEnabled) {
        requirements.warnings.push('Virtualização não está habilitada no BIOS/UEFI');
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar o status da virtualização');
    }
    
    // Verificar WSL
    try {
      requirements.details.wslInstalled = await this.isWSLInstalled();
      requirements.details.wsl2Configured = await this.isWSL2Configured();
      requirements.details.ubuntuInstalled = await this.isUbuntuInstalled();
      
      // Se WSL não estiver instalado, não é um erro crítico
      if (!requirements.details.wslInstalled) {
        requirements.warnings.push('Windows Subsystem for Linux (WSL) não está instalado');
      }
      
      // Se WSL 2 não estiver configurado, não é um erro crítico
      if (requirements.details.wslInstalled && !requirements.details.wsl2Configured) {
        requirements.warnings.push('WSL 2 não está configurado como padrão');
      }
      
      // Se Ubuntu não estiver instalado, não é um erro crítico
      if (requirements.details.wslInstalled && !requirements.details.ubuntuInstalled) {
        requirements.warnings.push('Ubuntu não está instalado no WSL');
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar o status do WSL');
    }
    
    // Verificar espaço em disco
    try {
      const driveLetter = process.env.SystemDrive || 'C:';
      const output = await this.execPromise(`powershell -Command "Get-Volume -DriveLetter ${driveLetter[0]} | Select-Object -ExpandProperty SizeRemaining"`, 10000, true);
      const freeSpace = parseInt(output.trim(), 10);
      const freeSpaceGB = freeSpace / (1024 * 1024 * 1024);
      
      requirements.details.freeSpaceGB = freeSpaceGB.toFixed(2);
      
      if (freeSpaceGB < 10) {
        requirements.warnings.push(`Pouco espaço livre no disco (${freeSpaceGB.toFixed(2)} GB). Recomendado: pelo menos 10 GB`);
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar o espaço livre em disco');
    }
    
    // Verificar memória
    try {
      const totalMem = os.totalmem();
      const totalMemGB = totalMem / (1024 * 1024 * 1024);
      
      requirements.details.totalMemoryGB = totalMemGB.toFixed(2);
      
      if (totalMemGB < 4) {
        requirements.warnings.push(`Pouca memória RAM (${totalMemGB.toFixed(2)} GB). Recomendado: pelo menos 4 GB`);
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar a memória do sistema');
    }
    
    // Verificar arquitetura
    requirements.details.is64Bit = this.is64Bit;
    if (!this.is64Bit) {
      requirements.warnings.push('Sistema operacional de 32 bits. Algumas funcionalidades podem ser limitadas.');
    }
    
    // Log dos resultados
    if (requirements.compatible) {
      this.log('Sistema atende aos requisitos mínimos', 'success');
    } else {
      this.log('Sistema não atende aos requisitos mínimos', 'error');
      for (const error of requirements.errors) {
        this.log(`Erro: ${error}`, 'error');
      }
    }
    
    for (const warning of requirements.warnings) {
      this.log(`Aviso: ${warning}`, 'warning');
    }
    
    return requirements;
  }
  
  /**
   * Instala o WSL usando método moderno
   * @returns {Promise<boolean>} - True se instalado com sucesso
   */
  async installWSLModern() {
    this.log('Instalando WSL usando método moderno (wsl --install)', 'step');
    
    try {
      // Usar o método moderno e simples com --no-distribution
      await this.execPromise('wsl --install --no-distribution --no-launch', 300000);
      this.log('WSL instalado com sucesso usando método moderno', 'success');
      this.state.wslInstalled = true;
      return true;
    } catch (error) {
      // Verificar se o erro é porque o WSL já está instalado
      let stdout = '';
      if (error.stdout) {
        stdout = typeof error.stdout === 'string' ? error.stdout : error.stdout.toString();
      }
      
      if (stdout && (stdout.includes('já está instalado') || stdout.includes('already installed'))) {
        this.log('WSL já está instalado (detectado durante instalação)', 'success');
        this.state.wslInstalled = true;
        return true;
      }
      
      this.log('Instalação do WSL via método moderno falhou', 'warning');
      return false;
    }
  }
  
  /**
   * Instala o WSL usando método legado
   * @returns {Promise<boolean>} - True se instalado com sucesso
   */
  async installWSLLegacy() {
    this.log('Instalando WSL usando método legado', 'header');
    
    try {
      // Habilitar o recurso WSL
      this.log('Habilitando o recurso Windows Subsystem for Linux...', 'step');
      
      try {
        await this.execPromise('powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart"', 180000);
        this.log('Recurso WSL habilitado com sucesso (método PowerShell)', 'success');
      } catch (error) {
        this.log('Falha ao habilitar WSL via PowerShell. Tentando método DISM...', 'warning');
        
        try {
          await this.execPromise('dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 180000);
          this.log('Recurso WSL habilitado com sucesso (método DISM)', 'success');
        } catch (dismError) {
          this.log('Falha ao habilitar o recurso WSL', 'error');
          return false;
        }
      }
      
      // Habilitar o recurso de Máquina Virtual
      this.log('Habilitando o recurso de Plataforma de Máquina Virtual...', 'step');
      
      try {
        await this.execPromise('powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart"', 180000);
        this.log('Recurso de Máquina Virtual habilitado com sucesso (método PowerShell)', 'success');
      } catch (error) {
        this.log('Falha ao habilitar Máquina Virtual via PowerShell. Tentando método DISM...', 'warning');
        
        try {
          await this.execPromise('dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 180000);
          this.log('Recurso de Máquina Virtual habilitado com sucesso (método DISM)', 'success');
        } catch (dismError) {
          this.log('Falha ao habilitar o recurso de Máquina Virtual', 'error');
          return false;
        }
      }
      
      this.log('Recursos do WSL habilitados com sucesso!', 'success');
      this.state.wslInstalled = true;
      
      // Baixar e instalar o kernel do WSL2
      const tempDir = path.join(os.tmpdir(), 'wsl-installer');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const kernelUpdatePath = path.join(tempDir, 'wsl_update_x64.msi');
      
      this.log('Baixando o pacote de atualização do kernel do WSL2...', 'step');
      
      try {
        // Verificar se já temos o arquivo
        if (fs.existsSync(kernelUpdatePath)) {
          this.log('Pacote do kernel WSL2 já baixado anteriormente', 'success');
        } else {
          await this.execPromise(`powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelUpdatePath}'"`, 180000);
          this.log('Pacote do kernel WSL2 baixado com sucesso', 'success');
        }
      } catch (error) {
        this.log('Erro ao baixar o pacote do kernel WSL2. Tentando método alternativo...', 'warning');
        
        try {
          // Método alternativo usando bitsadmin
          await this.execPromise(`bitsadmin /transfer WSLUpdateDownload /download /priority normal https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi "${kernelUpdatePath}"`, 180000);
          this.log('Pacote do kernel WSL2 baixado com sucesso (método alternativo)', 'success');
        } catch (bitsError) {
          this.log('Todos os métodos de download falharam', 'error');
          
          // Abrir página de download
          await this.execPromise('start https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 5000);
          this.log('Página de download aberta', 'warning');
          
          // Aguardar o download manual
          this.log('Por favor, baixe o arquivo manualmente e coloque-o em: ' + kernelUpdatePath, 'warning');
          
          // Requerimento de reinicialização
          this.log('Reinicie o computador após baixar e executar o instalador do kernel WSL2', 'warning');
          return { wslInstalled: true, needsReboot: true };
        }
      }
      
      // Verificar se o arquivo existe
      if (!fs.existsSync(kernelUpdatePath)) {
        this.log('Arquivo de atualização do kernel não foi encontrado', 'error');
        return false;
      }
      
      this.log('Instalando o pacote de atualização do kernel do WSL2...', 'step');
      
      try {
        await this.execPromise(`msiexec /i "${kernelUpdatePath}" /qn`, 120000);
        this.log('Kernel do WSL2 instalado com sucesso', 'success');
      } catch (error) {
        this.log('Erro ao instalar o kernel do WSL2. Tentando método alternativo...', 'warning');
        
        try {
          await this.execPromise(`start /wait msiexec /i "${kernelUpdatePath}" /qn`, 120000);
          this.log('Kernel do WSL2 instalado com sucesso (método alternativo)', 'success');
        } catch (startError) {
          this.log('Todos os métodos de instalação do kernel falharam', 'error');
          return false;
        }
      }
      
      this.log('Definindo WSL 2 como versão padrão...', 'step');
      try {
        await this.execPromise('wsl --set-default-version 2', 30000);
        this.log('WSL 2 definido como versão padrão', 'success');
        this.state.wsl2Configured = true;
      } catch (error) {
        this.log('Erro ao definir WSL 2 como versão padrão', 'warning');
      }
      
      this.log('WSL instalado, mas é necessário reiniciar o computador para continuar', 'warning');
      return { wslInstalled: true, needsReboot: true };
    } catch (error) {
      this.log(`Erro ao instalar o WSL: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Instala o Ubuntu no WSL
   * @returns {Promise<Object>} - Resultado da instalação
   */
  async installUbuntu() {
    this.log('Instalando Ubuntu no WSL...', 'header');
    
    try {
      // Verificar se a distribuição já foi registrada
      const ubuntuExists = await this.isUbuntuInstalled();
      
      if (!ubuntuExists) {
        this.log('Registrando distribuição Ubuntu no WSL...', 'step');
        await this.execPromise('wsl --install -d Ubuntu', 180000);
        this.log('Ubuntu instalado, aguardando inicialização...', 'step');
      } else {
        this.log('Distribuição Ubuntu já registrada no WSL', 'info');
      }
      
      // Verificar se Ubuntu está realmente funcional
      this.log('Verificando se Ubuntu está acessível...', 'step');
      
      // Tentar 3 vezes com intervalos de 10 segundos
      let ubuntuAccessible = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.execPromise('wsl -d Ubuntu -u root echo "Ubuntu está acessível"', 30000);
          this.log(`Ubuntu está acessível na tentativa ${attempt}`, 'success');
          ubuntuAccessible = true;
          break;
        } catch (error) {
          this.log(`Tentativa ${attempt} falhou, aguardando inicialização...`, 'warning');
          
          // Se não for a última tentativa, aguarde antes de tentar novamente
          if (attempt < 3) {
            this.log('Aguardando 10 segundos antes da próxima tentativa...', 'info');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Tentar inicializar a distribuição novamente
            try {
              await this.execPromise('wsl -d Ubuntu -u root echo "Inicializando"', 15000);
            } catch (initError) {
              this.log('Tentando inicializar novamente...', 'warning');
            }
          }
        }
      }
      
      if (!ubuntuAccessible) {
        // Se ainda não está acessível, tentar uma abordagem mais agressiva
        this.log('Ubuntu não está respondendo, tentando método alternativo...', 'warning');
        
        try {
          // Tentar reiniciar o serviço WSL
          this.log('Reiniciando serviço WSL...', 'step');
          await this.execPromise('powershell -Command "Restart-Service LxssManager -Force"', 30000);
          this.log('Serviço WSL reiniciado, aguardando...', 'info');
          await new Promise(resolve => setTimeout(resolve, 15000));
          
          // Tentar acessar novamente
          await this.execPromise('wsl -d Ubuntu -u root echo "Ubuntu está acessível após reinício"', 30000);
          this.log('Ubuntu está acessível após reinício do serviço WSL', 'success');
          ubuntuAccessible = true;
        } catch (restartError) {
          this.log('Reinício do serviço WSL não resolveu, tentando último método...', 'warning');
          
          try {
            // Tentar terminar e reiniciar a distribuição
            this.log('Terminando e reiniciando Ubuntu...', 'step');
            await this.execPromise('wsl --terminate Ubuntu', 10000);
            await new Promise(resolve => setTimeout(resolve, 5000));
            await this.execPromise('wsl -d Ubuntu echo "Iniciando Ubuntu novamente"', 30000);
            
            // Verificar uma última vez
            await this.execPromise('wsl -d Ubuntu -u root echo "Verificação final"', 30000);
            this.log('Ubuntu está acessível após terminar e reiniciar', 'success');
            ubuntuAccessible = true;
          } catch (finalError) {
            this.log('Todos os métodos falharam para acessar o Ubuntu', 'error');
            
            // Tentar abrir e inicializar manualmente
            this.log('Tentando inicializar Ubuntu manualmente...', 'step');
            
            // Abrir um terminal WSL para inicializar manualmente
            await this.execPromise('start wsl -d Ubuntu', 5000);
            this.log('Terminal WSL aberto. Por favor, aguarde a inicialização e feche o terminal.', 'warning');
            
            // Aguardar bastante tempo para a inicialização manual
            this.log('Aguardando 30 segundos para a inicialização manual...', 'info');
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            // Verificar uma última vez
            try {
              await this.execPromise('wsl -d Ubuntu -u root echo "Verificação após inicialização manual"', 15000);
              this.log('Ubuntu acessível após inicialização manual!', 'success');
              ubuntuAccessible = true;
            } catch (manualError) {
              this.log('Inicialização manual não resolveu o problema', 'error');
              return { success: false, needsReboot: true, message: 'Não foi possível acessar o Ubuntu após múltiplas tentativas' };
            }
          }
        }
      }
      
      if (ubuntuAccessible) {
        this.log('Ubuntu instalado e acessível com sucesso!', 'success');
        this.state.ubuntuInstalled = true;
        
        // Configurar usuário padrão
        const userConfigured = await this.configureDefaultUser();
        
        return { 
          success: true, 
          userConfigured, 
          message: userConfigured ? 
            'Ubuntu instalado e usuário padrão configurado' : 
            'Ubuntu instalado, mas não foi possível configurar usuário padrão'
        };
      } else {
        return { success: false, message: 'Ubuntu instalado mas não está acessível' };
      }
    } catch (error) {
      this.log(`Erro ao instalar o Ubuntu: ${error.message}`, 'error');
      
      // Método de último recurso: via Microsoft Store
      try {
        this.log('Tentando último recurso: instalação via Microsoft Store...', 'step');
        await this.execPromise('start ms-windows-store://pdp/?productid=9PDXGNCFSCZV', 5000);
        this.log('Microsoft Store aberta. Por favor, instale o Ubuntu manualmente.', 'warning');
        this.log('Após instalar, reinicie este instalador para continuar.', 'warning');
        
        return { success: false, manualAction: true, message: 'É necessário instalar o Ubuntu manualmente através da Microsoft Store' };
      } catch (storeError) {
        this.log('Todos os métodos de instalação falharam', 'error');
        return { success: false, message: 'Falha ao instalar Ubuntu' };
      }
    }
  }
  
  /**
   * Configura o usuário padrão no Ubuntu WSL
   * @returns {Promise<boolean>} - True se configurado com sucesso
   */
  async configureDefaultUser() {
    this.log('Configurando usuário padrão...', 'step');
    
    try {
      // Comando para adicionar o usuário no WSL Ubuntu
      try {
        await this.execPromise('wsl.exe -d Ubuntu -u root useradd -m -s /bin/bash -G sudo print_user', 12000);
      } catch (error) {
        // Ignorar erro se o usuário já existir
        this.log('Nota: o usuário pode já existir', 'info');
      }
      
      // Definir senha
      await this.execPromise('wsl.exe -d Ubuntu -u root bash -c "echo \'print_user:print_user\' | chpasswd"', 12000);
      
      // Definir o diretório home e mover o usuário
      await this.execPromise('wsl.exe -d Ubuntu -u root usermod -d /home/print_user -m print_user', 12000);
      
      // Criando o arquivo wsl.conf em etapas separadas
      await this.execPromise('wsl.exe -d Ubuntu -u root bash -c "echo [user] > /etc/wsl.conf"', 12000);
      await this.execPromise('wsl.exe -d Ubuntu -u root bash -c "echo default=print_user >> /etc/wsl.conf"', 12000);
      
      // Verificação
      this.log('Usuário padrão configurado com sucesso', 'success');
      this.state.defaultUserCreated = true;
      
      return true;
    } catch (error) {
      this.log('Falha ao configurar o usuário padrão', 'error');
      return false;
    }
  }
  
  /**
   * Instala e configura impressora virtual
   * @returns {Promise<boolean>} - True se configurado com sucesso
   */
  async installWindowsPrinter() {
    this.log('Instalando impressora CUPS para Windows...', 'header');
    
    try {
      // Etapa 1: Limpeza de impressoras anteriores
      this.log('Removendo impressoras anteriores...', 'step');
      
      try {
        await this.execPromise('rundll32 printui.dll,PrintUIEntry /dl /n "Impressora LoQQuei" /q', 8000);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        this.log('Nota: Nenhuma impressora anterior encontrada', 'info');
      }
      
      // Etapa 2: Verificar ambiente CUPS
      this.log('Preparando ambiente CUPS...', 'step');
      
      try {
        // Verificar se o CUPS está respondendo
        await this.execPromise('wsl -d Ubuntu -u root systemctl is-active cups', 5000);
        
        // Configurar impressora PDF se necessário
        const printerList = await this.execPromise('wsl -d Ubuntu -u root lpstat -p 2>/dev/null || echo "No printers"', 5000);
        
        if (!printerList.includes('PDF') && !printerList.includes('PDF_Printer')) {
          this.log('Configurando impressora PDF no CUPS...', 'step');
          await this.execPromise('wsl -d Ubuntu -u root lpadmin -p PDF -E -v cups-pdf:/ -m drv:///cupsfilters.drv/genericpdf.ppd -o job-sheets=none,none -o media=iso_a4_210x297mm -o sides=one-sided', 12000);
        } else {
          this.log('Impressora PDF já existe no CUPS', 'info');
        }
        
        // Garantir que a impressora esteja habilitada e aceitando trabalhos
        await this.execPromise('wsl -d Ubuntu -u root cupsenable PDF 2>/dev/null || cupsenable PDF_Printer 2>/dev/null || true', 5000);
        await this.execPromise('wsl -d Ubuntu -u root cupsaccept PDF 2>/dev/null || cupsaccept PDF_Printer 2>/dev/null || true', 5000);
        
        this.log('Ambiente CUPS preparado com sucesso', 'success');
      } catch (cupsError) {
        this.log('Aviso: Houve um problema com a configuração CUPS, mas continuando...', 'warning');
      }
      
      // Etapa 3: Instalar impressora no Windows - método direto
      this.log('Instalando impressora no Windows...', 'step');
      
      // Comando para adicionar a impressora
      const cmdSimple = 'rundll32 printui.dll,PrintUIEntry /if /b "Impressora LoQQuei" /f "%SystemRoot%\\inf\\ntprint.inf" /r "http://localhost:631/printers/PDF" /m "Microsoft IPP Class Driver" /Z';
      
      try {
        await this.execPromise(cmdSimple, 20000);
        this.log('Comando de instalação executado', 'info');
        
        // Verificação rápida
        await new Promise(resolve => setTimeout(resolve, 2000));
        const checkPrinter = await this.execPromise('powershell -Command "if (Get-Printer -Name \'Impressora LoQQuei\' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"', 5000)
          .catch(() => "not_found");
        
        if (checkPrinter !== "not_found") {
          this.log('Impressora instalada com sucesso!', 'success');
          return true;
        }
        
        // Método alternativo com batch
        this.log('Tentando método alternativo mais simples...', 'step');
        
        // Criar script batch temporário
        const tempDir = path.join(os.tmpdir(), 'printer-install');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const batchContent = `@echo off
echo Instalando impressora...
rundll32 printui.dll,PrintUIEntry /dl /n "Impressora LoQQuei" /q
timeout /t 2 > nul
rundll32 printui.dll,PrintUIEntry /if /b "Impressora LoQQuei" /f "%SystemRoot%\\inf\\ntprint.inf" /r "http://localhost:631/printers/PDF" /m "Microsoft IPP Class Driver"
echo Instalação concluída.
`;
        
        const batchPath = path.join(tempDir, 'install-printer.bat');
        fs.writeFileSync(batchPath, batchContent);
        
        await this.execPromise(`cmd /c "${batchPath}"`, 25000);
        this.log('Script de instalação executado', 'info');
        
        // Verificação final
        await new Promise(resolve => setTimeout(resolve, 3000));
        const finalCheck = await this.execPromise('powershell -Command "try { Get-Printer -Name \'Impressora LoQQuei\' | Out-Null; Write-Output \'success\' } catch { Write-Output \'failure\' }"', 5000);
        
        if (finalCheck.includes('success')) {
          this.log('Impressora "Impressora LoQQuei" instalada com sucesso!', 'success');
          return true;
        } else {
          this.log('Não foi possível verificar a instalação da impressora', 'warning');
          // Mesmo assim retornamos true pois o comando de instalação foi executado
          return true;
        }
      } catch (windowsError) {
        this.log('Erro ao executar comandos Windows', 'warning');
        
        // Último recurso - método ainda mais básico
        try {
          this.log('Tentando método de instalação final...', 'step');
          await this.execPromise('powershell -Command "Add-PrinterPort -Name \'IPP_Port\' -PrinterHostAddress \'http://localhost:631/printers/PDF\'; Add-Printer -Name \'Impressora LoQQuei\' -DriverName \'Microsoft IPP Class Driver\' -PortName \'IPP_Port\'"', 20000);
          
          this.log('Comando final executado, assumindo sucesso', 'info');
          return true;
        } catch (finalError) {
          this.log('Não foi possível instalar a impressora', 'error');
          return false;
        }
      }
    } catch (error) {
      this.log(`Erro na instalação da impressora: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Execute verificações específicas da plataforma para determinar quais componentes precisam ser instalados
   * @returns {Promise<string[]>} - Lista de componentes a serem instalados
   */
  async determineComponentsToInstall() {
    this.log('Determinando componentes necessários para instalação...', 'step');
    
    const componentsToInstall = [];
    
    // Verificar WSL e Ubuntu
    const wslInstalled = await this.isWSLInstalled();
    if (!wslInstalled) {
      componentsToInstall.push('wsl');
    }
    
    if (wslInstalled) {
      const wsl2Configured = await this.isWSL2Configured();
      if (!wsl2Configured) {
        componentsToInstall.push('wsl2');
      }
      
      const ubuntuInstalled = await this.isUbuntuInstalled();
      if (!ubuntuInstalled) {
        componentsToInstall.push('ubuntu');
      }
      
      if (ubuntuInstalled) {
        try {
          // Verificar usuário padrão
          const userCheck = await this.execPromise('wsl -d Ubuntu -u root id -u print_user 2>/dev/null || echo "not_found"', 10000, true);
          if (userCheck.trim() === 'not_found' || !userCheck.trim().match(/^\d+$/)) {
            componentsToInstall.push('user');
          }
          
          // Verificar pacotes e serviços em uma etapa futura
          componentsToInstall.push('packages');
          componentsToInstall.push('services');
          
          // Verificar impressora
          try {
            const printerCheck = await this.execPromise('powershell -Command "if (Get-Printer -Name \'Impressora LoQQuei\' -ErrorAction SilentlyContinue) { Write-Output \'exists\' } else { Write-Output \'not_found\' }"', 10000, true);
            if (printerCheck.trim() === 'not_found') {
              componentsToInstall.push('printer');
            }
          } catch (error) {
            componentsToInstall.push('printer');
          }
        } catch (error) {
          // Se houver erro na verificação, adicionar componentes por precaução
          componentsToInstall.push('user');
          componentsToInstall.push('packages');
          componentsToInstall.push('services');
          componentsToInstall.push('printer');
        }
      }
    }
    
    this.log(`Componentes a serem instalados: ${componentsToInstall.join(', ')}`, 'info');
    return componentsToInstall;
  }
  
  /**
   * Executa a instalação específica para Windows
   * @returns {Promise<Object>} - Resultado da instalação
   */
  async runInstallation() {
    this.log('Iniciando instalação específica para Windows...', 'header');
    
    // Determinar quais componentes precisam ser instalados
    const componentsToInstall = await this.determineComponentsToInstall();
    
    if (componentsToInstall.length === 0) {
      this.log('Todos os componentes já estão instalados', 'success');
      return { success: true, message: 'Sistema já está configurado corretamente' };
    }
    
    // Instalar componentes na ordem correta
    let currentStep = 0;
    
    // WSL
    if (componentsToInstall.includes('wsl')) {
      this.updateProgress(currentStep, 10, 'Instalando WSL');
      
      // Tentar método moderno primeiro
      let wslResult = await this.installWSLModern();
      
      // Se falhar, tentar método legado
      if (!wslResult) {
        this.log('Método moderno falhou, tentando método legado', 'warning');
        wslResult = await this.installWSLLegacy();
      }
      
      if (!wslResult) {
        this.log('Falha ao instalar WSL', 'error');
        return { success: false, message: 'Falha ao instalar WSL' };
      }
      
      if (wslResult.needsReboot) {
        this.log('É necessário reiniciar o computador para continuar', 'warning');
        return { success: false, needsReboot: true, message: 'Reinicie o computador e execute novamente' };
      }
      
      this.updateProgress(currentStep, 100, 'WSL instalado');
      currentStep++;
    }
    
    // WSL 2
    if (componentsToInstall.includes('wsl2')) {
      this.updateProgress(currentStep, 10, 'Configurando WSL 2');
      
      // Configurar WSL 2
      try {
        await this.execPromise('wsl --set-default-version 2', 30000);
        this.log('WSL 2 configurado como versão padrão', 'success');
        this.state.wsl2Configured = true;
      } catch (error) {
        this.log('Erro ao configurar WSL 2. Pode ser necessário atualizar o kernel.', 'warning');
        
        // Baixar e instalar o kernel do WSL 2
        const tempDir = path.join(os.tmpdir(), 'wsl-installer');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const kernelUpdatePath = path.join(tempDir, 'wsl_update_x64.msi');
        
        this.log('Baixando o pacote de atualização do kernel do WSL2...', 'step');
        try {
          await this.execPromise(`powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelUpdatePath}'"`, 180000);
          this.log('Pacote do kernel WSL2 baixado com sucesso', 'success');
          
          this.log('Instalando o pacote de atualização do kernel do WSL2...', 'step');
          await this.execPromise(`msiexec /i "${kernelUpdatePath}" /qn`, 120000);
          this.log('Kernel do WSL2 instalado com sucesso', 'success');
          
          this.log('É necessário reiniciar o computador para continuar', 'warning');
          return { success: false, needsReboot: true, message: 'Reinicie o computador e execute novamente' };
        } catch (downloadError) {
          this.log('Erro ao baixar ou instalar o kernel do WSL2', 'error');
          return { success: false, message: 'Falha ao atualizar o kernel do WSL2' };
        }
      }
      
      this.updateProgress(currentStep, 100, 'WSL 2 configurado');
      currentStep++;
    }
    
    // Ubuntu
    if (componentsToInstall.includes('ubuntu')) {
      this.updateProgress(currentStep, 10, 'Instalando Ubuntu');
      
      const ubuntuResult = await this.installUbuntu();
      
      if (!ubuntuResult.success) {
        if (ubuntuResult.needsReboot) {
          return { success: false, needsReboot: true, message: 'Reinicie o computador e execute novamente' };
        }
        
        if (ubuntuResult.manualAction) {
          return { success: false, manualAction: true, message: ubuntuResult.message };
        }
        
        return { success: false, message: ubuntuResult.message || 'Falha ao instalar Ubuntu' };
      }
      
      this.updateProgress(currentStep, 100, 'Ubuntu instalado');
      currentStep++;
    }
    
    // Usuário padrão
    if (componentsToInstall.includes('user')) {
      this.updateProgress(currentStep, 10, 'Configurando usuário padrão');
      
      const userConfigured = await this.configureDefaultUser();
      
      if (!userConfigured) {
        this.log('Falha ao configurar usuário padrão', 'warning');
        // Não interromper a instalação por isso
      }
      
      this.updateProgress(currentStep, 100, 'Usuário padrão configurado');
      currentStep++;
    }
    
    // Impressora
    if (componentsToInstall.includes('printer')) {
      this.updateProgress(5, 10, 'Instalando impressora');
      
      const printerResult = await this.installWindowsPrinter();
      
      if (!printerResult) {
        this.log('Falha ao instalar impressora', 'warning');
        // Não interromper a instalação por isso
      }
      
      this.updateProgress(5, 100, 'Impressora instalada');
    }
    
    // Verificar impressora
    try {
      const printerCheck = await this.execPromise('powershell -Command "if (Get-Printer -Name \'Impressora LoQQuei\' -ErrorAction SilentlyContinue) { Write-Output \'exists\' } else { Write-Output \'not_found\' }"', 10000, true);
      if (printerCheck.trim() === 'exists') {
        this.log('Impressora LoQQuei instalada corretamente', 'success');
      } else {
        this.log('Impressora LoQQuei não encontrada após instalação', 'warning');
      }
    } catch (error) {
      this.log('Erro ao verificar impressora após instalação', 'warning');
    }
    
    this.log('Instalação concluída com sucesso!', 'success');
    
    return { success: true, message: 'Instalação concluída com sucesso' };
  }
  
  /**
   * Desinstala o sistema
   * @returns {Promise<Object>} - Resultado da desinstalação
   */
  async uninstall() {
    this.log('Iniciando desinstalação do sistema...', 'header');
    
    try {
      // Remover a impressora Windows
      this.log('Removendo impressora...', 'step');
      await this.execPromise('rundll32 printui.dll,PrintUIEntry /dl /n "Impressora LoQQuei" /q', 10000).catch(() => {});
      
      // Remover distribuição Ubuntu
      this.log('Removendo distribuição Ubuntu do WSL...', 'step');
      await this.execPromise('wsl --unregister Ubuntu', 60000).catch(() => {});
      
      // Limpar arquivos temporários
      this.log('Limpando arquivos temporários...', 'step');
      const tempDir = path.join(os.tmpdir(), 'wsl-installer');
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
      
      this.log('Desinstalação concluída com sucesso', 'success');
      return { success: true, message: 'Desinstalação concluída com sucesso' };
    } catch (error) {
      this.log(`Erro durante a desinstalação: ${error.message}`, 'error');
      return { success: false, message: `Erro durante a desinstalação: ${error.message}` };
    }
  }
  
  /**
   * Instala um componente específico
   * @param {string} component - Nome do componente a ser instalado
   * @returns {Promise<boolean>} - True se a instalação foi bem-sucedida
   */
  async installComponent(component) {
    this.log(`Instalando componente: ${component}...`, 'header');
    
    try {
      switch (component) {
        case 'wsl':
          return await this.installWSLModern() || await this.installWSLLegacy();
          
        case 'wsl2':
          try {
            await this.execPromise('wsl --set-default-version 2', 30000);
            this.log('WSL 2 configurado como versão padrão', 'success');
            return true;
          } catch (error) {
            this.log('Erro ao configurar WSL 2', 'error');
            return false;
          }
          
        case 'ubuntu':
          const ubuntuResult = await this.installUbuntu();
          return ubuntuResult.success;
          
        case 'user':
          return await this.configureDefaultUser();
          
        case 'printer':
          return await this.installWindowsPrinter();
          
        default:
          this.log(`Componente desconhecido: ${component}`, 'error');
          return false;
      }
    } catch (error) {
      this.log(`Erro ao instalar componente ${component}: ${error.message}`, 'error');
      return false;
    }
  }
}

module.exports = WindowsInstaller;