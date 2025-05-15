const schedule = require('node-schedule');
const axios = require('axios');
const { app } = require('electron');
const { compareVersions } = require('compare-versions');
const fs = require('fs');
const path = require('path');

const { printSync } = require('./tasks/print');
const { printersSync } = require('./tasks/printers');
const verification = require('./verification');

// Variável global para controlar o estado da sincronização
global.syncTasksInitialized = false;

// Função de verificação de atualização
const checkForUpdates = async (silent = false, appConfig, mainWindow) => {
  // Usar uma variável local para tracking em vez de depender apenas da variável global
  let localUpdateInProgress = false;
  
  try {
    // Evitar verificação se já houver uma em andamento
    if (global.isUpdateInProgress) {
      console.log('Verificação de atualização já em andamento, pulando');
      return;
    }
    
    // Marcar que estamos verificando
    global.isUpdateInProgress = true;
    localUpdateInProgress = true;
    
    if (!appConfig || !appConfig.apiPrincipalServiceUrl) {
      console.error('Configuração inválida: apiPrincipalServiceUrl não definida');
      return;
    }
    
    const updateUrl = `${appConfig.apiPrincipalServiceUrl}/desktop/update`;
    const currentVersion = app.getVersion();
    
    // Informar que estamos verificando (se não for silencioso)
    if (!silent && mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('update-status', {
          status: 'checking',
          message: 'Verificando atualizações...'
        });
      } catch (windowError) {
        console.error('Erro ao enviar mensagem para a janela:', windowError);
        verification.logToFile(`Erro ao enviar mensagem para a janela: ${JSON.stringify(windowError)}`);
      }
    }
    
    console.log(`Verificando atualizações em: ${updateUrl}`);
    
    // Consultar API de atualização com timeout e tratamento de erros melhorado
    let response;
    try {
      response = await axios.get(updateUrl, {
        params: { currentVersion },
        timeout: 15000 // 15 segundos de timeout
      });
    } catch (requestError) {
      console.error('Falha na requisição de atualização:', requestError.message);
      
      if (!silent && mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('update-status', {
            status: 'check-error',
            message: 'Não foi possível conectar ao servidor de atualizações'
          });
        } catch (windowError) {
          console.error('Erro ao enviar status de erro:', windowError);
          verification.logToFile(`Erro ao enviar status de erro: ${JSON.stringify(windowError)}`);
        }
      }
      return; // Retornar sem lançar erro
    }
    
    // Validar resposta
    if (!response || !response.data || !response.data.data) {
      console.log('Resposta de atualização inválida');
      
      if (!silent && mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('update-status', {
            status: 'check-error',
            message: 'Resposta de atualização inválida'
          });
        } catch (windowError) {
          console.error('Erro ao enviar status de erro:', windowError);
          verification.logToFile(`Erro ao enviar status de erro: ${JSON.stringify(windowError)}`);
        }
      }
      return; // Retornar sem lançar erro
    }
    
    const updateInfo = response.data.data;
    
    // Validar informações de atualização
    if (!updateInfo.version || !updateInfo.updateUrl) {
      console.log('Dados de atualização incompletos');
      
      if (!silent && mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('update-status', {
            status: 'check-error',
            message: 'Informações de atualização incompletas'
          });
        } catch (windowError) {
          console.error('Erro ao enviar status de erro:', windowError);
          verification.logToFile(`Erro ao enviar status de erro: ${JSON.stringify(windowError)}`);
        }
      }
      return; // Retornar sem lançar erro
    }
    
    // Comparar versões com verificação adicional de erro
    let versionComparison;
    try {
      versionComparison = compareVersions(updateInfo.version, currentVersion);
    } catch (versionError) {
      console.error('Erro ao comparar versões:', versionError);
      
      if (!silent && mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('update-status', {
            status: 'check-error',
            message: 'Erro ao verificar versões'
          });
        } catch (windowError) {
          console.error('Erro ao enviar status de erro:', windowError);
          verification.logToFile(`Erro ao enviar status de erro: ${JSON.stringify(windowError)}`);
        }
      }
      return; // Retornar sem lançar erro
    }
    
    // Comparar versões
    if (versionComparison <= 0) {
      console.log('Nenhuma atualização disponível');
      
      if (!silent && mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('update-status', {
            status: 'up-to-date',
            message: 'Seu aplicativo está atualizado!'
          });
        } catch (windowError) {
          console.error('Erro ao enviar status de atualizado:', windowError);
          verification.logToFile(`Erro ao enviar status de atualizado: ${JSON.stringify(windowError)}`);
        }
      }
      return;
    }

    console.log(`Atualização disponível: ${updateInfo.version}`);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('update-status', {
          status: 'update-available',
          version: updateInfo.version,
          updateUrl: updateInfo.updateUrl,
          notes: updateInfo.releaseNotes || `Nova versão ${updateInfo.version} disponível`
        });
      } catch (windowError) {
        console.error('Erro ao enviar status de atualização disponível:', windowError);
        verification.logToFile(`Erro ao enviar status de atualização disponível: ${JSON.stringify(windowError)}`);
      }
    }
    
    global.pendingUpdate = updateInfo;
    
  } catch (error) {
    console.error('Erro não tratado ao verificar atualizações:', error);
    
    if (!silent && mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('update-status', {
          status: 'check-error',
          message: 'Erro ao verificar atualizações'
        });
      } catch (windowError) {
        console.error('Erro ao enviar status de erro:', windowError);
        verification.logToFile(`Erro ao enviar status de erro: ${JSON.stringify(windowError)}`);
      }
    }
  } finally {
    if (localUpdateInProgress) {
      global.isUpdateInProgress = false;
    }
    console.log('Verificação de atualização finalizada');
  }
};

// Função para verificar se o sistema está completamente instalado
async function isSystemFullyInstalled() {
  try {
    console.log('Verificando se o sistema está completamente instalado...');
    
    // Verificar status do WSL e Ubuntu
    const wslStatus = await verification.checkWSLStatusDetailed();
    if (!wslStatus.installed || !wslStatus.wsl2 || !wslStatus.hasDistro) {
      console.log('Sistema não está completamente instalado: falta WSL ou Ubuntu');
      return false;
    }
    
    // Verificar configuração de software
    try {
      const softwareStatus = await verification.checkSoftwareConfigurations();
      
      // Verificar serviços necessários
      if (!softwareStatus.servicesStatus?.allRunning) {
        console.log('Sistema não está completamente instalado: serviços não estão em execução');
        return false;
      }
      
      // Verificar banco de dados
      if (!softwareStatus.dbStatus?.configured) {
        console.log('Sistema não está completamente instalado: banco de dados não configurado');
        return false;
      }
      
      // Verificar API - MUITO IMPORTANTE: isso precisa estar funcionando para sincronizar
      if (!softwareStatus.apiHealth) {
        console.log('Sistema não está completamente instalado: API não está saudável');
        return false;
      }
      
      // Verificar PM2 (gerenciador de processos)
      if (!softwareStatus.pm2Running) {
        console.log('Sistema não está completamente instalado: PM2 não está em execução');
        return false;
      }
    } catch (error) {
      console.log('Erro ao verificar status do software:', error.message);
      return false;
    }
    
    // Verificar impressora virtual do Windows
    try {
      const printerStatus = await verification.checkWindowsPrinterInstalled();
      if (!printerStatus?.installed) {
        console.log('Sistema não está completamente instalado: impressora virtual não instalada');
        return false;
      }
    } catch (error) {
      console.log('Erro ao verificar impressora virtual:', error.message);
      return false;
    }
    
    console.log('Sistema completamente instalado!');
    return true;
  } catch (error) {
    console.error('Erro ao verificar se o sistema está instalado:', error);
    return false;
  }
}

// Função para criar o arquivo de status para controlar reinicializações do nodemon
function createStatusLockFile(isReady) {
  try {
    const lockDir = path.join(app.getPath('userData'), 'locks');
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }
    
    const lockFile = path.join(lockDir, 'sync_status.lock');
    fs.writeFileSync(lockFile, JSON.stringify({
      ready: isReady,
      timestamp: new Date().toISOString()
    }), 'utf8');
    
    console.log(`Arquivo de status criado: ${isReady ? 'Sistema pronto' : 'Sistema não pronto'}`);
  } catch (error) {
    console.error('Erro ao criar arquivo de status:', error);
  }
}

// Função para verificar o arquivo de status
function checkStatusLockFile() {
  try {
    const lockFile = path.join(app.getPath('userData'), 'locks', 'sync_status.lock');
    if (fs.existsSync(lockFile)) {
      const data = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      console.log(`Estado de instalação anterior carregado: ${data.ready ? 'Pronto' : 'Não pronto'}`);
      return data.ready;
    }
  } catch (error) {
    console.error('Erro ao verificar arquivo de status:', error);
  }
  return false;
}

// Inicializa as tarefas de sincronização
function initializeSyncTasks() {
  if (global.syncTasksInitialized) {
    console.log('Tarefas de sincronização já inicializadas, ignorando.');
    return;
  }
  
  console.log('Inicializando tarefas de sincronização...');
  global.syncTasksInitialized = true;
  
  // Executar sincronização inicial em um timeout para evitar problemas de inicialização
  setTimeout(async () => {
    try {
      await printSync();
      await printersSync();
    } catch (error) {
      console.error('Erro na sincronização inicial:', error);
      verification.logToFile(`Erro na sincronização inicial: ${JSON.stringify(error)}`);
    }
  }, 5000); // 5 segundos de delay
  
  const ruleForZeroSecond = new schedule.RecurrenceRule();
  ruleForZeroSecond.second = [0];

  // Sincronização de impressões a cada minuto
  schedule.scheduleJob(ruleForZeroSecond, async () => {
    try {
      await printSync();
    } catch (error) {
      console.error('Erro na sincronização de impressões:', error);
      verification.logToFile(`Erro na sincronização de impressões: ${JSON.stringify(error)}`);
    }
  });

  const ruleForPrinterSync = new schedule.RecurrenceRule();
  ruleForPrinterSync.minute = [0, 15, 30, 45];

  // Sincronização de impressoras a cada 15 minutos
  schedule.scheduleJob(ruleForPrinterSync, async () => {
    try {
      await printersSync();
    } catch (error) {
      console.error('Erro na sincronização de impressoras:', error);
      verification.logToFile(`Erro na sincronização de impressoras: ${JSON.stringify(error)}`);
    }
  });
  
  console.log('Tarefas de sincronização inicializadas com sucesso.');
  verification.logToFile('Tarefas de sincronização inicializadas com sucesso.');
}

module.exports = {
  initTask: async () => {
    const mainModule = require('./main');
    const mainWindow = mainModule?.appWindow;
    const appConfig = mainModule?.appConfig;
    
    // Verificar se temos um status anterior para evitar múltiplas verificações
    const previousStatus = checkStatusLockFile();
    
    if (previousStatus) {
      console.log('Sistema anteriormente detectado como pronto. Verificando novamente...');
    }
    
    // Verificar se o sistema está completamente instalado
    try {
      const systemReady = await isSystemFullyInstalled();
      
      // Salvar o status em um arquivo para evitar reinicializações desnecessárias
      createStatusLockFile(systemReady);
      
      if (systemReady) {
        console.log('Sistema pronto para sincronização. Inicializando tarefas...');
        initializeSyncTasks();
      } else {
        console.log('Sistema não está pronto. As tarefas de sincronização NÃO serão iniciadas.');
        
        // Configurar verificação periódica do sistema
        const checkInterval = 5 * 60 * 1000; // 5 minutos
        console.log(`Agendando próxima verificação em ${checkInterval/60000} minutos`);
        
        setTimeout(async () => {
          try {
            console.log('Executando verificação periódica do sistema...');
            const isReady = await isSystemFullyInstalled();
            
            if (isReady && !global.syncTasksInitialized) {
              console.log('Sistema agora está pronto. Inicializando tarefas de sincronização...');
              createStatusLockFile(true);
              initializeSyncTasks();
            } else if (!isReady) {
              console.log('Sistema ainda não está pronto após verificação periódica.');
            }
          } catch (error) {
            console.error('Erro na verificação periódica:', error);
            verification.logToFile(`Erro na verificação periódica: ${JSON.stringify(error)}`);
          }
        }, checkInterval);
      }
    } catch (error) {
      console.error('Erro fatal ao verificar o sistema:', error);
      verification.logToFile(`Erro fatal ao verificar o sistema: ${JSON.stringify(error)}`);
      createStatusLockFile(false);
    }

    // Configurar verificação de atualizações independente do estado do sistema
    const ruleForMinute = new schedule.RecurrenceRule();
    ruleForMinute.minute = [0];
    
    // Verificação programada a cada hora
    // schedule.scheduleJob(ruleForMinute, async () => {
    //   try {
    //     await checkForUpdates(true, appConfig, mainWindow);
    //   } catch (error) {
    //     console.error('Erro na verificação programada de atualizações:', error);
    //     verification.logToFile(`Erro na verificação programada de atualizações: ${JSON.stringify(error)}`);
    //   }
    // });    
    
    // global.checkForUpdates = checkForUpdates;
    
    // // Verificação inicial após 2 minutos
    // setTimeout(() => {
    //   try {
    //     checkForUpdates(true, appConfig, mainWindow);
    //   } catch (error) {
    //     console.error('Erro na verificação inicial de atualizações:', error);
    //     verification.logToFile(`Erro na verificação inicial de atualizações: ${JSON.stringify(error)}`);
    //   }
    // }, 120000);
  }
}