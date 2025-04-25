const schedule = require('node-schedule');
const axios = require('axios');
const { app } = require('electron');
const { compareVersions } = require('compare-versions');

const { printSync } = require('./tasks/print');
const { printersSync } = require('./tasks/printers');

// Função de verificação de atualização
const checkForUpdates = async (silent = false, appConfig, mainWindow) => {
  try {
    // Evitar verificação se já houver uma em andamento
    if (global.isUpdateInProgress) return;
    
    // Marcar que estamos verificando
    global.isUpdateInProgress = true;
    
    const updateUrl = `${appConfig.apiPrincipalServiceUrl}/desktop/update`;
    const currentVersion = app.getVersion();
    
    // Informar que estamos verificando (se não for silencioso)
    if (!silent && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { 
        status: 'checking',
        message: 'Verificando atualizações...' 
      });
    }
    
    console.log(`Verificando atualizações em: ${updateUrl}`);
    
    // Consultar API de atualização
    const response = await axios.get(updateUrl, {
      params: { currentVersion: currentVersion }
    });
    
    // Validar resposta
    if (!response.data || !response.data.data) {
      console.log('Resposta de atualização inválida');
      
      if (!silent && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { 
          status: 'check-error',
          message: 'Resposta de atualização inválida' 
        });
      }
      
      global.isUpdateInProgress = false;
      return;
    }
    
    const updateInfo = response.data.data;
    
    // Validar informações de atualização
    if (!updateInfo.version || !updateInfo.updateUrl) {
      console.log('Dados de atualização incompletos');
      
      if (!silent && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { 
          status: 'check-error',
          message: 'Informações de atualização incompletas' 
        });
      }
      
      global.isUpdateInProgress = false;
      return;
    }
    
    // Comparar versões
    if (compareVersions(updateInfo.version, currentVersion) <= 0) {
      console.log('Nenhuma atualização disponível');
      
      if (!silent && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { 
          status: 'up-to-date',
          message: 'Seu aplicativo está atualizado!' 
        });
      }
      
      global.isUpdateInProgress = false;
      return;
    }
    
    // Atualização disponível
    console.log(`Atualização disponível: ${updateInfo.version}`);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { 
        status: 'update-available',
        version: updateInfo.version,
        updateUrl: updateInfo.updateUrl,
        notes: updateInfo.releaseNotes || `Nova versão ${updateInfo.version} disponível`
      });
    }
    
    // Salvar informações da atualização para uso posterior
    global.pendingUpdate = updateInfo;
    global.isUpdateInProgress = false;
    
  } catch (error) {
    console.error('Erro ao verificar atualizações:', error);
    
    if (!silent && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { 
        status: 'check-error',
        message: 'Erro ao verificar atualizações' 
      });
    }
    
    global.isUpdateInProgress = false;
  }
};

module.exports = {
  initTask: async () => {
    await printSync();
    await printersSync();

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