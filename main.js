/**
 * Sistema de Gerenciamento de Impressão - Aplicação Desktop
 */

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell, nativeImage, screen } = require('electron');
const { execFile, exec } = require('child_process');
const installer = require('./installer');
const AppUpdater = require('./updater');
const { initTask } = require('./task');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Manter referências globais
let mainWindow;
let tray = null;
let updater = null;
let isQuitting = false;
let loginWindow = null;
let currentTheme = 'dark';
let installationWindow = null;
let isInstallingComponents = false;

const appConfig = {
//   apiPrincipalServiceUrl: 'https://api.loqquei.com.br/api/v1',
  apiPrincipalServiceUrl: 'http://localhost:80/api/v1',
  apiLocalUrl: 'http://localhost:56258/api',
  autoStart: true,
  minimizeOnBlur: true, // Minimiza ao clicar fora da janela
  dataPath: path.join(app.getPath('userData'), 'appData'),
  userDataFile: path.join(app.getPath('userData'), 'user.json'),
  windowPrefsFile: path.join(app.getPath('userData'), 'window_prefs.json'),
  defaultWidth: 360,
  defaultHeight: 600
};

const setupWSL = process.argv.includes('--setup-wsl');

if (setupWSL) {
  console.log('Iniciando verificação e configuração do WSL e Ubuntu...');
  
  // Verificar se estamos rodando como administrador
  checkAdminPrivileges().then(isAdmin => {
    if (!isAdmin) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Privilégios de Administrador',
        message: 'Esta operação precisa ser executada como administrador.',
        detail: 'Por favor, execute a aplicação novamente como administrador.',
        buttons: ['OK']
      }).then(() => {
        app.exit(1);
      });
      return;
    }
    
    // Configurar o ambiente WSL
    setupEnvironment().then(success => {
      if (success) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Configuração Concluída',
          message: 'A configuração do WSL e Ubuntu foi concluída com sucesso.',
          detail: 'O sistema está pronto para uso.',
          buttons: ['OK']
        }).then(() => {
          app.exit(0);
        });
      } else {
        dialog.showMessageBox({
          type: 'warning',
          title: 'Configuração Incompleta',
          message: 'A configuração do WSL e Ubuntu não foi concluída completamente.',
          detail: 'Alguns recursos podem não funcionar corretamente.',
          buttons: ['OK']
        }).then(() => {
          app.exit(1);
        });
      }
    }).catch(error => {
      dialog.showMessageBox({
        type: 'error',
        title: 'Erro na Configuração',
        message: 'Ocorreu um erro durante a configuração do WSL e Ubuntu.',
        detail: error.message || 'Erro desconhecido',
        buttons: ['OK']
      }).then(() => {
        console.error('Erro ao configurar WSL:', error);
        app.exit(1);
      });
    });
  }).catch(error => {
    console.error('Erro ao verificar privilégios:', error);
    app.exit(1);
  });
  
  return;
}


// Função para verificar privilégios de administrador
async function checkAdminPrivileges() {
  try {
    if (process.platform !== 'win32') {
      return true; // Em sistemas não-Windows, presume-se privilégios suficientes
    }

    // Verificar se estamos rodando como administrador
    return new Promise((resolve) => {
      exec('powershell -Command "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
        (error, stdout, stderr) => {
          if (error) {
            console.error('Erro ao verificar privilégios:', error);
            resolve(false);
            return;
          }
          resolve(stdout.trim() === 'True');
        }
      );
    });
  } catch (error) {
    console.error('Erro ao verificar privilégios de administrador:', error);
    return false;
  }
}

// Elevar privilégios do aplicativo (reiniciar como administrador)
function elevatePrivileges() {
  try {
    const appPath = process.execPath;
    const args = process.argv.slice(1);

    // Usar PowerShell para executar como administrador
    execFile('powershell.exe', [
      '-Command',
      `Start-Process -FilePath '${appPath.replace(/(\s+)/g, '`$1')}' -ArgumentList '${args.join(' ')}' -Verb RunAs`
    ]);

    // Encerrar o processo atual
    setTimeout(() => app.exit(), 1000);
  } catch (error) {
    console.error('Erro ao elevar privilégios:', error);
    return false;
  }
}

// Verificar e configurar o ambiente necessário (WSL e Ubuntu)
async function setupEnvironment() {
  try {
    // Se já está instalando componentes, não continuar
    if (isInstallingComponents) return;
    isInstallingComponents = true;

    console.log('Verificando componentes do sistema...');

    // Verificar se WSL e Ubuntu já estão instalados
    const wslStatus = await installer.checkWSLStatusDetailed();

    // Se tudo estiver instalado, não fazer nada
    if (wslStatus.installed && wslStatus.wsl2 && wslStatus.hasDistro) {
      console.log('Todos os componentes do sistema estão instalados');
      isInstallingComponents = false;
      return true;
    }

    // Exibir diálogo perguntando se o usuário deseja instalar os componentes
    const choice = await dialog.showMessageBox({
      type: 'question',
      title: 'Instalação de Componentes',
      message: 'Componentes necessários não encontrados',
      detail: `Este aplicativo requer ${!wslStatus.installed ? 'WSL 2' : ''}${(!wslStatus.installed && !wslStatus.hasDistro) ? ' e ' : ''}${!wslStatus.hasDistro ? 'Ubuntu' : ''} para funcionar corretamente. Deseja instalar esses componentes agora?`,
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

    // Configurar a função personalizada de perguntas
    installer.setCustomAskQuestion(function (question) {
      return new Promise((resolve) => {
        // Log da pergunta
        installer.log(`Pergunta: ${question}`, 'info');

        if (installationWindow && !installationWindow.isDestroyed()) {
          // Enviar a pergunta para a interface
          installationWindow.webContents.send('pergunta', { question });

          // Configurar receptor de resposta via IPC
          const responseHandler = (responseEvent, resposta) => {
            ipcMain.removeListener('resposta-pergunta', responseHandler);
            resolve(resposta);
          };

          // Escutar pela resposta
          ipcMain.once('resposta-pergunta', responseHandler);
        } else {
          // Fallback: usar dialog
          dialog.showMessageBox({
            type: 'question',
            buttons: ['Sim', 'Não'],
            defaultId: 0,
            title: 'Instalador',
            message: question
          }).then(result => {
            const response = result.response === 0 ? 's' : 'n';
            resolve(response);
          }).catch(() => {
            // Em caso de erro, assumir sim
            resolve('s');
          });
        }
      });
    });

    // Enviar logs para a instalação
    if (installationWindow && !installationWindow.isDestroyed()) {
      installationWindow.webContents.send('log', {
        type: 'header',
        message: 'Iniciando instalação de componentes do sistema'
      });
    }

    // Instalar os componentes necessários
    const resultado = await installer.installSystem();

    if (resultado.success) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Instalação Concluída',
        message: 'Componentes instalados com sucesso!',
        detail: 'O sistema está pronto para uso.',
        buttons: ['OK']
      });
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
        // Reiniciar o computador
        exec('shutdown /r /t 10');
      }
      isInstallingComponents = false;
      return false;
    } else {
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

// Configurar inicialização automática
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

// Criar diretório de dados se não existir
function ensureDirectories() {
  if (!fs.existsSync(appConfig.dataPath)) {
    fs.mkdirSync(appConfig.dataPath, { recursive: true });
  }
}

// Verificar se o usuário está autenticado
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

// Salvar dados do usuário
function saveUserData(userData) {
  try {
    ensureDirectories();
    const data = userData && userData.data ? userData.data : userData;
    fs.writeFileSync(appConfig.userDataFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Erro ao salvar dados do usuário:', error);
  }
}

// Obter dados do usuário
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

// Salvar preferências da janela
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

// Obter preferências da janela
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

// Criar janela de login
function createLoginWindow() {
  // Importar o ícone da aplicação
  const iconPath = path.join(__dirname, `assets/icon/${currentTheme}.ico`);
  console.log(iconPath);

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

// Criar janela principal
function createMainWindow() {
  // Importar o ícone da aplicação
  const iconPath = path.join(__dirname, `assets/icon/${currentTheme}.ico`);
  console.log(iconPath);

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
  mainWindow.webContents.openDevTools(); // remover

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

  mainWindow.on('show', function() {
    mainWindow.webContents.send('window-shown');
  });

  mainWindow.on('focus', function() {
    mainWindow.webContents.send('window-shown');
  });  

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
          case 'updating-wsl':
            notification.innerHTML = \`
              <div style="display:flex;align-items:center;">
                <div class="spinner" style="width:16px;height:16px;margin-right:8px;"></div>
                <div>\${data.message}</div>
              </div>
            \`;
            notification.style.display = 'block';
            break;
            
          case 'update-error':
          case 'wsl-update-error':
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

// Criar janela de instalação
function createInstallationWindow() {
  // Importar o ícone da aplicação
  const iconPath = path.join(__dirname, `assets/icon/${currentTheme}.ico`);

  installationWindow = new BrowserWindow({
    width: 800,
    height: 700,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true // Habilitar DevTools para debug
    },
    show: false,
    frame: false // Remover frame padrão para corresponder ao estilo do index.html
  });

  installationWindow.loadFile('view/installation.html');

  // Mostrar a janela quando estiver pronta
  installationWindow.once('ready-to-show', () => {
    installationWindow.show();
    
    // Para debug - abrir DevTools automaticamente
    installationWindow.webContents.openDevTools();
    
    // Enviar um log inicial para confirmar que a comunicação está funcionando
    setTimeout(() => {
      try {
        installationWindow.webContents.send('log', {
          type: 'header',
          message: 'Iniciando instalação do sistema...'
        });
      } catch (err) {
        console.error('Erro ao enviar log inicial:', err);
      }
    }, 500);
  });

  installationWindow.on('closed', function () {
    installationWindow = null;
  });

  // Diagnóstico de comunicação
  installationWindow.webContents.on('did-finish-load', () => {
    installationWindow.webContents.executeJavaScript(`
      console.log('Página de instalação carregada, configurando diagnóstico');
      // Monitorar recebimento de mensagens
      const originalConsoleLog = console.log;
      console.log = function(...args) {
        originalConsoleLog.apply(console, args);
        if (args[0] === 'Log recebido:') {
          document.getElementById('logContainer').innerHTML += 
            '<div class="log-entry debug">Diagnóstico: Log recebido pelo renderer</div>';
        }
      };
      
      // Informar que a página está pronta
      require('electron').ipcRenderer.send('installation-page-ready');
    `);
  });
}

// Criar ícone na bandeja
function createTray() {
  // Usar o ícone de acordo com o tema atual
  const iconPath = path.join(__dirname, `assets/icon/${currentTheme}.ico`);
  console.log(iconPath);

  // Criar o ícone na bandeja
  try {
    tray = new Tray(iconPath);

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

// Função auxiliar para executar comandos
function execPromise(command, timeoutMs = 60000, quiet = false) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Tempo limite excedido (${timeoutMs / 1000}s): ${command}`));
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

// Este método será chamado quando o Electron terminar a inicialização
app.whenReady().then(async () => {
  // Verificar se temos privilégios de administrador
  const isAdmin = await checkAdminPrivileges();

  if (!isAdmin) {
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
  await setupEnvironment();

  // Verificar se o usuário está autenticado
  if (isAuthenticated()) {
    createMainWindow();

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

ipcMain.on('update-app-icon', (event, { theme }) => {
  // Atualizar a variável global do tema
  currentTheme = theme;
  
  // Caminho para o novo ícone
  const iconPath = path.join(__dirname, `assets/icon/${theme}.ico`);
  console.log(iconPath);
  
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

// Login
ipcMain.on('login', async (event, credentials) => {
  try {
    let response
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

// Obter informações do usuário
ipcMain.on('get-user', (event) => {
  const userData = getUserData();
  event.reply('user-data', userData);
});

// Verificar status de instalação do WSL
ipcMain.on('verificar-instalacao', async (event) => {
  try {
    const wslStatus = await installer.checkWSLStatusDetailed();

    // Verificar se o usuário padrão está configurado
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

// Instalação do WSL
ipcMain.on('iniciar-instalacao', async (event) => {
  try {
    // Verificar se está sendo executado como administrador
    const isAdmin = await checkAdminPrivileges();

    if (!isAdmin) {
      const choice = await dialog.showMessageBox(mainWindow, {
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
      return;
    }

    // Abrir janela de instalação
    createInstallationWindow();

    // Iniciar o processo de instalação
    event.reply('log', {
      type: 'header',
      message: 'Iniciando instalação do Sistema de Gerenciamento de Impressão'
    });

    // Enviar um log para a interface principal também
    event.reply('installation-log', {
      type: 'info',
      message: 'Iniciando instalação do Sistema de Gerenciamento de Impressão'
    });

    // Chamar a função de instalação do installer.js

    // Substituir a função de log para enviar para a interface
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    // Substituir console.log
    console.log = function() {
      const args = Array.from(arguments).join(' ');
      originalConsoleLog.apply(console, arguments);
      
      // Enviar para o front-end
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('log', { 
          type: 'info', 
          message: args 
        });
      }
    };

    // Substituir console.error
    console.error = function() {
      const args = Array.from(arguments).join(' ');
      originalConsoleError.apply(console, arguments);
      
      // Enviar para o front-end
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('log', { 
          type: 'error', 
          message: args 
        });
      }
    };

    // Substituir console.warn
    console.warn = function() {
      const args = Array.from(arguments).join(' ');
      originalConsoleWarn.apply(console, arguments);
      
      // Enviar para o front-end
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('log', { 
          type: 'warning', 
          message: args 
        });
      }
    };

    // Capturar saída do stdout
    process.stdout.write = function(string, encoding, fd) {
      originalStdoutWrite.apply(process.stdout, arguments);
      
      if (typeof string === 'string' && string.trim() !== '') {
        if (installationWindow && !installationWindow.isDestroyed()) {
          installationWindow.webContents.send('log', { 
            type: 'info', 
            message: string.trim() 
          });
        }
      }
      
      return true;
    };

    // Capturar saída do stderr
    process.stderr.write = function(string, encoding, fd) {
      originalStderrWrite.apply(process.stderr, arguments);
      
      if (typeof string === 'string' && string.trim() !== '') {
        if (installationWindow && !installationWindow.isDestroyed()) {
          installationWindow.webContents.send('log', { 
            type: 'error', 
            message: string.trim() 
          });
        }
      }
      
      return true;
    };


    // Configurar a função personalizada de perguntas
    installer.setCustomAskQuestion(function (question) {
      return new Promise((resolve) => {
        // Log da pergunta
        installer.log(`Pergunta: ${question}`, 'info');

        if (installationWindow && !installationWindow.isDestroyed()) {
          // Enviar a pergunta para a interface
          installationWindow.webContents.send('pergunta', { question });

          // Configurar receptor de resposta via IPC
          const responseHandler = (responseEvent, resposta) => {
            ipcMain.removeListener('resposta-pergunta', responseHandler);
            resolve(resposta);
          };

          // Escutar pela resposta
          ipcMain.once('resposta-pergunta', responseHandler);
        } else {
          // Fallback: usar dialog
          dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: ['Sim', 'Não'],
            defaultId: 0,
            title: 'Instalador',
            message: question
          }).then(result => {
            const response = result.response === 0 ? 's' : 'n';
            resolve(response);
          }).catch(() => {
            // Em caso de erro, assumir sim
            resolve('s');
          });
        }
      });
    });

    // Iniciar a instalação
    const resultado = await installer.installSystem();

    // Informar o resultado
    if (resultado.success) {
      event.reply('log', {
        type: 'success',
        message: resultado.message
      });
    
      if (installationWindow && !installationWindow.isDestroyed()) {
        // Enviar mensagem de conclusão
        installationWindow.webContents.send('log', {
          type: 'success',
          message: '✅ Instalação concluída com sucesso!'
        });
        
        installationWindow.webContents.send('instalacao-completa', { success: true });
        
        // Fechar a janela automaticamente após 5 segundos
        console.log('Programando fechamento automático da janela de instalação em 5 segundos');
        setTimeout(() => {
          if (installationWindow && !installationWindow.isDestroyed()) {
            installationWindow.close();
          }
        }, 5000);
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
          // Reiniciar o computador
          exec('shutdown /r /t 10');
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

// Receber resposta da pergunta
ipcMain.on('resposta-pergunta', (event, resposta) => {
  if (global.askQuestionCallback) {
    global.askQuestionCallback(resposta);
    global.askQuestionCallback = null;
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

    let files = null
    let response
    try {
      response = await axios.get(`${appConfig.apiLocalUrl}/files`);
    } catch (error) {
      console.error(error.data);
    }
  
    await installer.configureDefaultUser()

    if (response.status === 200) {
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

    let printers = null
    let response
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

    let response
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

module.exports = {
  userData: getUserData(),
  appConfig
};

initTask();