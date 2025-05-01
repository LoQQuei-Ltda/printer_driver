/**
 * Sistema de Gerenciamento de Impressão - Instalador macOS
 * 
 * Implementação do instalador para macOS
 */

const fs = require('fs-extra');
const path = require('path');
const { exec, execFile } = require('child_process');
const os = require('os');
const InstallerBase = require('../../installer-base');
const util = require('util');
const sudo = require('sudo-prompt');

const sudoExec = util.promisify((command, options, callback) => {
  sudo.exec(command, options, callback);
});

class MacInstaller extends InstallerBase {
  constructor(options = {}) {
    super(options);
    
    // Passos de instalação específicos do macOS
    this.installationSteps = [
      'Verificando pré-requisitos',
      'Verificando permissões',
      'Instalando Homebrew e dependências',
      'Configurando CUPS',
      'Configurando Samba',
      'Configurando PostgreSQL',
      'Configurando serviço',
      'Finalizando instalação'
    ];
    
    // Estado adicional específico do macOS
    this.state.homebrewInstalled = false;
    this.state.packagesInstalled = false;
    this.state.cupsConfigured = false;
    this.state.sambaConfigured = false;
    this.state.postgresConfigured = false;
    this.state.serviceConfigured = false;
    
    // Verificar arquitetura do macOS
    this.architecture = process.arch === 'arm64' ? 'arm64' : 'x64';
    this.isAppleSilicon = this.architecture === 'arm64';
  }
  
  /**
   * Verifica se o usuário tem privilégios de administrador
   * @returns {Promise<boolean>} True se tem privilégios, false caso contrário
   */
  async checkAdminPrivileges() {
    try {
      const output = await this.execPromise('id -u', 5000, true);
      const isRoot = output.trim() === '0';
      
      if (isRoot) {
        this.log('Executando com privilégios de administrador (root)', 'success');
        return true;
      } else {
        this.log('Não está executando com privilégios de administrador (root)', 'warning');
        
        try {
          // Verificar se o sudo está disponível e se o usuário pode usá-lo
          await this.execPromise('sudo -n true', 5000, true);
          this.log('Usuário tem permissão para usar sudo', 'success');
          return true;
        } catch (error) {
          this.log('Usuário não tem permissão para usar sudo sem senha', 'warning');
          return false;
        }
      }
    } catch (error) {
      this.log('Erro ao verificar privilégios', 'error');
      return false;
    }
  }
  
  /**
   * Executa um comando com privilégios elevados
   * @param {string} command Comando a ser executado
   * @param {number} timeout Tempo limite em milissegundos
   * @returns {Promise<string>} Resultado do comando
   */
  async execSudo(command, timeout = null) {
    const timeoutMs = timeout || this.options.timeouts.command;
    
    try {
      // Verificar se já estamos executando como root
      const isRoot = (await this.execPromise('id -u', 5000, true)).trim() === '0';
      
      if (isRoot) {
        return await this.execPromise(command, timeoutMs);
      } else {
        this.log(`Executando com sudo: ${command}`, 'step');
        
        // Usando sudo-prompt para interface gráfica quando necessário
        try {
          const options = {
            name: 'Sistema de Gerenciamento de Impressão'
          };
          
          return await sudoExec(command, options);
        } catch (sudoError) {
          // Tentar usar sudo diretamente com senha
          const sudoCommand = `sudo ${command}`;
          return await this.execPromise(sudoCommand, timeoutMs);
        }
      }
    } catch (error) {
      this.log(`Erro ao executar comando com privilégios elevados: ${error.message}`, 'error');
      throw error;
    }
  }
  
  /**
   * Verifica se o Homebrew está instalado
   * @returns {Promise<boolean>} True se instalado, false caso contrário 
   */
  async isHomebrewInstalled() {
    try {
      await this.execPromise('which brew', 5000, true);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Instala o Homebrew
   * @returns {Promise<boolean>} True se instalado com sucesso
   */
  async installHomebrew() {
    this.log('Instalando Homebrew...', 'step');
    
    try {
      // Script padrão de instalação do Homebrew
      const installCmd = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
      
      await this.execPromise(installCmd, 600000); // 10 minutos de timeout
      
      // Verificar o sucesso da instalação
      const homebrewPath = this.isAppleSilicon
        ? '/opt/homebrew/bin/brew'
        : '/usr/local/bin/brew';
      
      if (await fs.pathExists(homebrewPath)) {
        this.log('Homebrew instalado com sucesso', 'success');
        this.state.homebrewInstalled = true;
        
        // Configurar PATH para usar o Homebrew
        if (this.isAppleSilicon) {
          process.env.PATH = `/opt/homebrew/bin:${process.env.PATH}`;
        }
        
        return true;
      } else {
        this.log('Falha ao verificar a instalação do Homebrew', 'error');
        return false;
      }
    } catch (error) {
      this.log(`Erro ao instalar Homebrew: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Verifica os requisitos do sistema
   * @returns {Promise<Object>} Resultado da verificação
   */
  async checkSystemRequirements() {
    this.log('Verificando requisitos do sistema para macOS', 'header');
    
    const requirements = {
      compatible: true,
      errors: [],
      warnings: [],
      details: {}
    };
    
    // Verificar versão do macOS
    try {
      const macOsVersion = await this.execPromise('sw_vers -productVersion', 10000, true);
      requirements.details.macOsVersion = macOsVersion.trim();
      
      const versionParts = macOsVersion.trim().split('.');
      const majorVersion = parseInt(versionParts[0], 10);
      
      // Verificar se é pelo menos macOS 11 (Big Sur) ou superior
      if (majorVersion < 11) {
        requirements.warnings.push(`macOS ${macOsVersion.trim()} pode não ser totalmente compatível. Recomendado: macOS 11 (Big Sur) ou superior.`);
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar a versão do macOS.');
    }
    
    // Verificar arquitetura
    requirements.details.architecture = this.architecture;
    requirements.details.isAppleSilicon = this.isAppleSilicon;
    
    // Verificar espaço em disco
    try {
      const output = await this.execPromise('df -h / | tail -1 | awk \'{print $4}\'', 10000, true);
      const freeSpace = output.trim();
      
      requirements.details.freeSpace = freeSpace;
      
      // Se o espaço livre termina com "G" e o número for menor que 10, adicionar aviso
      if (freeSpace.endsWith('G') || freeSpace.endsWith('Gi')) {
        const sizeValue = parseFloat(freeSpace.replace(/G.*$/, ''));
        if (sizeValue < 10) {
          requirements.warnings.push(`Pouco espaço livre em disco (${freeSpace}). Recomendado: pelo menos 10G.`);
        }
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar o espaço livre em disco.');
    }
    
    // Verificar memória
    try {
      const totalMem = os.totalmem();
      const totalMemGB = totalMem / (1024 * 1024 * 1024);
      
      requirements.details.totalMemoryGB = totalMemGB.toFixed(2);
      
      if (totalMemGB < 4) {
        requirements.warnings.push(`Pouca memória RAM (${totalMemGB.toFixed(2)} GB). Recomendado: pelo menos 4 GB.`);
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar a memória do sistema.');
    }
    
    // Verificar Homebrew e permissões
    try {
      const homebrewInstalled = await this.isHomebrewInstalled();
      requirements.details.homebrewInstalled = homebrewInstalled;
      
      if (!homebrewInstalled) {
        requirements.warnings.push('Homebrew não está instalado. Será instalado durante o processo.');
      }
      
      // Verificar Rosetta 2 para Apple Silicon
      if (this.isAppleSilicon) {
        try {
          await this.execPromise('pgrep oahd', 5000, true);
          requirements.details.rosettaInstalled = true;
        } catch (error) {
          requirements.details.rosettaInstalled = false;
          requirements.warnings.push('Rosetta 2 não está instalado. Pode ser necessário para algumas dependências em Macs com Apple Silicon.');
        }
      }
    } catch (error) {
      requirements.warnings.push('Erro na verificação de componentes adicionais.');
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
   * Instala as dependências usando Homebrew
   * @returns {Promise<boolean>} True se instalado com sucesso
   */
  async installDependencies() {
    this.log('Instalando dependências com Homebrew...', 'step');
    
    // Verificar e instalar Homebrew se necessário
    if (!this.state.homebrewInstalled && !(await this.isHomebrewInstalled())) {
      const brewInstalled = await this.installHomebrew();
      
      if (!brewInstalled) {
        this.log('Falha ao instalar Homebrew', 'error');
        return false;
      }
    }
    
    // Atualizar Homebrew
    try {
      this.log('Atualizando Homebrew...', 'step');
      await this.execPromise('brew update', 300000);
    } catch (error) {
      this.log('Aviso: Erro ao atualizar Homebrew, continuando mesmo assim', 'warning');
    }
    
    // Lista de pacotes a serem instalados
    const packages = [
      'cups',
      'samba',
      'postgresql',
      'node'
    ];
    
    // Instalar cada pacote individualmente
    for (const pkg of packages) {
      this.log(`Instalando ${pkg}...`, 'step');
      
      try {
        // Verificar se o pacote já está instalado
        const isInstalled = await this.execPromise(`brew list ${pkg} 2>/dev/null || echo "not_installed"`, 10000, true);
        
        if (isInstalled.includes('not_installed')) {
          await this.execPromise(`brew install ${pkg}`, 600000);
          this.log(`${pkg} instalado com sucesso`, 'success');
        } else {
          this.log(`${pkg} já está instalado`, 'info');
        }
      } catch (error) {
        this.log(`Erro ao instalar ${pkg}, continuando com os demais...`, 'warning');
      }
    }
    
    // Verificar se todos os pacotes foram instalados
    let allPackagesInstalled = true;
    for (const pkg of packages) {
      try {
        const isInstalled = await this.execPromise(`brew list ${pkg} 2>/dev/null || echo "not_installed"`, 10000, true);
        
        if (isInstalled.includes('not_installed')) {
          this.log(`Pacote ${pkg} não foi instalado corretamente`, 'warning');
          allPackagesInstalled = false;
        }
      } catch (error) {
        this.log(`Erro ao verificar pacote ${pkg}`, 'warning');
        allPackagesInstalled = false;
      }
    }
    
    this.state.packagesInstalled = allPackagesInstalled;
    
    if (allPackagesInstalled) {
      this.log('Todas as dependências foram instaladas com sucesso', 'success');
    } else {
      this.log('Algumas dependências não foram instaladas corretamente', 'warning');
    }
    
    return true; // Continuar mesmo que alguns pacotes falhem
  }
  
  /**
   * Configura o serviço CUPS
   * @returns {Promise<boolean>} True se configurado com sucesso
   */
  async configureCups() {
    this.log('Configurando CUPS...', 'step');
    
    try {
      // No macOS, o CUPS já vem pré-instalado e configurado
      // Vamos apenas verificar se está em execução e adicionar configurações adicionais
      
      // Verificar se o CUPS está em execução
      const cupsStatus = await this.execPromise('sudo launchctl list org.cups.cupsd || echo "not_running"', 10000, true);
      
      if (cupsStatus.includes('not_running')) {
        this.log('CUPS não está em execução, iniciando...', 'info');
        await this.execSudo('launchctl load -w /System/Library/LaunchDaemons/org.cups.cupsd.plist', 30000);
      } else {
        this.log('CUPS já está em execução', 'success');
      }
      
      // Configurar o CUPS para permitir acesso remoto
      this.log('Configurando CUPS para acesso remoto...', 'step');
      
      // Criar um arquivo de configuração temporário
      const cupsdConfContent = `# Allow remote access to CUPS
ServerName localhost
Listen localhost:631
Listen /private/var/run/cupsd.sock

# Share local printers on the local network
Browsing On
BrowseLocalProtocols dnssd

<Location />
  Order allow,deny
  Allow all
</Location>

<Location /admin>
  Order allow,deny
  Allow localhost
  Allow 127.0.0.1
</Location>

DefaultAuthType Basic
WebInterface Yes
`;
      
      const tempCupsdPath = path.join(this.options.tempDir, 'cupsd.conf');
      await fs.writeFile(tempCupsdPath, cupsdConfContent, 'utf8');
      
      // No macOS, o arquivo de configuração do CUPS fica em /etc/cups/cupsd.conf
      // Fazer backup da configuração atual antes de substituir
      await this.execSudo('cp /etc/cups/cupsd.conf /etc/cups/cupsd.conf.backup', 10000);
      
      // Copiar a nova configuração
      await this.execSudo(`cp ${tempCupsdPath} /etc/cups/cupsd.conf`, 10000);
      await this.execSudo('chown root:admin /etc/cups/cupsd.conf', 10000);
      await this.execSudo('chmod 644 /etc/cups/cupsd.conf', 10000);
      
      // Reiniciar o CUPS para aplicar as alterações
      this.log('Reiniciando o CUPS...', 'step');
      await this.execSudo('launchctl unload /System/Library/LaunchDaemons/org.cups.cupsd.plist', 30000);
      await this.execSudo('launchctl load -w /System/Library/LaunchDaemons/org.cups.cupsd.plist', 30000);
      
      // Verificar se a impressora virtual já existe
      const printerList = await this.execPromise('lpstat -p 2>/dev/null || echo "no_printers"', 10000, true);
      
      if (!printerList.includes('PDF')) {
        this.log('Configurando impressora PDF...', 'step');
        
        try {
          // No macOS, podemos usar a impressora Save as PDF que já vem com o sistema
          // ou instalar CUPS-PDF via Homebrew
          const cupsPdfInstalled = await this.execPromise('brew list cups-pdf 2>/dev/null || echo "not_installed"', 10000, true);
          
          if (cupsPdfInstalled.includes('not_installed')) {
            await this.execPromise('brew install cups-pdf', 300000);
          }
          
          // Configurar a impressora PDF
          await this.execSudo('lpadmin -p PDF -E -v cups-pdf:/ -P /Library/Printers/PPDs/Contents/Resources/Generic.ppd', 30000);
          await this.execSudo('cupsenable PDF', 10000);
          await this.execSudo('cupsaccept PDF', 10000);
          this.log('Impressora PDF configurada com sucesso', 'success');
        } catch (pdfError) {
          this.log(`Erro ao configurar impressora PDF: ${pdfError.message}`, 'warning');
          
          // Tentar usar a impressora virtual do sistema como fallback
          try {
            await this.execSudo('lpadmin -p PDF -E -v CUPS-PDF:/ -m CUPS-PDF.ppd', 30000);
            this.log('Impressora PDF configurada usando o driver do sistema', 'success');
          } catch (systemPdfError) {
            this.log('Erro ao configurar impressora PDF usando o driver do sistema', 'warning');
          }
        }
      } else {
        this.log('Impressora PDF já está configurada', 'info');
      }
      
      this.state.cupsConfigured = true;
      this.log('CUPS configurado com sucesso', 'success');
      return true;
    } catch (error) {
      this.log(`Erro ao configurar CUPS: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Configura o Samba para compartilhamento de impressoras
   * @returns {Promise<boolean>} True se configurado com sucesso
   */
  async configureSamba() {
    this.log('Configurando Samba...', 'step');
    
    try {
      // Verificar se o Samba está instalado
      try {
        await this.execPromise('which smbd', 10000, true);
      } catch (error) {
        this.log('Samba não encontrado, instalando...', 'info');
        await this.execPromise('brew install samba', 600000);
      }
      
      // Criar diretório de compartilhamento
      await this.execSudo('mkdir -p /usr/local/var/print_server', 10000);
      await this.execSudo('chmod -R 0777 /usr/local/var/print_server', 10000);
      
      // Configuração do Samba
      const smbContent = `[global]
workgroup = WORKGROUP
server string = Print Server
security = user
map to guest = Bad User
printing = cups
printcap name = cups

[print_server]
path = /usr/local/var/print_server
public = yes
writable = yes
browseable = yes
guest ok = yes
`;
      
      // Criar arquivo temporário com a configuração
      const tempSmbPath = path.join(this.options.tempDir, 'smb.conf');
      await fs.writeFile(tempSmbPath, smbContent, 'utf8');
      
      // Copiar para o diretório de configuração do Samba
      const smbDir = this.isAppleSilicon
        ? '/opt/homebrew/etc/samba'
        : '/usr/local/etc/samba';
      
      await this.execSudo(`mkdir -p ${smbDir}`, 10000);
      await this.execSudo(`cp ${tempSmbPath} ${smbDir}/smb.conf`, 10000);
      
      // Iniciar/reiniciar o serviço Samba
      // No macOS, o Homebrew geralmente usa services para gerenciar serviços
      try {
        await this.execPromise('brew services restart samba', 60000);
      } catch (error) {
        this.log('Erro ao reiniciar serviço Samba via Homebrew, tentando método alternativo...', 'warning');
        
        // Método alternativo: usar launchctl diretamente
        const smbdPath = this.isAppleSilicon
          ? '/opt/homebrew/opt/samba/sbin/smbd'
          : '/usr/local/opt/samba/sbin/smbd';
        
        await this.execSudo(`${smbdPath} --configfile=${smbDir}/smb.conf`, 30000);
      }
      
      this.state.sambaConfigured = true;
      this.log('Samba configurado com sucesso', 'success');
      return true;
    } catch (error) {
      this.log(`Erro ao configurar Samba: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Configura o PostgreSQL
   * @returns {Promise<boolean>} True se configurado com sucesso
   */
  async configurePostgres() {
    this.log('Configurando PostgreSQL...', 'step');
    
    try {
      // Iniciar o serviço PostgreSQL
      try {
        await this.execPromise('brew services start postgresql', 60000);
        this.log('Serviço PostgreSQL iniciado', 'success');
      } catch (error) {
        this.log('Erro ao iniciar serviço PostgreSQL via Homebrew, tentando método alternativo...', 'warning');
        
        // Método alternativo: iniciar manualmente
        const pgBinPath = this.isAppleSilicon
          ? '/opt/homebrew/opt/postgresql/bin'
          : '/usr/local/opt/postgresql/bin';
        
        await this.execSudo(`${pgBinPath}/pg_ctl -D /usr/local/var/postgres start`, 60000);
      }
      
      // Aguardar um momento para o PostgreSQL inicializar completamente
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Criar usuário print_user se não existir
      const userExists = await this.execPromise('psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname=\'print_user\'" postgres || echo "not_found"', 15000, true).catch(() => 'not_found');
      
      if (userExists.includes('not_found')) {
        this.log('Criando usuário print_user...', 'step');
        await this.execPromise('psql -U postgres -c "CREATE USER print_user WITH PASSWORD \'print_user\'"', 15000, true);
        this.log('Usuário print_user criado', 'success');
      } else {
        this.log('Usuário print_user já existe', 'info');
      }
      
      // Conceder privilégios de superusuário
      await this.execPromise('psql -U postgres -c "ALTER USER print_user WITH SUPERUSER"', 15000, true);
      
      // Criar banco de dados print_server se não existir
      const dbExists = await this.execPromise('psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname=\'print_server\'" postgres || echo "not_found"', 15000, true).catch(() => 'not_found');
      
      if (dbExists.includes('not_found')) {
        this.log('Criando banco de dados print_server...', 'step');
        await this.execPromise('psql -U postgres -c "CREATE DATABASE print_server OWNER print_user"', 15000, true);
        this.log('Banco de dados print_server criado', 'success');
      } else {
        this.log('Banco de dados print_server já existe', 'info');
        // Garantir ownership correto
        await this.execPromise('psql -U postgres -c "ALTER DATABASE print_server OWNER TO print_user"', 15000, true);
      }
      
      // Conceder todos os privilégios
      await this.execPromise('psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE print_server TO print_user"', 15000, true);
      
      // Repetir o processo para print_management
      
      // Criar usuário postgres_print se não existir
      const userMigExists = await this.execPromise('psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname=\'postgres_print\'" postgres || echo "not_found"', 15000, true).catch(() => 'not_found');
      
      if (userMigExists.includes('not_found')) {
        this.log('Criando usuário postgres_print...', 'step');
        await this.execPromise('psql -U postgres -c "CREATE USER postgres_print WITH PASSWORD \'root_print\'"', 15000, true);
        this.log('Usuário postgres_print criado', 'success');
      } else {
        this.log('Usuário postgres_print já existe', 'info');
      }
      
      // Conceder privilégios de superusuário
      await this.execPromise('psql -U postgres -c "ALTER USER postgres_print WITH SUPERUSER"', 15000, true);
      
      // Criar banco de dados print_management se não existir
      const dbMigExists = await this.execPromise('psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname=\'print_management\'" postgres || echo "not_found"', 15000, true).catch(() => 'not_found');
      
      if (dbMigExists.includes('not_found')) {
        this.log('Criando banco de dados print_management...', 'step');
        await this.execPromise('psql -U postgres -c "CREATE DATABASE print_management OWNER postgres_print"', 15000, true);
        this.log('Banco de dados print_management criado', 'success');
      } else {
        this.log('Banco de dados print_management já existe', 'info');
        // Garantir ownership correto
        await this.execPromise('psql -U postgres -c "ALTER DATABASE print_management OWNER TO postgres_print"', 15000, true);
      }
      
      // Conceder todos os privilégios
      await this.execPromise('psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE print_management TO postgres_print"', 15000, true);
      
      // Criar schema print_management
      try {
        await this.execPromise('psql -U postgres -d print_management -c "CREATE SCHEMA IF NOT EXISTS print_management AUTHORIZATION postgres_print"', 15000, true);
        this.log('Schema print_management criado com sucesso', 'success');
      } catch (schemaError) {
        this.log('Erro ao criar schema, continuando...', 'warning');
      }
      
      this.state.postgresConfigured = true;
      this.log('PostgreSQL configurado com sucesso', 'success');
      return true;
    } catch (error) {
      this.log(`Erro ao configurar PostgreSQL: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Copia os arquivos do sistema para os diretórios apropriados
   * @returns {Promise<boolean>} True se copiado com sucesso
   */
  async copySystemFiles() {
    this.log('Copiando arquivos do sistema...', 'step');
    
    try {
      // Criar diretórios necessários
      await this.execSudo('mkdir -p /usr/local/var/loqquei/print_server_desktop', 30000);
      await this.execSudo('mkdir -p /usr/local/var/loqquei/print_server_desktop/logs', 10000);
      await this.execSudo('mkdir -p /usr/local/var/loqquei/print_server_desktop/updates', 10000);
      
      // Ajustar permissões
      await this.execSudo('chmod -R 755 /usr/local/var/loqquei', 30000);
      
      // Obter o diretório de recursos do aplicativo
      const resourcesPath = path.join(process.resourcesPath, 'resources', 'print_server_desktop');
      
      if (fs.existsSync(resourcesPath)) {
        this.log(`Copiando arquivos de ${resourcesPath} para /usr/local/var/loqquei/print_server_desktop`, 'step');
        
        // Criar um arquivo tar temporário para facilitar a transferência
        const tempTarPath = path.join(this.options.tempDir, 'print_server_desktop.tar');
        
        // Empacotar os arquivos
        await this.execPromise(`cd "${resourcesPath}" && tar -cf "${tempTarPath}" .`, 120000);
        
        // Extrair para o destino
        await this.execSudo(`tar -xf "${tempTarPath}" -C /usr/local/var/loqquei/print_server_desktop`, 120000);
        
        // Configurar arquivo .env
        const envCheckCmd = 'if [ ! -f "/usr/local/var/loqquei/print_server_desktop/.env" ]; then cp /usr/local/var/loqquei/print_server_desktop/.env.example /usr/local/var/loqquei/print_server_desktop/.env 2>/dev/null || echo "PORT=56258" > /usr/local/var/loqquei/print_server_desktop/.env; fi';
        await this.execSudo(envCheckCmd, 15000);
        
        this.log('Arquivos copiados com sucesso', 'success');
      } else {
        this.log('Diretório de recursos não encontrado!', 'error');
        
        // Criar estrutura básica de qualquer forma
        this.log('Criando estrutura básica...', 'step');
        const basicSetupCmd = `
        echo '{"name":"print_server_desktop","version":"1.0.0"}' > /usr/local/var/loqquei/print_server_desktop/package.json
        echo 'PORT=56258' > /usr/local/var/loqquei/print_server_desktop/.env
        `;
        
        await this.execSudo(basicSetupCmd, 15000);
        this.log('Estrutura básica criada', 'warning');
      }
      
      return true;
    } catch (error) {
      this.log(`Erro ao copiar arquivos do sistema: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Configura o serviço do sistema
   * @returns {Promise<boolean>} True se configurado com sucesso
   */
  async configureService() {
    this.log('Configurando serviço do sistema...', 'step');
    
    try {
      // Tentar instalar PM2 globalmente
      try {
        await this.execSudo('npm install -g pm2', 180000);
        this.log('PM2 instalado globalmente', 'success');
      } catch (pmError) {
        this.log('Erro ao instalar PM2, tentando método alternativo...', 'warning');
        
        try {
          // Alguns sistemas podem exigir instalação local
          await this.execSudo('cd /usr/local/var/loqquei/print_server_desktop && npm install pm2 --save', 180000);
          this.log('PM2 instalado localmente', 'success');
        } catch (localPmError) {
          this.log('Erro ao instalar PM2 localmente, tentando usar launchd...', 'warning');
        }
      }
      
      // Tentar instalar dependências do projeto
      try {
        await this.execSudo('cd /usr/local/var/loqquei/print_server_desktop && npm install', 300000);
        this.log('Dependências do projeto instaladas', 'success');
      } catch (npmError) {
        this.log('Erro ao instalar dependências do projeto', 'warning');
      }
      
      // Tentar iniciar com PM2
      try {
        // Verificar se ecosystem.config.js existe
        const ecoExists = await this.execPromise('test -f /usr/local/var/loqquei/print_server_desktop/ecosystem.config.js && echo "exists"', 5000, true).catch(() => '');
        
        if (ecoExists.trim() === 'exists') {
          // Parar instâncias anteriores
          await this.execSudo('pm2 delete all', 30000).catch(() => {});
          
          // Iniciar com ecosystem.config.js
          await this.execSudo('cd /usr/local/var/loqquei/print_server_desktop && pm2 start ecosystem.config.js', 60000);
          await this.execSudo('pm2 save', 30000).catch(() => {});
          
          // Configurar inicialização automática
          await this.execSudo('pm2 startup', 60000).catch(() => {});
          
          this.log('Serviço iniciado com PM2 e configurado para inicialização automática', 'success');
          this.state.serviceConfigured = true;
          return true;
        } else {
          // Se não houver arquivo ecosystem.config.js, criar um arquivo launchd plist
          this.log('Arquivo ecosystem.config.js não encontrado, criando serviço launchd...', 'info');
          
          // Criar arquivo de serviço launchd
          const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.loqquei.print-management</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/usr/local/var/loqquei/print_server_desktop/bin/www.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/usr/local/var/loqquei/print_server_desktop</string>
    <key>StandardErrorPath</key>
    <string>/usr/local/var/loqquei/print_server_desktop/logs/error.log</string>
    <key>StandardOutPath</key>
    <string>/usr/local/var/loqquei/print_server_desktop/logs/output.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>56258</string>
    </dict>
</dict>
</plist>`;
          
          // Criar arquivo temporário
          const tempPlistPath = path.join(this.options.tempDir, 'com.loqquei.print-management.plist');
          await fs.writeFile(tempPlistPath, plistContent, 'utf8');
          
          // Copiar para o diretório de serviços launchd
          await this.execSudo(`cp ${tempPlistPath} /Library/LaunchDaemons/`, 15000);
          await this.execSudo('chmod 644 /Library/LaunchDaemons/com.loqquei.print-management.plist', 10000);
          await this.execSudo('chown root:wheel /Library/LaunchDaemons/com.loqquei.print-management.plist', 10000);
          
          // Carregar e iniciar o serviço
          await this.execSudo('launchctl load -w /Library/LaunchDaemons/com.loqquei.print-management.plist', 30000);
          
          this.log('Serviço launchd criado e iniciado', 'success');
          this.state.serviceConfigured = true;
          return true;
        }
      } catch (error) {
        this.log(`Erro ao configurar serviço: ${error.message}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`Erro geral ao configurar serviço: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Executa a instalação específica para macOS
   * @returns {Promise<Object>} Resultado da instalação
   */
  async runInstallation() {
    this.log('Iniciando instalação específica para macOS...', 'header');
    
    // Passos de instalação
    const steps = [
      {
        name: 'Verificando e instalando Homebrew',
        execute: async () => {
          if (await this.isHomebrewInstalled()) {
            this.log('Homebrew já está instalado', 'success');
            this.state.homebrewInstalled = true;
            return true;
          } else {
            return await this.installHomebrew();
          }
        }
      },
      {
        name: 'Instalando dependências',
        execute: this.installDependencies.bind(this)
      },
      {
        name: 'Configurando CUPS',
        execute: this.configureCups.bind(this)
      },
      {
        name: 'Configurando Samba',
        execute: this.configureSamba.bind(this)
      },
      {
        name: 'Configurando PostgreSQL',
        execute: this.configurePostgres.bind(this)
      },
      {
        name: 'Copiando arquivos do sistema',
        execute: this.copySystemFiles.bind(this)
      },
      {
        name: 'Configurando serviço',
        execute: this.configureService.bind(this)
      }
    ];
    
    // Executar cada passo
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      this.log(`Executando passo ${i + 1}/${steps.length}: ${step.name}`, 'step');
      this.updateProgress(i, 10, step.name);
      
      try {
        const result = await step.execute();
        
        if (result === false) {
          this.log(`Falha no passo ${i + 1}: ${step.name}`, 'error');
          return { success: false, message: `Falha em: ${step.name}` };
        }
        
        this.updateProgress(i, 100, `${step.name} - Concluído`);
      } catch (error) {
        this.log(`Erro no passo ${i + 1}: ${step.name} - ${error.message}`, 'error');
        return { success: false, message: `Erro em ${step.name}: ${error.message}` };
      }
    }
    
    this.log('Instalação macOS concluída com sucesso!', 'success');
    
    return { success: true, message: 'Instalação concluída com sucesso' };
  }
  
  /**
   * Desinstala o sistema
   * @returns {Promise<Object>} Resultado da desinstalação
   */
  async uninstall() {
    this.log('Iniciando desinstalação do sistema...', 'header');
    
    try {
      // Parar e remover serviço
      // Verificar se estamos usando PM2 ou launchd
      const pm2Exists = await this.execPromise('which pm2', 5000, true).catch(() => '');
      
      if (pm2Exists) {
        // Parar PM2 se estiver em uso
        await this.execSudo('pm2 delete all', 30000).catch(() => {});
        await this.execSudo('pm2 save', 15000).catch(() => {});
      }
      
      // Remover arquivo launchd
      if (await fs.pathExists('/Library/LaunchDaemons/com.loqquei.print-management.plist')) {
        await this.execSudo('launchctl unload -w /Library/LaunchDaemons/com.loqquei.print-management.plist', 30000).catch(() => {});
        await this.execSudo('rm -f /Library/LaunchDaemons/com.loqquei.print-management.plist', 10000).catch(() => {});
      }
      
      // Remover arquivos
      await this.execSudo('rm -rf /usr/local/var/loqquei', 60000).catch(() => {});
      
      // Remover impressora PDF
      await this.execSudo('lpadmin -x PDF', 30000).catch(() => {});
      
      this.log('Desinstalação concluída com sucesso', 'success');
      return { success: true, message: 'Desinstalação concluída com sucesso' };
    } catch (error) {
      this.log(`Erro durante a desinstalação: ${error.message}`, 'error');
      return { success: false, message: `Erro durante a desinstalação: ${error.message}` };
    }
  }
  
  /**
   * Instala um componente específico
   * @param {string} component Nome do componente a ser instalado
   * @returns {Promise<boolean>} True se a instalação foi bem-sucedida
   */
  async installComponent(component) {
    this.log(`Instalando componente: ${component}...`, 'header');
    
    try {
      switch (component) {
        case 'homebrew':
          return await this.installHomebrew();
          
        case 'dependencies':
        case 'packages':
          return await this.installDependencies();
          
        case 'cups':
          return await this.configureCups();
          
        case 'samba':
          return await this.configureSamba();
          
        case 'postgres':
        case 'database':
          return await this.configurePostgres();
          
        case 'service':
          return await this.configureService();
          
        case 'files':
        case 'software':
          return await this.copySystemFiles();
          
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

module.exports = MacInstaller;