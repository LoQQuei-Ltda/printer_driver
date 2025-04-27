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
      progressPercentage: document.getElementById('progressPercentage'),
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
      closeBtn: document.getElementById('closeBtn'),
      exportLogButton: document.getElementById('exportLogButton')
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
      logUpdateInterval: null,
      lastProgressUpdate: Date.now(), // Para limitar a frequência de atualizações da barra de progresso
      stepStatus: Array(8).fill('Pendente'),
      stepState: Array(8).fill('pending') // pending, in-progress, completed, error
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
    // Processar imediatamente o primeiro lote para garantir feedback rápido
    this.processLogBuffer();

    // Configurar o intervalo para atualização contínua
    this.state.logUpdateInterval = setInterval(() => {
      this.processLogBuffer();
    }, 50); // Atualizar 20 vezes por segundo para feedback mais rápido
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
   * Exportar log para arquivo de texto
   */
  exportLog() {
    if (!this.ui.logContainer) return;
    
    const logEntries = this.ui.logContainer.querySelectorAll('.log-entry');
    let logText = `Log de Instalação - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n\n`;
    
    logEntries.forEach(entry => {
      logText += `${entry.textContent}\n`;
    });
    
    // Criar um blob com o texto
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    // Criar um link para download e clicar nele
    const a = document.createElement('a');
    a.href = url;
    a.download = `instalacao_log_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    
    // Limpar
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    this.addLogEntry('Log exportado para arquivo de texto', 'success');
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

    // Botão de exportar log
    if (this.ui.exportLogButton) {
      this.ui.exportLogButton.addEventListener('click', () => this.exportLog());
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
    ipcRenderer.on('log', (event, data) => {
      console.log('Log recebido:', data); // Debug
      this.handleLogMessage(data);
    });

    setInterval(() => {
      console.log('🔍 Status do logContainer:', document.getElementById('logContainer').childElementCount, 'itens');
    }, 5000);

    ipcRenderer.on('pergunta', (event, data) => {
      console.log('Pergunta recebida:', data); // Debug
      this.showQuestionModal(data.question);
    });

    ipcRenderer.on('instalacao-completa', (event, data) => {
      console.log('Instalação completa:', data); // Debug
      this.handleInstallationComplete(data);
    });

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
    // Limitar atualizações para evitar sobrecarga
    const now = Date.now();
    if (now - this.state.lastProgressUpdate < 50 && percentage < 100) return;
    this.state.lastProgressUpdate = now;

    if (step >= 0 && step < this.allSteps.length && this.ui.stepStatus) {
      this.state.currentStep = step;
      this.ui.stepStatus.textContent = this.allSteps[step];
      
      // Atualizar o status da etapa
      this.updateStepStatus(step, 'in-progress', 'Em andamento');
      
      // Marcar etapas anteriores como concluídas se não estiverem marcadas
      for (let i = 0; i < step; i++) {
        if (this.state.stepState[i] !== 'completed' && this.state.stepState[i] !== 'error') {
          this.updateStepStatus(i, 'completed', 'Concluído');
        }
      }
    }

    if (percentage >= 0 && percentage <= 100 && this.ui.progressBar) {
      this.ui.progressBar.style.width = `${percentage}%`;
      
      // Atualizar porcentagem numérica
      if (this.ui.progressPercentage) {
        this.ui.progressPercentage.textContent = `${Math.round(percentage)}%`;
      }
      
      console.log(`Atualizando barra de progresso: ${percentage}%`); // Debug

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
   * Atualizar status de uma etapa específica
   */
  updateStepStatus(stepIndex, state, statusText) {
    if (stepIndex < 0 || stepIndex >= this.allSteps.length) return;
    
    this.state.stepState[stepIndex] = state;
    this.state.stepStatus[stepIndex] = statusText;
    
    const indicator = document.getElementById(`stepIndicator${stepIndex + 1}`);
    const status = document.getElementById(`stepStatus${stepIndex + 1}`);
    
    if (indicator) {
      indicator.className = `step-indicator ${state}`;
      
      // Atualizar ícone
      if (state === 'pending') {
        indicator.innerHTML = '<i class="fas fa-circle"></i>';
      } else if (state === 'in-progress') {
        indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      } else if (state === 'completed') {
        indicator.innerHTML = '<i class="fas fa-check"></i>';
      } else if (state === 'error') {
        indicator.innerHTML = '<i class="fas fa-times"></i>';
      }
    }
    
    if (status) {
      status.textContent = statusText;
    }
  }

  /**
   * Adicionar entrada no log
   */
  addLogEntry(message, type = 'info') {
    // Adicionar ao buffer de log em vez de diretamente ao DOM
    this.state.logBuffer.push({ message, type });

    // Forçar processamento imediato para visualização rápida
    if (type === 'error' || type === 'success' || type === 'header' || this.state.logBuffer.length === 1) {
      this.processLogBuffer();
    }
  }

  /**
   * Atualizar progresso baseado na mensagem
   */
  updateProgressFromMessage(message, type) {
    if (this.state.installationComplete) return;

    const lowerMessage = message.toLowerCase();

    // Atualizar a porcentagem de progresso com base no conteúdo da mensagem
    if (lowerMessage.includes('instalação concluída com sucesso') ||
      (type === 'success' && lowerMessage.includes('concluída'))) {
      this.updateProgress(7, 100);
      this.updateStepStatus(7, 'completed', 'Concluído');
      this.state.installationComplete = true;

      if (this.ui.closeButton) {
        this.ui.closeButton.style.display = 'block';
      }

      return;
    } else if (lowerMessage.includes('verificando privilégios') ||
      lowerMessage.includes('verificando versão do windows')) {
      this.updateProgress(0, 5);
    } else if (lowerMessage.includes('verificando virtualização')) {
      this.updateProgress(0, 10);
    } else if (lowerMessage.includes('wsl não está instalado')) {
      this.updateProgress(0, 15);
      this.updateStepStatus(0, 'completed', 'Concluído');
    } else if (lowerMessage.includes('instalando wsl')) {
      this.updateProgress(1, 20);
      this.updateStepStatus(0, 'completed', 'Concluído');
    } else if (lowerMessage.includes('recurso wsl habilitado')) {
      this.updateProgress(1, 30);
    } else if (lowerMessage.includes('definindo wsl 2') ||
      lowerMessage.includes('kernel do wsl2 instalado')) {
      this.updateProgress(2, 40);
      this.updateStepStatus(1, 'completed', 'Concluído');
    } else if (lowerMessage.includes('instalando ubuntu')) {
      this.updateProgress(3, 50);
      this.updateStepStatus(2, 'completed', 'Concluído');
    } else if (lowerMessage.includes('ubuntu instalado')) {
      this.updateProgress(3, 60);
    } else if (lowerMessage.includes('configurando usuário padrão')) {
      this.updateProgress(4, 70);
      this.updateStepStatus(3, 'completed', 'Concluído');
    } else if (lowerMessage.includes('configurando o sistema')) {
      this.updateProgress(5, 80);
      this.updateStepStatus(4, 'completed', 'Concluído');
    } else if (lowerMessage.includes('configurando cups') ||
      lowerMessage.includes('configurando samba') ||
      lowerMessage.includes('configurando nginx')) {
      this.updateProgress(6, 90);
      this.updateStepStatus(5, 'completed', 'Concluído');
    } else if (lowerMessage.includes('instalação concluída')) {
      this.updateProgress(7, 100);
      this.updateStepStatus(6, 'completed', 'Concluído');
      this.updateStepStatus(7, 'completed', 'Concluído');
      this.state.installationComplete = true;

      if (this.ui.closeButton) {
        this.ui.closeButton.style.display = 'block';
      }

      // Fechar automaticamente após 5 segundos
      setTimeout(() => {
        window.close();
      }, 5000);
    }
    
    // Verificar erros
    if (type === 'error') {
      // Marcar a etapa atual como erro
      this.updateStepStatus(this.state.currentStep, 'error', 'Erro');
    }
    
    // Verificar sucesso em etapas específicas
    if (type === 'success') {
      if (lowerMessage.includes('wsl instalado')) {
        this.updateStepStatus(1, 'completed', 'Concluído');
      } else if (lowerMessage.includes('wsl 2 configurado')) {
        this.updateStepStatus(2, 'completed', 'Concluído');
      } else if (lowerMessage.includes('ubuntu instalado')) {
        this.updateStepStatus(3, 'completed', 'Concluído');
      } else if (lowerMessage.includes('usuário configurado')) {
        this.updateStepStatus(4, 'completed', 'Concluído');
      } else if (lowerMessage.includes('ambiente configurado')) {
        this.updateStepStatus(5, 'completed', 'Concluído');
      } else if (lowerMessage.includes('serviços configurados')) {
        this.updateStepStatus(6, 'completed', 'Concluído');
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

    console.log('Processando log:', formattedMessage); // Debug

    this.addLogEntry(formattedMessage, data.type);
  }

  /**
   * Manipular conclusão da instalação
   */
  handleInstallationComplete(data) {
    console.log('Recebido evento de instalação completa:', data);

    if (data.success) {
      this.updateProgress(7, 100);
      this.addLogEntry('✅ Instalação concluída com sucesso!', 'success');
      
      // Marcar todas as etapas como concluídas
      for (let i = 0; i < this.allSteps.length; i++) {
        this.updateStepStatus(i, 'completed', 'Concluído');
      }

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

      // Informar ao usuário sobre o fechamento automático
      alert('Instalação concluída com sucesso! Esta janela será fechada automaticamente em 5 segundos.');
    } else {
      this.addLogEntry(`❌ Instalação falhou: ${data.error || 'Erro desconhecido'}`, 'error');
      
      // Marcar etapa atual como erro
      this.updateStepStatus(this.state.currentStep, 'error', 'Erro');

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

  // Debug: confirmar inicialização
  console.log('InstallationManager inicializado no DOM');
});