/**
 * Sistema de Gerenciamento de Impressão - Installation JS
 * Funcionalidades para a página de instalação
 */

// Módulos do Electron
const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  console.log('Página de instalação carregada');
  // Enviar mensagem para o processo principal que a página está pronta
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('installation-page-ready');

  // Inicializar o gerenciador de instalação
  window.installationManager = new InstallationManager();

  // Debug: confirmar inicialização
  console.log('InstallationManager inicializado no DOM');
});

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
    this.addLogEntry('Aguardando comandos do instalador...', 'info');
  
    // Iniciar o intervalo de atualização do log
    this.startLogUpdater();
  
    // Escutar explicitamente por eventos de atualização
    const { ipcRenderer } = require('electron');
  
    // Remover ouvintes anteriores para prevenir duplicação
    ipcRenderer.removeAllListeners('step-update');
    ipcRenderer.removeAllListeners('progress-update');
    ipcRenderer.removeAllListeners('log');
    ipcRenderer.removeAllListeners('pergunta');
    ipcRenderer.removeAllListeners('instalacao-completa');
  
    // Configurar receptor de atualização de etapa
    ipcRenderer.on('step-update', (event, data) => {
      console.log('Recebida atualização de etapa:', data);
      this.updateStepStatus(data.step, data.state, data.message);
    });
  
    // Configurar receptor de atualização de progresso
    ipcRenderer.on('progress-update', (event, data) => {
      console.log('Recebida atualização de progresso:', data.percentage);
      if (data.percentage >= 0 && data.percentage <= 100) {
        this.updateProgressBar(data.percentage);
      }
    });
  
    // Configurar receptor de log
    ipcRenderer.on('log', (event, data) => {
      console.log('Log recebido:', data);
      this.handleLogMessage(data);
    });
  
    // Configurar receptor de pergunta
    ipcRenderer.on('pergunta', (event, data) => {
      console.log('Pergunta recebida:', data);
      this.showQuestionModal(data.question);
    });
  
    // Configurar receptor de conclusão
    ipcRenderer.on('instalacao-completa', (event, data) => {
      console.log('Instalação completa:', data);
      this.handleInstallationComplete(data);
    });
  
    // Imediatamente enviar mensagem de pronto para o processo principal
    ipcRenderer.send('installation-page-ready');
  
    console.log('Gerenciador de instalação inicializado');
  }

  processLogForSteps(message, type) {
    const lowerMessage = message.toLowerCase();
    console.log('Analisando mensagem para mapeamento de etapas:', lowerMessage);
    
    // Detectar componentes específicos sendo instalados
    if (lowerMessage.includes('instalando/configurando database') || 
        lowerMessage.includes('banco de dados')) {
      // Database geralmente é configurado como parte do ambiente
      console.log('Detectada instalação/configuração de banco de dados');
      
      // Marcar etapas anteriores como concluídas
      for (let i = 0; i < 5; i++) {
        this.updateStepStatus(i, 'completed', 'Concluído');
      }
      
      // Atualizar etapa atual
      this.updateStepStatus(5, 'in-progress', 'Em andamento');
      this.updateProgressBar(80);
      
      // Atualizar status principal
      if (this.ui.stepStatus) {
        this.ui.stepStatus.textContent = this.allSteps[5];
      }
      
      return true;
    } 
    else if (lowerMessage.includes('instalando/configurando api') || 
             lowerMessage.includes('instalando/configurando pm2')) {
      // API e PM2 são geralmente parte dos serviços
      console.log('Detectada instalação/configuração de API ou PM2');
      
      // Marcar etapas anteriores como concluídas
      for (let i = 0; i < 6; i++) {
        this.updateStepStatus(i, 'completed', 'Concluído');
      }
      
      // Atualizar etapa atual
      this.updateStepStatus(6, 'in-progress', 'Em andamento');
      this.updateProgressBar(90);
      
      // Atualizar status principal
      if (this.ui.stepStatus) {
        this.ui.stepStatus.textContent = this.allSteps[6];
      }
      
      return true;
    }
    else if (lowerMessage.includes('instalando/configurando printer') || 
             lowerMessage.includes('impressora')) {
      // Impressora geralmente é o último componente antes de finalizar
      console.log('Detectada instalação/configuração de impressora');
      
      // Marcar etapas anteriores como concluídas
      for (let i = 0; i < 7; i++) {
        this.updateStepStatus(i, 'completed', 'Concluído');
      }
      
      // Atualizar etapa atual
      this.updateStepStatus(7, 'in-progress', 'Em andamento');
      this.updateProgressBar(95);
      
      // Atualizar status principal
      if (this.ui.stepStatus) {
        this.ui.stepStatus.textContent = this.allSteps[7];
      }
      
      return true;
    }
    else if (lowerMessage.includes('verificando o sistema após a instalação')) {
      // Verificação final
      console.log('Detectada verificação final do sistema');
      
      // Marcar etapas anteriores como concluídas
      for (let i = 0; i < 7; i++) {
        this.updateStepStatus(i, 'completed', 'Concluído');
      }
      
      // Atualizar etapa atual
      this.updateStepStatus(7, 'in-progress', 'Em andamento');
      this.updateProgressBar(98);
      
      // Atualizar status principal
      if (this.ui.stepStatus) {
        this.ui.stepStatus.textContent = this.allSteps[7];
      }
      
      return true;
    }
    else if (lowerMessage.includes('componentes que serão instalados')) {
      // Detectar a lista de componentes e marcar etapas apropriadamente
      console.log('Detectada listagem de componentes para instalação');
      
      // Verificar quais componentes serão instalados
      const needsWsl = lowerMessage.includes('wsl');
      const needsUbuntu = lowerMessage.includes('ubuntu');
      const hasDatabaseComponent = lowerMessage.includes('database');
      const hasApiComponent = lowerMessage.includes('api');
      const hasPm2Component = lowerMessage.includes('pm2');
      const hasPrinterComponent = lowerMessage.includes('printer');
      
      // Se não menciona WSL ou Ubuntu, significa que já estão instalados
      if (!needsWsl && !needsUbuntu) {
        // Marcar as primeiras etapas como concluídas
        for (let i = 0; i < 4; i++) {
          this.updateStepStatus(i, 'completed', 'Concluído');
        }
        
        // Se temos componentes de ambiente/serviço, vamos para a etapa correspondente
        if (hasDatabaseComponent || hasApiComponent || hasPm2Component || hasPrinterComponent) {
          this.updateStepStatus(4, 'completed', 'Concluído'); // Usuário padrão também está ok
          this.updateStepStatus(5, 'in-progress', 'Em andamento'); // Ambiente de sistema
          this.updateProgressBar(70);
          
          // Atualizar status principal
          if (this.ui.stepStatus) {
            this.ui.stepStatus.textContent = this.allSteps[5];
          }
        }
      }
      
      return true;
    }
    else if (lowerMessage.includes('analisando componentes necessários')) {
      // Análise inicial - verificação concluída
      console.log('Detectada análise de componentes - verificação concluída');
      
      // Marcar primeira etapa como concluída
      this.updateStepStatus(0, 'completed', 'Concluído');
      this.updateProgressBar(20);
      
      return true;
    }
    
    // Padrão para instalação genérica de componentes
    if (lowerMessage.includes('instalando/configurando')) {
      console.log('Detectada instalação/configuração genérica de componente');
      
      // No mínimo, a verificação está concluída
      this.updateStepStatus(0, 'completed', 'Concluído');
      
      // Se não temos um componente específico, assumir que estamos na etapa de ambiente de sistema
      this.updateStepStatus(5, 'in-progress', 'Em andamento');
      this.updateProgressBar(80);
      
      // Atualizar status principal
      if (this.ui.stepStatus) {
        this.ui.stepStatus.textContent = this.allSteps[5];
      }
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Adicione este método para atualizar exclusivamente a barra de progresso:
   */
  updateProgressBar(percentage) {
    if (percentage >= 0 && percentage <= 100 && this.ui.progressBar) {
      // Use requestAnimationFrame for smoother updates
      requestAnimationFrame(() => {
        this.ui.progressBar.style.width = `${percentage}%`;
  
        // Update numerical percentage
        if (this.ui.progressPercentage) {
          this.ui.progressPercentage.textContent = `${Math.round(percentage)}%`;
        }
  
        // Update status icon based on progress
        if (this.ui.statusIcon) {
          if (percentage < 30) {
            this.ui.statusIcon.className = 'status-indicator yellow';
          } else if (percentage < 90) {
            this.ui.statusIcon.className = 'status-indicator yellow';
          } else {
            this.ui.statusIcon.className = 'status-indicator green';
          }
        }
      });
    }
  }

  /**
   * Iniciar o atualizador de logs
   * Isso permite agrupar múltiplas mensagens de log e atualizá-las de uma vez,
   * melhorando a performance e evitando travamentos da interface
   */
  startLogUpdater() {
    // Processar imediatamente o primeiro lote para garantir feedback rápido
    this.processLogBuffer();
  
    // Configurar o intervalo para atualização contínua com intervalo menor
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
      // Create fragment for batch DOM updates
      const fragment = document.createDocumentFragment();
  
      // Process up to 50 logs at once to avoid overwhelming the UI
      const logsToProcess = this.state.logBuffer.splice(0, 50);
  
      // Track if we need to update UI based on logs
      let needsProgressUpdate = false;
      let progressValue = -1;
  
      logsToProcess.forEach(logEntry => {
        const { message, type } = logEntry;
  
        // Create log entry element
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = message;
  
        // Check for duplicates
        let isDuplicate = false;
        const existingEntries = this.ui.logContainer.getElementsByClassName('log-entry');
        if (existingEntries.length > 0) {
          const lastEntry = existingEntries[existingEntries.length - 1];
          if (lastEntry.textContent === message && lastEntry.className === entry.className) {
            isDuplicate = true;
          }
        }
  
        if (!isDuplicate) {
          fragment.appendChild(entry);
  
          // Check if this message should update progress
          const progressInfo = this.getProgressInfoFromMessage(message, type);
          if (progressInfo.shouldUpdate) {
            needsProgressUpdate = true;
            progressValue = progressInfo.value;
          }
        }
      });
  
      // Add all logs at once for better performance
      this.ui.logContainer.appendChild(fragment);
  
      // Update progress if needed
      if (needsProgressUpdate && progressValue >= 0) {
        this.updateProgressBar(progressValue);
      }
  
      // Scroll to bottom if auto-scroll is enabled
      if (this.state.autoScroll) {
        this.scrollLogToBottom();
      }
    } catch (error) {
      console.error('Erro ao processar logs:', error);
    } finally {
      this.state.processingLogs = false;
    }
  }  

  // Helper to extract progress info from log messages
  getProgressInfoFromMessage(message, type) {
    const lowerMessage = message.toLowerCase();
    let result = { shouldUpdate: false, value: -1 };
  
    // Progress percentage mapping (same logic as in installer.js)
    if (lowerMessage.includes('verificando privilégios')) {
      result = { shouldUpdate: true, value: 5 };
    } else if (lowerMessage.includes('verificando virtualização')) {
      result = { shouldUpdate: true, value: 10 };
    } else if (lowerMessage.includes('wsl não está instalado')) {
      result = { shouldUpdate: true, value: 15 };
    } else if (lowerMessage.includes('instalando wsl')) {
      result = { shouldUpdate: true, value: 20 };
    } else if (lowerMessage.includes('recurso wsl habilitado')) {
      result = { shouldUpdate: true, value: 30 };
    } else if (lowerMessage.includes('definindo wsl 2') || 
               lowerMessage.includes('kernel do wsl2 instalado')) {
      result = { shouldUpdate: true, value: 40 };
    } else if (lowerMessage.includes('instalando ubuntu')) {
      result = { shouldUpdate: true, value: 50 };
    } else if (lowerMessage.includes('ubuntu instalado')) {
      result = { shouldUpdate: true, value: 60 };
    } else if (lowerMessage.includes('configurando usuário padrão')) {
      result = { shouldUpdate: true, value: 70 };
    } else if (lowerMessage.includes('configurando o sistema')) {
      result = { shouldUpdate: true, value: 80 };
    } else if (lowerMessage.includes('configurando cups') || 
               lowerMessage.includes('configurando samba') || 
               lowerMessage.includes('configurando nginx')) {
      result = { shouldUpdate: true, value: 90 };
    } else if (lowerMessage.includes('instalação concluída')) {
      result = { shouldUpdate: true, value: 100 };
    }
  
    return result;
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

    // Enviar para o processo principal para exportar
    ipcRenderer.send('export-installation-log', logText);

    this.addLogEntry('Solicitação de exportação de log enviada', 'info');
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

    console.log(`Atualizando etapa ${stepIndex} para estado '${state}' com texto '${statusText}'`);

    // Armazenar estado anterior para comparação
    const previousState = this.state.stepState[stepIndex];
    
    // Regra importante: não permitir "rebaixar" um estado de completed para in-progress
    // Isso é vital para instalações parciais onde etapas já estão concluídas
    if (previousState === 'completed' && state === 'in-progress') {
      console.log(`Etapa ${stepIndex} já está marcada como concluída, ignorando alteração para 'in-progress'`);
      return;
    }

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

    // Se a etapa atual mudou para "em andamento", atualizar o status principal
    if (state === 'in-progress' && this.ui.stepStatus) {
      this.ui.stepStatus.textContent = this.allSteps[stepIndex];
    }

    // CRUCIAL: Se estamos marcando uma etapa como em andamento ou concluída,
    // garantir que todas as etapas anteriores estejam marcadas como concluídas
    if ((state === 'in-progress' || state === 'completed') && stepIndex > 0) {
      for (let i = 0; i < stepIndex; i++) {
        // Só atualizar se a etapa não estiver já marcada como concluída ou erro
        if (this.state.stepState[i] !== 'completed' && this.state.stepState[i] !== 'error') {
          this.updateStepStatus(i, 'completed', 'Concluído');
        }
      }
    }
  }

  /**
   * Função especializada para detectar padrões de componentes específicos nos logs
   */
  detectComponentSpecificLogs(message, type) {
    const lowerMessage = message.toLowerCase();
    
    // Componentes específicos que indicam etapas mais avançadas
    const componentPatterns = [
      { pattern: 'database', step: 5, progress: 80 },
      { pattern: 'api', step: 6, progress: 85 },
      { pattern: 'pm2', step: 6, progress: 87 },
      { pattern: 'printer', step: 7, progress: 95 },
      { pattern: 'verificando o sistema após', step: 7, progress: 98 }
    ];
    
    // Verificar cada padrão
    for (const { pattern, step, progress } of componentPatterns) {
      if (lowerMessage.includes(pattern)) {
        console.log(`Detectado componente específico: ${pattern} → Etapa ${step}, Progresso ${progress}%`);
        
        // Primeiro verificar se alguma etapa posterior já está em progresso/completa
        let skipUpdate = false;
        for (let i = step + 1; i < this.allSteps.length; i++) {
          if (this.state.stepState[i] === 'in-progress' || this.state.stepState[i] === 'completed') {
            skipUpdate = true;
            break;
          }
        }
        
        // Se não precisamos pular, atualizar para este componente
        if (!skipUpdate) {
          // Garantir que as etapas anteriores estejam marcadas como concluídas
          for (let i = 0; i < step; i++) {
            this.updateStepStatus(i, 'completed', 'Concluído');
          }
          
          // Marcar a etapa atual
          this.updateStepStatus(step, 'in-progress', 'Em andamento');
          
          // Atualizar o progresso
          this.updateProgressBar(progress);
          
          // Atualizar texto de status principal
          if (this.ui.stepStatus) {
            this.ui.stepStatus.textContent = this.allSteps[step];
          }
          
          return true;
        }
      }
    }
    
    // Verificar lista de componentes a instalar
    if (lowerMessage.includes('componentes que serão instalados:')) {
      try {
        // Tentar extrair a lista de componentes
        const componentsMatch = lowerMessage.match(/instalados:([^,]+(?:,[^,]+)*)/);
        if (componentsMatch && componentsMatch[1]) {
          const componentsList = componentsMatch[1].split(',').map(c => c.trim().toLowerCase());
          console.log('Lista de componentes detectada:', componentsList);
          
          // Com base nos componentes, determinar quais etapas pular
          const needsWsl = componentsList.some(c => c === 'wsl');
          const needsWsl2 = componentsList.some(c => c === 'wsl2');
          const needsUbuntu = componentsList.some(c => c === 'ubuntu');
          
          // Se não precisa de WSL/Ubuntu, podemos marcar essas etapas como concluídas
          if (!needsWsl && !needsWsl2 && !needsUbuntu) {
            // Marcar etapas iniciais como concluídas
            for (let i = 0; i <= 3; i++) {
              this.updateStepStatus(i, 'completed', 'Concluído');
            }
            
            // Definir qual etapa está em progresso com base nos componentes
            let currentStep = 5; // Ambiente por padrão
            
            if (componentsList.includes('database') || 
                componentsList.includes('software')) {
              currentStep = 5; // Ambiente
            } else if (componentsList.includes('api') || 
                       componentsList.includes('pm2') || 
                       componentsList.includes('services')) {
              currentStep = 6; // Serviços
            } else if (componentsList.includes('printer')) {
              currentStep = 7; // Finalização
            }
            
            this.updateStepStatus(currentStep, 'in-progress', 'Em andamento');
            this.updateProgressBar(currentStep * 15); // Progresso aproximado
            
            // Atualizar status principal
            if (this.ui.stepStatus) {
              this.ui.stepStatus.textContent = this.allSteps[currentStep];
            }
            
            return true;
          }
        }
      } catch (err) {
        console.error('Erro ao analisar componentes:', err);
      }
    }
    
    return false;
  }

  /**
   * Adicionar entrada no log
   */
  addLogEntry(message, type = 'info') {
    // Adicionar ao buffer de log em vez de diretamente ao DOM
    this.state.logBuffer.push({ message, type });
  
    // Processar mensagens específicas relacionadas à instalação de componentes
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('instalando componente') || 
        lowerMessage.includes('instalando/configurando packages') ||
        lowerMessage.includes('instalando aplicação')) {
      // Forçar atualização do estado para mostrar o progresso corretamente
      this.updateProgressFromMessage(message, type);
    }
  
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
    // Adicionar timestamp à mensagem se ainda não tiver
    let message = data.message;
    if (!message.startsWith('[')) {
      const timestamp = new Date().toLocaleTimeString();
      message = `[${timestamp}] ${message}`;
    }

    console.log('Processando log:', message); // Debug
    
    // NOVO: Primeiro tentar detectar logs específicos de componentes
    const handled = this.detectComponentSpecificLogs(message, data.type);
    
    // Adicionar a entrada ao log de qualquer forma
    this.addLogEntry(message, data.type);
    
    // Se não foi tratado como componente específico, processar normalmente
    if (!handled) {
      this.updateProgressFromMessage(message, data.type);
    }
  }
  
  // 2. Melhoria no método updateProgressFromMessage para mapear corretamente as mensagens para etapas
  updateProgressFromMessage(message, type) {
    if (this.state.installationComplete) return;
  
    const lowerMessage = message.toLowerCase();
    console.log('Analisando mensagem para progresso:', lowerMessage);
  
    // Priorizar mensagens explícitas de instalação de componentes
    if (lowerMessage.includes('instalando aplicação') || 
        lowerMessage.includes('instalando/configurando packages')) {
      this.updateProgress(5, 80);
      this.updateStepStatus(0, 'completed', 'Concluído');
      this.updateStepStatus(1, 'completed', 'Concluído');
      this.updateStepStatus(2, 'completed', 'Concluído');
      this.updateStepStatus(3, 'completed', 'Concluído');
      this.updateStepStatus(4, 'completed', 'Concluído');
      this.updateStepStatus(5, 'in-progress', 'Em andamento');
      return;
    }
  
    // Mapeamento detalhado de mensagens para etapas e progresso
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
    } else if (lowerMessage.includes('configurando o sistema') || 
               lowerMessage.includes('configurando ambiente')) {
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
    } else if (lowerMessage.includes('analisando componentes necessários')) {
      // Esta mensagem indica que a verificação está completa e estamos analisando o que instalar
      this.updateProgress(0, 20);
      this.updateStepStatus(0, 'completed', 'Concluído');
    } else if (lowerMessage.includes('componentes que serão instalados')) {
      // Quando os componentes são listados, sabemos quais etapas serão puladas
      this.updateProgress(1, 30);
      this.updateStepStatus(0, 'completed', 'Concluído');
    } else if (lowerMessage.includes('banco de dados configurado')) {
      this.updateProgress(5, 85);
      this.updateStepStatus(5, 'completed', 'Concluído');
    } else if (lowerMessage.includes('firewall configurado')) {
      this.updateProgress(6, 90);
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
   * Manipular conclusão da instalação
   */
  handleInstallationComplete(data) {
    console.log('Recebido evento de instalação completa:', data);
  
    if (data.success) {
      this.updateProgress(7, 100);
      this.addLogEntry('✅ Instalação concluída com sucesso!', 'success');
  
      if (data.message) {
        this.addLogEntry(`Mensagem: ${data.message}`, 'success');
      }
  
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
      this.addLogEntry('IMPORTANTE: Instalação concluída com sucesso! Use o botão "Verificar Novamente" na tela principal para confirmar o status.', 'header');
  
      setTimeout(() => {
        if (this.ui.closeButton) {
          this.ui.closeButton.click(); // Usar o botão para fechar e garantir cleanup
        } else {
          window.close();
        }
      }, 5000);
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
