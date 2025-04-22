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
      statusIcon: document.getElementById('statusIcon'),
      progressBar: document.getElementById('progressBar'),
      logContainer: document.getElementById('logContainer'),
      closeButton: document.getElementById('closeButton'),
      questionModal: document.getElementById('questionModal'),
      questionText: document.getElementById('questionText'),
      answerInput: document.getElementById('answerInput'),
      answerButton: document.getElementById('answerButton'),
      modalCloseBtn: document.getElementById('modalCloseBtn'),
      themeToggleBtn: document.getElementById('themeToggleBtn'),
      installLogo: document.getElementById('installLogo'),
      autoScrollToggle: document.getElementById('autoScrollToggle'),
      minimizeBtn: document.getElementById('minimizeBtn'),
      closeBtn: document.getElementById('closeBtn')
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
      isDarkTheme: localStorage.getItem('loqqei-theme') === 'dark',
      autoScroll: true,
      logBuffer: [], // Buffer para processar logs em lote
      processingLogs: false,
      logUpdateInterval: null
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
    
    // Limpar log existente
    this.ui.logContainer.innerHTML = '';
    
    // Adicionar primeira entrada de log
    this.addLogEntry('Iniciando processo de instalação...', 'header');
    
    // Iniciar o intervalo de atualização do log
    this.startLogUpdater();
    
    console.log('Gerenciador de instalação inicializado');
  }
  
  /**
   * Iniciar o atualizador de logs
   * Isso permite agrupar múltiplas mensagens de log e atualizá-las de uma vez,
   * melhorando a performance e evitando travamentos da interface
   */
  startLogUpdater() {
    this.state.logUpdateInterval = setInterval(() => {
      this.processLogBuffer();
    }, 100); // Atualizar 10 vezes por segundo
  }
  
  /**
   * Processar o buffer de logs
   */
  processLogBuffer() {
    if (this.state.processingLogs || this.state.logBuffer.length === 0) return;
    
    this.state.processingLogs = true;
    
    try {
      // Criar um fragmento para adicionar todos os logs de uma vez
      const fragment = document.createDocumentFragment();
      
      // Processar até 50 logs de uma vez para evitar sobrecarga
      const logsToProcess = this.state.logBuffer.splice(0, 50);
      
      logsToProcess.forEach(logEntry => {
        const { message, type } = logEntry;
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = message;
        
        fragment.appendChild(entry);
        
        // Atualizar progresso com base na mensagem
        this.updateProgressFromMessage(message, type);
      });
      
      // Adicionar todos os logs de uma vez
      this.ui.logContainer.appendChild(fragment);
      
      // Rolar para o final se autoScroll estiver ativado
      if (this.state.autoScroll) {
        this.scrollLogToBottom();
      }
    } finally {
      this.state.processingLogs = false;
    }
  }
  
  /**
   * Rolar o log para o final
   */
  scrollLogToBottom() {
    if (this.ui.logContainer) {
      this.ui.logContainer.scrollTop = this.ui.logContainer.scrollHeight;
    }
  }
  
  /**
   * Aplicar tema
   */
  applyTheme() {
    if (this.state.isDarkTheme) {
      document.body.classList.add('dark-theme');
      if (this.ui.themeToggleBtn) {
        this.ui.themeToggleBtn.checked = true;
      }
      this.updateLogo('dark');
    } else {
      document.body.classList.remove('dark-theme');
      if (this.ui.themeToggleBtn) {
        this.ui.themeToggleBtn.checked = false;
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
   * Alternar autoScroll
   */
  toggleAutoScroll() {
    this.state.autoScroll = !this.state.autoScroll;
    
    // Atualizar ícone
    if (this.ui.autoScrollToggle) {
      this.ui.autoScrollToggle.innerHTML = `Auto-rolagem <i class="fas fa-toggle-${this.state.autoScroll ? 'on' : 'off'}"></i>`;
    }
    
    // Se acabou de ativar, rolar para o final
    if (this.state.autoScroll) {
      this.scrollLogToBottom();
    }
  }
  
  /**
   * Configurar escutadores de eventos
   */
  setupEventListeners() {
    // Tema
    if (this.ui.themeToggleBtn) {
      this.ui.themeToggleBtn.addEventListener('change', () => this.toggleTheme());
    }
    
    // Botão fechar
    if (this.ui.closeButton) {
      this.ui.closeButton.addEventListener('click', () => window.close());
    }
    
    // Botão confirmar resposta
    if (this.ui.answerButton) {
      this.ui.answerButton.addEventListener('click', () => this.submitAnswer());
    }
    
    // Botão fechar modal
    if (this.ui.modalCloseBtn) {
      this.ui.modalCloseBtn.addEventListener('click', () => this.hideQuestionModal());
    }
    
    // Tecla Enter no input de resposta
    if (this.ui.answerInput) {
      this.ui.answerInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
          this.submitAnswer();
        }
      });
    }
    
    // Toggle de auto-scroll
    if (this.ui.autoScrollToggle) {
      this.ui.autoScrollToggle.addEventListener('click', () => this.toggleAutoScroll());
    }
    
    // Controle da janela
    if (this.ui.minimizeBtn) {
      this.ui.minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
      });
    }
    
    if (this.ui.closeBtn) {
      this.ui.closeBtn.addEventListener('click', () => {
        window.close();
      });
    }
    
    // Eventos IPC
    ipcRenderer.on('log', (event, data) => this.handleLogMessage(data));
    ipcRenderer.on('pergunta', (event, data) => this.showQuestionModal(data.question));
    ipcRenderer.on('instalacao-completa', (event, data) => this.handleInstallationComplete(data));
    
    // Evento de fechamento da janela para limpar o intervalo
    window.addEventListener('beforeunload', () => {
      if (this.state.logUpdateInterval) {
        clearInterval(this.state.logUpdateInterval);
      }
    });
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
      
      // Atualizar o ícone de status
      if (this.ui.statusIcon) {
        if (percentage < 30) {
          this.ui.statusIcon.className = 'status-indicator yellow';
        } else if (percentage < 90) {
          this.ui.statusIcon.className = 'status-indicator yellow';
        } else {
          this.ui.statusIcon.className = 'status-indicator green';
        }
      }
    }
  }
  
  /**
   * Adicionar entrada no log
   */
  addLogEntry(message, type = 'info') {
    // Adicionar ao buffer de log em vez de diretamente ao DOM
    this.state.logBuffer.push({ message, type });
  }
  
  /**
   * Atualizar progresso baseado na mensagem
   */
  updateProgressFromMessage(message, type) {
    if (this.state.installationComplete) return;
    
    const lowerMessage = message.toLowerCase();
    
    // Atualizar a porcentagem de progresso com base no conteúdo da mensagem
    if (lowerMessage.includes('verificando privilégios') || 
        lowerMessage.includes('verificando versão do windows')) {
      this.updateProgress(0, 5);
    } else if (lowerMessage.includes('verificando virtualização')) {
      this.updateProgress(0, 10);
    } else if (lowerMessage.includes('wsl não está instalado')) {
      this.updateProgress(0, 15);
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
      
      // Fechar automaticamente após 5 segundos
      setTimeout(() => {
        window.close();
      }, 5000);
    }
  }
  
  /**
   * Exibir modal de pergunta
   */
  showQuestionModal(question) {
    if (!this.ui.questionModal || !this.ui.questionText || !this.ui.answerInput) return;
    
    this.ui.questionText.textContent = question;
    this.ui.answerInput.value = '';
    this.ui.questionModal.style.display = 'flex';
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
    // Adicionar timestamp à mensagem
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `[${timestamp}] ${data.message}`;
    
    this.addLogEntry(formattedMessage, data.type);
  }
  
  /**
   * Manipular conclusão da instalação
   */
  handleInstallationComplete(data) {
    if (data.success) {
      this.updateProgress(7, 100);
      this.addLogEntry('✅ Instalação concluída com sucesso!', 'success');
      
      // Atualizar botão
      if (this.ui.closeButton) {
        this.ui.closeButton.style.display = 'block';
        this.ui.closeButton.innerHTML = '<i class="fas fa-check-circle"></i> Instalação Concluída';
      }
      
      // Atualizar status icon
      if (this.ui.statusIcon) {
        this.ui.statusIcon.className = 'status-indicator green';
      }
      
      // Fechar automaticamente após 5 segundos
      this.addLogEntry('Esta janela será fechada automaticamente em 5 segundos...', 'info');
      setTimeout(() => {
        window.close();
      }, 5000);
    } else {
      this.addLogEntry(`❌ Instalação falhou: ${data.error || 'Erro desconhecido'}`, 'error');
      
      if (this.ui.closeButton) {
        this.ui.closeButton.style.display = 'block';
        this.ui.closeButton.innerHTML = '<i class="fas fa-exclamation-circle"></i> Instalação Falhou';
      }
      
      // Atualizar status icon
      if (this.ui.statusIcon) {
        this.ui.statusIcon.className = 'status-indicator red';
      }
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