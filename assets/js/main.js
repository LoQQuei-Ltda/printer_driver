// Import Electron modules
const { ipcRenderer } = require('electron');

// DOM References
document.addEventListener('DOMContentLoaded', () => {
  const app = new PrintManager();
  window.app = app; // Expose app to global scope for compatibility
});

// Classe principal da aplicação
class PrintManager {
  constructor() {
    this.initDOMElements();
    this.initState();
    this.setupEventListeners();
    this.initApp();
  }

  // Inicializar elementos do DOM
  initDOMElements() {
    this.dom = {
      // Sidebar elements
      sidebar: document.getElementById('sidebar'),
      sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
      sidebarOverlay: document.getElementById('sidebarOverlay'),
      userInitial: document.getElementById('userInitial'),
      userName: document.getElementById('userName'),
      
      // Logo element
      appLogo: document.getElementById('appLogo'),
      
      // Navigation
      navItems: document.querySelectorAll('.nav-item[data-tab]'),
      tabContents: document.querySelectorAll('.tab-content'),
      logoutButton: document.getElementById('logoutButton'),
      manualSettingsButton: document.getElementById('manualSettingsButton'),
      
      // System elements
      statusSection: document.getElementById('statusSection'),
      installButton: document.getElementById('installButton'),
      installLog: document.getElementById('installLog'),
      clearLogBtn: document.getElementById('clearLogBtn'),
      
      // Print elements
      filesContainer: document.getElementById('filesContainer'),
      refreshButton: document.getElementById('refreshButton'),
      
      // Modal elements
      printModal: document.getElementById('printModal'),
      modalCloseBtn: document.getElementById('modalCloseBtn'),
      printInfo: document.getElementById('printInfo'),
      printerSelect: document.getElementById('printerSelect'),
      cancelPrintButton: document.getElementById('cancelPrintButton'),
      confirmPrintButton: document.getElementById('confirmPrintButton'),
      
      // Window controls
      minimizeBtn: document.getElementById('minimizeBtn'),
      closeBtn: document.getElementById('closeBtn'),
      themeToggleBtn: document.getElementById('themeToggleBtn')
    };
  }

  // Inicializar estado da aplicação
  initState() {
    this.state = {
      currentUser: null,
      files: [],
      printers: [],
      selectedFileId: null,
      isLoading: false,
      systemCheckPassed: false,
      isDarkTheme: localStorage.getItem('loqqei-theme') === 'dark' || true, // Dark theme é o padrão
      isSidebarOpen: window.innerWidth >= 768 // Sidebar aberta por padrão em telas maiores
    };
  }

  // Configurar eventos
  setupEventListeners() {
    // Sidebar toggle
    if (this.dom.sidebarToggleBtn) {
      this.dom.sidebarToggleBtn.addEventListener('click', () => this.toggleSidebar());
    }
    
    // Sidebar overlay (fechar quando clicar fora)
    if (this.dom.sidebarOverlay) {
      this.dom.sidebarOverlay.addEventListener('click', () => this.toggleSidebar(false));
    }
    
    // Navigation tabs
    this.dom.navItems.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        this.switchTab(tabName);
        
        // Verificar status do sistema quando clicar na tab de configurações
        if (tabName === 'system') {
          this.checkInstallationStatus();
        }
        
        // Em telas pequenas, fechar o sidebar após seleção
        if (window.innerWidth < 768) {
          this.toggleSidebar(false);
        }
      });
    });
    
    // Logout
    if (this.dom.logoutButton) {
      this.dom.logoutButton.addEventListener('click', () => this.logout());
    }

    if (this.dom.manualSettingsButton) {
      this.dom.manualSettingsButton.addEventListener('click', () => this.openManualSettings());
    }
    
    // Refresh button
    if (this.dom.refreshButton) {
      this.dom.refreshButton.addEventListener('click', () => this.loadFileList());
    }
    
    // Print modal
    if (this.dom.modalCloseBtn) {
      this.dom.modalCloseBtn.addEventListener('click', () => this.closePrintModal());
    }
    
    if (this.dom.cancelPrintButton) {
      this.dom.cancelPrintButton.addEventListener('click', () => this.closePrintModal());
    }
    
    if (this.dom.confirmPrintButton) {
      this.dom.confirmPrintButton.addEventListener('click', () => this.printFile());
    }
    
    // Print buttons (event delegation)
    document.addEventListener('click', (event) => {
      const printButton = event.target.closest('.action-button');
      if (printButton) {
        const fileId = printButton.getAttribute('data-file-id');
        if (fileId) {
          this.showPrintModal(fileId);
        }
      }
      
      // Delete buttons (event delegation)
      const deleteButton = event.target.closest('.delete-button');
      if (deleteButton) {
        const fileId = deleteButton.getAttribute('data-file-id');
        if (fileId) {
          this.confirmDeleteFile(fileId);
        }
      }
    });
    
    // Window controls
    if (this.dom.minimizeBtn) {
      this.dom.minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
      });
    }
    
    if (this.dom.closeBtn) {
      this.dom.closeBtn.addEventListener('click', () => {
        ipcRenderer.send('hide-window');
      });
    }
    
    // Theme toggle
    if (this.dom.themeToggleBtn) {
      this.dom.themeToggleBtn.addEventListener('change', () => this.toggleTheme());
    }
    
    // Clear log
    if (this.dom.clearLogBtn) {
      this.dom.clearLogBtn.addEventListener('click', () => this.clearLog());
    }
    
    // Modal click outside
    if (this.dom.printModal) {
      this.dom.printModal.addEventListener('click', (event) => {
        if (event.target === this.dom.printModal) {
          this.closePrintModal();
        }
      });
    }
    
    // Receive installation logs
    ipcRenderer.on('installation-log', (event, data) => {
      this.addLogEntry(data.message, data.type);
    });
    
    // Window resize handler
    window.addEventListener('resize', () => {
      // Auto-close sidebar on small screens, auto-open on large screens
      if (window.innerWidth < 768 && this.state.isSidebarOpen) {
        this.toggleSidebar(false);
      } else if (window.innerWidth >= 768 && !this.state.isSidebarOpen) {
        this.toggleSidebar(true);
      }
    });
  }
  
  // Inicialização da aplicação
  initApp() {
    console.log('Inicializando aplicação...');
    
    // Aplicar tema salvo
    this.applyTheme();
    
    // Inicializar estado da sidebar
    this.updateSidebarState();
    
    // Carregar dados do usuário
    this.loadUserInfo();
    
    // Verificar status do sistema SEMPRE ao iniciar
    this.checkInstallationStatus();
    
    // Carregar lista de arquivos
    this.loadFileList();
    
    // Carregar lista de impressoras
    this.loadPrinterList();
    
    console.log('Aplicação inicializada com sucesso!');
  }
  
  // Alternar sidebar
  toggleSidebar(forcedState) {
    const newState = forcedState !== undefined ? forcedState : !this.state.isSidebarOpen;
    this.state.isSidebarOpen = newState;
    this.updateSidebarState();
  }
  
  // Atualizar estado visual da sidebar
  updateSidebarState() {
    if (this.state.isSidebarOpen) {
      this.dom.sidebar.classList.add('show');
      this.dom.sidebarOverlay.classList.add('show');
    } else {
      this.dom.sidebar.classList.remove('show');
      this.dom.sidebarOverlay.classList.remove('show');
    }
  }
  
  // Alternar tema
  toggleTheme() {
    this.state.isDarkTheme = !this.state.isDarkTheme;
    localStorage.setItem('loqqei-theme', this.state.isDarkTheme ? 'dark' : 'light');
    this.applyTheme();
  }
  
  // Aplicar tema
  applyTheme() {
    const theme = this.state.isDarkTheme ? 'dark' : 'light';
    const thumbColor = this.state.isDarkTheme ? '#2d2d2d' : '#d6dee1';
    const thumbHoverColor = this.state.isDarkTheme ? '#444' : '#b1b6b7';
    
    document.documentElement.style.setProperty('--scrollbar-thumb-color', thumbColor);
    document.documentElement.style.setProperty('--scrollbar-thumb-hover-color', thumbHoverColor);

    if (this.state.isDarkTheme) {
      document.body.classList.add('dark-theme');
      if (this.dom.themeToggleBtn) {
        this.dom.themeToggleBtn.checked = true;
      }
    } else {
      document.body.classList.remove('dark-theme');
      if (this.dom.themeToggleBtn) {
        this.dom.themeToggleBtn.checked = false;
      }
    }
    
    // Atualizar logo
    this.updateLogo(theme);
    
    // Atualizar favicon
    this.updateFavicon(theme);
    
    // Informar processo principal sobre a mudança de tema
    ipcRenderer.send('update-app-icon', { theme });
  }
  
  // Atualizar logo
  updateLogo(theme) {
    if (this.dom.appLogo) {
      // Limpar conteúdo atual
      this.dom.appLogo.innerHTML = '';
      
      // Adicionar logo de acordo com o tema
      const logoImg = document.createElement('img');
      logoImg.src = `../assets/icon/${theme}.ico`;
      logoImg.alt = 'Logo';
      logoImg.width = 32;
      logoImg.height = 32;
      logoImg.style.marginRight = '8px';
      
      this.dom.appLogo.appendChild(logoImg);
    }
  }
  
  // Atualizar favicon
  updateFavicon(theme) {
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    
    favicon.href = `../assets/icon/${theme}.ico`;
  }
  
  // Alternar tabs
  switchTab(tabName) {
    // Atualizar tab ativa
    this.dom.navItems.forEach(item => {
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Mostrar conteúdo correto
    this.dom.tabContents.forEach(content => {
      if (content.id === tabName + 'Tab') {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    });
    
    // Carregar dados específicos da tab
    if (tabName === 'system') {
      // Sempre atualizar o status do sistema ao trocar para a aba de configurações
      this.checkInstallationStatus();
    } else if (tabName === 'print') {
      this.loadFileList();
    }
  }
  
  // Carregar informações do usuário
  loadUserInfo() {
    ipcRenderer.send('get-user');
    
    ipcRenderer.once('user-data', (event, userData) => {
      if (userData && userData.user) {
        this.state.currentUser = userData.user;
        
        if (this.dom.userName) {
          this.dom.userName.textContent = userData.user.name;
        }
        
        // Definir inicial do avatar
        if (this.dom.userInitial && userData.user.picture) {
          this.dom.userInitial.textContent = null;
          this.dom.userInitial.style.backgroundImage = `url(${userData.user.picture})`;
          this.dom.userInitial.style.backgroundSize = "contain";
          this.dom.userInitial.style.backgroundPosition = "center";
          this.dom.userInitial.style.backgroundRepeat = "no-repeat";
          this.dom.userInitial.style.width = "40px";
          this.dom.userInitial.style.height = "40px";
        } else if (this.dom.userInitial && userData.user.name) {
          this.dom.userInitial.textContent = userData.user.name.charAt(0).toUpperCase();
        }
      } else {
        if (this.dom.userName) {
          this.dom.userName.textContent = 'Usuário';
        }
      }
    });
  }
  
  // Verificar status de instalação
  checkInstallationStatus() {
    if (!this.dom.statusSection) return;
    
    this.dom.statusSection.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Verificando...</p>
      </div>
    `;
    
    if (this.dom.installButton) {
      this.dom.installButton.disabled = true;
    }
    
    ipcRenderer.send('verificar-instalacao');
    
    ipcRenderer.once('status-instalacao', (event, status) => {
      let statusHTML = '';
      let hasIssue = false;
      
      if (status.error) {
        hasIssue = true;
        statusHTML = `
          <div class="status-item">
            <div class="status-indicator red"></div>
            <div class="status-label">Erro ao verificar status</div>
          </div>
        `;
        if (this.dom.installButton) {
          this.dom.installButton.textContent = 'Verificar Novamente';
          this.dom.installButton.disabled = false;
          this.dom.installButton.onclick = () => this.checkInstallationStatus();
        }
      } else {
        statusHTML = `
          <div class="status-item">
            <div class="status-indicator ${status.wslInstalled ? 'green' : 'red'}"></div>
            <div class="status-label">Windows Subsystem for Linux</div>
          </div>
          <div class="status-item">
            <div class="status-indicator ${status.wsl2Configured ? 'green' : 'red'}"></div>
            <div class="status-label">WSL 2 Configurado</div>
          </div>
          <div class="status-item">
            <div class="status-indicator ${status.distroInstalled ? 'green' : 'red'}"></div>
            <div class="status-label">Ubuntu Instalado</div>
          </div>
          <div class="status-item">
            <div class="status-indicator ${status.userConfigured ? 'green' : 'red'}"></div>
            <div class="status-label">Usuário do Sistema Configurado</div>
          </div>
        `;
        
        const isInstalled = status.wslInstalled && status.wsl2Configured &&
          status.distroInstalled && status.userConfigured;
          
        this.state.systemCheckPassed = isInstalled;
        
        if (!isInstalled) {
          hasIssue = true;
        }
        
        this.updateInstallButton(isInstalled);
      }
      
      this.dom.statusSection.innerHTML = statusHTML;
    });
  }
  
  // Atualizar botão de instalação
  updateInstallButton(isInstalled) {
    if (!this.dom.installButton) return;
    
    if (isInstalled) {
      this.dom.installButton.textContent = 'Sistema Instalado';
      this.dom.installButton.disabled = true;
      this.dom.installButton.classList.add('installed');
      
      // Adicionar texto de status
      const container = this.dom.installButton.parentElement;
      if (!container.querySelector('.status-text')) {
        const statusText = document.createElement('div');
        statusText.className = 'status-text';
        statusText.textContent = 'O sistema está configurado e pronto para uso';
        container.appendChild(statusText);
      }
    } else {
      this.dom.installButton.textContent = 'Instalar Sistema';
      this.dom.installButton.disabled = false;
      this.dom.installButton.classList.remove('installed');
      this.dom.installButton.onclick = () => this.initiateInstallation();
      
      // Adicionar texto de status
      const container = this.dom.installButton.parentElement;
      if (!container.querySelector('.status-text')) {
        const statusText = document.createElement('div');
        statusText.className = 'status-text';
        statusText.textContent = 'Clique para instalar os componentes necessários';
        container.appendChild(statusText);
      }
    }
  }
  
  // Iniciar instalação
  initiateInstallation() {
    if (!this.dom.installButton) return;
    
    this.dom.installButton.disabled = true;
    this.dom.installButton.innerHTML = '<div class="spinner button-spinner"></div> Instalando...';
    
    // Atualizar texto de status
    const container = this.dom.installButton.parentElement;
    const statusText = container.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = 'Instalação em andamento, aguarde...';
    }
    
    // Limpar e adicionar entradas iniciais no log
    this.clearLog();
    this.addLogEntry('Iniciando processo de instalação do sistema...', 'info');
    this.addLogEntry('Este processo pode levar vários minutos, aguarde até a conclusão.', 'info');
    
    ipcRenderer.send('iniciar-instalacao');
  }
  
  // Adicionar entrada no log
  addLogEntry(message, type = 'info') {
    if (!this.dom.installLog) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    
    this.dom.installLog.appendChild(entry);
    this.dom.installLog.scrollTop = this.dom.installLog.scrollHeight;
  }
  
  // Limpar log
  clearLog() {
    if (!this.dom.installLog) return;
    
    this.dom.installLog.innerHTML = '';
    this.addLogEntry('Log limpo pelo usuário', 'info');
  }
  
  // Carregar lista de arquivos
  loadFileList() {
    if (this.state.isLoading || !this.dom.filesContainer) return;
    
    this.state.isLoading = true;
    
    this.dom.filesContainer.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Carregando arquivos...</p>
      </div>
    `;
    
    if (this.dom.refreshButton) {
      this.dom.refreshButton.disabled = true;
    }
    
    ipcRenderer.send('listar-arquivos');
    
    ipcRenderer.once('arquivos-response', (event, response) => {
      this.state.isLoading = false;
      
      if (this.dom.refreshButton) {
        this.dom.refreshButton.disabled = false;
      }
      
      if (response.success && response.files && response.files.length > 0) {
        this.state.files = response.files;
        this.renderFileList();
      } else {
        this.renderEmptyFileList();
      }
    });
  }
  
  // Renderizar lista de arquivos
  renderFileList() {
    if (!this.dom.filesContainer) return;
    
    this.state.files = this.state.files.sort((a, b) => {
      return new Date(a.date) - new Date(b.date);
    });

    let filesHTML = '';
    
    this.state.files.forEach(file => {
      // Formatação da data para o padrão brasileiro
      const dateObj = new Date(file.createdat);
      const formattedDate = dateObj.toLocaleDateString('pt-BR') + ' ' + 
                           dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
      
      filesHTML += `
        <div class="file-item">
          <div class="file-details">
            <div class="file-name" title="${file.filename}">${file.filename}</div>
            <div class="file-meta">
              <div>${file.pages == 1 ? file.pages + ' página' : file.pages + ' páginas'}</div>
              <div>${formattedDate}</div>
            </div>
          </div>
          <div class="file-actions">
            <button class="btn-delete delete-button" data-file-id="${file.id}">
              <i class="fas fa-trash-alt"></i>
            </button>
            <button class="btn-print action-button" data-file-id="${file.id}">
              <i class="fas fa-print"></i> Imprimir
            </button>
          </div>
        </div>
      `;
    });
    
    this.dom.filesContainer.innerHTML = filesHTML;
  }
  
  // Renderizar estado vazio (sem arquivos)
  renderEmptyFileList() {
    if (!this.dom.filesContainer) return;
    
    this.dom.filesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-alt empty-icon"></i>
        <p>Nenhum arquivo encontrado para impressão.</p>
      </div>
    `;
  }
  
  // Carregar lista de impressoras
  loadPrinterList() {
    ipcRenderer.send('listar-impressoras');
    
    ipcRenderer.once('impressoras-response', (event, response) => {
      if (response.success && response.printers && response.printers.length > 0) {
        this.state.printers = response.printers;
        
        if (this.dom.printerSelect) {
          this.dom.printerSelect.innerHTML = '';
          
          this.state.printers.forEach(printer => {
            const option = document.createElement('option');
            option.value = printer.id;
            option.textContent = `${printer.name} (${printer.status})`;
            option.disabled = printer.status.toLowerCase() !== 'functional';
            this.dom.printerSelect.appendChild(option);
          });
        }
      } else if (this.dom.printerSelect) {
        this.dom.printerSelect.innerHTML = '<option value="">Nenhuma impressora disponível</option>';
      }
    });
  }
  
  // Mostrar modal de impressão
  showPrintModal(fileId) {
    // Verificar se o sistema está pronto
    if (!this.state.systemCheckPassed) {
      alert('O sistema precisa estar completamente instalado antes de imprimir.');
      this.switchTab('system');
      return;
    }
    
    this.state.selectedFileId = fileId;
    
    // Encontrar arquivo
    const file = this.state.files.find(f => f.id === fileId);
    if (file && this.dom.printModal) {
      // Atualizar informações do modal
      if (this.dom.printInfo) {
        this.dom.printInfo.textContent = `Imprimir arquivo "${file.filename}" em:`;
      }
      
      // Atualizar lista de impressoras
      this.loadPrinterList();
      
      // Exibir modal
      this.dom.printModal.style.display = 'flex';
    }
  }
  
  // Fechar modal de impressão
  closePrintModal() {
    if (this.dom.printModal) {
      this.dom.printModal.style.display = 'none';
      this.state.selectedFileId = null;
    }
  }
  
  // Imprimir arquivo
  printFile() {
    if (!this.state.selectedFileId || 
        !this.dom.printerSelect || 
        !this.dom.printerSelect.value) {
      return;
    }
    
    if (this.dom.confirmPrintButton) {
      this.dom.confirmPrintButton.disabled = true;
      this.dom.confirmPrintButton.innerHTML = '<div class="spinner button-spinner"></div> Enviando...';
    }
    
    ipcRenderer.send('imprimir-arquivo', {
      fileId: this.state.selectedFileId,
      printerId: this.dom.printerSelect.value
    });
    
    ipcRenderer.once('impressao-response', (event, response) => {
      if (this.dom.confirmPrintButton) {
        this.dom.confirmPrintButton.disabled = false;
        this.dom.confirmPrintButton.innerHTML = '<i class="fas fa-print"></i> Imprimir';
      }
      
      if (response.success) {
        alert(`${response.message}\nId do documento: ${response.fileId}\nId da impressora: ${response.printerId}`);
        this.closePrintModal();
        this.loadFileList(); // Atualizar lista após impressão
      } else {
        alert(`Erro ao enviar documento para impressão: ${response.message}`);
      }
    });
  }
  
  // Confirmar exclusão de arquivo
  confirmDeleteFile(fileId) {
    if (confirm(`Tem certeza que deseja excluir este arquivo?`)) {
      this.deleteFile(fileId);
    }
  }
  
  // Excluir arquivo
  deleteFile(fileId) {
    // Mostrar carregamento no botão correspondente
    const deleteButton = document.querySelector(`.delete-button[data-file-id="${fileId}"]`);
    if (deleteButton) {
      deleteButton.disabled = true;
      deleteButton.innerHTML = '<div class="spinner button-spinner"></div>';
    }
    
    // Enviar solicitação para o processo principal
    ipcRenderer.send('excluir-arquivo', { fileId });
    
    // Aguardar resposta
    ipcRenderer.once('exclusao-response', (event, response) => {
      if (response.success) {
        alert('Arquivo excluído com sucesso.');
        this.loadFileList(); // Recarregar a lista após exclusão
      } else {
        alert(`Erro ao excluir arquivo: ${response.message}`);
        
        // Restaurar o botão
        if (deleteButton) {
          deleteButton.disabled = false;
          deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
        }
      }
    });
  }
  
  openManualSettings() {
    ipcRenderer.send('open-manual-settings');
  }

  // Logout
  logout() {
    ipcRenderer.send('logout');
  }
}

// Função global para compatibilidade com código existente
window.showPrintModal = function(fileId) {
  if (window.app) {
    window.app.showPrintModal(fileId);
  } else {
    console.error('Aplicação não inicializada');
  }
};