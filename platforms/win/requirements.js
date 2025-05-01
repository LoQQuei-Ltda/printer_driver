/**
 * Sistema de Gerenciamento de Impressão - Verificador de Requisitos Windows
 * 
 * Verifica se o sistema Windows atende aos requisitos mínimos
 */

const { execFile, exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * Verifica os requisitos do sistema para Windows
 * @returns {Promise<Object>} Resultado da verificação
 */
async function checkRequirements() {
  const requirements = {
    compatible: true,
    errors: [],
    warnings: [],
    details: {
      os: 'windows',
      arch: process.arch,
      isX64: process.arch === 'x64'
    }
  };
  
  // Verificar versão do Windows
  try {
    const { stdout } = await execPromise('powershell -Command "(Get-WmiObject -class Win32_OperatingSystem).Version"');
    const winVersion = stdout.trim();
    requirements.details.windowsVersion = winVersion;
    
    const versionParts = winVersion.split('.');
    if (versionParts.length >= 3) {
      const major = parseInt(versionParts[0], 10);
      const build = parseInt(versionParts[2], 10);
      
      if (major > 10 || (major === 10 && build >= 18362)) {
        requirements.details.windowsCompatible = true;
      } else {
        requirements.details.windowsCompatible = false;
        requirements.errors.push(`Windows ${winVersion} não é compatível com WSL 2. É necessário Windows 10 versão 1903 (build 18362) ou superior.`);
        requirements.compatible = false;
      }
    } else {
      requirements.warnings.push(`Não foi possível analisar completamente a versão do Windows (${winVersion})`);
      requirements.details.windowsCompatible = false;
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar a versão do Windows');
  }
  
  // Verificar arquitetura do sistema
  if (process.arch !== 'x64' && process.arch !== 'ia32') {
    requirements.warnings.push(`Arquitetura não suportada: ${process.arch}. Suportadas: x64 (64 bits) e ia32 (32 bits).`);
  }
  
  // Verificar virtualização (necessário para WSL 2)
  try {
    let virtualizationEnabled = false;
    
    // Método 1: Verificação direta do Hyper-V
    try {
      const { stdout } = await execPromise('powershell "(Get-ComputerInfo).HyperVisorPresent"');
      virtualizationEnabled = stdout.trim().toLowerCase() === 'true';
    } catch (e) {
      // Tentar método alternativo
      try {
        const { stdout } = await execPromise('systeminfo | findstr /C:"Virtualization"');
        virtualizationEnabled = stdout.toLowerCase().includes('enabled');
      } catch (e2) {
        requirements.warnings.push('Não foi possível verificar o status da virtualização');
      }
    }
    
    requirements.details.virtualizationEnabled = virtualizationEnabled;
    
    if (!virtualizationEnabled) {
      requirements.warnings.push('Virtualização não está habilitada no BIOS/UEFI. Isso pode causar problemas com o WSL 2.');
    }
  } catch (error) {
    requirements.warnings.push('Erro ao verificar status da virtualização');
  }
  
  // Verificar privilégios de administrador
  try {
    const { stdout } = await execPromise('powershell -Command "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"');
    requirements.details.isAdmin = stdout.trim() === 'True';
    
    if (!requirements.details.isAdmin) {
      requirements.warnings.push('O aplicativo não está sendo executado como administrador, o que pode limitar algumas funcionalidades de instalação.');
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar privilégios de administrador');
  }
  
  // Verificar espaço em disco
  try {
    const driveLetter = process.env.SystemDrive || 'C:';
    const { stdout } = await execPromise(`powershell -Command "Get-Volume -DriveLetter ${driveLetter[0]} | Select-Object -ExpandProperty SizeRemaining"`);
    const freeSpace = parseInt(stdout.trim(), 10);
    const freeSpaceGB = freeSpace / (1024 * 1024 * 1024);
    
    requirements.details.freeSpaceGB = freeSpaceGB.toFixed(2);
    
    if (freeSpaceGB < 10) {
      requirements.warnings.push(`Pouco espaço livre no disco ${driveLetter} (${freeSpaceGB.toFixed(2)} GB). Recomendado: pelo menos 10 GB.`);
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
  
  // Verificar WSL e WSL 2
  try {
    // Verificar se o WSL está instalado
    let wslInstalled = false;
    
    try {
      if (fs.existsSync('C:\\Windows\\System32\\wsl.exe')) {
        wslInstalled = true;
      }
    } catch (e) {
      // Ignore
    }
    
    // Verificar versão WSL apenas se wsl.exe existir
    if (wslInstalled) {
      try {
        const { stdout } = await execPromise('wsl --set-default-version 2');
        requirements.details.wsl2Configured = stdout.includes('já está configurado') || 
                                           stdout.includes('already configured') ||
                                           stdout.includes('operation completed successfully');
      } catch (e) {
        requirements.details.wsl2Configured = false;
      }
      
      try {
        // Verificar distribuições
        const { stdout } = await execPromise('wsl --list --verbose');
        const hasUbuntu = stdout.toLowerCase().includes('ubuntu');
        requirements.details.hasUbuntu = hasUbuntu;
      } catch (e) {
        requirements.details.hasUbuntu = false;
      }
    }
    
    requirements.details.wslInstalled = wslInstalled;
    
    if (!wslInstalled) {
      requirements.warnings.push('Windows Subsystem for Linux (WSL) não está instalado.');
    } else if (!requirements.details.wsl2Configured) {
      requirements.warnings.push('WSL 2 não está configurado como padrão.');
    }
    
    if (wslInstalled && !requirements.details.hasUbuntu) {
      requirements.warnings.push('Ubuntu não está instalado no WSL.');
    }
  } catch (error) {
    requirements.warnings.push('Erro ao verificar status do WSL');
  }
  
  // Verificar impressora
  try {
    const { stdout } = await execPromise('powershell -Command "Get-Printer -Name \'Impressora LoQQuei\' -ErrorAction SilentlyContinue | Out-Null; $?"');
    requirements.details.printerInstalled = stdout.trim() === 'True';
    
    if (!requirements.details.printerInstalled) {
      requirements.warnings.push('Impressora "Impressora LoQQuei" não está instalada.');
    }
  } catch (error) {
    requirements.warnings.push('Não foi possível verificar o status da impressora');
  }
  
  // Verificar status final
  if (requirements.errors.length > 0) {
    requirements.compatible = false;
  }
  
  return requirements;
}

module.exports = { 
  checkRequirements 
};