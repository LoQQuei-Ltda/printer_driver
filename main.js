/**
 * Sistema de Gerenciamento de Impressão - Aplicação Desktop
 */

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell, nativeImage, screen } = require('electron');
const { printersSync } = require('./tasks/printers');
const { execFile, exec } = require('child_process');
const installer = require('./installer');
const verification = require('./verification');
const { printSync } = require('./tasks/print');
const AppUpdater = require('./updater');
const { initTask } = require('./task');
const { initAPI } = require('./api');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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

const appConfig = {
  apiPrincipalServiceUrl: 'https://api.loqquei.com.br/api/v1',
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

verification.execPromise('wsl -d Ubuntu -u root bash -c echo "Ubuntu está acessível"', 10000, true);
verification.execPromise('wsl -d Ubuntu -u root bash -c pm2 list', 10000, true);

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
          detail: 'O sistema está pronto para uso, caso algo não funcione, volte a aba de sistema e faça uma verificação completa do sistema, e se necessário, reinstale.',
          buttons: ['OK']
        }).then(() => {
          printersSync();
          initTask();
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

// Função para garantir que todos os serviços necessários estejam em execução
async function ensureServicesRunning() {
  console.log('Verificando e garantindo que todos os serviços necessários estejam ativos...');
  
  try {
    // Verificar acesso ao WSL primeiro
    try {
      await verification.execPromise('wsl -d Ubuntu -u root echo "WSL Access Check"', 10000, true);
    } catch (wslError) {
      console.error('Erro ao acessar WSL:', wslError);
      // Se não conseguir acessar o WSL, não podemos continuar
      return false;
    }
    
    // Lista de serviços essenciais para verificar e iniciar se necessário
    const essentialServices = [
      {
        name: 'dbus',
        checkCmd: 'systemctl is-active dbus',
        startCmd: 'systemctl start dbus || service dbus start'
      },
      {
        name: 'postgresql',
        checkCmd: 'systemctl is-active postgresql',
        startCmd: 'systemctl start postgresql || service postgresql start || pg_ctlcluster $(ls -d /etc/postgresql/*/ 2>/dev/null | cut -d\'/\' -f4 | head -n 1 || echo "14") main start'
      },
      {
        name: 'cups',
        checkCmd: 'systemctl is-active cups',
        startCmd: 'systemctl start cups || service cups start'
      },
      {
        name: 'smbd',
        checkCmd: 'systemctl is-active smbd',
        startCmd: 'systemctl start smbd || service smbd start'
      },
      {
        name: 'avahi-daemon',
        checkCmd: 'systemctl is-active avahi-daemon',
        startCmd: 'systemctl start avahi-daemon || service avahi-daemon start'
      }
    ];
    
    // Verificar e iniciar cada serviço essencial
    for (const service of essentialServices) {
      console.log(`Verificando serviço: ${service.name}...`);
      
      // Verificar status atual do serviço
      let isActive = false;
      try {
        const status = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${service.checkCmd}"`, 15000, true);
        isActive = status.trim() === 'active';
      } catch (checkError) {
        console.log(`Serviço ${service.name} está inativo ou não pôde ser verificado`);
        isActive = false;
      }
      
      // Se o serviço não estiver ativo, tentar iniciá-lo
      if (!isActive) {
        console.log(`Iniciando serviço ${service.name}...`);
        try {
          await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${service.startCmd}"`, 30000, true);
          console.log(`Serviço ${service.name} iniciado com sucesso`);
        } catch (startError) {
          console.error(`Erro ao iniciar serviço ${service.name}:`, startError.message || startError);
          // Continuar mesmo se um serviço falhar, para tentar iniciar os outros
        }
      } else {
        console.log(`Serviço ${service.name} já está ativo`);
      }
    }
    
    // Verificar se a API está em execução por PM2
    console.log('Verificando serviço de API...');
    let apiRunning = false;
    try {
      const pm2List = await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 list"', 15000, true);
      apiRunning = pm2List.includes('online') && pm2List.includes('print_server_desktop');
    } catch (apiCheckError) {
      console.log('Serviço de API não encontrado ou PM2 não está respondendo');
      apiRunning = false;
    }
    
    // Se a API não estiver rodando, tentar iniciá-la
    if (!apiRunning) {
      console.log('Iniciando serviço de API...');
      
      try {
        // Buscar quaisquer diretórios possíveis de forma mais completa
        const possiblePaths = [
          '/opt/loqquei/print_server_desktop',
          '/opt/print_server/print_server_desktop',
          '/opt/loqquei',
          '/opt/print_server'
        ];
        
        let apiPath = null;
        
        // Verificar cada caminho possível
        for (const path of possiblePaths) {
          try {
            const pathCheck = await verification.execPromise(
              `wsl -d Ubuntu -u root bash -c "if [ -d '${path}' ]; then echo 'exists'; else echo 'not_found'; fi"`, 
              15000, 
              true
            );
            
            if (pathCheck.trim() === 'exists') {
              // Verificar se tem ecosystem.config.js ou bin/www.js
              const appCheck = await verification.execPromise(
                `wsl -d Ubuntu -u root bash -c "if [ -f '${path}/ecosystem.config.js' ] || [ -f '${path}/bin/www.js' ]; then echo 'valid'; else echo 'invalid'; fi"`, 
                15000, 
                true
              );
              
              if (appCheck.trim() === 'valid') {
                apiPath = path;
                console.log(`Diretório da API encontrado: ${path}`);
                break;
              }
            }
          } catch (pathError) {
            // Ignorar erros individuais e continuar verificando
          }
        }
        
        if (apiPath) {
          // Tentar iniciar com métodos diferentes para maior robustez
          try {
            // Método 1: PM2 resurrect (restabelece estado anterior)
            await verification.execPromise(`wsl -d Ubuntu -u root bash -c "cd ${apiPath} && pm2 resurrect"`, 30000, true);
          } catch (resurError) {
            try {
              // Método 2: Reiniciar todos
              await verification.execPromise(`wsl -d Ubuntu -u root bash -c "cd ${apiPath} && pm2 restart all"`, 30000, true);
            } catch (restartError) {
              try {
                // Método 3: Iniciar com ecosystem.config.js
                await verification.execPromise(`wsl -d Ubuntu -u root bash -c "cd ${apiPath} && pm2 start ecosystem.config.js"`, 30000, true);
              } catch (startError) {
                try {
                  // Método 4: Iniciar com bin/www.js diretamente
                  await verification.execPromise(`wsl -d Ubuntu -u root bash -c "cd ${apiPath} && pm2 start bin/www.js --name print_server_desktop"`, 30000, true);
                } catch (finalError) {
                  console.error('Todos os métodos para iniciar a API falharam:', finalError.message || finalError);
                }
              }
            }
          }
          
          // Verificar se a API está em execução após tentativas
          try {
            const finalPm2Check = await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 list"', 15000, true);
            if (finalPm2Check.includes('online') && finalPm2Check.includes('print_server_desktop')) {
              console.log('API iniciada com sucesso!');
            } else {
              console.error('API pode não ter iniciado corretamente. Verificando portas...');
              
              // Verificar se a porta está em uso como última verificação
              const portCheck = await verification.execPromise(
                'wsl -d Ubuntu -u root bash -c "netstat -tuln | grep :56258"', 
                10000, 
                true
              ).catch(() => "");
              
              if (portCheck.includes('56258')) {
                console.log('Porta da API 56258 está ativa, serviço parece estar funcionando');
              } else {
                console.error('Porta da API 56258 não encontrada, serviço pode não estar funcional');
              }
            }
          } catch (checkError) {
            console.error('Erro ao verificar status final da API:', checkError.message || checkError);
          }
        } else {
          console.error('Não foi possível encontrar o diretório da API');
        }
      } catch (apiError) {
        console.error('Erro ao iniciar serviço de API:', apiError.message || apiError);
      }
    } else {
      console.log('Serviço de API já está ativo');
    }
    
    console.log('Verificação e inicialização de serviços concluída');
    return true;
  } catch (error) {
    console.error('Erro durante a verificação/inicialização de serviços:', error.message || error);
    return false;
  }
}

function interpretarMensagemLog(message, type) {
  const lowerMessage = message.toLowerCase();

  // Mapear mensagens para estados de componentes
  if (lowerMessage.includes('analisando componentes necessários')) {
    // Verificação completa, analisando componentes
    return {
      type: 'component-analysis',
      step: 0,
      state: 'completed',
      progress: 20
    };
  }
  else if (lowerMessage.includes('instalando aplicação') ||
    lowerMessage.includes('instalando/configurando packages')) {
    // Instalando aplicação (ambiente de sistema)
    return {
      type: 'component-install',
      step: 5,  // Etapa "Configurando ambiente de sistema"
      state: 'in-progress',
      progress: 80
    };
  }
  else if (lowerMessage.includes('instalando componente')) {
    // Determinar qual componente está sendo instalado
    let step = 5; // Ambiente por padrão

    if (lowerMessage.includes('packages')) {
      step = 5; // Ambiente
    }
    else if (lowerMessage.includes('cups') ||
      lowerMessage.includes('samba') ||
      lowerMessage.includes('firewall') ||
      lowerMessage.includes('database') ||
      lowerMessage.includes('service')) {
      step = 6; // Serviços
    }

    return {
      type: 'component-install',
      step: step,
      state: 'in-progress',
      progress: step === 5 ? 80 : 90
    };
  }

  // Sem interpretação especial para outras mensagens
  return null;
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
    const wslStatus = await verification.checkWSLStatusDetailed();

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

    isInstallingComponents = false; 

    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('Enviando solicitação para interface iniciar instalação');
      mainWindow.webContents.send('solicitar-iniciar-instalacao', {
        forceReinstall: false
      });
      return true; // Retornamos true porque a instalação será gerenciada pelo fluxo normal
    } else {
      // Se não temos janela principal, precisamos criar uma temporária para acionar o processo
      console.log('Criando janela temporária para acionar instalação');
      
      // Criar uma janela invisível se necessário
      const tempWindow = new BrowserWindow({
        width: 1,
        height: 1,
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });
      
      // Carregar uma página simples que vai acionar o evento
      tempWindow.loadFile('view/temp-installer.html');
      
      // Quando a página estiver carregada, enviamos o evento
      tempWindow.webContents.once('did-finish-load', () => {
        tempWindow.webContents.send('iniciar-processo-instalacao');
      });
      
      return true;
    }
  } catch (error) {
    console.error('Erro ao configurar ambiente:', error);
    isInstallingComponents = false;
    return false;
  }
}

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

function interpretarComponentesInstalacao(message) {
  const lowerMessage = message.toLowerCase();
  
  // Extrair informações sobre componentes a serem instalados
  if (lowerMessage.includes('componentes que serão instalados:')) {
    try {
      const componentesMatch = lowerMessage.match(/instalados:\s*(.+)$/);
      if (componentesMatch && componentesMatch[1]) {
        const componentes = componentesMatch[1]
          .split(',')
          .map(comp => comp.trim().toLowerCase());
        
        console.log('Componentes detectados:', componentes);
        
        // Verificar quais etapas podem ser marcadas como concluídas
        const needsWsl = componentes.includes('wsl');
        const needsUbuntu = componentes.includes('ubuntu');
        
        // Se não precisa de WSL nem Ubuntu, marcar essas etapas como concluídas
        if (!needsWsl && !needsUbuntu) {
          if (installationWindow && !installationWindow.isDestroyed()) {
            // Marcar as primeiras etapas como concluídas
            for (let i = 0; i < 4; i++) {
              sendStepUpdateToInstallWindow(i, 'completed', 'Concluído');
            }
            
            // Atualizar progresso
            sendProgressUpdateToInstallWindow(60);
          }
        }
        
        return true;
      }
    } catch (err) {
      console.error('Erro ao interpretar componentes:', err);
    }
  }
  
  return false;
}

function detectComponentTypeFromMessage(message) {
  const lowerMessage = message.toLowerCase();
  
  // Detectar componentes específicos com mapeamento de progresso
  const componentPatterns = [
    { pattern: 'verificando privilégios', step: 0, progress: 5 },
    { pattern: 'verificando virtualização', step: 0, progress: 10 },
    { pattern: 'wsl não está instalado', step: 0, progress: 15 },
    { pattern: 'instalando wsl', step: 1, progress: 20 },
    { pattern: 'recurso wsl habilitado', step: 1, progress: 30 },
    { pattern: 'definindo wsl 2', step: 2, progress: 40 },
    { pattern: 'kernel do wsl2 instalado', step: 2, progress: 40 },
    { pattern: 'instalando ubuntu', step: 3, progress: 50 },
    { pattern: 'ubuntu instalado', step: 3, progress: 60 },
    { pattern: 'configurando usuário padrão', step: 4, progress: 70 },
    { pattern: 'analisando componentes necessários', step: 0, progress: 20 },
    { pattern: 'componentes que serão instalados', step: 0, progress: 25 },
    { pattern: 'instalando aplicação', step: 5, progress: 75 },
    { pattern: 'banco de dados', step: 5, progress: 80 },
    { pattern: 'database', step: 5, progress: 80 },
    { pattern: 'configurando ambiente', step: 5, progress: 80 },
    { pattern: 'configurando sistema', step: 5, progress: 80 },
    { pattern: 'api', step: 6, progress: 85 },
    { pattern: 'pm2', step: 6, progress: 87 },
    { pattern: 'configurando cups', step: 6, progress: 90 },
    { pattern: 'configurando samba', step: 6, progress: 90 },
    { pattern: 'configurando nginx', step: 6, progress: 90 },
    { pattern: 'configurando serviços', step: 6, progress: 90 },
    { pattern: 'firewall configurado', step: 6, progress: 90 },
    { pattern: 'printer', step: 7, progress: 95 },
    { pattern: 'impressora', step: 7, progress: 95 },
    { pattern: 'verificando o sistema após', step: 7, progress: 98 },
    { pattern: 'instalação concluída', step: 7, progress: 100 }
  ];
  
  // Buscar primeiro padrão correspondente
  for (const { pattern, step, progress } of componentPatterns) {
    if (lowerMessage.includes(pattern)) {
      console.log(`Detectado padrão: "${pattern}" → Etapa ${step}, Progresso ${progress}%`);
      return { type: pattern, step, progress };
    }
  }
  
  // Padrões especiais para instalação específica de componentes
  if (lowerMessage.includes('instalando/configurando')) {
    // Extrair qual componente está sendo instalado/configurado
    const componentMatch = lowerMessage.match(/instalando\/configurando\s+(\w+)/i);
    const component = componentMatch ? componentMatch[1].toLowerCase() : null;
    
    if (component) {
      if (component === 'database' || component === 'packages' || component.includes('software')) {
        return { type: component, step: 5, progress: 80 };
      } else if (component === 'api' || component === 'pm2' || component === 'services') {
        return { type: component, step: 6, progress: 85 };
      } else if (component === 'printer') {
        return { type: component, step: 7, progress: 95 };
      }
    }
    
    // Padrão genérico para instalação de componentes
    return { type: 'generic-component', step: 5, progress: 80 };
  }
  
  return null;
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

// Criar ícone na bandeja
function createTray() {
  // Usar o ícone de acordo com o tema atual
  const iconPath = path.join(__dirname, `assets/icon/${currentTheme}.ico`);

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
  // Importante: Aguardamos a conclusão da verificação/instalação antes de prosseguir
  try {
    await setupEnvironment();
    console.log('Configuração do ambiente concluída ou não necessária');
  } catch (error) {
    console.error('Erro durante a configuração do ambiente:', error);
  }

  printersSync();
  initTask();
  await ensureServicesRunning();
  
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

ipcMain.on('solicitar-iniciar-instalacao', (event, options) => {
  console.log('Recebida solicitação para iniciar instalação via interface');
  // Se a janela principal existe mas não está visível, mostrar
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
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
    const systemStatus = await verification.checkSystemStatus();

    // Verificar status do software (mais detalhado)
    if (systemStatus.wslStatus.installed && systemStatus.wslStatus.hasDistro) {
      systemStatus.softwareStatus = await verification.checkSoftwareConfigurations();
    }

    // Verificar status da impressora virtual do Windows
    systemStatus.printerStatus = await verification.checkWindowsPrinterInstalled();

    // Determinar se o sistema precisa ser configurado - agora mais rigoroso
    systemStatus.needsConfiguration = !systemStatus.systemConfigured;
    if (systemStatus.softwareStatus) {
      systemStatus.needsConfiguration = !systemStatus.softwareStatus.fullyConfigured;

      // Levar em consideração portas de firewall específicas
      if (systemStatus.softwareStatus.firewallStatus &&
        !systemStatus.softwareStatus.firewallStatus.configured) {
        systemStatus.needsConfiguration = true;
      }

      // Levar em consideração configuração da impressora
      if (systemStatus.printerStatus &&
        (!systemStatus.printerStatus.installed || !systemStatus.printerStatus.correctConfig)) {
        systemStatus.needsConfiguration = true;
      }
    }

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
      if (fs.existsSync(appConfig.userDataFile)) {
        fs.unlinkSync(appConfig.userDataFile);
      }

      try {
        axios.delete(`${appConfig.apiLocalUrl}/files/delete-all`);
      } catch (error) {
        console.error('Erro ao excluir arquivos do servidor:', error);
      }

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

// Função para enviar atualizações de etapa para a janela de instalação
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

// Função para enviar atualizações de progresso para a janela de instalação
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

// Função para enviar notificação de conclusão para a janela de instalação
function sendCompletionToInstallWindow(success, message) {
  if (installationWindow && !installationWindow.isDestroyed()) {
    try {
      installationWindow.webContents.send('instalacao-completa', {
        success: success,
        message: message || (success ? 'Instalação concluída com sucesso' : 'Erro na instalação')
      });
      
      // Se for sucesso, agendar fechamento da janela após 5 segundos
      if (success) {
        setTimeout(() => {
          if (installationWindow && !installationWindow.isDestroyed()) {
            installationWindow.close();
          }
        }, 5000);
      }
    } catch (err) {
      console.error('Erro ao enviar notificação de conclusão:', err);
    }
  }
}

// Instalação do WSL
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

      event.reply('installation-log', {
        type: 'error',
        message: 'Privilégios de administrador necessários para instalação.'
      });
      return;
    }

    // Determinar o tipo de instalação
    const forceReinstall = options.forceReinstall === true;

    // Criar janela de instalação se não existir
    if (!installationWindow || installationWindow.isDestroyed()) {
      createInstallationWindow();

      // Aguardar a janela ser criada e carregada
      await new Promise((resolve) => {
        const checkReady = () => {
          if (installationWindow && !installationWindow.isDestroyed()) {
            installationWindow.once('ready-to-show', () => {
              console.log('Janela de instalação pronta');
              setTimeout(resolve, 500); // Dar tempo para inicializar
            });
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });

      // Aguardar mais tempo para certificar que os handlers IPC estão registrados
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Enviar mensagem inicial para ambas as interfaces
    const headerMessage = forceReinstall
      ? 'Iniciando reinstalação completa do sistema'
      : 'Iniciando instalação dos componentes necessários';

    // Para a janela principal (renderer que solicitou)
    event.reply('installation-log', {
      type: 'header',
      message: headerMessage
    });

    // Para a janela de instalação
    sendLogToInstallWindow('header', headerMessage);

    // Configurar callbacks para atualização da interface
    installer.setStepUpdateCallback((stepIndex, state, message) => {
      console.log(`Atualizando etapa ${stepIndex} para estado ${state}: ${message}`);
      
      // Verificar se a mensagem indica um componente específico
      const componentInfo = detectComponentTypeFromMessage(message);
      
      // Caso especial: se a mensagem é sobre componente específico, ajustar a etapa
      if (componentInfo && (state === 'in-progress' || state === 'completed')) {
        // Sobrescrever o stepIndex com base no tipo de componente
        stepIndex = componentInfo.step;
        
        // Garantir que etapas anteriores sejam marcadas como concluídas
        try {
          // Primeiro marcar etapas anteriores como concluídas
          for (let i = 0; i < stepIndex; i++) {
            sendStepUpdateToInstallWindow(i, 'completed', 'Concluído');
          }
          
          // Depois atualizar a etapa atual
          sendStepUpdateToInstallWindow(
            stepIndex, 
            state, 
            state === 'in-progress' ? 'Em andamento' : 'Concluído'
          );
          
          // Atualizar progresso também
          sendProgressUpdateToInstallWindow(componentInfo.progress);
        } catch (err) {
          console.error('Erro ao enviar atualizações para janela de instalação:', err);
        }
      } 
      // Caso padrão: usar o stepIndex fornecido
      else {
        try {
          // Se etapa > 0 e estado in-progress/completed, garantir etapas anteriores concluídas
          if (stepIndex > 0 && (state === 'in-progress' || state === 'completed')) {
            // Primeiro marcar etapas anteriores como concluídas
            for (let i = 0; i < stepIndex; i++) {
              sendStepUpdateToInstallWindow(i, 'completed', 'Concluído');
            }
          }
          
          // Agora atualizar a etapa atual
          sendStepUpdateToInstallWindow(stepIndex, state, message);
        } catch (err) {
          console.error('Erro ao enviar atualização de etapa:', err);
        }
      }
      
      // Enviar também para a janela principal
      event.reply('installation-log', {
        type: state === 'error' ? 'error' : (state === 'completed' ? 'success' : 'info'),
        message: `[Etapa ${stepIndex + 1}] ${message}`
      });
    });

    installer.setProgressCallback((percentage) => {
      // Usar a função auxiliar para enviar a atualização
      sendProgressUpdateToInstallWindow(percentage);
    });

    // Modificar a função de log do installer para enviar mensagens para ambas as janelas
    const originalLog = installer.log;
    installer.log = function(message, type = 'info') {
      // Log original
      originalLog(message, type);
      
      // Detectar quando estamos listando componentes para instalação seletiva
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('componentes que serão instalados:')) {
        // Tentar extrair os componentes
        try {
          const componentsMatch = lowerMessage.match(/instalados:\s*(.+)$/);
          if (componentsMatch && componentsMatch[1]) {
            const componentsList = componentsMatch[1].split(',').map(c => c.trim().toLowerCase());
            console.log('Detectados componentes para instalação:', componentsList);
            
            // Verificar se WSL e Ubuntu NÃO estão na lista - isso indica instalação parcial
            const needsWsl = componentsList.some(c => c.includes('wsl'));
            const needsUbuntu = componentsList.some(c => c.includes('ubuntu'));
            
            if (!needsWsl && !needsUbuntu) {
              // É uma instalação parcial - marcar etapas iniciais como concluídas
              for (let i = 0; i <= 3; i++) {
                sendStepUpdateToInstallWindow(i, 'completed', 'Concluído');
              }
              
              // Atualizar progresso para refletir estado avançado
              sendProgressUpdateToInstallWindow(60);
              
              // Determinar próxima etapa com base nos componentes
              let nextStep = 5; // Ambiente por padrão
              
              if (componentsList.includes('database') || componentsList.includes('software')) {
                nextStep = 5; // Ambiente
              } else if (componentsList.includes('api') || componentsList.includes('pm2') || componentsList.includes('services')) {
                nextStep = 6; // Serviços
              } else if (componentsList.includes('printer')) {
                nextStep = 7; // Finalização
              }
              
              // Atualizar próxima etapa para "Em andamento"
              sendStepUpdateToInstallWindow(nextStep, 'in-progress', 'Em andamento');
            }
          }
        } catch (err) {
          console.error('Erro ao processar lista de componentes:', err);
        }
      }
      // Tratar caso especial quando estamos instalando componentes específicos
      else if (lowerMessage.includes('instalando/configurando')) {
        const componentInfo = detectComponentTypeFromMessage(message);
        
        if (componentInfo) {
          // Marcar etapas anteriores como concluídas
          for (let i = 0; i < componentInfo.step; i++) {
            sendStepUpdateToInstallWindow(i, 'completed', 'Concluído');
          }
          
          // Atualizar etapa atual para Em andamento
          sendStepUpdateToInstallWindow(componentInfo.step, 'in-progress', 'Em andamento');
          
          // Atualizar progresso
          sendProgressUpdateToInstallWindow(componentInfo.progress);
        }
      }
      
      // Enviar log para a janela de instalação
      sendLogToInstallWindow(type, message);
      
      // Enviar para a interface principal também
      event.reply('installation-log', {
        type: type,
        message: message
      });
    };

    // Configurar a função personalizada de perguntas
    installer.setCustomAskQuestion(function (question) {
      return new Promise((resolve) => {
        // Log da pergunta
        installer.log(`Pergunta: ${question}`, 'info');

        // Salvar o callback global para resposta
        global.askQuestionCallback = resolve;

        if (installationWindow && !installationWindow.isDestroyed()) {
          // Enviar a pergunta para a interface
          try {
            installationWindow.webContents.send('pergunta', { question });
          } catch (err) {
            console.error('Erro ao enviar pergunta para janela de instalação:', err);

            // Fallback: usar dialog
            dialog.showMessageBox({
              type: 'question',
              buttons: ['Sim', 'Não'],
              defaultId: 0,
              title: 'Instalador',
              message: question
            }).then(result => {
              const response = result.response === 0 ? 's' : 'n';
              if (global.askQuestionCallback) {
                global.askQuestionCallback(response);
                global.askQuestionCallback = null;
              }
            }).catch(() => {
              // Em caso de erro, assumir sim
              if (global.askQuestionCallback) {
                global.askQuestionCallback('s');
                global.askQuestionCallback = null;
              }
            });
          }
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
            if (global.askQuestionCallback) {
              global.askQuestionCallback(response);
              global.askQuestionCallback = null;
            }
          }).catch(() => {
            // Em caso de erro, assumir sim
            if (global.askQuestionCallback) {
              global.askQuestionCallback('s');
              global.askQuestionCallback = null;
            }
          });
        }
      });
    });

    // EXECUTAR A INSTALAÇÃO
    console.log(`Iniciando instalação ${forceReinstall ? 'completa' : 'seletiva'}...`);
    event.reply('installation-log', {
      type: 'info',
      message: `Iniciando ${forceReinstall ? 'reinstalação completa' : 'instalação de componentes necessários'}. Este processo pode levar vários minutos.`
    });

    // Executar a instalação apropriada
    let resultado;
    if (forceReinstall) {
      resultado = await installer.installSystem();
    } else {
      // Para instalação seletiva, verificar o que precisa ser instalado
      const status = await verification.checkSystemStatus();
      installer.log('Analisando componentes necessários...', 'header');

      let componentsToInstall = [];

      // Verificar quais componentes precisam ser instalados
      if (!status.wslStatus.installed) {
        componentsToInstall.push('wsl');
      }

      if (!status.wslStatus.wsl2) {
        componentsToInstall.push('wsl2');
      }

      if (!status.wslStatus.hasDistro) {
        componentsToInstall.push('ubuntu');
      }

      // Verificar software status apenas se Ubuntu estiver instalado
      if (status.wslStatus.hasDistro) {
        try {
          // Verificar status de software mais detalhadamente
          const softwareStatus = await verification.checkSoftwareConfigurations();

          // Verificar pacotes necessários
          if (softwareStatus.packagesStatus && !softwareStatus.packagesStatus.allInstalled) {
            componentsToInstall.push('packages');
          }

          // Verificar serviços
          if (softwareStatus.servicesStatus && !softwareStatus.servicesStatus.allRunning) {
            componentsToInstall.push('services');
          }

          // Verificar firewall
          if (softwareStatus.firewallStatus && !softwareStatus.firewallStatus.configured) {
            componentsToInstall.push('firewall');
          }

          // Verificar banco de dados
          if (softwareStatus.dbStatus && !softwareStatus.dbStatus.configured) {
            componentsToInstall.push('database');
          }

          // Verificar API
          if (!softwareStatus.apiHealth) {
            componentsToInstall.push('api');
          }

          // Verificar PM2
          if (!softwareStatus.pm2Running) {
            componentsToInstall.push('pm2');
          }

          // Verificar diretório /opt
          if (!softwareStatus.optDirExists) {
            componentsToInstall.push('software');
          }
        } catch (error) {
          installer.log(`Erro ao verificar componentes do software: ${error.message}`, 'warning');
          // Em caso de erro, adicionar dependências essenciais
          componentsToInstall.push('packages');
          componentsToInstall.push('services');
          componentsToInstall.push('firewall');
          componentsToInstall.push('database');
          componentsToInstall.push('api');
          componentsToInstall.push('pm2');
          componentsToInstall.push('software');
        }
      } else {
        installer.log('Ubuntu não instalado, adicionando todos os componentes necessários', 'info');
    
        // Adicionar todos os componentes de software necessários
        componentsToInstall.push('packages');
        componentsToInstall.push('services');
        componentsToInstall.push('firewall');
        componentsToInstall.push('database');
        componentsToInstall.push('api');
        componentsToInstall.push('pm2');
        componentsToInstall.push('software');
      }

      // Verificar impressora
      try {
        const printerStatus = await verification.checkWindowsPrinterInstalled();
        if (!printerStatus || !printerStatus.installed) {
          componentsToInstall.push('printer');
        }
      } catch (error) {
        installer.log(`Erro ao verificar impressora: ${error.message}`, 'warning');
        componentsToInstall.push('printer');
      }

      if (componentsToInstall.length === 0) {
        installer.log('Todos os componentes já estão instalados corretamente!', 'success');
        resultado = { success: true, message: 'Sistema já está configurado corretamente' };
      } else {
        installer.log(`Componentes que serão instalados: ${componentsToInstall.join(', ')}`, 'info');

        // Instalar componentes na ordem correta
        let success = true;
        let errorMessage = '';

        // Instalar primeiro os componentes de base (WSL, Ubuntu)
        const baseComponents = ['wsl', 'wsl2', 'ubuntu'];
        const firstComponents = componentsToInstall.filter(c => baseComponents.includes(c));

        if (firstComponents.length > 0) {
          installer.log('Instalando componentes de base...', 'step');

          for (const component of firstComponents) {
            installer.log(`Instalando ${component}...`, 'step');
            const result = await installer.installComponent(component, status);

            if (!result) {
              success = false;
              errorMessage = `Falha ao instalar ${component}`;
              installer.log(`Erro ao instalar ${component}`, 'error');
              break;
            }
          }
        }

        // Se a instalação dos componentes de base for bem-sucedida, continuar com o restante
        if (success) {
          const remainingComponents = componentsToInstall.filter(c => !baseComponents.includes(c));

          if (remainingComponents.includes('software')) {
            // Instalar software (copiar para /opt)
            installer.log('Instalando aplicação...', 'step');
            const softwareResult = await installer.copySoftwareToOpt();
            if (!softwareResult) {
              success = false;
              errorMessage = 'Falha ao instalar aplicação';
            }
          }

          // Continuar com os demais componentes
          if (success && remainingComponents.length > 0) {
            for (const component of remainingComponents.filter(c => c !== 'software')) {
              installer.log(`Instalando/configurando ${component}...`, 'step');
              const result = await installer.installComponent(component, status);

              if (!result) {
                success = false;
                errorMessage = `Falha ao instalar ${component}`;
                installer.log(`Erro ao instalar ${component}`, 'error');
                break;
              }
            }
          }
        }

        // Verificar o sistema após a instalação
        if (success) {
          installer.log('Verificando o sistema após a instalação...', 'step');

          try {
            // Verificar novamente os componentes que foram instalados
            const updatedStatus = await verification.checkSystemStatus();
            const allComponentsInstalled = componentsToInstall.every(component => {
              // Verificar se o componente foi instalado com sucesso
              switch (component) {
                case 'wsl': return updatedStatus.wslStatus.installed;
                case 'wsl2': return updatedStatus.wslStatus.wsl2;
                case 'ubuntu': return updatedStatus.wslStatus.hasDistro;
                case 'printer': return updatedStatus.printerStatus && updatedStatus.printerStatus.installed;
                default: return true; // Para outros componentes, assumir sucesso
              }
            });

            if (allComponentsInstalled) {
              installer.log('Todos os componentes foram instalados com sucesso!', 'success');
            } else {
              installer.log('Alguns componentes podem não ter sido instalados corretamente', 'warning');
            }
          } catch (verifyError) {
            installer.log(`Erro ao verificar o sistema após a instalação: ${verifyError.message}`, 'warning');
          }
        }

        resultado = { success, message: success ? 'Componentes instalados com sucesso' : errorMessage };
      }
    }

    if (resultado.success) {
      // Informar GUI sobre sucesso
      event.reply('installation-log', {
        type: 'success',
        message: 'Instalação concluída com sucesso! ' + (resultado.message || '')
      });

      // Enviando notificação de sucesso para a janela de instalação
      sendCompletionToInstallWindow(true, resultado.message || 'Instalação concluída com sucesso');

      // Mostrar diálogo de conclusão
      await dialog.showMessageBox({
        type: 'info',
        title: 'Instalação Concluída',
        message: 'Sistema instalado com sucesso!',
        detail: 'O sistema está pronto para uso, caso algo não funcione, volte a aba de sistema e faça uma verificação completa do sistema, e se necessário, reinstale.',
        buttons: ['OK']
      });
      printersSync();
      initTask();
      // Atualizar o status do sistema após a instalação
      try {
        // Enviar evento para a janela principal verificar a instalação
        event.reply('verificar-instalacao');

        // Atualizar a interface do sistema
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-system-status', {
            needsVerification: true
          });
        }

        // Se a janela de verificação do sistema estiver aberta, verificar novamente
        try {
          const systemTab = await mainWindow?.webContents?.executeJavaScript(`
            !document.getElementById('systemTab').classList.contains('hidden')
          `);

          if (systemTab) {
            mainWindow.webContents.send('check-system-now');
          }
        } catch (tabCheckError) {
          console.error('Erro ao verificar aba de sistema:', tabCheckError);
        }
      } catch (verifyError) {
        console.error('Erro ao solicitar verificação pós-instalação:', verifyError);
      }
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
        // Reiniciar o computador
        exec('shutdown /r /t 10');
      }
    } else {
      // Caso de erro
      event.reply('installation-log', {
        type: 'error',
        message: `Erro na instalação: ${resultado.message || 'Erro desconhecido'}`
      });

      // Notificar a janela de instalação sobre o erro
      sendCompletionToInstallWindow(false, resultado.message || 'Erro desconhecido');

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

    // Notificar a janela de instalação
    sendCompletionToInstallWindow(false, error.message || 'Erro desconhecido');

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

// Receber resposta da pergunta
ipcMain.on('resposta-pergunta', (event, resposta) => {
  if (global.askQuestionCallback) {
    global.askQuestionCallback(resposta);
    global.askQuestionCallback = null;
  }
});

ipcMain.on('check-system-now', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('check-system-now');
  }
});

// Handler para atualizações de progresso por etapa
ipcMain.on('get-installation-steps', (event) => {
  const steps = installer.getInstallationSteps();
  event.reply('installation-steps', steps);
});

// Handler para exportar log de instalação
ipcMain.on('export-installation-log', (event, logContent) => {
  try {
    // Se logContent for uma string, usar diretamente
    // Caso contrário, usar como nome de arquivo
    let filename, content;

    if (typeof logContent === 'string' && logContent.includes('\n')) {
      // É o conteúdo do log
      content = logContent;
      filename = `instalacao_log_${new Date().toISOString().slice(0, 10)}.txt`;
    } else {
      // É o nome do arquivo
      filename = logContent || `instalacao_log_${new Date().toISOString().slice(0, 10)}.txt`;
      content = installer.getInstallationLog();
    }

    const downloadsPath = app.getPath('downloads');
    const logPath = path.join(downloadsPath, filename);

    fs.writeFileSync(logPath, content, 'utf8');

    // Avisar que o log foi exportado com sucesso
    if (installationWindow && !installationWindow.isDestroyed()) {
      installationWindow.webContents.send('log', {
        type: 'success',
        message: `Log exportado para: ${logPath}`
      });
    }

    event.reply('export-installation-log-response', {
      success: true,
      path: logPath
    });
  } catch (error) {
    console.error('Erro ao exportar log de instalação:', error);

    if (installationWindow && !installationWindow.isDestroyed()) {
      installationWindow.webContents.send('log', {
        type: 'error',
        message: `Erro ao exportar log: ${error.message}`
      });
    }

    event.reply('export-installation-log-response', {
      success: false,
      error: error.message
    });
  }
});

async function installSpecificComponent(component) {
  try {
    // Se já está instalando componentes, não continuar
    if (isInstallingComponents) {
      return { success: false, message: 'Já existe uma instalação em andamento' };
    }
    isInstallingComponents = true;

    console.log(`Instalando componente específico: ${component}`);

    // Criar janela de instalação se não existir
    if (!installationWindow || installationWindow.isDestroyed()) {
      createInstallationWindow();

      // Aguardar até que a janela de instalação esteja pronta
      await new Promise((resolve) => {
        if (installationWindow) {
          installationWindow.once('ready-to-show', () => {
            console.log('Janela de instalação pronta para exibição');
            resolve();
          });

          // Timeout como fallback (5 segundos)
          setTimeout(() => {
            console.log('Timeout ao aguardar janela de instalação');
            resolve();
          }, 5000);
        } else {
          console.log('Janela de instalação não foi criada');
          resolve();
        }
      });
    }

    // Enviar log para a janela de instalação
    if (installationWindow && !installationWindow.isDestroyed()) {
      installationWindow.webContents.send('log', {
        type: 'header',
        message: `Iniciando instalação do componente: ${component}`
      });
    }

    // Configurar a função de log customizada para o installer
    const originalLog = installer.log;
    installer.log = function (message, type = 'info') {
      // Log original
      originalLog(message, type);

      // Verificar mensagens específicas de instalação de componentes
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('instalando aplicação') ||
        lowerMessage.includes('instalando/configurando packages')) {

        // Forçar atualização da UI para mostrar instalação de ambiente em andamento
        if (installationWindow && !installationWindow.isDestroyed()) {
          // Marcar etapas anteriores como concluídas
          for (let i = 0; i < 5; i++) {
            installationWindow.webContents.send('step-update', {
              step: i,
              state: 'completed',
              message: 'Concluído'
            });
          }

          // Marcar etapa atual (ambiente)
          installationWindow.webContents.send('step-update', {
            step: 5,
            state: 'in-progress',
            message: 'Em andamento'
          });

          // Atualizar barra de progresso
          installationWindow.webContents.send('progress-update', {
            percentage: 80
          });
        }
      }

      // Enviar log normalmente
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('log', {
          type: type,
          message: message
        });
      }

      // Enviar para a interface principal também
      event.reply('installation-log', {
        type: type,
        message: message
      });
    };


    // Configurar a função personalizada de perguntas
    installer.setCustomAskQuestion(function (question) {
      return new Promise((resolve) => {
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

    // Executar a instalação do componente específico
    let result = null;
    switch (component) {
      case 'wsl':
        result = await installer.installWSLModern() || await installer.installWSLLegacy();
        break;
      case 'wsl2':
        try {
          await verification.execPromise('wsl --set-default-version 2', 30000);
          result = true;
        } catch (error) {
          result = false;
        }
        break;
      case 'ubuntu':
        result = await installer.installUbuntu();
        break;
      case 'user':
        result = await installer.configureDefaultUser();
        break;
      case 'packages':
        result = await installer.installRequiredPackages();
        break;
      case 'services':
        // Reiniciar os serviços básicos
        try {
          await verification.execPromise('wsl -d Ubuntu -u root systemctl restart cups smbd postgresql', 30000, true);
          result = true;
        } catch (error) {
          result = false;
        }
        break;
      case 'firewall':
        result = await installer.configureFirewall();
        break;
      case 'database':
        result = await installer.setupDatabase();
        break;
      case 'api':
        try {
          await verification.execPromise('wsl -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && pm2 restart ecosystem.config.js"', 30000, true);
          result = true;
        } catch (error) {
          result = false;
        }
        break;
      case 'pm2':
        result = await installer.setupPM2();
        break;
      case 'printer':
        result = await installer.installWindowsPrinter();
        break;
      default:
        result = false;
    }

    isInstallingComponents = false;

    return {
      success: !!result,
      message: result ? 'Componente instalado com sucesso' : 'Falha na instalação do componente'
    };
  } catch (error) {
    isInstallingComponents = false;
    console.error(`Erro ao instalar componente ${component}:`, error);
    return { success: false, message: error.message || 'Erro desconhecido' };
  }
}

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

      event.reply('componente-instalado', {
        success: false,
        message: 'Privilégios de administrador necessários'
      });
      return;
    }

    // Use cached status if available to avoid redundant checks
    const status = global.lastSystemStatus || await verification.checkSystemStatus();

    // Definir ouvinte de log para receber atualizações
    const originalLog = installer.log;
    installer.log = function (message, type = 'info') {
      // Log original
      originalLog(message, type);

      // Verificar mensagens específicas de instalação de componentes
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('instalando aplicação') ||
        lowerMessage.includes('instalando/configurando packages')) {

        // Forçar atualização da UI para mostrar instalação de ambiente em andamento
        if (installationWindow && !installationWindow.isDestroyed()) {
          // Marcar etapas anteriores como concluídas
          for (let i = 0; i < 5; i++) {
            installationWindow.webContents.send('step-update', {
              step: i,
              state: 'completed',
              message: 'Concluído'
            });
          }

          // Marcar etapa atual (ambiente)
          installationWindow.webContents.send('step-update', {
            step: 5,
            state: 'in-progress',
            message: 'Em andamento'
          });

          // Atualizar barra de progresso
          installationWindow.webContents.send('progress-update', {
            percentage: 80
          });
        }
      }

      // Enviar log normalmente
      if (installationWindow && !installationWindow.isDestroyed()) {
        installationWindow.webContents.send('log', {
          type: type,
          message: message
        });
      }

      // Enviar para a interface principal também
      event.reply('installation-log', {
        type: type,
        message: message
      });
    };


    // Install only the requested component
    const result = await installer.installComponent(component, status);

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

      // Verificar o sistema novamente e atualizar a interface
      setTimeout(() => {
        event.reply('verificar-instalacao');
      }, 1000);
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

    let files = null
    let response
    try {
      response = await axios.get(`${appConfig.apiLocalUrl}/files`, {
        headers: {
          'accept': 'application/json'
        }
      });
    } catch (error) {
      console.error(error.data);
    }

    await installer.configureDefaultUser()

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

ipcMain.on('navegar-para', (event, dados) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('navegar-para', dados);
  }
});

module.exports = {
  userData: getUserData(),
  getAutoPrintConfig,
  appConfig
};

initTask();