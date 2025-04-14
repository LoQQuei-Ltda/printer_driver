/**
 * Sistema de Gerenciamento de Impressão - Aplicação Desktop
 * Main Process
 */

//======================================================================
// IMPORTS & REQUIRES
//======================================================================
const { 
  app, 
  BrowserWindow, 
  ipcMain, 
  dialog, 
  Tray, 
  Menu, 
  shell, 
  nativeImage, 
  screen 
} = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const url = require('url');
const axios = require('axios');
const installer = require('./installer');

//======================================================================
// GLOBAL VARIABLES
//======================================================================
// Window references
let mainWindow;
let loginWindow = null;
let installationWindow = null;

// System state
let tray = null;
let isQuitting = false;

//======================================================================
// APP CONFIGURATION
//======================================================================
const appConfig = {
  apiPrincipalServiceUrl: 'https://api.loqquei.com.br/api/v1',
  apiLocalUrl: 'http://localhost:3000/api',
  autoStart: true,
  minimizeOnBlur: true,
  dataPath: path.join(app.getPath('userData'), 'appData'),
  userDataFile: path.join(app.getPath('userData'), 'user.json'),
  windowPrefsFile: path.join(app.getPath('userData'), 'window_prefs.json'),
  defaultWidth: 360,
  defaultHeight: 600
};

//======================================================================
// UTILITY FUNCTIONS
//======================================================================
/**
 * Execute a command with timeout
 * @param {string} command - Command to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {boolean} quiet - Whether to suppress output
 * @returns {Promise<string>} Command output
 */
function execPromise(command, timeoutMs = 60000, quiet = false) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Tempo limite excedido (${timeoutMs/1000}s): ${command}`));
    }, timeoutMs);
    
    execFile('cmd.exe', ['/c', command], { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      clearTimeout(timeout);
      
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

//======================================================================
// FILE SYSTEM & DATA MANAGEMENT
//======================================================================
/**
 * Ensure data directories exist
 */
function ensureDirectories() {
  if (!fs.existsSync(appConfig.dataPath)) {
    fs.mkdirSync(appConfig.dataPath, { recursive: true });
  }
}

/**
 * Check if user is authenticated
 * @returns {boolean} Whether user is authenticated
 */
function isAuthenticated() {
  try {
    if (fs.existsSync(appConfig.userDataFile)) {
      const userData = JSON.parse(fs.readFileSync(appConfig.userDataFile, 'utf8'));
      return !!userData.token;
    }
  } catch (error) {
    console.error('Erro ao verificar autenticação:', error);
  }
  return false;
}

/**
 * Save user data
 * @param {Object} userData - User data to save
 */
function saveUserData(userData) {
  try {
    ensureDirectories();
    fs.writeFileSync(appConfig.userDataFile, JSON.stringify(userData, null, 2), 'utf8');
  } catch (error) {
    console.error('Erro ao salvar dados do usuário:', error);
  }
}

/**
 * Get user data
 * @returns {Object|null} User data or null if not found
 */
function getUserData() {
  try {
    if (fs.existsSync(appConfig.userDataFile)) {
      return JSON.parse(fs.readFileSync(appConfig.userDataFile, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao ler dados do usuário:', error);
  }
  return null;
}

/**
 * Save window preferences
 */
function saveWindowPreferences() {
  try {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      const prefs = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: mainWindow.isMaximized()
      };
      
      ensureDirectories();
      fs.writeFileSync(appConfig.windowPrefsFile, JSON.stringify(prefs, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Erro ao salvar preferências da janela:', error);
  }
}

/**
 * Get window preferences
 * @returns {Object} Window preferences
 */
function getWindowPreferences() {
  try {
    if (fs.existsSync(appConfig.windowPrefsFile)) {
      return JSON.parse(fs.readFileSync(appConfig.windowPrefsFile, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao ler preferências da janela:', error);
  }
  
  // Return default values if no saved preferences
  return {
    width: appConfig.defaultWidth,
    height: appConfig.defaultHeight,
    isMaximized: false
  };
}

//======================================================================
// WINDOW MANAGEMENT
//======================================================================
/**
 * Create the main application window
 */
function createMainWindow() {
  const iconPath = path.join(__dirname, 'assets/icon/printer.ico');
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  const prefs = getWindowPreferences();
  
  let x = prefs.x;
  let y = prefs.y;
  
  if (x === undefined || y === undefined) {
    x = width - prefs.width - 20;
    y = height - prefs.height - 60; // Space for taskbar
  }
  
  mainWindow = new BrowserWindow({
    width: prefs.width || appConfig.defaultWidth,
    height: prefs.height || appConfig.defaultHeight,
    x: x,
    y: y,
    minWidth: 300,
    minHeight: 400,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    skipTaskbar: false,
    frame: false,
    transparent: false,
    show: false
  });

  mainWindow.loadFile('view/index.html');
  
  if (prefs.isMaximized) {
    mainWindow.maximize();
  }
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Save size and position when resized or moved
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      saveWindowPreferences();
    }
  });
  
  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      saveWindowPreferences();
    }
  });
  
  mainWindow.on('maximize', saveWindowPreferences);
  mainWindow.on('unmaximize', saveWindowPreferences);

  mainWindow.on('blur', () => {
    const isCriticalOperation = global.criticalOperation || false;
    
    if (!isCriticalOperation && appConfig.minimizeOnBlur) {
      mainWindow.hide();
    }
  });

  mainWindow.on('close', function (event) {
    saveWindowPreferences();
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  global.appWindow = mainWindow;
}

/**
 * Create the login window
 */
function createLoginWindow() {
  const iconPath = path.join(__dirname, 'assets/icon/printer.ico');
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  const windowWidth = 360;
  const windowHeight = 480;
  
  const x = width - windowWidth - 20;
  const y = height - windowHeight - 60; // Space for taskbar
  
  loginWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    resizable: true,
    fullscreenable: false,
    maximizable: false,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    skipTaskbar: false,
    frame: true,
    show: false
  });

  loginWindow.loadFile('view/login.html');
  loginWindow.setMenu(null);
  
  loginWindow.once('ready-to-show', () => {
    loginWindow.show();
  });

  loginWindow.on('closed', function () {
    loginWindow = null;
    if (!mainWindow && !isQuitting) {
      app.quit();
    }
  });
}

/**
 * Create installation window
 */
function createInstallationWindow() {
  const iconPath = path.join(__dirname, 'assets/icon/printer.ico');
  
  installationWindow = new BrowserWindow({
    width: 800,
    height: 700,
    parent: mainWindow,
    modal: true,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  installationWindow.loadFile('view/installation.html');
  installationWindow.setMenu(null);
  
  installationWindow.once('ready-to-show', () => {
    installationWindow.show();
  });

  installationWindow.on('closed', function () {
    installationWindow = null;
  });
}

/**
 * Create system tray icon
 */
function createTray() {
  const iconPath = path.join(__dirname, 'assets/icon/printer.ico');
  
  try {
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Abrir Sistema de Gerenciamento de Impressão', 
        click: function() {
          if (mainWindow) {
            mainWindow.show();
          } else if (isAuthenticated()) {
            createMainWindow();
          } else {
            createLoginWindow();
          }
        }
      },
      { type: 'separator' },
      { 
        label: 'Sair', 
        click: function() {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    tray.setToolTip('Sistema de Gerenciamento de Impressão');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', function() {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      } else if (isAuthenticated()) {
        createMainWindow();
      } else {
        createLoginWindow();
      }
    });
  } catch (error) {
    console.error('Erro ao criar ícone na bandeja:', error);
  }
}

//======================================================================
// SECURITY & ADMINISTRATION
//======================================================================
/**
 * Check if app is running with admin privileges
 * @returns {Promise<boolean>} Whether app is running as admin
 */
async function checkAdmin() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      // Non-Windows platforms are assumed to be OK
      resolve(true);
      return;
    }
    
    const options = {
      name: 'Verificação de Administrador'
    };
    
    try {
      // Try to execute a command that requires admin privileges
      execFile('powershell.exe', ['-Command', '([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'], options, (error, stdout, stderr) => {
        if (error) {
          resolve(false);
          return;
        }
        
        resolve(stdout.trim() === 'True');
      });
    } catch (error) {
      resolve(false);
    }
  });
}

/**
 * Configure auto-launch on startup
 */
function setupAutoLaunch() {
  const AutoLaunch = require('auto-launch');
  const autoLauncher = new AutoLaunch({
    name: 'Sistema de Gerenciamento de Impressão',
    path: app.getPath('exe'),
  });

  autoLauncher.isEnabled().then((isEnabled) => {
    if (appConfig.autoStart && !isEnabled) {
      autoLauncher.enable();
    } else if (!appConfig.autoStart && isEnabled) {
      autoLauncher.disable();
    }
  });
}

//======================================================================
// APP LIFECYCLE
//======================================================================
// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// App initialization
app.whenReady().then(() => {
  setupAutoLaunch();
  ensureDirectories();
  createTray();
  
  if (isAuthenticated()) {
    createMainWindow();
  } else {
    createLoginWindow();
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isAuthenticated()) {
        createMainWindow();
      } else {
        createLoginWindow();
      }
    }
  });
});

// App shutdown
app.on('before-quit', function () {
  isQuitting = true;
});

// Prevent app close on all windows closed
app.on('window-all-closed', function (e) {
  if (process.platform !== 'darwin') {
    // Don't terminate the app, keep it running in the background
    e.preventDefault();
  }
});

//======================================================================
// IPC EVENT HANDLERS - WINDOW OPERATIONS
//======================================================================
ipcMain.on('minimize-window', (event) => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('hide-window', (event) => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.on('close-app', () => {
  if (mainWindow) {
    mainWindow.hide(); // Just hide the window instead of closing it
  }
});

ipcMain.on('minimize-app', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('set-critical-operation', (event, isCritical) => {
  global.criticalOperation = isCritical;
});

//======================================================================
// IPC EVENT HANDLERS - AUTHENTICATION
//======================================================================
ipcMain.on('login', async (event, credentials) => {
  try {
    // Here you would make the call to the authentication API
    // Simulating a successful response for now
    let response;
    try {
      response = await axios.post(`${appConfig.apiPrincipalServiceUrl}/login/desktop`, {
        email: credentials.email,
        password: credentials.password
      });
    } catch (error) {
      event.reply('login-response', { 
        success: false, 
        message: error?.response?.data?.message || 'Erro ao autenticar com o servidor. Tente novamente mais tarde.'
      });
      return;
    }
    
    if (response.status === 200) {
      // Save user data
      saveUserData(response.data);
      
      // Close login window and open main window
      if (loginWindow) {
        loginWindow.close();
      }
      createMainWindow();
      
      event.reply('login-response', { success: true });
    } else {
      console.log('Falha na autenticação:', response.data);
      event.reply('login-response', { 
        success: false, 
        message: response?.data?.message || 'Falha na autenticação. Verifique suas credenciais.'
      });
    }
  } catch (error) {
    console.error('Erro de login:', error);
    event.reply('login-response', { 
      success: false, 
      message: 'Erro ao conectar ao servidor. Tente novamente mais tarde.'
    });
  }
});

ipcMain.on('logout', (event) => {
  try {
    if (fs.existsSync(appConfig.userDataFile)) {
      fs.unlinkSync(appConfig.userDataFile);
    }
    
    if (mainWindow) {
      mainWindow.close();
    }
    
    createLoginWindow();
    event.reply('logout-response', { success: true });
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
    event.reply('logout-response', { 
      success: false, 
      message: 'Erro ao fazer logout.'
    });
  }
});

ipcMain.on('get-user', (event) => {
  const userData = getUserData();
  event.reply('user-data', userData);
});

//======================================================================
// IPC EVENT HANDLERS - PRINT MANAGEMENT
//======================================================================
ipcMain.on('listar-arquivos', async (event) => {
  try {
    const userData = getUserData();
    
    if (!userData || !userData.token) {
      event.reply('arquivos-response', { 
        success: false, 
        message: 'Usuário não autenticado' 
      });
      return;
    }
    
    // Here you would make the API call to get the files
    // Simulating a response for now
    const arquivos = [
      { id: 1, nome: 'Documento 1.pdf', tamanho: '2.5 MB', data: '2025-04-10', status: 'Pendente' },
      { id: 2, nome: 'Relatório Mensal.docx', tamanho: '1.8 MB', data: '2025-04-11', status: 'Pendente' },
      { id: 3, nome: 'Imagem.jpg', tamanho: '3.2 MB', data: '2025-04-09', status: 'Impresso' },
      { id: 4, nome: 'Planilha.xlsx', tamanho: '1.1 MB', data: '2025-04-08', status: 'Falha' }
    ];
    
    /* Real API implementation:
    const response = await axios.get(`${appConfig.apiBaseUrl}/files`, {
      headers: {
        'Authorization': `Bearer ${userData.token}`
      }
    });
    const arquivos = response.data;
    */
    
    event.reply('arquivos-response', { success: true, arquivos });
  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
    event.reply('arquivos-response', { 
      success: false, 
      message: 'Erro ao listar arquivos para impressão' 
    });
  }
});

ipcMain.on('listar-impressoras', async (event) => {
  try {
    const userData = getUserData();
    
    if (!userData || !userData.token) {
      event.reply('impressoras-response', { 
        success: false, 
        message: 'Usuário não autenticado' 
      });
      return;
    }
    
    // Here you would make the API call to get the printers
    // Simulating a response for now
    const impressoras = [
      { id: 1, nome: 'HP LaserJet Pro', status: 'Online', localizacao: 'Recepção' },
      { id: 2, nome: 'Epson EcoTank', status: 'Online', localizacao: 'Escritório' },
      { id: 3, nome: 'Brother MFC', status: 'Offline', localizacao: 'Sala de Reunião' },
      { id: 4, nome: 'Canon PIXMA', status: 'Online', localizacao: 'Administração' }
    ];
    
    /* Real API implementation:
    const response = await axios.get(`${appConfig.apiBaseUrl}/printers`, {
      headers: {
        'Authorization': `Bearer ${userData.token}`
      }
    });
    const impressoras = response.data;
    */
    
    event.reply('impressoras-response', { success: true, impressoras });
  } catch (error) {
    console.error('Erro ao listar impressoras:', error);
    event.reply('impressoras-response', { 
      success: false, 
      message: 'Erro ao listar impressoras disponíveis' 
    });
  }
});

ipcMain.on('imprimir-arquivo', async (event, { arquivoId, impressoraId }) => {
  try {
    const userData = getUserData();
    
    if (!userData || !userData.token) {
      event.reply('impressao-response', { 
        success: false, 
        message: 'Usuário não autenticado' 
      });
      return;
    }
    
    // Here you would make the API call to print the file
    // Simulating a response for now
    const resultado = { 
      success: true, 
      jobId: Math.floor(Math.random() * 10000), 
      message: 'Arquivo enviado para impressão com sucesso' 
    };
    
    /* Real API implementation:
    const response = await axios.post(`${appConfig.apiBaseUrl}/print`, {
      fileId: arquivoId,
      printerId: impressoraId
    }, {
      headers: {
        'Authorization': `Bearer ${userData.token}`
      }
    });
    const resultado = response.data;
    */
    
    event.reply('impressao-response', resultado);
  } catch (error) {
    console.error('Erro ao imprimir arquivo:', error);
    event.reply('impressao-response', { 
      success: false, 
      message: 'Erro ao enviar arquivo para impressão' 
    });
  }
});

//======================================================================
// IPC EVENT HANDLERS - SYSTEM INSTALLATION
//======================================================================
ipcMain.on('verificar-instalacao', async (event) => {
  try {
    const instalador = require('./installer');
    
    // Check WSL status
    const wslStatus = await instalador.checkWSLStatusDetailed();
    
    // Check if default user is configured
    let userConfigured = false;
    if (wslStatus.installed && wslStatus.wsl2 && wslStatus.hasDistro) {
      try {
        const output = await execPromise('wsl -d Ubuntu -u root id print_user', 10000, true);
        userConfigured = output.trim() !== '';
      } catch (error) {
        console.error('Erro ao verificar usuário:', error);
      }
    }
    
    event.reply('status-instalacao', {
      wslInstalled: wslStatus.installed,
      wsl2Configured: wslStatus.wsl2,
      distroInstalled: wslStatus.hasDistro,
      userConfigured: userConfigured
    });
  } catch (error) {
    console.error('Erro ao verificar status de instalação:', error);
    event.reply('status-instalacao', {
      wslInstalled: false,
      wsl2Configured: false,
      distroInstalled: false,
      userConfigured: false,
      error: error.message
    });
  }
});

ipcMain.on('iniciar-instalacao', async (event) => {
  try {
    // Check if running as administrator
    const isAdmin = await checkAdmin();
    
    if (!isAdmin) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Privilégios de Administrador',
        message: 'Esta operação precisa ser executada como administrador.',
        detail: 'Por favor, execute a aplicação novamente como administrador.',
        buttons: ['OK']
      });
      return;
    }
    
    // Open installation window
    createInstallationWindow();
    
    // Start installation process
    event.reply('log', {
      type: 'header',
      message: 'Iniciando instalação do Sistema de Gerenciamento de Impressão'
    });
    
    // Send log to main interface too
    event.reply('installation-log', {
      type: 'info',
      message: 'Iniciando instalação do Sistema de Gerenciamento de Impressão'
    });
    
    // Call installer function
    const instalador = require('./installer');
    
    // Replace log function to send to interface
    const originalLog = instalador.log;
    instalador.log = function(message, type = 'info') {
      // Execute original log
      originalLog(message, type);
      
      // Send to interface
      event.reply('log', { type, message });
      
      // Send to main interface log
      event.reply('installation-log', { type, message });
      
      // Also send to installation window
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('log', { type, message });
      }
    };
    
    // Replace askQuestion function to use dialogs
    const originalAskQuestion = instalador.askQuestion;
    global.askQuestionCallback = null;
    
    instalador.askQuestion = function(question) {
      return new Promise((resolve) => {
        if (installationWindow && !installationWindow.isDestroyed()) {
          installationWindow.webContents.send('pergunta', { question });
        } else {
          event.reply('pergunta', { question });
        }
        
        // Set up global callback to receive the answer
        global.askQuestionCallback = resolve;
      });
    };
    
    // Start installation
    const resultado = await instalador.installSystem();
    
    // Report result
    if (resultado.success) {
      event.reply('log', {
        type: 'success',
        message: resultado.message
      });
      
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('instalacao-completa', { success: true });
      }
      
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Instalação Concluída',
        message: 'Sistema de Gerenciamento de Impressão instalado com sucesso!',
        detail: 'O sistema está pronto para uso.',
        buttons: ['OK']
      });
    } else {
      event.reply('log', {
        type: 'error',
        message: resultado.message
      });
      
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('instalacao-completa', { success: false });
      }
      
      if (resultado.needsReboot) {
        const escolha = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Reinicialização Necessária',
          message: 'É necessário reiniciar o computador para continuar a instalação.',
          detail: 'Deseja reiniciar agora?',
          buttons: ['Sim', 'Não'],
          defaultId: 0
        });
        
        if (escolha.response === 0) {
          // Restart computer
          require('child_process').exec('shutdown /r /t 10');
        }
      } else {
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Erro na Instalação',
          message: 'Ocorreu um erro durante a instalação.',
          detail: resultado.message,
          buttons: ['OK']
        });
      }
    }
  } catch (error) {
    console.error('Erro na instalação:', error);
    
    event.reply('log', {
      type: 'error',
      message: `Erro inesperado: ${error.message || 'Erro desconhecido'}`
    });
    
    if (installationWindow && !installationWindow.isDestroyed()) {
      installationWindow.webContents.send('instalacao-completa', { 
        success: false,
        error: error.message || 'Erro desconhecido' 
      });
    }
    
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Erro na Instalação',
      message: 'Ocorreu um erro durante a instalação.',
      detail: error.message || 'Erro desconhecido',
      buttons: ['OK']
    });
  }
});

// Receive question response
ipcMain.on('resposta-pergunta', (event, resposta) => {
  if (global.askQuestionCallback) {
    global.askQuestionCallback(resposta);
    global.askQuestionCallback = null;
  }
});