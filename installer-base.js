/**
 * Sistema de Gerenciamento de Impressão - Instalador Base
 * 
 * Classe base abstrata para implementações específicas de plataforma
 */

const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { EventEmitter } = require('events');
const { execFile, exec } = require('child_process');

class InstallerBase extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configurações padrão
    this.options = {
      logFile: path.join(os.tmpdir(), 'print-management-installer.log'),
      tempDir: path.join(os.tmpdir(), 'print-management-temp'),
      timeouts: {
        command: 60000, // 1 minuto
        installation: 600000 // 10 minutos
      },
      ...options
    };
    
    // Criar diretório temporário
    if (!fs.existsSync(this.options.tempDir)) {
      fs.mkdirSync(this.options.tempDir, { recursive: true });
    }
    
    // Inicializar log
    this.initLog();
    
    // Estado da instalação
    this.state = {
      isInstalling: false,
      installationStep: 0,
      installationProgress: 0,
      componentVersions: {},
      installationComplete: false,
      installationSuccess: false,
      errorMessage: null
    };
    
    // Passos de instalação - deve ser sobrescrito pelas subclasses
    this.installationSteps = [];
  }
  
  /**
   * Inicializa o arquivo de log
   */
  initLog() {
    try {
      const header = `======================================\n` +
                    `Instalador do Sistema de Gerenciamento de Impressão\n` +
                    `Data: ${new Date().toISOString()}\n` +
                    `Sistema: ${os.type()} ${os.release()} ${os.arch()}\n` +
                    `Node.js: ${process.version}\n` +
                    `======================================\n\n`;
      
      fs.writeFileSync(this.options.logFile, header, 'utf8');
      this.log('Inicialização do log concluída', 'info');
    } catch (error) {
      console.error('Erro ao inicializar arquivo de log:', error);
    }
  }
  
  /**
   * Registra uma mensagem no log
   * @param {string} message - Mensagem a ser registrada
   * @param {string} type - Tipo da mensagem (info, warning, error, success)
   */
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    let prefix = '';
    
    switch (type) {
      case 'success':
        prefix = '✓ ';
        break;
      case 'error':
        prefix = '✗ ';
        break;
      case 'warning':
        prefix = '⚠ ';
        break;
      case 'step':
        prefix = '→ ';
        break;
      case 'header':
        prefix = '=== ';
        message = `${message} ===`;
        break;
      default:
        prefix = '';
    }
    
    const logMessage = `[${timestamp}][${type}] ${prefix}${message}`;
    
    // Registrar no console
    console.log(logMessage);
    
    // Salvar no arquivo de log
    try {
      fs.appendFileSync(this.options.logFile, `${logMessage}\n`, 'utf8');
    } catch (error) {
      console.error('Erro ao escrever no log:', error);
    }
    
    // Emitir evento
    this.emit('log', { type, message, timestamp });
  }
  
  /**
   * Executa um comando via Promise
   * @param {string} command - Comando a ser executado
   * @param {number} timeout - Tempo limite em milissegundos
   * @param {boolean} quiet - Se true, não registra no log
   * @returns {Promise<string>} - A saída do comando
   */
  execPromise(command, timeout = null, quiet = false) {
    if (!quiet) {
      this.log(`Executando: ${command}`, 'step');
    }
    
    const timeoutMs = timeout || this.options.timeouts.command;
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tempo limite excedido (${timeoutMs / 1000}s): ${command}`));
      }, timeoutMs);
      
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        clearTimeout(timer);
        
        if (!quiet) {
          if (stdout.trim()) this.log(`Saída: ${stdout.trim().substring(0, 500)}${stdout.length > 500 ? '...' : ''}`, 'info');
          if (stderr.trim()) this.log(`Erro: ${stderr.trim().substring(0, 500)}${stderr.length > 500 ? '...' : ''}`, 'warning');
        }
        
        if (error) {
          reject({ error, stdout, stderr });
          return;
        }
        
        resolve(stdout.trim());
      });
    });
  }
  
  /**
   * Atualiza o progresso da instalação
   * @param {number} step - Índice do passo atual
   * @param {number} progress - Progresso do passo atual (0-100)
   * @param {string} status - Status do passo
   */
  updateProgress(step, progress, status = null) {
    // Atualizar estado
    this.state.installationStep = step;
    this.state.installationProgress = progress;
    
    // Calcular o progresso total
    const totalSteps = this.installationSteps.length;
    const stepSize = 100 / totalSteps;
    const totalProgress = Math.min(
      Math.round((step + (progress / 100)) * stepSize),
      100
    );
    
    // Emitir evento
    this.emit('progress', {
      step,
      progress,
      totalProgress,
      status: status || this.installationSteps[step],
      stepName: this.installationSteps[step]
    });
  }
  
  /**
   * Verifica se o usuário tem privilégios de administrador
   * @returns {Promise<boolean>} - True se tem privilégios, false caso contrário
   */
  async checkAdminPrivileges() {
    throw new Error('Método checkAdminPrivileges() deve ser implementado pela subclasse');
  }
  
  /**
   * Verifica se o sistema atende aos requisitos mínimos
   * @returns {Promise<Object>} - Objeto com o resultado da verificação
   */
  async checkSystemRequirements() {
    throw new Error('Método checkSystemRequirements() deve ser implementado pela subclasse');
  }
  
  /**
   * Instala um componente específico
   * @param {string} component - Nome do componente a ser instalado
   * @returns {Promise<boolean>} - True se a instalação foi bem-sucedida
   */
  async installComponent(component) {
    throw new Error('Método installComponent() deve ser implementado pela subclasse');
  }
  
  /**
   * Executa a instalação completa
   * @returns {Promise<Object>} - Resultado da instalação
   */
  async install() {
    if (this.state.isInstalling) {
      return { success: false, message: 'Instalação já em andamento' };
    }
    
    this.state.isInstalling = true;
    this.state.installationComplete = false;
    this.state.installationSuccess = false;
    this.state.errorMessage = null;
    
    this.log('Iniciando instalação do sistema', 'header');
    
    try {
      // Verificar privilégios de administrador
      this.log('Verificando privilégios de administrador', 'step');
      const hasAdminPrivileges = await this.checkAdminPrivileges();
      
      if (!hasAdminPrivileges) {
        this.log('Privilégios de administrador são necessários para a instalação', 'error');
        throw new Error('Privilégios de administrador são necessários para a instalação');
      }
      
      this.log('Verificando requisitos do sistema', 'step');
      const systemCheck = await this.checkSystemRequirements();
      
      if (!systemCheck.compatible) {
        this.log(`Sistema incompatível: ${systemCheck.errors.join(', ')}`, 'error');
        throw new Error(`Sistema incompatível: ${systemCheck.errors.join(', ')}`);
      }
      
      // Executar a instalação específica da plataforma
      await this.runInstallation();
      
      this.log('Instalação concluída com sucesso!', 'success');
      
      this.state.installationComplete = true;
      this.state.installationSuccess = true;
      this.state.isInstalling = false;
      
      return {
        success: true,
        message: 'Instalação concluída com sucesso'
      };
    } catch (error) {
      this.log(`Erro durante a instalação: ${error.message}`, 'error');
      
      this.state.installationComplete = true;
      this.state.installationSuccess = false;
      this.state.isInstalling = false;
      this.state.errorMessage = error.message;
      
      return {
        success: false,
        message: `Erro durante a instalação: ${error.message}`
      };
    }
  }
  
  /**
   * Executa a instalação específica da plataforma
   * @returns {Promise<void>}
   */
  async runInstallation() {
    throw new Error('Método runInstallation() deve ser implementado pela subclasse');
  }
  
  /**
   * Desinstala o sistema
   * @returns {Promise<Object>} - Resultado da desinstalação
   */
  async uninstall() {
    throw new Error('Método uninstall() deve ser implementado pela subclasse');
  }
}

module.exports = InstallerBase;