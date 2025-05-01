/**
 * Sistema de Gerenciamento de Impressão - Aplicação Desktop
 * 
 * Aplicativo principal com suporte multiplataforma (Windows, Linux, macOS)
 */

const { 
  app, 
  BrowserWindow, 
  ipcMain, 
  dialog, 
  Tray, 
  Menu, 
  shell, 
  screen 
} = require('electron');
const { printersSync } = require('./tasks/printers');
const { printSync } = require('./tasks/print');
const AppUpdater = require('./updater');
const { initTask } = require('./task');
const { initAPI } = require('./api');
const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { execFile, exec } = require('child_process');
const platform = require('./platform');
const { createInstaller } = require('./installer-factory');
const util = require('util');

// Convertir exec para Promises
const execPromise = util.promisify(exec);

// Manter referências globais
let mainWindow;
let tray = null;
let updater = null;
let apiServer = null;
let isQuitting = false;
let loginWindow = null;
let currentTheme = 'dark';
let installationWindow = null;
let isInstallingInProgress = false;
let isInstallingComponents = false;

// Configuração do aplicativo
const appConfig = {
  apiPrincipalServiceUrl: 'http://177.54.87.225:53000/api/v1',
  apiLocalUrl: 'http://localhost:56258/api',
  autoStart: true,
  minimizeOnBlur: true, // Minimiza ao clicar fora da janela
  dataPath: path.join(app.getPath('userData'), 'appData'),
  desktopApiPort: 56257,
  userDataFile: path.join(app.getPath('userData'), 'user.json'),
  windowPrefsFile: path.join(app.getPath('userData'), 'window_prefs.json'),
  defaultWidth: 360,
  defaultHeight: 600
};

// Detectar a plataforma atual
const currentPlatform = platform.detectPlatform();
const currentArch = platform.detectArch();
const platformHandler = createInstaller();

/**
 * Verifica se o usuário possui privilégios de administrador
 * @returns {Promise<boolean>} True se tem privilégios, false caso contrário
 */
async function checkAdminPrivileges() {
  try {
    return await platformHandler.checkAdminPrivileges();
  } catch (error) {
    console.error('Erro ao verificar privilégios de administrador:', error);
    return false;
  }
}

/**
 * Tenta elevar privilégios (reiniciar como administrador)
 * Funciona apenas no Windows
 */
function elevatePrivileges() {
  try {
    if (platform.detectPlatform() !== 'windows') {
      console.log('Elevação de privilégios é suportada apenas no Windows');
      return false;
    }

    const appPath = process.execPath;
    const args = process.argv.slice(1);

    execFile('powershell.exe', [
      '-Command',
      `Start-Process -FilePath '${appPath.replace(/(\s+)/g, '`$1')}' -ArgumentList '${args.join(' ')}' -Verb RunAs`
    ]);

    setTimeout(() => app.exit(), 1000);
    return true;
  } catch (error) {
    console.error('Erro ao elevar privilégios:', error);
    return false;
  }
}

/**
 * Verifica e configura o ambiente necessário para a plataforma
 */
async function setupEnvironment() {
  try {
    if (isInstallingComponents) return false;
    isInstallingComponents = true;

    console.log('Verificando componentes do sistema...');

    // Verificar componentes da plataforma
    const systemStatus = await platformHandler.checkSystemRequirements();

    // Se tudo estiver OK, não fazemos nada
    if (systemStatus.compatible && !systemStatus.errors.length) {
      console.log('Todos os componentes do sistema estão instalados');
      isInstallingComponents = false;
      return true;
    }

    // Exibir diálogo perguntando se o usuário deseja instalar os componentes
    const choice = await dialog.showMessageBox({
      type: 'question',
      title: 'Instalação de Componentes',
      message: 'Componentes necessários não encontrados',
      detail: `Este aplicativo requer alguns componentes para funcionar corretamente. Deseja instalar esses componentes agora?`,
      buttons: ['Sim', 'Não'],
      defaultId: 0
    });

    if (choice.response === 1) {
      // Usuário optou por não instalar
      isInstallingComponents = false;
      return false;
    }

    // Mostrar janela de instalação
    createInstallationWindow();
    
    // Aguardar a janela de instalação estar pronta
    await new Promise(resolve => {
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.once('ready-to-show', () => {
          console.log('Janela de instalação pronta');
          setTimeout(resolve, 500); // Dar tempo para inicializar
        });
      } else {
        setTimeout(resolve, 1000);
      }
    });

    // Aguardar mais tempo para certificar que os handlers IPC estão registrados
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Enviar mensagem inicial para a janela de instalação
    if (installationWindow && !installationWindow.isDestroyed()) {
      sendLogToInstallWindow('header', 'Iniciando instalação de componentes do sistema');
    }

    // Configurar callbacks para atualização da interface
    const resultado = await platformHandler.install();

    if (resultado.success) {
      // Enviar notificação de conclusão para a janela de instalação
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('instalacao-completa', {
          success: true,
          message: resultado.message || 'Instalação concluída com sucesso'
        });
      }

      await dialog.showMessageBox({
        type: 'info',
        title: 'Instalação Concluída',
        message: 'Componentes instalados com sucesso!',
        detail: 'O sistema está pronto para uso.',
        buttons: ['OK']
      });
      
      // Fechar a janela de instalação após 5 segundos
      setTimeout(() => {
        if (installationWindow && !installationWindow.isDestroyed()) {
          installationWindow.close();
        }
      }, 5000);
      
      isInstallingComponents = false;
      return true;
    } else if (resultado.needsReboot) {
      const rebootChoice = await dialog.showMessageBox({
        type: 'warning',
        title: 'Reinicialização Necessária',
        message: 'É necessário reiniciar o computador para continuar a instalação.',
        detail: 'Deseja reiniciar agora?',
        buttons: ['Sim', 'Não'],
        defaultId: 0
      });

      if (rebootChoice.response === 0) {
        // Reiniciar o computador - método específico por plataforma
        if (platform.detectPlatform() === 'windows') {
          exec('shutdown /r /t 10');
        } else if (platform.detectPlatform() === 'linux') {
          exec('sudo shutdown -r now');
        } else if (platform.detectPlatform() === 'macos') {
          exec('sudo shutdown -r now');
        }
      }
      
      isInstallingComponents = false;
      return false;
    } else {
      // Caso de erro
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('instalacao-completa', {
          success: false,
          error: resultado.message || 'Erro desconhecido'
        });
      }

      await dialog.showMessageBox({
        type: 'error',
        title: 'Erro na Instalação',
        message: 'Não foi possível instalar todos os componentes necessários.',
        detail: resultado.message || 'Verifique o log para mais detalhes.',
        buttons: ['OK']
      });
      
      isInstallingComponents = false;
      return false;
    }
  } catch (error) {
    console.error('Erro ao configurar ambiente:', error);
    isInstallingComponents = false;
    return false;
  }
}

/**
 * Salva configurações de impressão automática
 * @param {Object} config Configuração de impressão automática
 * @returns {boolean} True se salvo com sucesso
 */
function saveAutoPrintConfig(config) {
  try {
    const userData = getUserData();

    if (!userData) return false;

    // Adicionar configurações de impressão automática
    userData.autoPrintEnabled = config.enabled;
    userData.defaultPrinterId = config.enabled ? config.printerId : null;

    // Salvar dados do usuário
    saveUserData(userData);

    updateTrayMenu();

    return true;
  } catch (error) {
    console.error('Erro ao salvar configurações de impressão automática:', error);
    return false;
  }
}

/**
 * Obter configurações de impressão automática
 * @returns {Object|null} Configurações de impressão automática ou null se erro
 */
function getAutoPrintConfig() {
  try {
    const userData = getUserData();

    if (!userData) return null;

    return {
      enabled: userData.autoPrintEnabled || false,
      printerId: userData.defaultPrinterId || null
    };
  } catch (error) {
    console.error('Erro ao obter configurações de impressão automática:', error);
    return null;
  }
}

// Garantir que apenas uma instância do aplicativo esteja em execução
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Alguém tentou executar uma segunda instância, devemos focar nossa janela
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/**
 * Configura inicialização automática do aplicativo
 */
function setupAutoLaunch() {
  try {
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
  } catch (error) {
    console.error('Erro ao configurar inicialização automática:', error);
  }
}

/**
 * Cria o diretório de dados se não existir
 */
function ensureDirectories() {
  if (!fs.existsSync(appConfig.dataPath)) {
    fs.mkdirSync(appConfig.dataPath, { recursive: true });
  }
}

/**
 * Verifica se o usuário está autenticado
 * @returns {boolean} True se autenticado
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
 * Salva dados do usuário
 * @param {Object} userData Dados do usuário
 */
function saveUserData(userData) {
  try {
    ensureDirectories();
    const data = userData && userData.data ? userData.data : userData;
    fs.writeFileSync(appConfig.userDataFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Erro ao salvar dados do usuário:', error);
  }
}

/**
 * Envia log para a janela de instalação
 * @param {string} type Tipo de log
 * @param {string} message Mensagem de log
 */
function sendLogToInstallWindow(type, message) {
  if (installationWindow && !installationWindow.isDestroyed()) {
    try {
      installationWindow.webContents.send('log', { type, message });
      console.log(`Log enviado para janela de instalação: [${type}] ${message}`);
    } catch (err) {
      console.error('Erro ao enviar log para a janela de instalação:', err);
    }
  } else {
    console.log(`Log não enviado (janela não disponível): [${type}] ${message}`);
  }
}

/**
 * Função para enviar atualizações de etapa para a janela de instalação
 * @param {number} step Número da etapa
 * @param {string} state Estado da etapa
 * @param {string} message Mensagem
 */
function sendStepUpdateToInstallWindow(step, state, message) {
  if (installationWindow && !installationWindow.isDestroyed()) {
    try {
      console.log(`Enviando atualização de etapa: ${step}, ${state}, ${message}`);
      installationWindow.webContents.send('step-update', {
        step: step,
        state: state,
        message: message
      });
    } catch (err) {
      console.error('Erro ao enviar atualização de etapa:', err);
    }
  }
}

/**
 * Função para enviar atualizações de progresso para a janela de instalação
 * @param {number} percentage Porcentagem de progresso
 */
function sendProgressUpdateToInstallWindow(percentage) {
  if (installationWindow && !installationWindow.isDestroyed()) {
    try {
      installationWindow.webContents.send('progress-update', {
        percentage: percentage
      });
    } catch (err) {
      console.error('Erro ao enviar atualização de progresso:', err);
    }
  }
}

/**
 * Obter dados do usuário
 * @returns {Object|null} Dados do usuário ou null se erro
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
 * Salva preferências da janela
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
 * Obter preferências da janela
 * @returns {Object} Preferências da janela
 */
function getWindowPreferences() {
  try {
    if (fs.existsSync(appConfig.windowPrefsFile)) {
      return JSON.parse(fs.readFileSync(appConfig.windowPrefsFile, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao ler preferências da janela:', error);
  }

  // Retornar valores padrão se não houver preferências salvas
  return {
    width: appConfig.defaultWidth,
    height: appConfig.defaultHeight,
    isMaximized: false
  };
}

/**
 * Criar janela de login
 */
function createLoginWindow() {
  // Importar o ícone da aplicação
  const iconPath = getIconPath();

  // Obter tamanho da tela
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Tamanho padrão da janela de login
  const windowWidth = 360;
  const windowHeight = 480;

  // Calcular posição (canto inferior direito)
  const x = width - windowWidth - 20;
  const y = height - windowHeight - 60; // Deixar espaço para a barra de tarefas

  loginWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    resizable: false,
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

  // Mostrar a janela quando estiver pronta
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
 * Obtém o caminho do ícone apropriado para a plataforma atual
 * @returns {string} Caminho do ícone
 */
function getIconPath() {
  const currentPlatform = platform.detectPlatform();
  
  switch (currentPlatform) {
    case 'windows':
      return path.join(__dirname, `assets/icon/${currentTheme}.ico`);
    case 'linux':
      return path.join(__dirname, 'assets/icon/icon.png');
    case 'macos':
      return path.join(__dirname, 'assets/icon/icon.icns');
    default:
      return path.join(__dirname, `assets/icon/${currentTheme}.ico`);
  }
}

/**
 * Criar janela principal
 */
function createMainWindow() {
  // Importar o ícone da aplicação
  const iconPath = getIconPath();

  // Obter tamanho da tela
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Obter preferências salvas
  const prefs = getWindowPreferences();

  // Calcular posição (canto inferior direito) se não houver posição salva
  let x = prefs.x;
  let y = prefs.y;

  if (x === undefined || y === undefined) {
    x = width - prefs.width - 20;
    y = height - prefs.height - 60; // Deixar espaço para a barra de tarefas
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
  // mainWindow.webContents.openDevTools(); // debug

  // Maximizar a janela se for a preferência do usuário
  if (prefs.isMaximized) {
    mainWindow.maximize();
  }

  // Mostrar a janela quando estiver pronta
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Salvar tamanho e posição quando a janela for movida ou redimensionada
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

  mainWindow.on('show', function () {
    mainWindow.webContents.send('window-shown');
  });

  mainWindow.on('focus', function () {
    mainWindow.webContents.send('window-shown');
  });

  // Adicionar notificação de atualização na interface
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      // Add update notification UI
      const updateNotification = document.createElement('div');
      updateNotification.id = 'update-notification';
      updateNotification.style.display = 'none';
      updateNotification.style.position = 'fixed';
      updateNotification.style.bottom = '20px';
      updateNotification.style.right = '20px';
      updateNotification.style.backgroundColor = 'var(--bg-content)';
      updateNotification.style.color = 'var(--text-color)';
      updateNotification.style.padding = '12px 16px';
      updateNotification.style.borderRadius = '4px';
      updateNotification.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
      updateNotification.style.zIndex = '9999';
      updateNotification.style.maxWidth = '300px';
      document.body.appendChild(updateNotification);
      
      // Listen for update events
      require('electron').ipcRenderer.on('update-status', (event, data) => {
        const notification = document.getElementById('update-notification');
        
        switch(data.status) {
          case 'update-available':
            notification.innerHTML = \`
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="font-weight:500;">Nova atualização disponível</div>
                <button id="close-update-notification" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <div style="margin-bottom:8px;">Versão \${data.version} está disponível.</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">\${data.notes || ''}</div>
              <button id="install-update-btn" style="background-color:var(--color-primary);color:white;border:none;border-radius:4px;padding:8px 12px;cursor:pointer;width:100%;">
                Atualizar agora
              </button>
            \`;
            notification.style.display = 'block';
            
            document.getElementById('close-update-notification').addEventListener('click', () => {
              notification.style.display = 'none';
            });
            
            document.getElementById('install-update-btn').addEventListener('click', () => {
              require('electron').ipcRenderer.send('install-update');
              notification.style.display = 'none';
            });
            break;
            
          case 'downloading':
          case 'installing':
            notification.innerHTML = \`
              <div style="display:flex;align-items:center;">
                <div class="spinner" style="width:16px;height:16px;margin-right:8px;"></div>
                <div>\${data.message}</div>
              </div>
            \`;
            notification.style.display = 'block';
            break;
            
          case 'update-error':
            notification.innerHTML = \`
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="font-weight:500;">Erro na atualização</div>
                <button id="close-update-notification" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <div>\${data.message}</div>
            \`;
            notification.style.display = 'block';
            
            document.getElementById('close-update-notification').addEventListener('click', () => {
              notification.style.display = 'none';
            });
            break;
            
          default:
            if (data.message) {
              notification.innerHTML = \`
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <div>\${data.message}</div>
                  <button id="close-update-notification" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);margin-left:8px;">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              \`;
              notification.style.display = 'block';
              
              document.getElementById('close-update-notification').addEventListener('click', () => {
                notification.style.display = 'none';
              });
              
              // Auto hide after 5 seconds for non-critical statuses
              setTimeout(() => {
                notification.style.display = 'none';
              }, 5000);
            }
        }
      });
    `);
  });

  global.appWindow = mainWindow;
}

/**
 * Criar janela de instalação
 */
function createInstallationWindow() {
  // Importar o ícone da aplicação
  const iconPath = getIconPath();

  // Fechar a janela existente se houver
  if (installationWindow && !installationWindow.isDestroyed()) {
    installationWindow.close();
  }

  installationWindow = new BrowserWindow({
    width: 800,
    height: 700,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true
    },
    show: false,
    frame: false
  });

  installationWindow.loadFile('view/installation.html');

  // Mostrar a janela quando estiver pronta
  installationWindow.once('ready-to-show', () => {
    console.log('Janela de instalação pronta para ser mostrada');
    installationWindow.show();

    // Enviar um log inicial para inicializar a comunicação
    setTimeout(() => {
      sendLogToInstallWindow('header', 'Inicializando instalação do sistema...');
    }, 500);
  });

  installationWindow.on('closed', function () {
    installationWindow = null;
  });

  // Importante: configurar handler para o evento 'installation-page-ready'
  // Este evento é emitido pelo renderer quando a página está totalmente carregada
  ipcMain.once('installation-page-ready', () => {
    console.log('Página de instalação pronta para receber logs');
    if (installationWindow && !installationWindow.isDestroyed()) {
      sendLogToInstallWindow('info', 'Interface de instalação inicializada com sucesso');
    }
  });

  return installationWindow;
}

/**
 * Criar ícone na bandeja
 */
function createTray() {
  // Usar o ícone de acordo com o tema atual e plataforma
  const iconPath = getIconPath();

  // Criar o ícone na bandeja
  try {
    tray = new Tray(iconPath);

    const autoPrintConfig = getAutoPrintConfig();
    const isAutoPrintEnabled = autoPrintConfig?.enabled || false;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir Sistema de Gerenciamento de Impressão',
        click: function () {
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
        label: isAutoPrintEnabled ? 'Desativar Impressão Automática' : 'Ativar Impressão Automática',
        click: function () {
          toggleAutoPrintFromTray();
        }
      },
      { type: 'separator' },
      {
        label: 'Sair',
        click: function () {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Sistema de Gerenciamento de Impressão');
    tray.setContextMenu(contextMenu);

    tray.on('click', function () {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.webContents.send('window-shown');
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

/**
 * Atualiza o menu da bandeja
 */
function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;

  // Obter o estado da impressão automática
  const autoPrintConfig = getAutoPrintConfig();
  const isAutoPrintEnabled = autoPrintConfig?.enabled || false;

  // Recriar o menu com o estado atualizado
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Sistema de Gerenciamento de Impressão',
      click: function () {
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
      label: isAutoPrintEnabled ? 'Desativar Impressão Automática' : 'Ativar Impressão Automática',
      click: function () {
        toggleAutoPrintFromTray();
      }
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: function () {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Alterna o estado da impressão automática a partir da bandeja
 */
function toggleAutoPrintFromTray() {
  // Obter configuração atual
  const autoPrintConfig = getAutoPrintConfig();
  const isAutoPrintEnabled = autoPrintConfig?.enabled || false;

  if (isAutoPrintEnabled) {
    // Desativar impressão automática
    saveAutoPrintConfig({
      enabled: false,
      printerId: null
    });

    // Atualizar interface se a janela estiver aberta
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-auto-print-state', {
        enabled: false,
        printerId: null
      });
    }

    // Atualizar menu da bandeja
    updateTrayMenu();
  } else {
    // Ativar impressão automática - precisa mostrar a interface
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Mostrar a janela
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();

      // Enviar mensagem para abrir o modal de configuração
      setTimeout(() => {
        mainWindow.webContents.send('show-auto-print-modal');
      }, 500);
    } else if (isAuthenticated()) {
      // Criar a janela principal
      createMainWindow();

      // Agendar a abertura do modal após a janela estar pronta
      mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('show-auto-print-modal');
          }
        }, 1000);
      });
    } else {
      // Usuário não está autenticado, abrir tela de login
      createLoginWindow();
    }
  }
}

// Este método será chamado quando o Electron terminar a inicialização
app.whenReady().then(async () => {
  // Verificar se temos privilégios de administrador
  const isAdmin = await checkAdminPrivileges();

  if (!isAdmin && platform.detectPlatform() === 'windows') {
    // No Windows, podemos tentar elevar privilégios
    // Mostrar diálogo perguntando se deseja continuar com elevação
    const choice = await dialog.showMessageBox({
      type: 'question',
      title: 'Privilégios de Administrador',
      message: 'Este aplicativo precisa de privilégios de administrador',
      detail: 'Para instalação e configuração adequada dos componentes, é necessário executar como administrador. Deseja continuar?',
      buttons: ['Sim', 'Não'],
      defaultId: 0
    });

    if (choice.response === 0) {
      // Tentar elevar privilégios
      elevatePrivileges();
      return; // Encerra este processo, o novo será executado como admin
    }
    // Se o usuário não quiser elevar, continuaremos sem privilégios de admin
    console.log('Continuando sem privilégios de administrador (algumas funcionalidades podem não funcionar)');
  }

  // Inicialização normal do aplicativo
  setupAutoLaunch();
  ensureDirectories();
  createTray();

  // Verificar e configurar componentes do sistema
  // Importante: Aguardamos a conclusão da verificação/instalação antes de prosseguir
  try {
    await setupEnvironment();
    console.log('Configuração do ambiente concluída ou não necessária');
  } catch (error) {
    console.error('Erro durante a configuração do ambiente:', error);
  }

  // Verificar se o usuário está autenticado
  if (isAuthenticated()) {
    createMainWindow();

    apiServer = initAPI(appConfig, mainWindow, createMainWindow, isAuthenticated);

    updater = new AppUpdater(mainWindow);

    setTimeout(() => {
      updater.checkForUpdates(true);
    }, 3000);
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

// Evento quando o aplicativo está pronto para fechar
app.on('before-quit', function () {
  isQuitting = true;

  if (apiServer) {
    apiServer.close(() => {
      console.log('Servidor API encerrado com sucesso');
    });
  }
});

// Manter o aplicativo em execução quando todas as janelas forem fechadas
app.on('window-all-closed', function (e) {
  if (process.platform !== 'darwin') {
    // Não finalizar o aplicativo, mantê-lo em segundo plano
    e.preventDefault();
  }
});

// Capturar eventos do processo de renderização

// Eventos de controle da janela
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
    mainWindow.hide(); // Apenas esconde a janela em vez de fechá-la
  }
});

// Manipular minimização de janela
ipcMain.on('minimize-app', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('set-critical-operation', (event, isCritical) => {
  global.criticalOperation = isCritical;
});

ipcMain.on('check-for-updates', (event) => {
  if (updater) {
    updater.checkForUpdates();
  }
});

ipcMain.on('install-update', (event) => {
  if (updater && updater.pendingUpdate) {
    updater.installUpdate();
  }
});

// Ouvir quando a página de instalação estiver pronta
ipcMain.on('installation-page-ready', () => {
  console.log('Página de instalação pronta para receber logs');
  if (installationWindow && !installationWindow.isDestroyed()) {
    installationWindow.webContents.send('log', {
      type: 'info',
      message: 'Interface de instalação inicializada com sucesso'
    });
  }
});

// Handler para verificação detalhada do sistema
ipcMain.on('verificar-sistema-detalhado', async (event) => {
  try {
    console.log('Recebida solicitação de verificação detalhada do sistema');

    // Verificar status do sistema com verificação completa
    const systemStatus = await platformHandler.checkSystemRequirements();

    // Salvar o status em cache global para fallback
    global.lastSystemStatus = systemStatus;

    console.log('Enviando resultado da verificação para o renderer');
    event.reply('sistema-status-detalhado', systemStatus);
  } catch (error) {
    console.error('Erro na verificação detalhada do sistema:', error);

    // Usar cache se disponível
    if (global.lastSystemStatus) {
      console.log('Usando cache de status para fallback');
      event.reply('sistema-status-detalhado', global.lastSystemStatus);
    } else {
      event.reply('sistema-status-detalhado', {
        error: error.message || 'Erro desconhecido na verificação do sistema'
      });
    }
  }
});

// Handler para exportar log
ipcMain.on('exportar-log', (event, { content, filename }) => {
  try {
    const downloadsPath = app.getPath('downloads');
    const logPath = path.join(downloadsPath, filename);

    fs.writeFileSync(logPath, content, 'utf8');

    event.reply('exportar-log-resposta', {
      success: true,
      path: logPath
    });
  } catch (error) {
    console.error('Erro ao exportar log:', error);
    event.reply('exportar-log-resposta', {
      success: false,
      error: error.message
    });
  }
});

ipcMain.on('update-app-icon', (event, { theme }) => {
  // Atualizar a variável global do tema
  currentTheme = theme;

  // Caminho para o novo ícone
  const iconPath = getIconPath();

  // Verificar se o arquivo existe
  if (fs.existsSync(iconPath)) {
    // Atualizar ícone da janela principal (se existir)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIcon(iconPath);
    }

    // Atualizar ícone da bandeja (se existir)
    if (tray && !tray.isDestroyed()) {
      tray.setImage(iconPath);
    }

    // Log para debugging
    console.log(`Ícone da aplicação atualizado para: ${theme}`);
  } else {
    console.error(`Ícone não encontrado: ${iconPath}`);
  }
});

ipcMain.on('save-auto-print-config', (event, config) => {
  const success = saveAutoPrintConfig(config);

  updateTrayMenu();

  event.reply('save-auto-print-config-response', {
    success: success,
    config: config
  });

  console.log('Configurações de impressão automática salvas:', success, config);
});

// Obter configurações de impressão automática
ipcMain.on('get-auto-print-config', (event) => {
  const config = getAutoPrintConfig();

  event.reply('auto-print-config', config);
});

ipcMain.on('show-auto-print-modal', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('show-auto-print-modal');
  }
});

// Login
ipcMain.on('login', async (event, credentials) => {
  try {
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
      // Salvar os dados do usuário
      saveUserData(response.data);

      // Fechar a janela de login e abrir a janela principal
      if (loginWindow) {
        loginWindow.close();
      }
      createMainWindow();

      apiServer = initAPI(appConfig, mainWindow, createMainWindow, isAuthenticated);

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

// Abrir configurações manuais
ipcMain.on('open-manual-settings', (event) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Configurações manuais',
    message: 'Abrindo configurações manuais...',
    detail: 'Abra o navegador e acesse http://localhost:631 para configurar as impressoras manualmente.',
    buttons: ['OK']
  });
  shell.openExternal('http://localhost:631');
});

// Logout
ipcMain.on('logout', (event) => {
  try {
    printSync();

    if (fs.existsSync(appConfig.userDataFile)) {
      fs.unlinkSync(appConfig.userDataFile);
    }

    if (mainWindow) {
      mainWindow.close();
    }

    if (apiServer) {
      apiServer.close(() => {
        console.log('Servidor API encerrado durante logout');
      });
      apiServer = null;
    }

    try {
      axios.delete(`${appConfig.apiLocalUrl}/files/delete-all`);
    } catch (error) {
      console.error('Erro ao excluir arquivos do servidor:', error);
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

// Obter informações do usuário
ipcMain.on('get-user', (event) => {
  const userData = getUserData();
  event.reply('user-data', userData);
});

// Iniciar instalação
ipcMain.on('iniciar-instalacao', async (event, options = {}) => {
  try {
    // Evitar instalações múltiplas
    if (isInstallingInProgress) {
      console.log('Instalação já em andamento, ignorando nova solicitação');
      event.reply('installation-log', {
        type: 'warning',
        message: 'Instalação já em andamento. Aguarde a conclusão do processo atual.'
      });
      return;
    }

    isInstallingInProgress = true;
    console.log('Iniciando processo de instalação...');

    // Verificar se está sendo executado como administrador
    const isAdmin = await checkAdminPrivileges();
    if (!isAdmin) {
      isInstallingInProgress = false;

      if (platform.detectPlatform() === 'windows') {
        const choice = await dialog.showMessageBox({
          type: 'question',
          title: 'Privilégios de Administrador',
          message: 'Esta operação precisa ser executada como administrador.',
          detail: 'Deseja tentar executar com privilégios elevados?',
          buttons: ['Sim', 'Não'],
          defaultId: 0
        });

        if (choice.response === 0) {
          // Tentar elevar privilégios
          elevatePrivileges();
        }
      } else {
        await dialog.showMessageBox({
          type: 'warning',
          title: 'Privilégios Insuficientes',
          message: 'Esta operação precisa ser executada com privilégios de administrador.',
          detail: 'Por favor, reinicie o aplicativo com privilégios adequados.',
          buttons: ['OK']
        });
      }

      event.reply('installation-log', {
        type: 'error',
        message: 'Privilégios de administrador necessários para instalação.'
      });
      return;
    }

    // Criar janela de instalação
    createInstallationWindow();

    // Executar a instalação usando o gerenciador de plataforma
    const resultado = await platformHandler.install();

    if (resultado.success) {
      event.reply('installation-log', {
        type: 'success',
        message: 'Instalação concluída com sucesso! ' + (resultado.message || '')
      });

      // Notificar conclusão
      await dialog.showMessageBox({
        type: 'info',
        title: 'Instalação Concluída',
        message: 'Sistema instalado com sucesso!',
        detail: 'O sistema está pronto para uso.',
        buttons: ['OK']
      });

      // Fechar janela de instalação após 5 segundos
      setTimeout(() => {
        if (installationWindow && !installationWindow.isDestroyed()) {
          installationWindow.close();
        }
      }, 5000);
    } else if (resultado.needsReboot) {
      // Caso precise reiniciar
      const rebootChoice = await dialog.showMessageBox({
        type: 'warning',
        title: 'Reinicialização Necessária',
        message: 'É necessário reiniciar o computador para continuar a instalação.',
        detail: 'Deseja reiniciar agora?',
        buttons: ['Sim', 'Não'],
        defaultId: 0
      });

      if (rebootChoice.response === 0) {
        // Reiniciar o computador - método específico por plataforma
        if (platform.detectPlatform() === 'windows') {
          exec('shutdown /r /t 10');
        } else if (platform.detectPlatform() === 'linux') {
          exec('sudo shutdown -r now');
        } else if (platform.detectPlatform() === 'macos') {
          exec('sudo shutdown -r now');
        }
      }
    } else {
      // Caso de erro
      event.reply('installation-log', {
        type: 'error',
        message: `Erro na instalação: ${resultado.message || 'Erro desconhecido'}`
      });

      await dialog.showMessageBox({
        type: 'error',
        title: 'Erro na Instalação',
        message: 'Ocorreu um erro durante a instalação.',
        detail: resultado.message || 'Erro desconhecido',
        buttons: ['OK']
      });
    }

    isInstallingInProgress = false;
  } catch (error) {
    isInstallingInProgress = false;
    console.error('Erro fatal ao iniciar instalação:', error);

    // Informar a GUI sobre o erro
    event.reply('installation-log', {
      type: 'error',
      message: `Erro inesperado ao iniciar instalação: ${error.message || 'Erro desconhecido'}`
    });

    // Mostrar diálogo de erro
    dialog.showMessageBox({
      type: 'error',
      title: 'Erro na Instalação',
      message: 'Ocorreu um erro crítico durante a instalação.',
      detail: error.message || 'Erro desconhecido',
      buttons: ['OK']
    });
  }
});

// Instalar componente específico
ipcMain.on('instalar-componente', async (event, { component }) => {
  try {
    // Check if already installing
    if (isInstallingComponents) {
      event.reply('componente-instalado', {
        success: false,
        message: 'Já existe uma instalação em andamento'
      });
      return;
    }

    isInstallingComponents = true;

    // Log para o processo principal e para a janela principal
    console.log(`Iniciando instalação de componente específico: ${component}`);
    event.reply('installation-log', {
      type: 'header',
      message: `Iniciando instalação do componente: ${component}`
    });

    // Check admin privileges
    const isAdmin = await checkAdminPrivileges();
    if (!isAdmin) {
      isInstallingComponents = false;

      if (platform.detectPlatform() === 'windows') {
        const choice = await dialog.showMessageBox({
          type: 'question',
          title: 'Privilégios de Administrador',
          message: 'Esta operação precisa ser executada como administrador.',
          detail: 'Deseja tentar executar com privilégios elevados?',
          buttons: ['Sim', 'Não'],
          defaultId: 0
        });

        if (choice.response === 0) {
          elevatePrivileges();
        }
      }

      event.reply('componente-instalado', {
        success: false,
        message: 'Privilégios de administrador necessários'
      });
      return;
    }

    // Instalar componente específico usando o platformHandler
    const result = await platformHandler.installComponent(component);

    isInstallingComponents = false;

    // Notify about the result
    event.reply('componente-instalado', {
      success: !!result,
      message: result ? `Componente ${component} instalado com sucesso` : `Falha ao instalar ${component}`
    });

    // If successful, update the system status
    if (result && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('installation-log', {
        type: 'success',
        message: `Componente ${component} instalado com sucesso!`
      });
    }
  } catch (error) {
    isInstallingComponents = false;
    event.reply('componente-instalado', {
      success: false,
      message: error.message || 'Erro desconhecido'
    });
  }
});

// Listar arquivos para impressão
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

    let files = null;
    let response;
    try {
      response = await axios.get(`${appConfig.apiLocalUrl}/files`);
    } catch (error) {
      console.error(error.response?.data);
    }

    if (response?.status === 200) {
      files = response.data?.data.sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
      });
    } else {
      files = [];
    }

    event.reply('arquivos-response', { success: true, files });
  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
    event.reply('arquivos-response', {
      success: false,
      message: 'Erro ao listar arquivos para impressão'
    });
  }
});

// Listar impressoras
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

    let printers = null;
    let response;
    try {
      response = await axios.get(`${appConfig.apiLocalUrl}/printers`);
    } catch (error) {
      console.error(error.response?.data?.message);
    }

    if (response?.status === 200) {
      printers = response.data?.data;
    } else {
      printers = [];
    }
    event.reply('impressoras-response', { success: true, printers });
  } catch (error) {
    console.error('Erro ao listar impressoras:', error);
    event.reply('impressoras-response', {
      success: false,
      message: 'Erro ao listar impressoras disponíveis'
    });
  }
});

// Imprimir arquivo
ipcMain.on('imprimir-arquivo', async (event, { fileId, printerId }) => {
  try {
    const userData = getUserData();

    if (!userData || !userData.token) {
      event.reply('impressao-response', {
        success: false,
        message: 'Usuário não autenticado'
      });
      return;
    }

    let response;
    try {
      response = await axios.post(`${appConfig.apiLocalUrl}/print`, {
        fileId: fileId,
        assetId: printerId
      });
    } catch (error) {
      console.log(error?.response?.data);
    }

    if (!response || response.status !== 200) {
      event.reply('impressao-response', {
        success: false,
        message: 'Erro ao enviar arquivo para impressão'
      });
      return;
    }

    event.reply('impressao-response', {
      success: true,
      fileId: fileId,
      printerId: printerId,
      message: 'Arquivo enviado para impressão com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao imprimir arquivo:', error);
    event.reply('impressao-response', {
      success: false,
      message: 'Erro ao enviar arquivo para impressão'
    });
  }
});

// Excluir arquivo
ipcMain.on('excluir-arquivo', async (event, { fileId }) => {
  try {
    const userData = getUserData();

    if (!userData || !userData.token) {
      event.reply('exclusao-response', {
        success: false,
        message: 'Usuário não autenticado'
      });
      return;
    }

    // Fazer uma requisição para a API para excluir o arquivo
    let response;
    try {
      response = await axios.delete(`${appConfig.apiLocalUrl}/files/${fileId}`);
    } catch (error) {
      console.error('Erro ao excluir arquivo:', error);
      event.reply('exclusao-response', {
        success: false,
        message: error.response?.data?.message || 'Erro ao conectar com o servidor'
      });
      return;
    }

    if (response.status === 200 || response.status === 204) {
      event.reply('exclusao-response', {
        success: true,
        message: 'Arquivo excluído com sucesso'
      });
    } else {
      event.reply('exclusao-response', {
        success: false,
        message: response.data?.message || 'Erro ao excluir arquivo'
      });
    }
  } catch (error) {
    console.error('Erro ao excluir arquivo:', error);
    event.reply('exclusao-response', {
      success: false,
      message: 'Erro ao excluir arquivo'
    });
  }
});

// Atualiza impressoras manualmente
ipcMain.on('atualizar-impressoras', async (event) => {
  try {
    await printersSync();

    event.reply('atualizar-impressoras-response', {
      success: true,
      message: 'Impressoras atualizadas com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao atualizar impressoras:', error);
    event.reply('atualizar-impressoras-response', {
      success: false,
      message: 'Erro ao atualizar impressoras!'
    });
  }
});

// Navegar para uma rota específica na interface
ipcMain.on('navegar-para', (event, dados) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('navegar-para', dados);
  }
});

// Exportar módulo
module.exports = {
  userData: getUserData(),
  getAutoPrintConfig,
  appConfig
};

// Inicializar tarefas adicionais
initTask();