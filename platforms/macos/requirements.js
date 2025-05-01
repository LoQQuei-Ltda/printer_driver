/**
 * Sistema de Gerenciamento de Impressão - Verificador de Requisitos macOS
 * 
 * Verifica se o sistema macOS atende aos requisitos mínimos
 */

const { execFile, exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * Verifica se o Homebrew está instalado
 * @returns {Promise<boolean>} True se instalado, false caso contrário
 */
async function isHomebrewInstalled() {
  try {
    await execPromise('which brew');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Verifica os requisitos do sistema para macOS
 * @returns {Promise<Object>} Resultado da verificação
 */
async function checkRequirements() {
  const requirements = {
    compatible: true,
    errors: [],
    warnings: [],
    details: {
      os: 'macos',
      arch: process.arch,
      isAppleSilicon: process.arch === 'arm64'
    }
  };
  
  // Verificar versão do macOS
  try {
    const { stdout } = await execPromise('sw_vers -productVersion');
    const macOsVersion = stdout.trim();
    requirements.details.macOsVersion = macOsVersion;
    
    const versionParts = macOsVersion.split('.');
    const majorVersion = parseInt(versionParts[0], 10);
    
    // Verificar se é pelo menos macOS 11 (Big Sur) ou superior
    if (majorVersion < 11) {
      requirements.warnings.push(`macOS ${macOsVersion} pode não ser totalmente compatível. Recomendado: macOS 11 (Big Sur) ou superior.`);
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar a versão do macOS');
  }
  
  // Verificar Homebrew
  try {
    const homebrewInstalled = await isHomebrewInstalled();
    requirements.details.homebrewInstalled = homebrewInstalled;
    
    if (!homebrewInstalled) {
      requirements.warnings.push('Homebrew não está instalado. Será instalado durante o processo de configuração.');
    } else {
      // Verificar versão do Homebrew
      try {
        const { stdout } = await execPromise('brew --version');
        requirements.details.homebrewVersion = stdout.split('\n')[0];
      } catch (e) {
        requirements.warnings.push('Não foi possível verificar a versão do Homebrew');
      }
    }
  } catch (error) {
    requirements.warnings.push('Erro ao verificar Homebrew');
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
    const { stdout } = await execPromise('df -h / | tail -1 | awk \'{print $4}\'');
    const freeSpace = stdout.trim();
    
    requirements.details.freeSpace = freeSpace;
    
    // Se o espaço livre termina com "G" e o número for menor que 10, adicionar aviso
    if (freeSpace.endsWith('G') || freeSpace.endsWith('Gi')) {
      const sizeValue = parseFloat(freeSpace.replace(/G.*$/, ''));
      if (sizeValue < 10) {
        requirements.warnings.push(`Pouco espaço livre em disco (${freeSpace}). Recomendado: pelo menos 10G.`);
      }
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar o espaço livre em disco');
  }
  
  // Verificar memória
  const totalMem = os.totalmem();
  const totalMemGB = totalMem / (1024 * 1024 * 1024);
  
  requirements.details.totalMemoryGB = totalMemGB.toFixed(2);
  
  if (totalMemGB < 4) {
    requirements.warnings.push(`Pouca memória RAM (${totalMemGB.toFixed(2)} GB). Recomendado: pelo menos 4 GB.`);
  }
  
  // Verificar Rosetta 2 para Apple Silicon
  if (requirements.details.isAppleSilicon) {
    try {
      const { stdout, stderr } = await execPromise('pgrep oahd || echo "not_running"');
      requirements.details.rosettaInstalled = !stdout.includes('not_running');
      
      if (!requirements.details.rosettaInstalled) {
        requirements.warnings.push('Rosetta 2 não está instalado. Pode ser necessário para algumas dependências em Macs com Apple Silicon.');
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar o status do Rosetta 2');
    }
  }
  
  // Verificar CUPS
  try {
    const { stdout } = await execPromise('launchctl list org.cups.cupsd || echo "not_running"');
    requirements.details.cupsRunning = !stdout.includes('not_running');
    
    if (!requirements.details.cupsRunning) {
      requirements.warnings.push('CUPS não está em execução. Será configurado durante a instalação.');
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar o status do CUPS');
  }
  
  // Verificar PostgreSQL
  const pgPaths = [
    '/usr/local/bin/postgres',
    '/opt/homebrew/bin/postgres',
    '/usr/local/opt/postgresql/bin/postgres'
  ];
  
  let pgInstalled = false;
  for (const pgPath of pgPaths) {
    try {
      await fs.promises.access(pgPath);
      pgInstalled = true;
      break;
    } catch (e) {
      // Continuar tentando
    }
  }
  
  requirements.details.postgresInstalled = pgInstalled;
  
  if (!pgInstalled) {
    requirements.warnings.push('PostgreSQL não parece estar instalado. Será instalado durante a configuração.');
  } else {
    // Verificar se está em execução
    try {
      const { stdout } = await execPromise('ps aux | grep postgres[:]');
      requirements.details.postgresRunning = stdout.trim() !== '';
      
      if (!requirements.details.postgresRunning) {
        requirements.warnings.push('PostgreSQL está instalado mas não está em execução. Será configurado durante a instalação.');
      }
    } catch (error) {
      requirements.warnings.push('Não foi possível verificar se o PostgreSQL está em execução');
    }
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
  isHomebrewInstalled 
};