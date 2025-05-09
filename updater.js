const { app, dialog } = require('electron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { compareVersions } = require('compare-versions');
const verification = require('./verification');

class AppUpdater {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.appConfig = require('./main').appConfig;
    this.isUpdateInProgress = false;
    this.appVersion = app.getVersion();
    this.updateUrl = `${this.appConfig.apiPrincipalServiceUrl}/desktop/update`;
    this.updateDir = path.join(app.getPath('temp'), 'app-updates');
    this.pendingUpdate = null;
    
    // Create update directory if it doesn't exist
    if (!fs.existsSync(this.updateDir)) {
      fs.mkdirSync(this.updateDir, { recursive: true });
    }
  }

  async checkForUpdates(silent = false) {
    if (this.isUpdateInProgress) return false;
    
    try {
      console.log('Checking for updates...');
      
      // Send current app version to the server
      const response = await axios.get(this.updateUrl, {
        params: { currentVersion: this.appVersion }
      });
      
      if (!response.data || !response.data.data) {
        console.log('Invalid update response from server');
        verification.logToFile(`Resposta de atualização inválida do servidor: ${JSON.stringify(response.response)}`);
        if (!silent) {
          this.sendToRenderer('update-status', { 
            status: 'check-error',
            message: 'Resposta de atualização inválida do servidor' 
          });
        }
        return false;
      }
      
      const updateInfo = response.data.data;
      
      // Validate update info
      if (!updateInfo.version || !updateInfo.updateUrl) {
        console.log('Invalid update info from server');
        if (!silent) {
          this.sendToRenderer('update-status', { 
            status: 'check-error',
            message: 'Informações de atualização inválidas do servidor' 
          });
        }
        return false;
      }
      
      // Compare versions to see if update is needed
      if (compareVersions(updateInfo.version, this.appVersion) <= 0) {
        console.log('No updates available');
        if (!silent) {
          this.sendToRenderer('update-status', { 
            status: 'up-to-date',
            message: 'Seu aplicativo está atualizado!' 
          });
        }
        return false;
      }
      
      // We have an update
      console.log(`Update available: ${updateInfo.version}`);
      this.pendingUpdate = updateInfo;
      
      this.sendToRenderer('update-status', { 
        status: 'update-available',
        version: updateInfo.version,
        notes: updateInfo.releaseNotes || `Nova versão ${updateInfo.version} disponível`
      });
      
      // If auto-update is enabled, start the update
      if (this.appConfig.autoUpdate !== false) {
        return await this.downloadAndInstallUpdate(updateInfo);
      }
      
      return true;
    } catch (error) {
      verification.logToFile(`Erro ao verificar atualizações: ${JSON.stringify(error)}`);
      console.error('Error checking for updates:', error);
      if (!silent) {
        this.sendToRenderer('update-status', { 
          status: 'check-error',
          message: 'Erro ao verificar atualizações' 
        });
      }
      return false;
    }
  }
  
  async downloadAndInstallUpdate(updateInfo) {
    try {
      this.isUpdateInProgress = true;
      this.sendToRenderer('update-status', { 
        status: 'downloading',
        message: 'Baixando atualização...' 
      });
      
      // Download the update executable
      const installerPath = path.join(this.updateDir, `Installer_${updateInfo.version}.exe`);
      
      try {
        // Download the installer file
        const response = await axios({
          url: updateInfo.updateUrl,
          method: 'GET',
          responseType: 'arraybuffer',
          timeout: 300000 // 5 minute timeout for large downloads
        });
        
        // Write the file directly
        fs.writeFileSync(installerPath, Buffer.from(response.data));
        console.log(`Update installer downloaded to: ${installerPath}`);
      } catch (downloadError) {
        verification.logToFile(`Erro ao baixar atualização: ${JSON.stringify(downloadError)}`);
        console.error('Error downloading update:', downloadError);
        throw new Error(`Falha ao baixar atualização: ${downloadError.message}`);
      }
      
      this.sendToRenderer('update-status', { 
        status: 'installing',
        message: 'Preparando instalação...' 
      });
      
      // Verify the installer exists
      if (!fs.existsSync(installerPath)) {
        throw new Error('O arquivo de instalação não foi baixado corretamente');
      }
      
      // Store update info for later use
      this.pendingUpdate = {
        ...updateInfo,
        installerPath
      };
      
      // Show update ready notification
      dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Atualização Pronta',
        message: `A atualização para a versão ${updateInfo.version} está pronta para ser instalada.`,
        detail: 'A aplicação será encerrada e o instalador será executado para aplicar a atualização.',
        buttons: ['Atualizar Agora', 'Mais Tarde'],
        defaultId: 0
      }).then(result => {
        if (result.response === 0) {
          this.executeInstaller();
        }
      });
      
      return true;
    } catch (error) {
      verification.logToFile(`Erro ao executar instalador/updater: ${JSON.stringify(error)}`);
      console.error('Error downloading/preparing update:', error);
      this.isUpdateInProgress = false;
      this.sendToRenderer('update-status', { 
        status: 'update-error',
        message: `Erro na atualização: ${error.message || 'Falha desconhecida'}` 
      });
      return false;
    }
  }
  
  executeInstaller() {
    if (!this.pendingUpdate || !this.pendingUpdate.installerPath) {
      console.error('No pending update installer to run');
      return false;
    }
    
    try {
      const installerPath = this.pendingUpdate.installerPath;
      
      // Verify the installer still exists
      if (!fs.existsSync(installerPath)) {
        throw new Error('O arquivo de instalação não foi encontrado');
      }
      
      console.log(`Launching installer: ${installerPath}`);
      
      // Run the installer with silent flags - adjust flags as needed for your installer
      const installerProcess = spawn(installerPath, ['/SILENT', '/CLOSEAPPLICATIONS'], {
        detached: true,
        stdio: 'ignore'
      });
      
      installerProcess.unref();
      
      // Quit the app to allow the installer to update files
      setTimeout(() => app.quit(), 1000);
      
      return true;
    } catch (error) {
      verification.logToFile(`Erro ao executar instalador do updater: ${JSON.stringify(error)}`);
      console.error('Error launching installer:', error);
      this.sendToRenderer('update-status', { 
        status: 'update-error',
        message: `Erro ao executar instalador: ${error.message}` 
      });
      return false;
    }
  }
  
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

module.exports = AppUpdater;