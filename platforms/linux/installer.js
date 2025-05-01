/**
 * Sistema de Gerenciamento de Impressão - Instalador Linux
 * 
 * Implementação do instalador para sistemas Linux
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

class LinuxInstaller extends InstallerBase {
  constructor(options = {}) {
    super(options);
    
    // Passos de instalação específicos do Linux
    this.installationSteps = [
      'Verificando pré-requisitos',
      'Verificando permissões',
      'Instalando dependências',
      'Configurando CUPS',
      'Configurando Samba',
      'Configurando PostgreSQL',
      'Configurando serviço',
      'Finalizando instalação'
    ];
    
    // Estado adicional específico do Linux
    this.state.packagesInstalled = false;
    this.state.cupsConfigured = false;
    this.state.sambaConfigured = false;
    this.state.postgresConfigured = false;
    this.state.serviceConfigured = false;
    
    // Detectar a distribuição Linux
    this.distribution = null;
    this.packageManager = null;
    this.serviceManager = null;
    
    // Pacotes necessários por distribuição
    this.requiredPackages = {
      debian: [
        'cups', 'printer-driver-cups-pdf', 'samba', 'avahi-daemon',
        'postgresql', 'postgresql-contrib', 'nodejs', 'npm', 'ufw'
      ],
      fedora: [
        'cups', 'cups-pdf', 'samba', 'avahi',
        'postgresql', 'postgresql-server', 'nodejs', 'npm', 'firewalld'
      ],
      arch: [
        'cups', 'cups-pdf', 'samba', 'avahi',
        'postgresql', 'nodejs', 'npm', 'ufw'
      ]
    };
  }
  
  /**
   * Detecta a distribuição Linux em uso
   * @returns {Promise<Object>} Informações sobre a distribuição
   */
  async detectDistribution() {
    if (this.distribution) return {
      distribution: this.distribution,
      packageManager: this.packageManager,
      serviceManager: this.serviceManager
    };
    
    try {
      // Tentar ler o arquivo os-release
      let releaseInfo = {};
      
      try {
        const osRelease = await fs.readFile('/etc/os-release', 'utf8');
        const lines = osRelease.split('\n');
        
        for (const line of lines) {
          const match = line.match(/^([^=]+)=(.*)$/);
          if (match) {
            let value = match[2].trim();
            // Remover aspas se presentes
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.slice(1, -1);
            }
            releaseInfo[match[1]] = value;
          }
        }
      } catch (error) {
        this.log('Erro ao ler /etc/os-release, tentando método alternativo', 'warning');
        
        // Tentar usar comando lsb_release
        try {
          const lsbOutput = await this.execPromise('lsb_release -a', 10000, true);
          const lines = lsbOutput.split('\n');
          
          for (const line of lines) {
            const match = line.match(/^([^:]+):\s*(.*)$/);
            if (match) {
              releaseInfo[match[1].trim()] = match[2].trim();
            }
          }
          
          if (releaseInfo['Distributor ID']) {
            releaseInfo.ID = releaseInfo['Distributor ID'].toLowerCase();
          }
        } catch (lsbError) {
          this.log('Erro ao executar lsb_release, tentando verificar arquivos comuns', 'warning');
          
          // Verificar arquivos comuns de distribuição
          const distroFiles = [
            { path: '/etc/debian_version', id: 'debian' },
            { path: '/etc/fedora-release', id: 'fedora' },
            { path: '/etc/redhat-release', id: 'rhel' },
            { path: '/etc/arch-release', id: 'arch' },
            { path: '/etc/gentoo-release', id: 'gentoo' },
            { path: '/etc/SuSE-release', id: 'suse' },
            { path: '/etc/slackware-version', id: 'slackware' }
          ];
          
          for (const file of distroFiles) {
            if (await fs.pathExists(file.path)) {
              releaseInfo.ID = file.id;
              break;
            }
          }
        }
      }
      
      // Determinar a família da distribuição
      let distribution = 'unknown';
      
      if (!releaseInfo.ID) {
        this.log('Não foi possível determinar a distribuição', 'warning');
      } else {
        // Distribuições baseadas em Debian
        if (['debian', 'ubuntu', 'linuxmint', 'pop', 'elementary', 'zorin', 'kali', 'parrot', 'mx'].includes(releaseInfo.ID.toLowerCase())) {
          distribution = 'debian';
        }
        // Distribuições baseadas em Red Hat
        else if (['fedora', 'rhel', 'centos', 'rocky', 'alma', 'oracle'].includes(releaseInfo.ID.toLowerCase())) {
          distribution = 'fedora';
        }
        // Arch Linux e derivados
        else if (['arch', 'manjaro', 'endeavouros', 'arcolinux'].includes(releaseInfo.ID.toLowerCase())) {
          distribution = 'arch';
        }
        // Outras distribuições
        else {
          distribution = releaseInfo.ID.toLowerCase();
        }
      }
      
      // Determinar o gerenciador de pacotes
      let packageManager = 'unknown';
      let installCommand = '';
      let serviceManager = 'systemctl';
      
      switch (distribution) {
        case 'debian':
          packageManager = 'apt';
          installCommand = 'apt-get install -y';
          break;
        case 'fedora':
          packageManager = 'dnf';
          installCommand = 'dnf install -y';
          break;
        case 'arch':
          packageManager = 'pacman';
          installCommand = 'pacman -S --noconfirm';
          break;
        default:
          // Tentar detectar por comandos disponíveis
          try {
            await this.execPromise('which apt', 5000, true);
            packageManager = 'apt';
            installCommand = 'apt-get install -y';
            distribution = 'debian'; // Assumir família Debian
          } catch (e1) {
            try {
              await this.execPromise('which dnf', 5000, true);
              packageManager = 'dnf';
              installCommand = 'dnf install -y';
              distribution = 'fedora'; // Assumir família Red Hat
            } catch (e2) {
              try {
                await this.execPromise('which pacman', 5000, true);
                packageManager = 'pacman';
                installCommand = 'pacman -S --noconfirm';
                distribution = 'arch'; // Assumir Arch Linux
              } catch (e3) {
                try {
                  await this.execPromise('which zypper', 5000, true);
                  packageManager = 'zypper';
                  installCommand = 'zypper install -y';
                  distribution = 'suse'; // Assumir OpenSUSE
                } catch (e4) {
                  this.log('Não foi possível detectar o gerenciador de pacotes', 'warning');
                }
              }
            }
          }
      }
      
      // Verificar se systemd está disponível
      try {
        await this.execPromise('which systemctl', 5000, true);
        serviceManager = 'systemctl';
      } catch (error) {
        // Verificar se SysVinit está disponível
        try {
          await this.execPromise('which service', 5000, true);
          serviceManager = 'service';
        } catch (e) {
          this.log('Não foi possível detectar o gerenciador de serviços', 'warning');
          serviceManager = 'unknown';
        }
      }
      
      const result = {
        distribution,
        packageManager,
        installCommand,
        serviceManager,
        name: releaseInfo.NAME || releaseInfo['Distributor ID'] || distribution,
        version: releaseInfo.VERSION_ID || releaseInfo['Release'] || 'unknown'
      };
      
      this.distribution = result.distribution;
      this.packageManager = result.packageManager;
      this.serviceManager = result.serviceManager;
      
      return result;
    } catch (error) {
      this.log(`Erro ao detectar distribuição: ${error.message}`, 'error');
      return {
        distribution: 'unknown',
        packageManager: 'unknown',
        serviceManager: 'unknown',
        name: 'Linux',
        version: 'unknown'
      };
    }
  }
  
  /**
   * Verifica se o usuário tem privilégios de administrador (root)
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
   * Verifica os requisitos do sistema
   * @returns {Promise<Object>} Resultado da verificação
   */
  async checkSystemRequirements() {
    this.log('Verificando requisitos do sistema para Linux', 'header');
    
    const requirements = {
      compatible: true,
      errors: [],
      warnings: [],
      details: {}
    };
    
    // Detectar distribuição
    const distroInfo = await this.detectDistribution();
    requirements.details.distribution = distroInfo;
    
    this.log(`Distribuição detectada: ${distroInfo.name} ${distroInfo.version}`, 'info');
    
    // Verificar se é uma distribuição suportada
    const supportedDistros = ['debian', 'fedora', 'arch'];
    if (!supportedDistros.includes(distroInfo.distribution)) {
      requirements.warnings.push(`Distribuição ${distroInfo.name} não é oficialmente suportada. Tentaremos prosseguir, mas podem ocorrer problemas.`);
    }
    
    // Verificar espaço em disco
    try {
      // Verificar espaço na pasta /opt ou equivalente
      const output = await this.execPromise('df -k /opt | tail -1 | awk \'{print $4}\'', 10000, true);
      const freeSpaceKB = parseInt(output.trim(), 10);
      const freeSpaceGB = freeSpaceKB / (1024 * 1024);
      
      requirements.details.freeSpaceGB = freeSpaceGB.toFixed(2);
      
      if (freeSpaceGB < 2) {
        requirements.warnings.push(`Pouco espaço livre em /opt (${freeSpaceGB.toFixed(2)} GB). Recomendado: pelo menos 2 GB.`);
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar o espaço livre em disco.');
    }
    
    // Verificar memória
    try {
      const totalMem = os.totalmem();
      const totalMemGB = totalMem / (1024 * 1024 * 1024);
      
      requirements.details.totalMemoryGB = totalMemGB.toFixed(2);
      
      if (totalMemGB < 2) {
        requirements.warnings.push(`Pouca memória RAM (${totalMemGB.toFixed(2)} GB). Recomendado: pelo menos 2 GB.`);
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar a memória do sistema.');
    }
    
    // Verificar se os pacotes são instaláveis
    if (distroInfo.packageManager === 'unknown') {
      requirements.errors.push('Não foi possível detectar um gerenciador de pacotes suportado.');
      requirements.compatible = false;
    } else {
      // Verificar os pacotes específicos da distribuição
      const packageList = this.requiredPackages[distroInfo.distribution];
      
      if (!packageList) {
        requirements.warnings.push('Lista de pacotes não definida para esta distribuição. Será usada a lista padrão.');
      }
    }
    
    // Verificar se o CUPS está em execução
    try {
      if (distroInfo.serviceManager === 'systemctl') {
        const cupsStatus = await this.execPromise('systemctl is-active cups.service', 5000, true).catch(() => 'inactive');
        requirements.details.cupsRunning = cupsStatus.trim() === 'active';
      } else if (distroInfo.serviceManager === 'service') {
        const cupsStatus = await this.execPromise('service cups status', 5000, true).catch(() => '');
        requirements.details.cupsRunning = cupsStatus.includes('running');
      } else {
        requirements.details.cupsRunning = false;
      }
      
      if (!requirements.details.cupsRunning) {
        requirements.warnings.push('O serviço CUPS não está em execução.');
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar o status do CUPS.');
    }
    
    // Verificar PostgreSQL
    try {
      if (distroInfo.serviceManager === 'systemctl') {
        const pgStatus = await this.execPromise('systemctl is-active postgresql.service', 5000, true).catch(() => 'inactive');
        requirements.details.postgresRunning = pgStatus.trim() === 'active';
      } else if (distroInfo.serviceManager === 'service') {
        const pgStatus = await this.execPromise('service postgresql status', 5000, true).catch(() => '');
        requirements.details.postgresRunning = pgStatus.includes('running');
      } else {
        requirements.details.postgresRunning = false;
      }
      
      if (!requirements.details.postgresRunning) {
        requirements.warnings.push('O serviço PostgreSQL não está em execução.');
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar o status do PostgreSQL.');
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
   * Instala os pacotes necessários
   * @returns {Promise<boolean>} True se instalado com sucesso
   */
  async installPackages() {
    const distroInfo = await this.detectDistribution();
    const packageList = this.requiredPackages[distroInfo.distribution] || this.requiredPackages.debian;
    
    this.log(`Instalando pacotes para ${distroInfo.name}: ${packageList.join(', ')}`, 'step');
    
    try {
      // Atualizar repositórios primeiro
      if (distroInfo.packageManager === 'apt') {
        await this.execSudo('apt-get update', 300000);
      } else if (distroInfo.packageManager === 'dnf') {
        await this.execSudo('dnf check-update', 300000);
      } else if (distroInfo.packageManager === 'pacman') {
        await this.execSudo('pacman -Sy', 300000);
      }
      
      // Instalar pacotes em grupos menores para melhor tratamento de erros
      const packageGroups = [];
      const groupSize = 3;
      
      for (let i = 0; i < packageList.length; i += groupSize) {
        packageGroups.push(packageList.slice(i, i + groupSize));
      }
      
      for (let i = 0; i < packageGroups.length; i++) {
        const group = packageGroups[i];
        this.log(`Instalando grupo ${i + 1}/${packageGroups.length}: ${group.join(', ')}`, 'step');
        
        try {
          const installCommand = `${distroInfo.installCommand} ${group.join(' ')}`;
          await this.execSudo(installCommand, 600000);
          this.log(`Grupo ${i + 1} instalado com sucesso`, 'success');
        } catch (error) {
          this.log(`Erro ao instalar grupo ${i + 1}: ${error.message}`, 'warning');
          
          // Tentar instalar pacotes individualmente
          for (const pkg of group) {
            try {
              const individualCommand = `${distroInfo.installCommand} ${pkg}`;
              await this.execSudo(individualCommand, 300000);
              this.log(`Pacote ${pkg} instalado com sucesso`, 'success');
            } catch (pkgError) {
              this.log(`Erro ao instalar ${pkg}. Continuando com os demais pacotes.`, 'warning');
            }
          }
        }
      }
      
      this.log('Instalação de pacotes concluída', 'success');
      this.state.packagesInstalled = true;
      return true;
    } catch (error) {
      this.log(`Erro ao instalar pacotes: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Configura o serviço CUPS
   * @returns {Promise<boolean>} True se configurado com sucesso
   */
  async configureCups() {
    this.log('Configurando CUPS...', 'step');
    
    try {
      const distroInfo = await this.detectDistribution();
      
      // Iniciar o serviço CUPS se não estiver em execução
      if (distroInfo.serviceManager === 'systemctl') {
        // Verificar status atual
        const cupsStatus = await this.execPromise('systemctl is-active cups.service', 5000, true).catch(() => 'inactive');
        
        if (cupsStatus.trim() !== 'active') {
          await this.execSudo('systemctl start cups.service', 30000);
          await this.execSudo('systemctl enable cups.service', 30000);
        }
      } else if (distroInfo.serviceManager === 'service') {
        await this.execSudo('service cups start', 30000);
        if (await fs.pathExists('/etc/init.d/cups')) {
          await this.execSudo('update-rc.d cups defaults', 30000);
        }
      }
      
      // Verificar se o arquivo de configuração existe
      await this.execSudo('mkdir -p /opt/loqquei/print_server_desktop/config', 10000);
      
      // Configurar para acesso remoto
      const cupsdConfContent = `# Allow remote access
ServerName localhost
Listen *:631
<Location />
  Order allow,deny
  Allow all
</Location>
<Location /admin>
  Order allow,deny
  Allow all
</Location>
<Location /admin/conf>
  AuthType Default
  Require user @SYSTEM
  Order allow,deny
  Allow all
</Location>

# Share local printers on the local network
Browsing On
BrowseLocalProtocols dnssd
BrowseAddress @LOCAL

DefaultAuthType Basic
WebInterface Yes
`;
      
      // Criar arquivo temporário com a configuração
      const tempConfPath = path.join(this.options.tempDir, 'cupsd.conf');
      await fs.writeFile(tempConfPath, cupsdConfContent, 'utf8');
      
      // Copiar para o diretório de configuração do CUPS
      await this.execSudo(`cp ${tempConfPath} /etc/cups/cupsd.conf`, 10000);
      
      // Verificar se CUPS-PDF está instalado e configurar
      const cupsPdfOutput = await this.execPromise('lpstat -v | grep pdf', 5000, true).catch(() => '');
      
      if (!cupsPdfOutput.includes('pdf')) {
        this.log('Configurando impressora PDF...', 'step');
        try {
          // Configurar impressora PDF
          await this.execSudo('lpadmin -p PDF -E -v cups-pdf:/ -m drv:///cups-pdf.drv/Generic-PDF_Printer-PDF.ppd', 30000);
          await this.execSudo('cupsenable PDF', 10000);
          await this.execSudo('cupsaccept PDF', 10000);
          this.log('Impressora PDF configurada com sucesso', 'success');
        } catch (pdfError) {
          this.log('Erro ao configurar impressora PDF', 'warning');
        }
      } else {
        this.log('Impressora PDF já está configurada', 'info');
      }
      
      // Reiniciar o serviço CUPS para aplicar as alterações
      if (distroInfo.serviceManager === 'systemctl') {
        await this.execSudo('systemctl restart cups.service', 30000);
      } else if (distroInfo.serviceManager === 'service') {
        await this.execSudo('service cups restart', 30000);
      }
      
      this.log('CUPS configurado com sucesso', 'success');
      this.state.cupsConfigured = true;
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
      const distroInfo = await this.detectDistribution();
      
      // Criar diretório de compartilhamento
      await this.execSudo('mkdir -p /srv/print_server', 10000);
      await this.execSudo('chmod -R 0777 /srv/print_server', 10000);
      
      // Configuração do Samba
      const smbContent = `[global]
workgroup = WORKGROUP
security = user
map to guest = bad user
printing = cups
printcap name = cups

[print_server]
path = /srv/print_server
public = yes
writable = yes
browseable = yes
guest ok = yes
`;
      
      // Criar arquivo temporário com a configuração
      const tempSmbPath = path.join(this.options.tempDir, 'smb.conf');
      await fs.writeFile(tempSmbPath, smbContent, 'utf8');
      
      // Copiar para o diretório de configuração do Samba
      await this.execSudo(`cp ${tempSmbPath} /etc/samba/smb.conf`, 10000);
      
      // Reiniciar o serviço Samba
      if (distroInfo.serviceManager === 'systemctl') {
        await this.execSudo('systemctl restart smbd.service', 30000);
        await this.execSudo('systemctl enable smbd.service', 30000);
      } else if (distroInfo.serviceManager === 'service') {
        await this.execSudo('service smbd restart', 30000);
        if (await fs.pathExists('/etc/init.d/smbd')) {
          await this.execSudo('update-rc.d smbd defaults', 30000);
        }
      }
      
      this.log('Samba configurado com sucesso', 'success');
      this.state.sambaConfigured = true;
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
      const distroInfo = await this.detectDistribution();
      
      // Iniciar o serviço PostgreSQL se não estiver em execução
      if (distroInfo.serviceManager === 'systemctl') {
        // Verificar status atual
        const pgStatus = await this.execPromise('systemctl is-active postgresql.service', 5000, true).catch(() => 'inactive');
        
        if (pgStatus.trim() !== 'active') {
          // Em alguns sistemas, pode ser necessário inicializar o cluster primeiro
          if (distroInfo.distribution === 'fedora') {
            await this.execSudo('postgresql-setup --initdb', 60000).catch(() => {});
          } else if (distroInfo.distribution === 'arch') {
            await this.execSudo('mkdir -p /var/lib/postgres/data', 10000).catch(() => {});
            await this.execSudo('chown -R postgres:postgres /var/lib/postgres', 10000).catch(() => {});
            await this.execSudo('su - postgres -c "initdb -D /var/lib/postgres/data"', 60000).catch(() => {});
          }
          
          await this.execSudo('systemctl start postgresql.service', 60000);
          await this.execSudo('systemctl enable postgresql.service', 30000);
        }
      } else if (distroInfo.serviceManager === 'service') {
        await this.execSudo('service postgresql start', 60000);
        if (await fs.pathExists('/etc/init.d/postgresql')) {
          await this.execSudo('update-rc.d postgresql defaults', 30000);
        }
      }
      
      // Aguardar um momento para o PostgreSQL inicializar completamente
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Criar usuário e banco de dados executando como usuário postgres
      try {
        // Verificar se o usuário já existe
        const userExists = await this.execSudo('su - postgres -c "psql -tAc \\"SELECT 1 FROM pg_roles WHERE rolname=\'print_user\'\\" "', 15000);
        
        if (!userExists.trim() || userExists.trim() !== '1') {
          // Criar o usuário
          await this.execSudo('su - postgres -c "psql -c \\"CREATE USER print_user WITH PASSWORD \'print_user\'\\""', 15000);
          this.log('Usuário print_user criado com sucesso', 'success');
        } else {
          this.log('Usuário print_user já existe', 'info');
        }
        
        // Conceder privilégios de superusuário
        await this.execSudo('su - postgres -c "psql -c \\"ALTER USER print_user WITH SUPERUSER\\""', 15000);
        
        // Verificar se o banco de dados já existe
        const dbExists = await this.execSudo('su - postgres -c "psql -tAc \\"SELECT 1 FROM pg_database WHERE datname=\'print_server\'\\" "', 15000);
        
        if (!dbExists.trim() || dbExists.trim() !== '1') {
          // Criar o banco de dados
          await this.execSudo('su - postgres -c "psql -c \\"CREATE DATABASE print_server OWNER print_user\\""', 15000);
          this.log('Banco de dados print_server criado com sucesso', 'success');
        } else {
          this.log('Banco de dados print_server já existe', 'info');
          // Garantir ownership correto
          await this.execSudo('su - postgres -c "psql -c \\"ALTER DATABASE print_server OWNER TO print_user\\""', 15000);
        }
        
        // Conceder todos os privilégios
        await this.execSudo('su - postgres -c "psql -c \\"GRANT ALL PRIVILEGES ON DATABASE print_server TO print_user\\""', 15000);
        
        // Repetir o processo para print_management
        
        // Verificar se o usuário postgres_print já existe
        const userMigExists = await this.execSudo('su - postgres -c "psql -tAc \\"SELECT 1 FROM pg_roles WHERE rolname=\'postgres_print\'\\" "', 15000);
        
        if (!userMigExists.trim() || userMigExists.trim() !== '1') {
          // Criar o usuário
          await this.execSudo('su - postgres -c "psql -c \\"CREATE USER postgres_print WITH PASSWORD \'root_print\'\\""', 15000);
          this.log('Usuário postgres_print criado com sucesso', 'success');
        } else {
          this.log('Usuário postgres_print já existe', 'info');
        }
        
        // Conceder privilégios de superusuário
        await this.execSudo('su - postgres -c "psql -c \\"ALTER USER postgres_print WITH SUPERUSER\\""', 15000);
        
        // Verificar se o banco de dados print_management já existe
        const dbMigExists = await this.execSudo('su - postgres -c "psql -tAc \\"SELECT 1 FROM pg_database WHERE datname=\'print_management\'\\" "', 15000);
        
        if (!dbMigExists.trim() || dbMigExists.trim() !== '1') {
          // Criar o banco de dados
          await this.execSudo('su - postgres -c "psql -c \\"CREATE DATABASE print_management OWNER postgres_print\\""', 15000);
          this.log('Banco de dados print_management criado com sucesso', 'success');
        } else {
          this.log('Banco de dados print_management já existe', 'info');
          // Garantir ownership correto
          await this.execSudo('su - postgres -c "psql -c \\"ALTER DATABASE print_management OWNER TO postgres_print\\""', 15000);
        }
        
        // Conceder todos os privilégios
        await this.execSudo('su - postgres -c "psql -c \\"GRANT ALL PRIVILEGES ON DATABASE print_management TO postgres_print\\""', 15000);
        
        // Criar schema print_management
        try {
          await this.execSudo('su - postgres -c "psql -d print_management -c \\"CREATE SCHEMA IF NOT EXISTS print_management AUTHORIZATION postgres_print\\""', 15000);
          this.log('Schema print_management criado com sucesso', 'success');
        } catch (schemaError) {
          this.log('Erro ao criar schema, continuando...', 'warning');
        }
        
        this.log('PostgreSQL configurado com sucesso', 'success');
        this.state.postgresConfigured = true;
        return true;
      } catch (error) {
        this.log(`Erro ao configurar banco de dados: ${error.message}`, 'error');
        return false;
      }
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
      await this.execSudo('mkdir -p /opt/loqquei/print_server_desktop', 30000);
      await this.execSudo('mkdir -p /opt/loqquei/print_server_desktop/logs', 10000);
      await this.execSudo('mkdir -p /opt/loqquei/print_server_desktop/updates', 10000);
      
      // Ajustar permissões
      await this.execSudo('chmod -R 755 /opt/loqquei', 30000);
      
      // Obter o diretório de recursos do aplicativo
      const resourcesPath = path.join(process.resourcesPath, 'resources', 'print_server_desktop');
      
      if (fs.existsSync(resourcesPath)) {
        this.log(`Copiando arquivos de ${resourcesPath} para /opt/loqquei/print_server_desktop`, 'step');
        
        // Criar um arquivo tar temporário para facilitar a transferência
        const tempTarPath = path.join(this.options.tempDir, 'print_server_desktop.tar');
        
        // Empacotar os arquivos
        await this.execPromise(`cd "${resourcesPath}" && tar -cf "${tempTarPath}" .`, 120000);
        
        // Extrair para o destino
        await this.execSudo(`tar -xf "${tempTarPath}" -C /opt/loqquei/print_server_desktop`, 120000);
        
        // Configurar arquivo .env
        const envCheckCmd = 'if [ ! -f "/opt/loqquei/print_server_desktop/.env" ]; then cp /opt/loqquei/print_server_desktop/.env.example /opt/loqquei/print_server_desktop/.env 2>/dev/null || echo "PORT=56258" > /opt/loqquei/print_server_desktop/.env; fi';
        await this.execSudo(envCheckCmd, 15000);
        
        this.log('Arquivos copiados com sucesso', 'success');
      } else {
        this.log('Diretório de recursos não encontrado!', 'error');
        
        // Criar estrutura básica de qualquer forma
        this.log('Criando estrutura básica...', 'step');
        const basicSetupCmd = `
        echo '{"name":"print_server_desktop","version":"1.0.0"}' > /opt/loqquei/print_server_desktop/package.json
        echo 'PORT=56258' > /opt/loqquei/print_server_desktop/.env
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
   * Configura o serviço do sistema usando PM2 ou systemd
   * @returns {Promise<boolean>} True se configurado com sucesso
   */
  async configureService() {
    this.log('Configurando serviço do sistema...', 'step');
    
    try {
      const distroInfo = await this.detectDistribution();
      
      // Tentar instalar PM2 globalmente
      try {
        await this.execSudo('npm install -g pm2', 180000);
        this.log('PM2 instalado globalmente', 'success');
      } catch (pmError) {
        this.log('Erro ao instalar PM2, tentando método alternativo...', 'warning');
        
        try {
          // Alguns sistemas podem exigir instalação local
          await this.execSudo('cd /opt/loqquei/print_server_desktop && npm install pm2 --save', 180000);
          this.log('PM2 instalado localmente', 'success');
        } catch (localPmError) {
          this.log('Erro ao instalar PM2 localmente, tentando usar systemd...', 'warning');
        }
      }
      
      // Tentar instalar dependências do projeto
      try {
        await this.execSudo('cd /opt/loqquei/print_server_desktop && npm install', 300000);
        this.log('Dependências do projeto instaladas', 'success');
      } catch (npmError) {
        this.log('Erro ao instalar dependências do projeto', 'warning');
      }
      
      // Tentar iniciar com PM2
      try {
        // Verificar se ecosystem.config.js existe
        const ecoExists = await this.execPromise('test -f /opt/loqquei/print_server_desktop/ecosystem.config.js && echo "exists"', 5000, true).catch(() => '');
        
        if (ecoExists.trim() === 'exists') {
          // Parar instâncias anteriores
          await this.execSudo('pm2 delete all', 30000).catch(() => {});
          
          // Iniciar com ecosystem.config.js
          await this.execSudo('cd /opt/loqquei/print_server_desktop && pm2 start ecosystem.config.js', 60000);
          await this.execSudo('pm2 save', 30000).catch(() => {});
          
          // Configurar inicialização automática
          await this.execSudo('pm2 startup', 60000).catch(() => {});
          
          this.log('Serviço iniciado com PM2 e configurado para inicialização automática', 'success');
        } else {
          // Se não houver arquivo ecosystem.config.js, criar um script systemd
          this.log('Arquivo ecosystem.config.js não encontrado, criando serviço systemd...', 'info');
          
          // Criar arquivo de serviço systemd
          const serviceContent = `[Unit]
Description=LoQQuei Print Management Service
After=network.target postgresql.service

[Service]
ExecStart=/usr/bin/node /opt/loqquei/print_server_desktop/bin/www.js
WorkingDirectory=/opt/loqquei/print_server_desktop
Restart=always
User=root
Environment=NODE_ENV=production
Environment=PORT=56258

[Install]
WantedBy=multi-user.target
`;
          
          // Criar arquivo temporário
          const tempServicePath = path.join(this.options.tempDir, 'print-management.service');
          await fs.writeFile(tempServicePath, serviceContent, 'utf8');
          
          // Copiar para o diretório de serviços systemd
          await this.execSudo(`cp ${tempServicePath} /etc/systemd/system/`, 15000);
          
          // Habilitar e iniciar o serviço
          if (distroInfo.serviceManager === 'systemctl') {
            await this.execSudo('systemctl daemon-reload', 30000);
            await this.execSudo('systemctl enable print-management.service', 30000);
            await this.execSudo('systemctl start print-management.service', 60000);
            this.log('Serviço systemd criado e iniciado', 'success');
          } else {
            this.log('Gerenciador de serviço systemd não disponível', 'warning');
          }
        }
        
        this.state.serviceConfigured = true;
        return true;
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
   * Configura regras de firewall
   * @returns {Promise<boolean>} True se configurado com sucesso
   */
  async configureFirewall() {
    this.log('Configurando regras de firewall...', 'step');
    
    try {
      const distroInfo = await this.detectDistribution();
      
      // Verificar qual firewall está em uso
      let firewallType = 'unknown';
      
      try {
        const ufwExists = await this.execPromise('which ufw', 5000, true).catch(() => '');
        const firewalldExists = await this.execPromise('which firewall-cmd', 5000, true).catch(() => '');
        
        if (ufwExists) {
          firewallType = 'ufw';
        } else if (firewalldExists) {
          firewallType = 'firewalld';
        }
      } catch (error) {
        this.log('Não foi possível determinar o tipo de firewall', 'warning');
      }
      
      // Definir as portas necessárias
      const ports = [
        { port: 137, protocol: 'udp' },
        { port: 138, protocol: 'udp' },
        { port: 22, protocol: 'tcp' },
        { port: 139, protocol: 'tcp' },
        { port: 445, protocol: 'tcp' },
        { port: 631, protocol: 'tcp' },
        { port: 56257, protocol: 'tcp' },
        { port: 56258, protocol: 'tcp' },
        { port: 56259, protocol: 'tcp' }
      ];
      
      // Configurar conforme o firewall detectado
      if (firewallType === 'ufw') {
        // Iniciar UFW
        await this.execSudo('ufw --force enable', 30000).catch(() => {});
        
        // Adicionar regras
        for (const { port, protocol } of ports) {
          try {
            await this.execSudo(`ufw allow ${port}/${protocol}`, 15000);
            this.log(`Regra para ${port}/${protocol} adicionada com sucesso`, 'success');
          } catch (error) {
            this.log(`Erro ao adicionar regra para ${port}/${protocol}`, 'warning');
          }
        }
        
        // Recarregar regras
        await this.execSudo('ufw reload', 30000).catch(() => {});
      } else if (firewallType === 'firewalld') {
        // Adicionar regras no firewalld
        for (const { port, protocol } of ports) {
          try {
            await this.execSudo(`firewall-cmd --permanent --add-port=${port}/${protocol}`, 15000);
            this.log(`Regra para ${port}/${protocol} adicionada com sucesso`, 'success');
          } catch (error) {
            this.log(`Erro ao adicionar regra para ${port}/${protocol}`, 'warning');
          }
        }
        
        // Recarregar regras
        await this.execSudo('firewall-cmd --reload', 30000).catch(() => {});
      } else {
        this.log('Nenhum firewall suportado detectado, pulando configuração', 'warning');
      }
      
      this.log('Configuração de firewall concluída', 'success');
      return true;
    } catch (error) {
      this.log(`Erro ao configurar firewall: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Executa a instalação específica para Linux
   * @returns {Promise<Object>} Resultado da instalação
   */
  async runInstallation() {
    this.log('Iniciando instalação específica para Linux...', 'header');
    
    // Passos de instalação
    const steps = [
      {
        name: 'Detectando distribuição Linux',
        execute: async () => {
          const distroInfo = await this.detectDistribution();
          return { success: true, message: `Distribuição detectada: ${distroInfo.name} ${distroInfo.version}` };
        }
      },
      {
        name: 'Instalando pacotes necessários',
        execute: this.installPackages.bind(this)
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
      },
      {
        name: 'Configurando regras de firewall',
        execute: this.configureFirewall.bind(this)
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
    
    this.log('Instalação Linux concluída com sucesso!', 'success');
    
    return { success: true, message: 'Instalação concluída com sucesso' };
  }
  
  /**
   * Desinstala o sistema
   * @returns {Promise<Object>} Resultado da desinstalação
   */
  async uninstall() {
    this.log('Iniciando desinstalação do sistema...', 'header');
    
    try {
      const distroInfo = await this.detectDistribution();
      
      // Parar e remover serviço
      if (distroInfo.serviceManager === 'systemctl') {
        await this.execSudo('systemctl stop print-management.service', 30000).catch(() => {});
        await this.execSudo('systemctl disable print-management.service', 30000).catch(() => {});
        await this.execSudo('rm -f /etc/systemd/system/print-management.service', 10000).catch(() => {});
        await this.execSudo('systemctl daemon-reload', 30000).catch(() => {});
      }
      
      // Parar PM2 se estiver em uso
      await this.execSudo('pm2 delete all', 30000).catch(() => {});
      
      // Remover arquivos
      await this.execSudo('rm -rf /opt/loqquei', 60000).catch(() => {});
      
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
        case 'packages':
          return await this.installPackages();
          
        case 'cups':
          return await this.configureCups();
          
        case 'samba':
          return await this.configureSamba();
          
        case 'postgres':
        case 'database':
          return await this.configurePostgres();
          
        case 'service':
          return await this.configureService();
          
        case 'firewall':
          return await this.configureFirewall();
          
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

module.exports = LinuxInstaller;