/**
 * Sistema de Gerenciamento de Impressão - Fábrica de Instaladores
 * 
 * Cria o instalador apropriado para a plataforma atual
 */

const platform = require('./platform');

/**
 * Cria um instalador apropriado para a plataforma atual
 * @param {Object} options Opções de configuração para o instalador
 * @returns {Object} Instalador para a plataforma atual
 */
function createInstaller(options = {}) {
  const currentPlatform = platform.detectPlatform();
  
  try {
    // Carregar o instalador específico da plataforma
    switch (currentPlatform) {
      case platform.PLATFORMS.WINDOWS:
        const WindowsInstaller = require('./platforms/windows/installer');
        return new WindowsInstaller(options);
        
      case platform.PLATFORMS.LINUX:
        const LinuxInstaller = require('./platforms/linux/installer');
        return new LinuxInstaller(options);
        
      case platform.PLATFORMS.MACOS:
        const MacInstaller = require('./platforms/macos/installer');
        return new MacInstaller(options);
        
      default:
        throw new Error(`Plataforma não suportada: ${currentPlatform}`);
    }
  } catch (error) {
    console.error(`Erro ao criar instalador para ${currentPlatform}:`, error);
    throw new Error(`Não foi possível criar o instalador para ${currentPlatform}: ${error.message}`);
  }
}

module.exports = { createInstaller };