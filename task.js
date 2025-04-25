const schedule = require('node-schedule');
const axios = require('axios');
const { app } = require('electron');
const { compareVersions } = require('compare-versions');

const { printSync } = require('./tasks/print');
const { printersSync } = require('./tasks/printers');

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
        // Continuar com a verificação mesmo se não puder notificar a janela
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
      }
    }
  } finally {
    if (localUpdateInProgress) {
      global.isUpdateInProgress = false;
    }
    console.log('Verificação de atualização finalizada');
  }
};

module.exports = {
  initTask: async () => {
    // printSync();
    // printersSync();

    const mainModule = require('./main');

    const mainWindow = mainModule.appWindow;
    const appConfig = mainModule.appConfig;

    const ruleForZeroSecond = new schedule.RecurrenceRule();
    ruleForZeroSecond.second = [0];

    // Sincronização de impressões a cada minuto
    schedule.scheduleJob(ruleForZeroSecond, async () => {
        await printSync();
    });

    const ruleForPrinterSync = new schedule.RecurrenceRule();
    ruleForPrinterSync.minute = [0, 15, 30, 45];

    // Sincronização de impressoras a cada 15 minutos
    schedule.scheduleJob(ruleForPrinterSync, async () => {
        await printersSync();
    });

    const ruleForMinute = new schedule.RecurrenceRule();
    ruleForMinute.minute = [0];
    
    // Verificação programada a cada hora
    schedule.scheduleJob(ruleForMinute, async () => {
      await checkForUpdates(true, appConfig, mainWindow);
    });
    
    global.checkForUpdates = checkForUpdates;
    
    // Verificação inicial após 2 minutos
    setTimeout(() => {
      checkForUpdates(true, appConfig, mainWindow);
    }, 120000);
  }
}