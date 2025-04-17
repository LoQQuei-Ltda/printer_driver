/**
 * Sistema de Gerenciamento de Impressão - Auth JS
 * Funcionalidades de autenticação e login
 */

// Módulos do Electron
const { ipcRenderer } = require('electron');

class AuthManager {
  constructor() {
    // Referências aos elementos da interface
    this.ui = {
      loginForm: document.getElementById('loginForm'),
      emailInput: document.getElementById('email'),
      passwordInput: document.getElementById('password'),
      loginButton: document.getElementById('loginButton'),
      errorMessage: document.getElementById('errorMessage'),
      themeToggleBtn: document.getElementById('themeToggleBtn'),
      loginLogo: document.getElementById('loginLogo')
    };
    
    // Estado
    this.state = {
      isAuthenticating: false,
      isDarkTheme: localStorage.getItem('loqqei-theme') === 'dark'
    };
    
    // Inicializar
    this.init();
  }
  
  /**
   * Inicializar
   */
  init() {
    console.log('Inicializando sistema de autenticação...');
    
    // Aplicar tema
    this.applyTheme();
    
    // Configurar eventos
    this.setupEventListeners();
    
    // Focar no campo de email
    if (this.ui.emailInput) {
      this.ui.emailInput.focus();
    }
    
    console.log('Sistema de autenticação inicializado');
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
      // Atualizar logo para tema escuro
      this.updateLogo('dark');
    } else {
      document.body.classList.remove('dark-theme');
      if (this.ui.themeToggleBtn) {
        this.ui.themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
      }
      // Atualizar logo para tema claro
      this.updateLogo('light');
    }
  }
  
  /**
   * Atualizar o logo com base no tema
   */
  updateLogo(theme) {
    if (this.ui.loginLogo) {
      // Limpar o conteúdo existente
      this.ui.loginLogo.innerHTML = '';
      
      // Criar elemento de imagem para o logo
      const logoImg = document.createElement('img');
      logoImg.width = 64;
      logoImg.height = 64;
      logoImg.src = `../assets/icon/${theme}.ico`;
      logoImg.alt = 'Logo';
      logoImg.style.marginBottom = '16px';
      
      console.log(`Atualizando logo: ${logoImg.src}`);
      
      // Adicionar o logo ao contêiner
      this.ui.loginLogo.appendChild(logoImg);
    }
  }
  
  /**
   * Alternar tema
   */
  toggleTheme() {
    this.state.isDarkTheme = !this.state.isDarkTheme;
    localStorage.setItem('loqqei-theme', this.state.isDarkTheme ? 'dark' : 'light');
    this.applyTheme();
    updateFavicon(this.state.isDarkTheme ? 'dark' : 'light');
  }
  
  /**
   * Configurar escutadores de eventos
   */
  setupEventListeners() {
    // Tema
    if (this.ui.themeToggleBtn) {
      this.ui.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }
    
    // Formulário de login
    if (this.ui.loginForm) {
      this.ui.loginForm.addEventListener('submit', (event) => this.handleLogin(event));
    }
    
    // Eventos IPC
    ipcRenderer.on('login-response', (event, data) => this.handleLoginResponse(data));
  }
  
  /**
   * Mostrar erro
   */
  showError(message) {
    if (this.ui.errorMessage) {
      this.ui.errorMessage.textContent = message;
      this.ui.errorMessage.style.display = 'block';
    }
  }
  
  /**
   * Ocultar erro
   */
  hideError() {
    if (this.ui.errorMessage) {
      this.ui.errorMessage.style.display = 'none';
    }
  }
  
  /**
   * Iniciar autenticação
   */
  startAuth() {
    this.state.isAuthenticating = true;
    
    if (this.ui.loginButton) {
      this.ui.loginButton.disabled = true;
      this.ui.loginButton.innerHTML = `
        <div class="loading-spinner"></div>
        <span>Autenticando...</span>
      `;
    }
    
    this.hideError();
  }
  
  /**
   * Finalizar autenticação
   */
  endAuth() {
    this.state.isAuthenticating = false;
    
    if (this.ui.loginButton) {
      this.ui.loginButton.disabled = false;
      this.ui.loginButton.textContent = 'Entrar';
    }
  }
  
  /**
   * Manipular evento de login
   */
  handleLogin(event) {
    event.preventDefault();
    
    if (this.state.isAuthenticating) return;
    
    const email = this.ui.emailInput ? this.ui.emailInput.value.trim() : '';
    const password = this.ui.passwordInput ? this.ui.passwordInput.value : '';
    
    if (!email || !password) {
      this.showError('Por favor, preencha todos os campos.');
      return;
    }
    
    this.startAuth();
    
    // Enviar credenciais para o processo principal
    ipcRenderer.send('login', { email, password });
  }
  
  /**
   * Manipular resposta de login
   */
  handleLoginResponse(data) {
    if (data.success) {
      // Login bem-sucedido, o processo principal irá redirecionar
      console.log('Login bem-sucedido!');
    } else {
      this.endAuth();
      this.showError(data.message || 'Erro de autenticação. Tente novamente.');
    }
  }
}

// Função para atualizar o favicon
function updateFavicon(theme) {
  // Obter link do favicon existente ou criar um novo
  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  
  // Atualizar href do favicon com base no tema
  favicon.href = `../assets/icon/${theme}.ico`;
  console.log(`Favicon atualizado: ${favicon.href}`);
  
  // Enviar mensagem para o processo principal para atualizar o ícone
  ipcRenderer.send('update-app-icon', { theme });
}

// Inicializar quando o DOM estiver carregado
window.addEventListener('DOMContentLoaded', () => {
  window.authManager = new AuthManager();

  const savedTheme = localStorage.getItem('loqqei-theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.remove('dark-theme');
    updateFavicon('light');
  } else {
    document.body.classList.add('dark-theme');
    updateFavicon('dark');
  }
});