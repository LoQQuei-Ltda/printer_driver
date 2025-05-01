/**
 * Sistema de Gerenciamento de Impressão - Verificador de Requisitos Linux
 * 
 * Verifica se o sistema Linux atende aos requisitos mínimos
 */

const { execFile, exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * Detecta a distribuição Linux em uso
 * @returns {Promise<Object>} Informações sobre a distribuição
 */
async function detectDistribution() {
  try {
    // Tentar ler o arquivo os-release
    let releaseInfo = {};
    
    try {
      const osRelease = await fs.promises.readFile('/etc/os-release', 'utf8');
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
      // Tentar usar comando lsb_release
      try {
        const { stdout } = await execPromise('lsb_release -a');
        const lines = stdout.split('\n');
        
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
          try {
            if (await fs.promises.access(file.path).then(() => true).catch(() => false)) {
              releaseInfo.ID = file.id;
              break;
            }
          } catch (e) {
            // Ignorar erros de acesso
          }
        }
      }
    }
    
    // Determinar a família da distribuição
    let distribution = 'unknown';
    
    if (!releaseInfo.ID) {
      console.warn('Não foi possível determinar a distribuição');
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
          await execPromise('which apt');
          packageManager = 'apt';
          installCommand = 'apt-get install -y';
          distribution = 'debian'; // Assumir família Debian
        } catch (e1) {
          try {
            await execPromise('which dnf');
            packageManager = 'dnf';
            installCommand = 'dnf install -y';
            distribution = 'fedora'; // Assumir família Red Hat
          } catch (e2) {
            try {
              await execPromise('which pacman');
              packageManager = 'pacman';
              installCommand = 'pacman -S --noconfirm';
              distribution = 'arch'; // Assumir Arch Linux
            } catch (e3) {
              try {
                await execPromise('which zypper');
                packageManager = 'zypper';
                installCommand = 'zypper install -y';
                distribution = 'suse'; // Assumir OpenSUSE
              } catch (e4) {
                console.warn('Não foi possível detectar o gerenciador de pacotes');
              }
            }
          }
        }
    }
    
    // Verificar se systemd está disponível
    try {
      await execPromise('which systemctl');
      serviceManager = 'systemctl';
    } catch (error) {
      // Verificar se SysVinit está disponível
      try {
        await execPromise('which service');
        serviceManager = 'service';
      } catch (e) {
        console.warn('Não foi possível detectar o gerenciador de serviços');
        serviceManager = 'unknown';
      }
    }
    
    return {
      distribution,
      packageManager,
      installCommand,
      serviceManager,
      name: releaseInfo.NAME || releaseInfo['Distributor ID'] || distribution,
      version: releaseInfo.VERSION_ID || releaseInfo['Release'] || 'unknown'
    };
  } catch (error) {
    console.error('Erro ao detectar distribuição:', error);
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
 * Verifica os requisitos do sistema para Linux
 * @returns {Promise<Object>} Resultado da verificação
 */
async function checkRequirements() {
  const requirements = {
    compatible: true,
    errors: [],
    warnings: [],
    details: {
      os: 'linux',
      arch: process.arch
    }
  };
  
  // Verificar distribuição Linux
  try {
    const distroInfo = await detectDistribution();
    requirements.details.distribution = distroInfo;
    
    // Verificar se é uma distribuição suportada
    const supportedDistros = ['debian', 'fedora', 'arch'];
    if (!supportedDistros.includes(distroInfo.distribution)) {
      requirements.warnings.push(`Distribuição ${distroInfo.name} não é oficialmente suportada. Tentaremos prosseguir, mas podem ocorrer problemas.`);
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível detectar a distribuição Linux');
  }
  
  // Verificar privilégios de administrador
  try {
    const { stdout } = await execPromise('id -u');
    requirements.details.isRoot = stdout.trim() === '0';
    
    if (!requirements.details.isRoot) {
      try {
        await execPromise('sudo -n true');
        requirements.details.hasSudo = true;
      } catch (e) {
        requirements.details.hasSudo = false;
        requirements.warnings.push('O usuário atual não tem permissão para usar sudo sem senha. Algumas operações podem requerer senha de administrador.');
      }
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar privilégios de administrador');
  }
  
  // Verificar espaço em disco
  try {
    // Verificar espaço na pasta /opt
    const { stdout } = await execPromise('df -k /opt | tail -1 | awk \'{print $4}\'');
    const freeSpaceKB = parseInt(stdout.trim(), 10);
    const freeSpaceGB = freeSpaceKB / (1024 * 1024);
    
    requirements.details.freeSpaceGB = freeSpaceGB.toFixed(2);
    
    if (freeSpaceGB < 2) {
      requirements.warnings.push(`Pouco espaço livre em /opt (${freeSpaceGB.toFixed(2)} GB). Recomendado: pelo menos 2 GB.`);
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar o espaço livre em disco');
  }
  
  // Verificar memória
  const totalMem = os.totalmem();
  const totalMemGB = totalMem / (1024 * 1024 * 1024);
  
  requirements.details.totalMemoryGB = totalMemGB.toFixed(2);
  
  if (totalMemGB < 2) {
    requirements.warnings.push(`Pouca memória RAM (${totalMemGB.toFixed(2)} GB). Recomendado: pelo menos 2 GB.`);
  }
  
  // Verificar CUPS
  try {
    const distroInfo = requirements.details.distribution;
    let cupsStatus = false;
    
    if (distroInfo.serviceManager === 'systemctl') {
      try {
        await execPromise('systemctl is-active cups.service');
        cupsStatus = true;
      } catch (e) {
        cupsStatus = false;
      }
    } else if (distroInfo.serviceManager === 'service') {
      try {
        const { stdout } = await execPromise('service cups status');
        cupsStatus = stdout.includes('running');
      } catch (e) {
        cupsStatus = false;
      }
    }
    
    requirements.details.cupsRunning = cupsStatus;
    
    if (!cupsStatus) {
      try {
        const cupsInstalled = await execPromise('which cups-config || which cupsd || dpkg -l | grep cups').then(() => true).catch(() => false);
        requirements.details.cupsInstalled = cupsInstalled;
        
        if (!cupsInstalled) {
          requirements.warnings.push('CUPS não parece estar instalado. Será instalado durante a configuração.');
        } else {
          requirements.warnings.push('CUPS está instalado mas não está em execução. Será configurado durante a instalação.');
        }
      } catch (e) {
        requirements.warnings.push('Não foi possível verificar se o CUPS está instalado');
      }
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar o status do CUPS');
  }
  
  // Verificar PostgreSQL
  try {
    const distroInfo = requirements.details.distribution;
    let pgStatus = false;
    
    if (distroInfo.serviceManager === 'systemctl') {
      try {
        await execPromise('systemctl is-active postgresql.service');
        pgStatus = true;
      } catch (e) {
        pgStatus = false;
      }
    } else if (distroInfo.serviceManager === 'service') {
      try {
        const { stdout } = await execPromise('service postgresql status');
        pgStatus = stdout.includes('running');
      } catch (e) {
        pgStatus = false;
      }
    }
    
    requirements.details.postgresRunning = pgStatus;
    
    if (!pgStatus) {
      try {
        const pgInstalled = await execPromise('which psql || dpkg -l | grep postgresql').then(() => true).catch(() => false);
        requirements.details.postgresInstalled = pgInstalled;
        
        if (!pgInstalled) {
          requirements.warnings.push('PostgreSQL não parece estar instalado. Será instalado durante a configuração.');
        } else {
          requirements.warnings.push('PostgreSQL está instalado mas não está em execução. Será configurado durante a instalação.');
        }
      } catch (e) {
        requirements.warnings.push('Não foi possível verificar se o PostgreSQL está instalado');
      }
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar o status do PostgreSQL');
  }
  
  // Verificar Node.js
  try {
    const { stdout } = await execPromise('node --version');
    requirements.details.nodeVersion = stdout.trim();
    
    const versionMatch = stdout.trim().match(/^v(\d+)\./);
    if (versionMatch) {
      const majorVersion = parseInt(versionMatch[1], 10);
      if (majorVersion < 14) {
        requirements.warnings.push(`Versão do Node.js (${stdout.trim()}) pode ser muito antiga. Recomendado: v14 ou superior.`);
      }
    }
  } catch (error) {
    requirements.details.nodeInstalled = false;
    requirements.warnings.push('Node.js não está instalado ou não está no PATH. Será instalado durante a configuração.');
  }
  
  // Verificação final
  if (requirements.errors.length > 0) {
    requirements.compatible = false;
  }
  
  return requirements;
}

module.exports = { 
  checkRequirements,
  detectDistribution 
};