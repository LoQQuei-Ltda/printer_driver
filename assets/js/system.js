// Gerenciamento de Auto-Scroll para a aba de sistema
let autoScrollSystemEnabled = true;

let isCheckingSystem = false;
let lastSystemStatus = null; // Cache para armazenar o último status do sistema verificado

// Função para alternar o auto-scroll na aba de sistema
function toggleAutoScrollSystem() {
  autoScrollSystemEnabled = !autoScrollSystemEnabled;
  
  // Atualizar o ícone
  const autoScrollToggle = document.getElementById('autoScrollToggleSystem');
  if (autoScrollToggle) {
    autoScrollToggle.innerHTML = `Auto-rolagem <i class="fas fa-toggle-${autoScrollSystemEnabled ? 'on' : 'off'}"></i>`;
  }
  
  // Se ativado, rolar para o final
  if (autoScrollSystemEnabled) {
    scrollSystemLogToBottom();
  }
}

// Função para rolar o log de sistema para o final
function scrollSystemLogToBottom() {
  const logContainer = document.getElementById('installLog');
  if (logContainer) {
    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

// Adicionar entrada no log da aba sistema com formatação por tipo
function addSystemLogEntry(message, type = 'info') {
  const logContainer = document.getElementById('installLog');
  if (!logContainer) return;
  
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  
  logContainer.appendChild(entry);
  
  // Auto-scroll se habilitado
  if (autoScrollSystemEnabled) {
    scrollSystemLogToBottom();
  }
}

// Limpar o log da aba sistema
function clearSystemLog() {
  const logContainer = document.getElementById('installLog');
  if (logContainer) {
    logContainer.innerHTML = '';
    addSystemLogEntry('Log limpo pelo usuário', 'info');
  }
}

// Exportar o log para um arquivo de texto
function exportSystemLog() {
  const logContainer = document.getElementById('installLog');
  if (!logContainer) return;
  
  const logEntries = logContainer.querySelectorAll('.log-entry');
  let logText = `Log de Verificação e Instalação - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n\n`;
  
  logEntries.forEach(entry => {
    logText += `${entry.textContent}\n`;
  });
  
  // Criar um blob com o texto
  const blob = new Blob([logText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  // Criar um link para download e clicar nele
  const a = document.createElement('a');
  a.href = url;
  a.download = `sistema_log_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  
  // Limpar
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  
  addSystemLogEntry('Log exportado para arquivo de texto', 'success');
}

// Renderizar os detalhes do status do sistema
function renderSystemStatusDetails(statusData) {
  // Primeiro, mostrar container de detalhes
  const detailsContainer = document.getElementById('statusDetailsContainer');
  if (detailsContainer) {
    detailsContainer.style.display = 'block';
  }
  
  // 1. Renderizar status do WSL e Ubuntu
  const wslContainer = document.getElementById('wslStatusDetails');
  if (wslContainer && statusData.wslStatus) {
    let wslHtml = '';
    
    // WSL Status
    wslHtml += `
      <div class="status-item">
        <div class="status-indicator ${statusData.wslStatus.installed ? 'green' : 'red'}"></div>
        <div class="status-label">Windows Subsystem for Linux (WSL)</div>
        <div class="status-action">
          ${!statusData.wslStatus.installed ? '<button class="btn-mini install-component" data-component="wsl">Instalar</button>' : ''}
        </div>
      </div>
    `;
    
    // WSL2 Status
    wslHtml += `
      <div class="status-item">
        <div class="status-indicator ${statusData.wslStatus.wsl2 ? 'green' : 'red'}"></div>
        <div class="status-label">WSL 2 Configurado</div>
        <div class="status-action">
          ${statusData.wslStatus.installed && !statusData.wslStatus.wsl2 ? '<button class="btn-mini install-component" data-component="wsl2">Configurar</button>' : ''}
        </div>
      </div>
    `;
    
    // Ubuntu Status
    wslHtml += `
      <div class="status-item">
        <div class="status-indicator ${statusData.wslStatus.hasDistro ? 'green' : 'red'}"></div>
        <div class="status-label">Ubuntu Instalado</div>
        <div class="status-action">
          ${!statusData.wslStatus.hasDistro ? '<button class="btn-mini install-component" data-component="ubuntu">Instalar</button>' : ''}
        </div>
      </div>
    `;
    
    // Virtualização Status
    wslHtml += `
      <div class="status-item">
        <div class="status-indicator ${statusData.virtualizationEnabled ? 'green' : 'yellow'}"></div>
        <div class="status-label">Virtualização ${statusData.virtualizationEnabled ? 'Habilitada' : 'Não Detectada'}</div>
        <div class="status-action">
          ${!statusData.virtualizationEnabled ? '<button class="btn-mini help-button" data-help="virtualization">Ajuda</button>' : ''}
        </div>
      </div>
    `;
    
    wslContainer.innerHTML = wslHtml;
  }
  
  // 2. Renderizar status dos pacotes e serviços
  const servicesContainer = document.getElementById('servicesStatusDetails');
  if (servicesContainer && statusData.softwareStatus) {
    let servicesHtml = '';
    const softwareStatus = statusData.softwareStatus;
    
    // Pacotes Status
    if (softwareStatus.packagesStatus) {
      if (softwareStatus.packagesStatus.allInstalled) {
        servicesHtml += `
          <div class="status-item">
            <div class="status-indicator green"></div>
            <div class="status-label">Todos os pacotes necessários estão instalados</div>
          </div>
        `;
      } else {
        servicesHtml += `
          <div class="status-item">
            <div class="status-indicator yellow"></div>
            <div class="status-label">Pacotes faltando: ${softwareStatus.packagesStatus.missing.join(', ')}</div>
            <div class="status-action">
              <button class="btn-mini install-component" data-component="packages">Instalar Pacotes</button>
            </div>
          </div>
        `;
      }
    }
    
    // Serviços Status
    if (softwareStatus.servicesStatus) {
      if (softwareStatus.servicesStatus.allRunning) {
        servicesHtml += `
          <div class="status-item">
            <div class="status-indicator green"></div>
            <div class="status-label">Todos os serviços estão em execução</div>
          </div>
        `;
      } else {
        servicesHtml += `
          <div class="status-item">
            <div class="status-indicator yellow"></div>
            <div class="status-label">Serviços inativos: ${softwareStatus.servicesStatus.inactive.join(', ')}</div>
            <div class="status-action">
              <button class="btn-mini install-component" data-component="services">Iniciar Serviços</button>
            </div>
          </div>
        `;
      }
    }
    
    // Firewall Status
    if (softwareStatus.firewallStatus) {
      servicesHtml += `
        <div class="status-item">
          <div class="status-indicator ${softwareStatus.firewallStatus.configured ? 'green' : 'yellow'}"></div>
          <div class="status-label">Firewall ${softwareStatus.firewallStatus.configured ? 'Configurado' : 'Necessita Configuração'}</div>
          <div class="status-action">
            ${!softwareStatus.firewallStatus.configured ? '<button class="btn-mini install-component" data-component="firewall">Configurar</button>' : ''}
          </div>
        </div>
      `;
    }
    
    servicesContainer.innerHTML = servicesHtml;
  }
  
  // 3. Renderizar status do banco de dados e API
  const dbApiContainer = document.getElementById('dbApiStatusDetails');
  if (dbApiContainer && statusData.softwareStatus) {
    let dbApiHtml = '';
    const softwareStatus = statusData.softwareStatus;
    
    // Database Status
    if (softwareStatus.dbStatus) {
      dbApiHtml += `
        <div class="status-item">
          <div class="status-indicator ${softwareStatus.dbStatus.configured ? 'green' : 'yellow'}"></div>
          <div class="status-label">Banco de Dados PostgreSQL ${softwareStatus.dbStatus.configured ? 'Configurado' : 'Necessita Configuração'}</div>
          <div class="status-action">
            ${!softwareStatus.dbStatus.configured ? '<button class="btn-mini install-component" data-component="database">Configurar</button>' : ''}
          </div>
        </div>
      `;
    }
    
    // API Status
    if (softwareStatus.apiHealth !== undefined) {
      dbApiHtml += `
        <div class="status-item">
          <div class="status-indicator ${softwareStatus.apiHealth ? 'green' : 'red'}"></div>
          <div class="status-label">API ${softwareStatus.apiHealth ? 'Respondendo' : 'Não Disponível'}</div>
          <div class="status-action">
            ${!softwareStatus.apiHealth ? '<button class="btn-mini install-component" data-component="api">Reiniciar</button>' : ''}
          </div>
        </div>
      `;
    }
    
    // PM2 Status
    if (softwareStatus.pm2Running !== undefined) {
      dbApiHtml += `
        <div class="status-item">
          <div class="status-indicator ${softwareStatus.pm2Running ? 'green' : 'yellow'}"></div>
          <div class="status-label">Serviço PM2 ${softwareStatus.pm2Running ? 'Em Execução' : 'Não Iniciado'}</div>
          <div class="status-action">
            ${!softwareStatus.pm2Running ? '<button class="btn-mini install-component" data-component="pm2">Iniciar</button>' : ''}
          </div>
        </div>
      `;
    }
    
    // Impressora Windows Status
    if (statusData.printerStatus) {
      dbApiHtml += `
        <div class="status-item">
          <div class="status-indicator ${statusData.printerStatus.installed ? 'green' : 'yellow'}"></div>
          <div class="status-label">Impressora Virtual ${statusData.printerStatus.installed ? 'Instalada' : 'Não Instalada'}</div>
          <div class="status-action">
            ${!statusData.printerStatus.installed ? '<button class="btn-mini install-component" data-component="printer">Instalar</button>' : ''}
          </div>
        </div>
      `;
    }
    
    dbApiContainer.innerHTML = dbApiHtml;
    
    // Configurar os ouvintes de eventos para os botões de ação
    setupComponentActionButtons();
  }
}

// Configurar botões de ação para instalação de componentes específicos
function setupComponentActionButtons() {
  const installButtons = document.querySelectorAll('.install-component');
  installButtons.forEach(button => {
    button.addEventListener('click', function() {
      const component = this.getAttribute('data-component');
      installComponent(component);
    });
  });
  
  const helpButtons = document.querySelectorAll('.help-button');
  helpButtons.forEach(button => {
    button.addEventListener('click', function() {
      const helpTopic = this.getAttribute('data-help');
      showHelpDialog(helpTopic);
    });
  });
}

// Mostrar diálogo de ajuda para tópicos específicos
function showHelpDialog(topic) {
  let title = 'Ajuda';
  let message = '';
  
  switch(topic) {
    case 'virtualization':
      title = 'Virtualização não detectada';
      message = `A virtualização não está habilitada no seu sistema. Para habilitar:
        
1. Reinicie o computador e entre na BIOS/UEFI (geralmente pressionando F2, Delete, F10 ou F12 durante a inicialização)
2. Procure por configurações de 'Virtualization', 'VT-x', 'AMD-V', ou 'SVM'
3. Habilite esta configuração
4. Salve as alterações e reinicie o computador

A virtualização é necessária para usar o WSL 2 com melhor desempenho.`;
      break;
    default:
      message = 'Informações de ajuda não disponíveis para este tópico.';
  }
  
  require('electron').remote.dialog.showMessageBox({
    type: 'info',
    title: title,
    message: title,
    detail: message,
    buttons: ['OK']
  });
}

// Instalar um componente específico do sistema
function installComponent(component) {
  // Mostrar confirmação antes de proceder
  const { dialog } = require('electron').remote;
  
  let title = 'Instalar Componente';
  let message = `Deseja instalar ou configurar o componente: ${component}?`;
  
  switch(component) {
    case 'wsl':
      title = 'Instalar WSL';
      message = 'Deseja instalar o Windows Subsystem for Linux (WSL)?';
      break;
    case 'wsl2':
      title = 'Configurar WSL 2';
      message = 'Deseja configurar o WSL para usar a versão 2?';
      break;
    case 'ubuntu':
      title = 'Instalar Ubuntu';
      message = 'Deseja instalar a distribuição Ubuntu no WSL?';
      break;
    case 'packages':
      title = 'Instalar Pacotes';
      message = 'Deseja instalar os pacotes necessários no Ubuntu?';
      break;
    case 'services':
      title = 'Iniciar Serviços';
      message = 'Deseja iniciar os serviços necessários no Ubuntu?';
      break;
    case 'firewall':
      title = 'Configurar Firewall';
      message = 'Deseja configurar o firewall no Ubuntu?';
      break;
    case 'database':
      title = 'Configurar Banco de Dados';
      message = 'Deseja configurar o banco de dados PostgreSQL?';
      break;
    case 'api':
      title = 'Reiniciar API';
      message = 'Deseja reiniciar o serviço da API?';
      break;
    case 'pm2':
      title = 'Iniciar PM2';
      message = 'Deseja iniciar o serviço PM2?';
      break;
    case 'printer':
      title = 'Instalar Impressora Virtual';
      message = 'Deseja instalar a impressora virtual?';
      break;
  }
  
  dialog.showMessageBox({
    type: 'question',
    title: title,
    message: message,
    buttons: ['Sim', 'Não'],
    defaultId: 0
  }).then(result => {
    if (result.response === 0) {
      initiateComponentInstallation(component);
    }
  });
}

// Iniciar a instalação de um componente específico
function initiateComponentInstallation(component) {
  const { ipcRenderer } = require('electron');
  
  // Desabilitar botões durante a instalação
  const buttons = document.querySelectorAll('.install-component, .help-button, #installButton, #reinstallButton, #checkSystemButton');
  buttons.forEach(button => {
    button.disabled = true;
  });
  
  // Adicionar log sobre o início da instalação
  addSystemLogEntry(`Iniciando instalação/configuração do componente: ${component}`, 'header');
  
  // Enviar solicitação para o processo principal
  ipcRenderer.send('instalar-componente', { component });
  
  // Configurar receptor de logs de instalação
  ipcRenderer.on('installation-log', (event, data) => {
    addSystemLogEntry(data.message, data.type);
  });
  
  // Configurar receptor de conclusão de instalação
  ipcRenderer.once('componente-instalado', (event, data) => {
    // Reabilitar botões
    buttons.forEach(button => {
      button.disabled = false;
    });
    
    if (data.success) {
      addSystemLogEntry(`Componente ${component} instalado/configurado com sucesso!`, 'success');
      // Verificar sistema novamente para atualizar o status
      checkSystemStatusDetailed();
    } else {
      addSystemLogEntry(`Erro ao instalar/configurar componente ${component}: ${data.message}`, 'error');
    }
    
    // Remover o listener de log para evitar duplicações em futuras instalações
    ipcRenderer.removeAllListeners('installation-log');
  });
}

// Verificar status do sistema de forma detalhada
async function checkSystemStatusDetailed() {
  // Evitar verificações múltiplas simultâneas
  if (isCheckingSystem) {
    console.log('Verificação já em andamento, ignorando nova solicitação');
    addSystemLogEntry('Verificação já em andamento, aguarde a conclusão...', 'warning');
    return;
  }
  
  isCheckingSystem = true;
  
  // Limpar área de status e mostrar spinner
  const statusSection = document.getElementById('statusSection');
  if (statusSection) {
    statusSection.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Verificando componentes do sistema...</p>
      </div>
    `;
  }
  
  // Desabilitar botões durante a verificação
  const checkButton = document.getElementById('checkSystemButton');
  const installButton = document.getElementById('installButton');
  const reinstallButton = document.getElementById('reinstallButton');
  
  if (checkButton) checkButton.disabled = true;
  if (installButton) installButton.disabled = true;
  if (reinstallButton) reinstallButton.disabled = true;
  
  // Desabilitar também botões de componentes individuais
  const componentButtons = document.querySelectorAll('.install-component, .help-button');
  componentButtons.forEach(button => button.disabled = true);
  
  // Ocultar detalhes antigos
  const detailsContainer = document.getElementById('statusDetailsContainer');
  if (detailsContainer) {
    detailsContainer.style.display = 'none';
  }
  
  addSystemLogEntry('Iniciando verificação detalhada do sistema...', 'header');
  
  // Usar IPC para solicitar verificação ao processo principal
  try {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('verificar-sistema-detalhado');
    
    // Configurar receptor de resposta
    ipcRenderer.once('sistema-status-detalhado', (event, status) => {
      isCheckingSystem = false;
      
      // Reabilitar botões
      if (checkButton) checkButton.disabled = false;
      if (reinstallButton) reinstallButton.disabled = false;
      
      // Reabilitar botões de componentes individuais
      componentButtons.forEach(button => button.disabled = false);
      
      // Armazenar último status verificado
      lastSystemStatus = status;
      
      // Log dos resultados
      addSystemLogEntry('Verificação do sistema concluída', 'success');
      
      if (status.error) {
        addSystemLogEntry(`Erro na verificação: ${status.error}`, 'error');
        
        if (statusSection) {
          statusSection.innerHTML = `
            <div class="status-item">
              <div class="status-indicator red"></div>
              <div class="status-label">Erro ao verificar status do sistema</div>
            </div>
          `;
        }
        
        return;
      }
      
      // Determinar o estado real da configuração com base em todos os componentes
      const needsConfiguration = 
        (status.softwareStatus && !status.softwareStatus.fullyConfigured) ||
        (status.softwareStatus && status.softwareStatus.firewallStatus && !status.softwareStatus.firewallStatus.configured) ||
        (status.printerStatus && (!status.printerStatus.installed || !status.printerStatus.correctConfig));
      
      // Forçar o status de configuração baseado na análise completa
      status.needsConfiguration = needsConfiguration;
      
      console.log('Status do sistema:', status);
      console.log('Status da configuração:', needsConfiguration ? 'Requer configuração' : 'Configurado');
      
      // Renderizar status detalhado
      renderSystemStatusDetails(status);
      
      // Atualizar status geral
      updateOverallStatus(status);
      
      // Adicionar logs detalhados sobre cada componente
      addDetailedStatusLogs(status);
      
      // Mostrar detalhes
      if (detailsContainer) {
        detailsContainer.style.display = 'block';
      }
    });
  } catch (error) {
    isCheckingSystem = false;
    addSystemLogEntry(`Erro ao solicitar verificação: ${error.message}`, 'error');
    
    if (statusSection) {
      statusSection.innerHTML = `
        <div class="status-item">
          <div class="status-indicator red"></div>
          <div class="status-label">Erro ao verificar status: ${error.message}</div>
        </div>
      `;
    }
    
    // Reabilitar botões
    if (checkButton) checkButton.disabled = false;
    if (installButton) installButton.disabled = false;
    if (reinstallButton) reinstallButton.disabled = false;
    
    // Reabilitar botões de componentes individuais
    componentButtons.forEach(button => button.disabled = false);
  }
}

// Adicionar logs detalhados sobre cada componente
function addDetailedStatusLogs(status) {
  // WSL e Ubuntu
  if (status.wslStatus) {
    addSystemLogEntry(`WSL: ${status.wslStatus.installed ? 'Instalado' : 'Não Instalado'}`, status.wslStatus.installed ? 'success' : 'warning');
    addSystemLogEntry(`WSL 2: ${status.wslStatus.wsl2 ? 'Configurado' : 'Não Configurado'}`, status.wslStatus.wsl2 ? 'success' : 'warning');
    addSystemLogEntry(`Ubuntu: ${status.wslStatus.hasDistro ? 'Instalado' : 'Não Instalado'}`, status.wslStatus.hasDistro ? 'success' : 'warning');
  }
  
  // Virtualização
  addSystemLogEntry(`Virtualização: ${status.virtualizationEnabled ? 'Habilitada' : 'Não Detectada'}`, status.virtualizationEnabled ? 'success' : 'warning');
  
  // Software Status
  if (status.softwareStatus) {
    const sw = status.softwareStatus;
    
    // Pacotes
    if (sw.packagesStatus) {
      if (sw.packagesStatus.allInstalled) {
        addSystemLogEntry('Todos os pacotes necessários estão instalados', 'success');
      } else {
        addSystemLogEntry(`Pacotes faltando: ${sw.packagesStatus.missing.join(', ')}`, 'warning');
      }
    }
    
    // Serviços
    if (sw.servicesStatus) {
      if (sw.servicesStatus.allRunning) {
        addSystemLogEntry('Todos os serviços estão em execução', 'success');
      } else {
        addSystemLogEntry(`Serviços inativos: ${sw.servicesStatus.inactive.join(', ')}`, 'warning');
      }
    }
    
    // Firewall
    if (sw.firewallStatus) {
      addSystemLogEntry(`Firewall: ${sw.firewallStatus.configured ? 'Configurado' : 'Necessita Configuração'}`, sw.firewallStatus.configured ? 'success' : 'warning');
      if (!sw.firewallStatus.configured && sw.firewallStatus.missingPorts) {
        addSystemLogEntry(`Portas não configuradas: ${sw.firewallStatus.missingPorts.join(', ')}`, 'info');
      }
    }
    
    // Database
    if (sw.dbStatus) {
      addSystemLogEntry(`Banco de Dados: ${sw.dbStatus.configured ? 'Configurado' : 'Necessita Configuração'}`, sw.dbStatus.configured ? 'success' : 'warning');
    }
    
    // API
    if (sw.apiHealth !== undefined) {
      addSystemLogEntry(`API: ${sw.apiHealth ? 'Respondendo' : 'Não Disponível'}`, sw.apiHealth ? 'success' : 'warning');
    }
    
    // PM2
    if (sw.pm2Running !== undefined) {
      addSystemLogEntry(`Serviço PM2: ${sw.pm2Running ? 'Em Execução' : 'Não Iniciado'}`, sw.pm2Running ? 'success' : 'warning');
    }
    
    // Status geral
    addSystemLogEntry(`Status Geral do Sistema: ${sw.fullyConfigured ? 'Totalmente Configurado' : 'Requer Configuração'}`, sw.fullyConfigured ? 'success' : 'warning');
  }
  
  // Impressora Windows
  if (status.printerStatus) {
    addSystemLogEntry(`Impressora Virtual: ${status.printerStatus.installed ? 'Instalada' : 'Não Instalada'}`, status.printerStatus.installed ? 'success' : 'warning');
    if (status.printerStatus.installed) {
      addSystemLogEntry(`Porta da Impressora: ${status.printerStatus.port || 'N/A'}`, 'info');
    }
  }
}

// Atualizar status geral na seção principal
function updateOverallStatus(status) {
  const statusSection = document.getElementById('statusSection');
  if (!statusSection) return;
  
  let statusHtml = '';
  
  // Determinar o estado real da configuração com base em todos os componentes
  const needsConfiguration = 
    (status.softwareStatus && !status.softwareStatus.fullyConfigured) ||
    (status.softwareStatus && status.softwareStatus.firewallStatus && !status.softwareStatus.firewallStatus.configured) ||
    (status.printerStatus && (!status.printerStatus.installed || !status.printerStatus.correctConfig));
  
  // Verificar status principal do WSL e Ubuntu
  if (status.wslStatus) {
    statusHtml += `
      <div class="status-item">
        <div class="status-indicator ${status.wslStatus.installed ? 'green' : 'red'}"></div>
        <div class="status-label">Windows Subsystem for Linux</div>
      </div>
      <div class="status-item">
        <div class="status-indicator ${status.wslStatus.wsl2 ? 'green' : 'red'}"></div>
        <div class="status-label">WSL 2 Configurado</div>
      </div>
      <div class="status-item">
        <div class="status-indicator ${status.wslStatus.hasDistro ? 'green' : 'red'}"></div>
        <div class="status-label">Ubuntu Instalado</div>
      </div>
      <div class="status-item">
        <div class="status-indicator ${status.userConfigured ? 'green' : 'red'}"></div>
        <div class="status-label">Usuário do Sistema Configurado</div>
      </div>
    `;
  }
  
  // Status geral do sistema - critério mais rigoroso
  if (status.softwareStatus) {
    statusHtml += `
      <div class="status-item">
        <div class="status-indicator ${!needsConfiguration ? 'green' : 'yellow'}"></div>
        <div class="status-label">Status Geral do Sistema: ${!needsConfiguration ? 'Totalmente Configurado' : 'Requer Configuração'}</div>
      </div>
    `;
  }
  
  statusSection.innerHTML = statusHtml;
  
  // Atualizar botões de instalação baseado no estado real
  updateInstallButtons(needsConfiguration);
}

// Atualizar botões de instalação
function updateInstallButtons(needsConfiguration) {
  const installButton = document.getElementById('installButton');
  const reinstallButton = document.getElementById('reinstallButton');
  
  if (!installButton || !reinstallButton) return;

  console.log(`Atualizando botões de instalação. Sistema precisa de configuração: ${needsConfiguration}`);
  
  // Texto do botão e container da mensagem
  const container = installButton.parentElement;
  const statusTextElement = container.querySelector('.status-text') || document.createElement('div');
  
  if (!statusTextElement.classList.contains('status-text')) {
    statusTextElement.className = 'status-text';
    container.appendChild(statusTextElement);
  }
  
  if (needsConfiguration) {
    // Sistema precisa ser configurado
    installButton.textContent = 'Instalar Componentes Necessários';
    installButton.disabled = false;
    installButton.classList.remove('installed');
    
    // Atribuir manipulador de evento
    installButton.onclick = function() {
      console.log('Clique no botão de instalação detectado');
      initiateInstallation(false); // false = instalar apenas o necessário
    };
    
    // Habilitar o botão de reinstalação completa
    reinstallButton.disabled = false;
    reinstallButton.onclick = function() {
      console.log('Clique no botão de reinstalação completa detectado');
      initiateInstallation(true); // true = reinstalação completa
    };
    
    // Atualizar mensagem de status
    statusTextElement.textContent = 'O sistema requer configuração. Clique para instalar apenas os componentes necessários.';
    statusTextElement.style.color = 'var(--color-warning)';
  } else {
    // Sistema já está configurado
    installButton.textContent = 'Sistema Instalado';
    installButton.disabled = true;
    installButton.classList.add('installed');
    installButton.onclick = null; // Remover qualquer handler de clique anterior
    
    // Ainda permitir a reinstalação completa
    reinstallButton.disabled = false;
    reinstallButton.onclick = function() {
      console.log('Clique no botão de reinstalação completa detectado');
      initiateInstallation(true); // true = reinstalação completa
    };
    
    // Atualizar mensagem de status
    statusTextElement.textContent = 'O sistema está configurado e pronto para uso.';
    statusTextElement.style.color = 'var(--color-success)';
  }
}

// Iniciar instalação do sistema (completa ou apenas o necessário)
function initiateInstallation(forceReinstall = false) {
  const { ipcRenderer } = require('electron');
  
  // Desabilitar botões durante a instalação
  const installButton = document.getElementById('installButton');
  const reinstallButton = document.getElementById('reinstallButton');
  const checkButton = document.getElementById('checkSystemButton');
  
  if (installButton) installButton.disabled = true;
  if (reinstallButton) reinstallButton.disabled = true;
  if (checkButton) checkButton.disabled = true;
  
  // Botão de instalação específica
  const componentButtons = document.querySelectorAll('.install-component, .help-button');
  componentButtons.forEach(button => button.disabled = true);
  
  // Mostrar indicação visual de que a instalação está sendo iniciada
  if (installButton) {
    installButton.innerHTML = '<div class="spinner button-spinner"></div> Iniciando Instalação...';
  }
  
  // Limpar qualquer log anterior
  const logContainer = document.getElementById('installLog');
  if (logContainer) {
    logContainer.innerHTML = '';
    addSystemLogEntry('Iniciando processo de instalação...', 'header');
  }
  
  // Enviar mensagem específica com base no tipo de instalação
  if (forceReinstall) {
    addSystemLogEntry('Realizando reinstalação completa do sistema...', 'warning');
    ipcRenderer.send('iniciar-instalacao', { forceReinstall: true });
  } else {
    addSystemLogEntry('Instalando apenas componentes necessários...', 'info');
    ipcRenderer.send('iniciar-instalacao', { forceReinstall: false });
  }
  
  // Registrar feedback de log
  addSystemLogEntry('Solicitação de instalação enviada. Aguarde a abertura da janela de instalação...', 'info');
  
  // Configurar receptor de logs de instalação
  ipcRenderer.on('installation-log', (event, data) => {
    addSystemLogEntry(data.message, data.type);
  });
  
  // Configurar receptor de conclusão de instalação
  ipcRenderer.once('instalacao-completa', (event, data) => {
    // Reabilitar botões
    if (checkButton) checkButton.disabled = false;
    if (reinstallButton) reinstallButton.disabled = false;
    if (installButton) installButton.disabled = false;
    
    // Reabilitar botões de componentes individuais
    componentButtons.forEach(button => button.disabled = false);
    
    if (data.success) {
      addSystemLogEntry('Instalação concluída com sucesso!', 'success');
      
      // Verificar sistema novamente para atualizar o status
      setTimeout(() => {
        checkSystemStatusDetailed();
      }, 2000);
    } else {
      addSystemLogEntry(`Erro na instalação: ${data.error || 'Erro desconhecido'}`, 'error');
      
      // Reabilitar botões de instalação
      if (installButton) {
        installButton.disabled = false;
        installButton.textContent = 'Instalar Componentes Necessários';
      }
      if (reinstallButton) {
        reinstallButton.disabled = false;
      }
    }
    
    // Remover o listener de log para evitar duplicações em futuras instalações
    ipcRenderer.removeAllListeners('installation-log');
  });
}

// Configurar evento quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
  // Botão verificar sistema
  const checkSystemButton = document.getElementById('checkSystemButton');
  if (checkSystemButton) {
    checkSystemButton.addEventListener('click', checkSystemStatusDetailed);
  }
  
  // Botão reinstalar tudo
  const reinstallButton = document.getElementById('reinstallButton');
  if (reinstallButton) {
    reinstallButton.addEventListener('click', function() {
      initiateInstallation(true); // true = forçar reinstalação completa
    });
  }
  
  // Botão instalar componentes necessários
  const installButton = document.getElementById('installButton');
  if (installButton) {
    installButton.addEventListener('click', function() {
      initiateInstallation(false); // false = instalar apenas o necessário
    });
  }
  
  // Auto scroll toggle
  const autoScrollToggle = document.getElementById('autoScrollToggleSystem');
  if (autoScrollToggle) {
    autoScrollToggle.addEventListener('click', toggleAutoScrollSystem);
  }
  
  // Botão exportar log
  const exportLogBtn = document.getElementById('exportLogBtn');
  if (exportLogBtn) {
    exportLogBtn.addEventListener('click', exportSystemLog);
  }
  
  // Verificar sistema automaticamente quando a aba é carregada pela primeira vez
  if (document.getElementById('systemTab')) {
    // Verificar se estamos na aba sistema (não bloqueando a primeira carga)
    setTimeout(() => {
      if (!document.getElementById('systemTab').classList.contains('hidden')) {
        checkSystemStatusDetailed();
      }
    }, 500);
  }
  
  // Escuta quando a aba sistema é mostrada
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      if (tabName === 'system') {
        // Esperar um pouco para garantir que a mudança de aba já ocorreu
        setTimeout(checkSystemStatusDetailed(), 100);
      }
    });
  });
  
  // Adicionar handler para botões de componentes individuais - garantir que funcionem
  const setupComponentButtons = () => {
    document.querySelectorAll('.install-component').forEach(button => {
      // Remover listeners antigos para evitar chamadas duplicadas
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      
      // Adicionar novo listener
      newButton.addEventListener('click', function() {
        const component = this.getAttribute('data-component');
        console.log(`Solicitando instalação do componente: ${component}`);
        
        // Desabilitar todos os botões durante a operação
        document.querySelectorAll('.install-component, .help-button, #checkSystemButton, #installButton, #reinstallButton')
          .forEach(btn => btn.disabled = true);
        
        // Log da operação iniciada
        addSystemLogEntry(`Iniciando instalação do componente: ${component}...`, 'header');
        
        // Enviar solicitação via IPC
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('instalar-componente', { component });
        
        // Ouvir resposta da instalação
        ipcRenderer.once('componente-instalado', (event, result) => {
          // Reabilitar todos os botões
          document.querySelectorAll('.install-component, .help-button, #checkSystemButton, #installButton, #reinstallButton')
            .forEach(btn => btn.disabled = false);
          
          // Log do resultado
          if (result.success) {
            addSystemLogEntry(`Componente ${component} instalado com sucesso!`, 'success');
            
            // Verificar o sistema após instalação bem-sucedida
            setTimeout(checkSystemStatusDetailed, 1000);
          } else {
            addSystemLogEntry(`Erro ao instalar componente ${component}: ${result.message}`, 'error');
          }
        });
      });
    });
  };
  
  // Garantir que o setup aconteça quando os botões forem criados
  const originalRenderSystemStatusDetails = window.renderSystemStatusDetails;
  window.renderSystemStatusDetails = function(statusData) {
    // Chamar a função original
    originalRenderSystemStatusDetails(statusData);
    
    // Configurar os botões após a renderização
    setupComponentButtons();
  };
});