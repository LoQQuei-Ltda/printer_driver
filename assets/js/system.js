// Gerenciamento de Auto-Scroll para a aba de sistema
let autoScrollSystemEnabled = true;

let isCheckingSystem = false;

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
      </div>
    `;
    
    // WSL2 Status
    wslHtml += `
      <div class="status-item">
        <div class="status-indicator ${statusData.wslStatus.wsl2 ? 'green' : 'red'}"></div>
        <div class="status-label">WSL 2 Configurado</div>
      </div>
    `;
    
    // Ubuntu Status
    wslHtml += `
      <div class="status-item">
        <div class="status-indicator ${statusData.wslStatus.hasDistro ? 'green' : 'red'}"></div>
        <div class="status-label">Ubuntu Instalado</div>
      </div>
    `;
    
    // Virtualização Status
    wslHtml += `
      <div class="status-item">
        <div class="status-indicator ${statusData.virtualizationEnabled ? 'green' : 'yellow'}"></div>
        <div class="status-label">Virtualização ${statusData.virtualizationEnabled ? 'Habilitada' : 'Não Detectada'}</div>
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
        </div>
      `;
    }
    
    // API Status
    if (softwareStatus.apiHealth !== undefined) {
      dbApiHtml += `
        <div class="status-item">
          <div class="status-indicator ${softwareStatus.apiHealth ? 'green' : 'red'}"></div>
          <div class="status-label">API ${softwareStatus.apiHealth ? 'Respondendo' : 'Não Disponível'}</div>
        </div>
      `;
    }
    
    // PM2 Status
    if (softwareStatus.pm2Running !== undefined) {
      dbApiHtml += `
        <div class="status-item">
          <div class="status-indicator ${softwareStatus.pm2Running ? 'green' : 'yellow'}"></div>
          <div class="status-label">Serviço PM2 ${softwareStatus.pm2Running ? 'Em Execução' : 'Não Iniciado'}</div>
        </div>
      `;
    }
    
    // Impressora Windows Status
    if (statusData.printerStatus) {
      dbApiHtml += `
        <div class="status-item">
          <div class="status-indicator ${statusData.printerStatus.installed ? 'green' : 'yellow'}"></div>
          <div class="status-label">Impressora Virtual ${statusData.printerStatus.installed ? 'Instalada' : 'Não Instalada'}</div>
        </div>
      `;
    }
    
    dbApiContainer.innerHTML = dbApiHtml;
  }
}

// Verificar status do sistema de forma detalhada
async function checkSystemStatusDetailed() {
  // Evitar verificações múltiplas simultâneas
  if (isCheckingSystem) {
    console.log('Verificação já em andamento, ignorando nova solicitação');
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
  
  // Ocultar detalhes antigos
  const detailsContainer = document.getElementById('statusDetailsContainer');
  if (detailsContainer) {
    detailsContainer.style.display = 'none';
  }
  
  // Desabilitar botão de instalação durante a verificação
  const installButton = document.getElementById('installButton');
  if (installButton) {
    installButton.disabled = true;
  }
  
  addSystemLogEntry('Iniciando verificação detalhada do sistema...', 'header');
  
  // Enviar solicitação para verificar sistema
  try {
    ipcRenderer.send('verificar-sistema-detalhado');
    
    // Configurar receptor de resposta
    ipcRenderer.once('sistema-status-detalhado', (event, status) => {
      isCheckingSystem = false;
      
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
      
      // Renderizar status detalhado
      renderSystemStatusDetails(status);
      
      // Atualizar status geral
      updateOverallStatus(status);
      
      // Adicionar logs detalhados sobre cada componente
      addDetailedStatusLogs(status);
      
      // Atualizar botão de instalação
      updateInstallButton(status.needsConfiguration);
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
  }
}

// Atualizar status geral na seção principal
function updateOverallStatus(status) {
  const statusSection = document.getElementById('statusSection');
  if (!statusSection) return;
  
  let statusHtml = '';
  
  // Verificar status principal do WSL e Ubuntu
  if (status.wslStatus) {
    statusHtml += `
      <div class="status-item">
        <div class="status-indicator ${status.wslStatus.installed ? 'green' : 'red'}"></div>
        <div class="status-label">Windows Subsystem for Linux (WSL)</div>
      </div>
      <div class="status-item">
        <div class="status-indicator ${status.wslStatus.wsl2 ? 'green' : 'red'}"></div>
        <div class="status-label">WSL 2 Configurado</div>
      </div>
      <div class="status-item">
        <div class="status-indicator ${status.wslStatus.hasDistro ? 'green' : 'red'}"></div>
        <div class="status-label">Ubuntu Instalado</div>
      </div>
    `;
  }
  
  // Status geral do sistema
  if (status.softwareStatus) {
    statusHtml += `
      <div class="status-item">
        <div class="status-indicator ${status.softwareStatus.fullyConfigured ? 'green' : 'yellow'}"></div>
        <div class="status-label">Status Geral do Sistema: ${status.softwareStatus.fullyConfigured ? 'Totalmente Configurado' : 'Requer Configuração'}</div>
      </div>
    `;
  }
  
  statusSection.innerHTML = statusHtml;
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

// Atualizar botão de instalação
function updateInstallButton(needsConfiguration) {
  const installButton = document.getElementById('installButton');
  if (!installButton) return;

  console.log(`Atualizando botão de instalação. Sistema precisa de configuração: ${needsConfiguration}`);
  
  // Texto do botão e container da mensagem
  const container = installButton.parentElement;
  const statusTextElement = container.querySelector('.status-text') || document.createElement('div');
  
  if (!statusTextElement.classList.contains('status-text')) {
    statusTextElement.className = 'status-text';
    container.appendChild(statusTextElement);
  }
  
  if (needsConfiguration) {
    // Sistema precisa ser configurado
    installButton.textContent = 'Instalar Sistema';
    installButton.disabled = false;
    installButton.classList.remove('installed');
    
    // Atribuir manipulador de evento
    installButton.onclick = function() {
      console.log('Clique no botão de instalação detectado');
      // Mostrar indicação visual de que a instalação está sendo iniciada
      installButton.innerHTML = '<div class="spinner button-spinner"></div> Iniciando Instalação...';
      installButton.disabled = true;
      
      // Limpar qualquer log anterior
      const logContainer = document.getElementById('installLog');
      if (logContainer) {
        logContainer.innerHTML = '';
        addSystemLogEntry('Iniciando processo de instalação...', 'header');
      }
      
      // Usar IPC para iniciar a instalação
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('iniciar-instalacao');
      
      // Registrar feedback de log
      addSystemLogEntry('Solicitação de instalação enviada. Aguarde a abertura da janela de instalação...', 'info');
    };
    
    // Atualizar mensagem de status
    statusTextElement.textContent = 'O sistema requer configuração. Clique para instalar os componentes necessários.';
    statusTextElement.style.color = 'var(--color-warning)';
  } else {
    // Sistema já está configurado
    installButton.textContent = 'Sistema Instalado';
    installButton.disabled = true;
    installButton.classList.add('installed');
    installButton.onclick = null; // Remover qualquer handler de clique anterior
    
    // Atualizar mensagem de status
    statusTextElement.textContent = 'O sistema está configurado e pronto para uso.';
    statusTextElement.style.color = 'var(--color-success)';
  }
}

// Corrigir a função que atualiza o status geral para garantir visualização consistente
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
  
  // Atualizar botão de instalação baseado no estado real
  updateInstallButton(needsConfiguration);
}

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
  
  // Desabilitar botão durante a verificação
  const checkButton = document.getElementById('checkSystemButton');
  const installButton = document.getElementById('installButton');
  
  if (checkButton) checkButton.disabled = true;
  if (installButton) installButton.disabled = true;
  
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
  }
}

// Configurar evento quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
  // Botão verificar sistema
  const checkSystemButton = document.getElementById('checkSystemButton');
  if (checkSystemButton) {
    checkSystemButton.addEventListener('click', checkSystemStatusDetailed);
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
        setTimeout(checkSystemStatusDetailed, 100);
      }
    });
  });
});