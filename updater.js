const { app, dialog } = require('electron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { compareVersions } = require('compare-versions');
const AdmZip = require('adm-zip');

class AppUpdater {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.appConfig = require('./main').appConfig;
    this.isUpdateInProgress = false;
    this.appVersion = app.getVersion();
    this.updateUrl = `${this.appConfig.apiPrincipalServiceUrl}/desktop/update`;
    this.updateDir = path.join(app.getPath('temp'), 'app-updates');
    
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
      
      const updateInfo = response.data?.data;
      
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
      this.sendToRenderer('update-status', { 
        status: 'update-available',
        version: updateInfo.version
      });
      
      // If auto-update is enabled, start the update
      if (this.appConfig.autoUpdate !== false) {
        return await this.downloadAndInstallUpdate(updateInfo);
      }
      
      return true;
    } catch (error) {
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
      
      // Download the update
      const downloadPath = path.join(this.updateDir, `update-${updateInfo.version}.zip`);
      const writer = fs.createWriteStream(downloadPath);
      
      const response = await axios({
        url: updateInfo.updateUrl,
        method: 'GET',
        responseType: 'stream'
      });
      
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      this.sendToRenderer('update-status', { 
        status: 'installing',
        message: 'Instalando atualização...' 
      });
      
      // Extract the update to a temporary directory
      const extractDir = path.join(this.updateDir, `extracted-${updateInfo.version}`);
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });
      
      const zip = new AdmZip(downloadPath);
      zip.extractAllTo(extractDir, true);
      
      // Create update installer script
      const appPath = app.getAppPath();
      const scriptPath = path.join(this.updateDir, 'install-update.js');
      
      const scriptContent = `
      const fs = require('fs');
      const path = require('path');
      const { exec } = require('child_process');
      
      const extractDir = '${extractDir.replace(/\\/g, '\\\\')}';
      const appPath = '${appPath.replace(/\\/g, '\\\\')}';
      
      // Wait for the app to close
      setTimeout(() => {
        try {
          // Copy all files from extract directory to app path, except node_modules
          const copyFiles = (src, dest) => {
            const entries = fs.readdirSync(src, { withFileTypes: true });
            
            for (const entry of entries) {
              const srcPath = path.join(src, entry.name);
              const destPath = path.join(dest, entry.name);
              
              if (entry.name === 'node_modules' || entry.name === '.git') continue;
              
              if (entry.isDirectory()) {
                if (!fs.existsSync(destPath)) {
                  fs.mkdirSync(destPath, { recursive: true });
                }
                copyFiles(srcPath, destPath);
              } else {
                fs.copyFileSync(srcPath, destPath);
              }
            }
          };
          
          copyFiles(extractDir, appPath);
          
          // Install any new dependencies
          exec('cd "' + appPath + '" && npm install', (error) => {
            if (error) console.error('Error installing dependencies:', error);
            
            // Start the app again
            exec('cd "' + appPath + '" && npm start', (error) => {
              if (error) console.error('Error restarting app:', error);
              process.exit(0);
            });
          });
        } catch (error) {
          console.error('Update failed:', error);
          process.exit(1);
        }
      }, 2000);
      `;
      
      fs.writeFileSync(scriptPath, scriptContent);
      
      // If we have a WSL update, let the user know
      if (updateInfo.wslUpdateRequired) {
        await this.updateWSLComponents();
      }
      
      // Show update ready notification
      dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Atualização Pronta',
        message: `A atualização para a versão ${updateInfo.version} está pronta para ser instalada.`,
        detail: 'A aplicação será reiniciada para aplicar a atualização.',
        buttons: ['Reiniciar Agora', 'Mais Tarde'],
        defaultId: 0
      }).then(result => {
        if (result.response === 0) {
          this.installUpdate(scriptPath);
        }
      });
      
      return true;
    } catch (error) {
      console.error('Error downloading/installing update:', error);
      this.isUpdateInProgress = false;
      this.sendToRenderer('update-status', { 
        status: 'update-error',
        message: 'Erro ao baixar ou instalar atualização' 
      });
      return false;
    }
  }
  
  installUpdate(scriptPath) {
    // Execute the update script in a detached process
    spawn(process.execPath, [scriptPath], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    
    // Quit the app to allow the update to proceed
    app.quit();
  }
  
  async updateWSLComponents() {
    try {
      this.sendToRenderer('update-status', { 
        status: 'updating-wsl',
        message: 'Atualizando componentes WSL...' 
      });
      
      // Execute the WSL update script
      const command = 'wsl -d Ubuntu -u root bash -c "cd /opt/print-management && bash -c \'if [ -f /opt/print-management/update.sh ]; then bash /opt/print-management/update.sh; else echo \"Script de atualização não encontrado.\"; fi\'"';
      
      return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error('Error updating WSL components:', error);
            console.error(stderr);
            this.sendToRenderer('update-status', { 
              status: 'wsl-update-error',
              message: 'Erro ao atualizar componentes WSL' 
            });
            reject(error);
            return;
          }
          
          console.log('WSL update output:', stdout);
          this.sendToRenderer('update-status', { 
            status: 'wsl-updated',
            message: 'Componentes WSL atualizados com sucesso' 
          });
          resolve(true);
        });
      });
    } catch (error) {
      console.error('Error in WSL update process:', error);
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