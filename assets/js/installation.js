/**
 * Sistema de Gerenciamento de Impressão - Installation JS
 * Funcionalidades para a página de instalação
 */

// Módulos do Electron
const { ipcRenderer } = require('electron');

class InstallationManager {
  constructor() {
    // Referências aos elementos da interface
    this.ui = {
      stepStatus: document.getElementById('stepStatus'),
      progressBar: document.getElementById('progressBar'),
      logContainer: document.getElementById('logContainer'),
      closeButton: document.getElementById('closeButton'),
      questionModal: document.getElementById('questionModal'),
      questionText: document.getElementById('questionText'),
      answerInput: document.getElementById('answerInput'),
      answerButton: document.getElementById('answerButton'),
      themeToggleBtn: document.getElementById('themeToggleBtn'),
      installLogo: document.getElementById('installLogo')
    };
    
    // Etapas de instalação
    this.allSteps = [
      'Verificando pré-requisitos',
      'Instalando Windows Subsystem for Linux (WSL)',
      'Configurando WSL 2',
      'Instalando Ubuntu',
      'Configurando usuário padrão',
      'Configurando ambiente de sistema',
      'Configurando serviços',
      'Finalizando instalação'
    ];
    
    // Estado
    this.state = {
      currentStep: 0,
      installationComplete: false,
      isDarkTheme: localStorage.getItem('loqqei-theme') === 'dark'
    };
    
    // Inicializar
    this.init();
  }
  
  /**
   * Inicializar
   */
  init() {
    console.log('Inicializando gerenciador de instalação...');
    
    // Aplicar tema
    this.applyTheme();
    
    // Configurar eventos
    this.setupEventListeners();
    
    // Iniciar barra de progresso
    this.updateProgress(0, 5);
    
    // Adicionar primeira entrada de log
    this.addLogEntry('Iniciando processo de instalação...', 'header');
    
    console.log('Gerenciador de instalação inicializado');
  }
  
  /**
   * Aplicar tema
   */
  applyTheme() {
    if (this.state.isDarkTheme) {
      document.body.classList.add('dark-theme');
      if (this.ui.themeToggleBtn) {
        this.ui.themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
      }
      this.updateLogo('dark');
    } else {
      document.body.classList.remove('dark-theme');
      if (this.ui.themeToggleBtn) {
        this.ui.themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
      }
      this.updateLogo('light');
    }
  }
  
  /**
   * Atualizar o logo com base no tema
   */
  updateLogo(theme) {
    if (this.ui.installLogo) {
      // Limpar o conteúdo existente
      this.ui.installLogo.innerHTML = '';
      
      // Criar elemento de imagem para o logo
      const logoImg = document.createElement('img');
      logoImg.width = 32;
      logoImg.height = 32;
      logoImg.src = `../assets/icon/${theme}.ico`;
      logoImg.alt = 'Logo';
      logoImg.style.marginRight = '8px';
      
      console.log(`Atualizando logo de instalação: ${logoImg.src}`);
      
      // Adicionar o logo ao contêiner
      this.ui.installLogo.appendChild(logoImg);
    }
  }
  
  /**
   * Alternar tema
   */
  toggleTheme() {
    this.state.isDarkTheme = !this.state.isDarkTheme;
    localStorage.setItem('loqqei-theme', this.state.isDarkTheme ? 'dark' : 'light');
    this.applyTheme();
    
    // Atualizar favicon
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = `../assets/icon/${this.state.isDarkTheme ? 'dark' : 'light'}.ico`;
    
    // Atualizar o ícone da aplicação
    ipcRenderer.send('update-app-icon', { theme: this.state.isDarkTheme ? 'dark' : 'light' });
  }
  
  /**
   * Configurar escutadores de eventos
   */
  setupEventListeners() {
    // Tema
    if (this.ui.themeToggleBtn) {
      this.ui.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }
    
    // Botão fechar
    if (this.ui.closeButton) {
      this.ui.closeButton.addEventListener('click', () => window.close());
    }
    
    // Botão confirmar resposta
    if (this.ui.answerButton) {
      this.ui.answerButton.addEventListener('click', () => this.submitAnswer());
    }
    
    // Tecla Enter no input de resposta
    if (this.ui.answerInput) {
      this.ui.answerInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
          this.submitAnswer();
        }
      });
    }
    
    // Eventos IPC
    ipcRenderer.on('log', (event, data) => this.handleLogMessage(data));
    ipcRenderer.on('pergunta', (event, data) => this.showQuestionModal(data.question));
    ipcRenderer.on('instalacao-completa', (event, data) => this.handleInstallationComplete(data));
  }
  
  /**
   * Atualizar progresso
   */
  updateProgress(step, percentage) {
    if (step >= 0 && step < this.allSteps.length && this.ui.stepStatus) {
      this.state.currentStep = step;
      this.ui.stepStatus.textContent = this.allSteps[step];
    }
    
    if (percentage >= 0 && percentage <= 100 && this.ui.progressBar) {
      this.ui.progressBar.style.width = `${percentage}%`;
    }
  }
  
  /**
   * Adicionar entrada no log
   */
  addLogEntry(message, type = 'info') {
    if (!this.ui.logContainer) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = message;
    
    this.ui.logContainer.appendChild(logEntry);
    this.ui.logContainer.scrollTop = this.ui.logContainer.scrollHeight;
    
    // Atualizar progresso com base na mensagem
    this.updateProgressFromMessage(message, type);
  }
  
  /**
   * Atualizar progresso baseado na mensagem
   */
  updateProgressFromMessage(message, type) {
    if (this.state.installationComplete) return;
    
    const lowerMessage = message.toLowerCase();
    
    // Atualize a porcentagem de progresso com base no conteúdo da mensagem
    if (lowerMessage.includes('verificando privilégios') || 
        lowerMessage.includes('verificando versão do windows')) {
      this.updateProgress(0, 5);
    } else if (lowerMessage.includes('verificando virtualização')) {
      this.updateProgress(0, 10);
    } else if (lowerMessage.includes('instalando wsl')) {
      this.updateProgress(1, 20);
    } else if (lowerMessage.includes('recurso wsl habilitado')) {
      this.updateProgress(1, 30);
    } else if (lowerMessage.includes('definindo wsl 2') || 
              lowerMessage.includes('kernel do wsl2 instalado')) {
      this.updateProgress(2, 40);
    } else if (lowerMessage.includes('instalando ubuntu')) {
      this.updateProgress(3, 50);
    } else if (lowerMessage.includes('ubuntu instalado')) {
      this.updateProgress(3, 60);
    } else if (lowerMessage.includes('configurando usuário padrão')) {
      this.updateProgress(4, 70);
    } else if (lowerMessage.includes('configurando o sistema')) {
      this.updateProgress(5, 80);
    } else if (lowerMessage.includes('configurando cups') || 
              lowerMessage.includes('configurando samba') ||
              lowerMessage.includes('configurando nginx')) {
      this.updateProgress(6, 90);
    } else if (lowerMessage.includes('instalação concluída')) {
      this.updateProgress(7, 100);
      this.state.installationComplete = true;
      
      if (this.ui.closeButton) {
        this.ui.closeButton.style.display = 'block';
      }
    }
  }
  
  /**
   * Exibir modal de pergunta
   */
  showQuestionModal(question) {
    if (!this.ui.questionModal || !this.ui.questionText || !this.ui.answerInput) return;
    
    this.ui.questionText.textContent = question;
    this.ui.answerInput.value = '';
    this.ui.questionModal.style.display = 'block';
    this.ui.answerInput.focus();
  }
  
  /**
   * Ocultar modal de pergunta
   */
  hideQuestionModal() {
    if (this.ui.questionModal) {
      this.ui.questionModal.style.display = 'none';
    }
  }
  
  /**
   * Enviar resposta
   */
  submitAnswer() {
    if (!this.ui.answerInput) return;
    
    const resposta = this.ui.answerInput.value;
    ipcRenderer.send('resposta-pergunta', resposta);
    this.hideQuestionModal();
    this.addLogEntry(`Resposta enviada: ${resposta}`, 'info');
  }
  
  /**
   * Manipular mensagem de log
   */
  handleLogMessage(data) {
    this.addLogEntry(data.message, data.type);
    
    // Atualizações adicionais baseadas em tipos específicos de mensagens
    if (data.type === 'step' || data.type === 'header') {
      // Poderia atualizar um indicador de status, se existisse
    }
  }
  
  /**
   * Manipular conclusão da instalação
   */
  handleInstallationComplete(data) {
    if (data.success) {
      this.updateProgress(7, 100);
      this.addLogEntry('Instalação concluída com sucesso!', 'success');
    } else {
      this.addLogEntry(`Instalação falhou: ${data.error || 'Erro desconhecido'}`, 'error');
    }
    
    if (this.ui.closeButton) {
      this.ui.closeButton.style.display = 'block';
    }
  }
  
  /**
   * Exibir mensagem de status
   */
  showStatus(message) {
    const statusEl = document.getElementById('statusMessage');
    
    if (!statusEl) {
      // Criar elemento de status se não existir
      const container = document.querySelector('.progress-container');
      
      if (container) {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'statusMessage';
        statusDiv.className = 'status-message';
        statusDiv.textContent = message;
        
        // Inserir antes da barra de progresso
        const progressContainer = document.querySelector('.progress-bar-container');
        if (progressContainer) {
          container.insertBefore(statusDiv, progressContainer);
        } else {
          container.appendChild(statusDiv);
        }
      }
    } else {
      statusEl.textContent = message;
    }
  }
}

// Inicializar quando o DOM estiver carregado
window.addEventListener('DOMContentLoaded', () => {
  // Verificar e definir o favicon com base no tema
  const savedTheme = localStorage.getItem('loqqei-theme') || 'dark';
  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.href = `../assets/icon/${savedTheme}.ico`;
  
  // Inicializar o gerenciador de instalação
  window.installationManager = new InstallationManager();
});