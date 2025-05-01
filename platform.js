/**
 * Sistema de Gerenciamento de Impressão - Detector de Plataforma
 * 
 * Este módulo fornece utilitários para detectar a plataforma e
 * carregar os módulos específicos para cada sistema operacional.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { app } = require('electron');

// Constantes
const PLATFORMS = {
  WINDOWS: 'windows',
  LINUX: 'linux',
  MACOS: 'macos'
};

// Arquitetura
const ARCH = {
  X64: 'x64',
  X86: 'ia32',
  ARM64: 'arm64'
};

/**
 * Detecta a plataforma atual do sistema
 * @returns {string} O nome da plataforma (windows, linux, macos)
 */
function detectPlatform() {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return PLATFORMS.WINDOWS;
  } else if (platform === 'darwin') {
    return PLATFORMS.MACOS;
  } else if (platform === 'linux') {
    return PLATFORMS.LINUX;
  } else {
    throw new Error(`Plataforma não suportada: ${platform}`);
  }
}

/**
 * Detecta a arquitetura do sistema
 * @returns {string} A arquitetura (x64, ia32, arm64)
 */
function detectArch() {
  const arch = process.arch;
  
  if (arch === 'x64') {
    return ARCH.X64;
  } else if (arch === 'ia32') {
    return ARCH.X86;
  } else if (arch === 'arm64') {
    return ARCH.ARM64;
  } else {
    console.warn(`Arquitetura não reconhecida: ${arch}, usando x64 como padrão`);
    return ARCH.X64;
  }
}

/**
 * Carrega o módulo específico da plataforma
 * @param {string} moduleName Nome do módulo a ser carregado
 * @returns {Object} O módulo específico da plataforma
 */
function loadPlatformModule(moduleName) {
  const platform = detectPlatform();
  const modulePath = path.join(__dirname, 'platforms', platform, `${moduleName}.js`);
  
  try {
    if (fs.existsSync(modulePath)) {
      return require(modulePath);
    } else {
      throw new Error(`Módulo ${moduleName} não encontrado para a plataforma ${platform}`);
    }
  } catch (error) {
    console.error(`Erro ao carregar módulo específico da plataforma: ${error.message}`);
    
    // Carregar uma implementação genérica/fallback se disponível
    const fallbackPath = path.join(__dirname, 'platforms', 'common', `${moduleName}.js`);
    if (fs.existsSync(fallbackPath)) {
      return require(fallbackPath);
    }
    
    throw error;
  }
}

/**
 * Verifica se o usuário tem privilégios de administrador
 * @returns {Promise<boolean>} True se o usuário tem privilégios de administrador
 */
function checkAdminPrivileges() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // Windows: verificar com PowerShell
      exec('powershell -Command "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
        (error, stdout) => {
          if (error) {
            console.error('Erro ao verificar privilégios de administrador:', error);
            resolve(false);
            return;
          }
          resolve(stdout.trim() === 'True');
        }
      );
    } else if (process.platform === 'linux') {
      // Linux: verificar com o comando id
      exec('id -u', (error, stdout) => {
        if (error) {
          console.error('Erro ao verificar privilégios de administrador:', error);
          resolve(false);
          return;
        }
        resolve(stdout.trim() === '0');
      });
    } else if (process.platform === 'darwin') {
      // macOS: verificar com o comando id
      exec('id -u', (error, stdout) => {
        if (error) {
          console.error('Erro ao verificar privilégios de administrador:', error);
          resolve(false);
          return;
        }
        resolve(stdout.trim() === '0');
      });
    } else {
      resolve(false);
    }
  });
}

/**
 * Obtém o caminho dos recursos específicos da plataforma
 * @returns {string} O caminho para os recursos da plataforma
 */
function getPlatformResourcesPath() {
  const platform = detectPlatform();
  // No modo de desenvolvimento, os recursos estão na pasta do projeto
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'platforms');
  } else {
    return path.join(__dirname, 'platforms', platform);
  }
}

/**
 * Obtém o caminho para o diretório de dados da aplicação
 * @returns {string} O caminho para o diretório de dados
 */
function getAppDataPath() {
  let appDataPath;
  
  if (process.platform === 'win32') {
    appDataPath = path.join(app.getPath('userData'), 'appData');
  } else if (process.platform === 'darwin') {
    appDataPath = path.join(app.getPath('userData'), 'appData');
  } else if (process.platform === 'linux') {
    appDataPath = path.join(app.getPath('userData'), 'appData');
  } else {
    appDataPath = path.join(app.getPath('userData'), 'appData');
  }
  
  // Garantir que o diretório exista
  if (!fs.existsSync(appDataPath)) {
    fs.mkdirSync(appDataPath, { recursive: true });
  }
  
  return appDataPath;
}

/**
 * Verifica se o sistema tem os requisitos mínimos
 * @returns {Promise<Object>} O status dos requisitos do sistema
 */
async function checkSystemRequirements() {
  const platform = detectPlatform();
  const arch = detectArch();
  
  // Carregar o verificador específico da plataforma
  try {
    const verifier = loadPlatformModule('requirements');
    return await verifier.checkRequirements();
  } catch (error) {
    console.error(`Erro ao verificar requisitos: ${error.message}`);
    return {
      compatible: false,
      errors: [`Erro ao verificar requisitos: ${error.message}`],
      platform,
      arch
    };
  }
}

// Exportar as funções e constantes
module.exports = {
  PLATFORMS,
  ARCH,
  detectPlatform,
  detectArch,
  loadPlatformModule,
  checkAdminPrivileges,
  getPlatformResourcesPath,
  getAppDataPath,
  checkSystemRequirements
};