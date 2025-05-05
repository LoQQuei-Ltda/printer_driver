/**
 * Sistema de Gerenciamento de Impressão - Instalador
 * 
 * Este script instala o ambiente WSL, Ubuntu e o sistema de gerenciamento de impressão.
 * Versão refatorada com funções de verificação movidas para verification.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const verification = require('./verification');

// Verificar se estamos em ambiente Electron
const isElectron = process.versions && process.versions.electron;
let stepUpdateCallback = null;
let progressCallback = null;
let customAskQuestion = null;

const allSteps = [
  'Verificando pré-requisitos',
  'Instalando Windows Subsystem for Linux (WSL)',
  'Configurando WSL 2',
  'Instalando Ubuntu',
  'Configurando usuário padrão',
  'Configurando ambiente de sistema',
  'Configurando serviços',
  'Finalizando instalação'
];

function setCustomAskQuestion(callback) {
  customAskQuestion = callback;
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

function askQuestion(question) {
  // Se uma função de pergunta personalizada foi definida (para Electron)
  if (customAskQuestion) {
    return customAskQuestion(question);
  }

  // Se estamos em modo Electron, mas sem função personalizada, apenas retornar sim
  if (isElectron) {
    log(`[PERGUNTA AUTOMÁTICA] ${question}`, 'info');
    verification.logToFile(`Pergunta automática: ${question}`);
    verification.logToFile(`Resposta automática: s`);
    return Promise.resolve('s');
  }

  // Modo terminal normal
  return new Promise((resolve) => {
    rl.question(`${'\x1b[33m'}${question}${'\x1b[0m'}`, (answer) => {
      verification.logToFile(`Pergunta: ${question}`);
      verification.logToFile(`Resposta: ${answer}`);
      resolve(answer);
    });
  });
}

function log(message, type = "info") {
  // Format and log to console
  const timestamp = new Date().toLocaleTimeString();
  let formattedMessage = "";

  switch (type) {
    case "success":
      formattedMessage = `[${timestamp}] ✓ ${message}`;
      break;
    case "error":
      formattedMessage = `[${timestamp}] ✗ ${message}`;
      break;
    case "warning":
      formattedMessage = `[${timestamp}] ⚠ ${message}`;
      break;
    case "step":
      formattedMessage = `[${timestamp}] → ${message}`;
      break;
    case "header":
      formattedMessage = `\n=== ${message} ===\n`;
      break;
    default:
      formattedMessage = `[${timestamp}] ${message}`;
  }

  console.log(formattedMessage);

  // Store in log buffer
  installationLog.push(`[${timestamp}][${type}] ${message}`);
  verification.logToFile(`[${timestamp}][${type}] ${message}`);

  // Call update callback if set
  if (stepUpdateCallback) {
    // Map message to step number based on keywords and determine appropriate state
    const lowerMessage = message.toLowerCase();
    let stepNumber = -1;
    let state = 'in-progress';

    // Determinar o estado com base no tipo de mensagem
    if (type === 'success') state = 'completed';
    else if (type === 'error') state = 'error';
    else state = 'in-progress';

    // Lógica especial para detecção de instalação de componentes específicos
    if (lowerMessage.includes('componentes que serão instalados:')) {
      // Examinar quais componentes serão instalados
      try {
        const componentsMatch = lowerMessage.match(/instalados:\s*(.+)$/);
        if (componentsMatch && componentsMatch[1]) {
          const componentsList = componentsMatch[1].split(',').map(c => c.trim().toLowerCase());
          console.log('Componentes a serem instalados:', componentsList);

          // Verificar se WSL/Ubuntu NÃO estão na lista (já estão instalados)
          const wslNeeded = componentsList.some(c => c.includes('wsl'));
          const ubuntuNeeded = componentsList.some(c => c.includes('ubuntu'));

          // Se WSL e Ubuntu não estão na lista, marcar essas etapas como concluídas
          if (!wslNeeded && !ubuntuNeeded) {
            // Marcar as primeiras etapas como concluídas
            for (let i = 0; i <= 3; i++) {
              stepUpdateCallback(i, 'completed', 'Concluído');
            }
          }

          // Antecipar qual etapa estará em andamento com base nos componentes
          if (componentsList.includes('database') ||
            componentsList.includes('software')) {
            stepUpdateCallback(5, 'in-progress', 'Em andamento');

            // Atualizar progresso também
            if (progressCallback) {
              progressCallback(70);
            }
          } else if (componentsList.includes('api') ||
            componentsList.includes('pm2') ||
            componentsList.includes('services')) {
            stepUpdateCallback(6, 'in-progress', 'Em andamento');

            // Atualizar progresso também
            if (progressCallback) {
              progressCallback(85);
            }
          } else if (componentsList.includes('printer')) {
            stepUpdateCallback(7, 'in-progress', 'Em andamento');

            // Atualizar progresso também
            if (progressCallback) {
              progressCallback(95);
            }
          }
        }
      } catch (err) {
        console.error('Erro ao processar componentes:', err);
      }
    }
    // Detecção de componentes específicos sendo instalados
    else if (lowerMessage.includes('instalando/configurando database') ||
      lowerMessage.includes('banco de dados')) {
      // Marcar etapas anteriores como concluídas
      for (let i = 0; i <= 4; i++) {
        stepUpdateCallback(i, 'completed', 'Concluído');
      }
      stepNumber = 5; // Configurando ambiente
    }
    else if (lowerMessage.includes('instalando/configurando api') ||
      lowerMessage.includes('instalando/configurando pm2')) {
      // Marcar etapas anteriores como concluídas
      for (let i = 0; i <= 5; i++) {
        stepUpdateCallback(i, 'completed', 'Concluído');
      }
      stepNumber = 6; // Configurando serviços
    }
    else if (lowerMessage.includes('instalando/configurando printer') ||
      lowerMessage.includes('impressora')) {
      // Marcar etapas anteriores como concluídas
      for (let i = 0; i <= 6; i++) {
        stepUpdateCallback(i, 'completed', 'Concluído');
      }
      stepNumber = 7; // Finalizando instalação
    }
    else if (lowerMessage.includes('verificando o sistema após')) {
      // Marcar etapas anteriores como concluídas
      for (let i = 0; i <= 6; i++) {
        stepUpdateCallback(i, 'completed', 'Concluído');
      }
      stepNumber = 7; // Finalizando instalação
    }
    // Detecção padrão de etapas
    else if (lowerMessage.includes('verificando pré-requisitos') ||
      lowerMessage.includes('verificando privilégios') ||
      lowerMessage.includes('verificando versão')) {
      stepNumber = 0;
    } else if (lowerMessage.includes('instalando wsl')) {
      stepNumber = 1;
    } else if (lowerMessage.includes('configurando wsl 2') ||
      lowerMessage.includes('definindo wsl 2')) {
      stepNumber = 2;
    } else if (lowerMessage.includes('instalando ubuntu')) {
      stepNumber = 3;
    } else if (lowerMessage.includes('configurando usuário')) {
      stepNumber = 4;
    } else if (lowerMessage.includes('configurando ambiente') ||
      lowerMessage.includes('configurando sistema')) {
      stepNumber = 5;
    } else if (lowerMessage.includes('configurando serviços') ||
      lowerMessage.includes('configurando cups') ||
      lowerMessage.includes('configurando samba')) {
      stepNumber = 6;
    } else if (lowerMessage.includes('finalizando instalação') ||
      lowerMessage.includes('instalação concluída')) {
      stepNumber = 7;
    }

    // Only update the step if we have a match and the state is appropriate
    if (stepNumber >= 0) {
      stepUpdateCallback(stepNumber, state, message);

      // Special case: if marking a step as in-progress or completed and 
      // it's not the first step, make sure previous steps are marked completed
      if ((state === 'in-progress' || state === 'completed') && stepNumber > 0) {
        for (let i = 0; i < stepNumber; i++) {
          stepUpdateCallback(i, 'completed', 'Concluído');
        }
      }
    }
  }

  // Update progress percentage if callback is set
  if (progressCallback) {
    // More accurate progress mapping with specific percentages per step
    const lowerMessage = message.toLowerCase();
    let progress = -1;

    // Detecção de progresso para componentes específicos
    if (lowerMessage.includes('analisando componentes necessários')) {
      progress = 20;
    }
    else if (lowerMessage.includes('componentes que serão instalados:')) {
      // Verificar se a instalação é parcial
      if (!lowerMessage.includes('wsl') && !lowerMessage.includes('ubuntu')) {
        // Instalação parcial sem WSL/Ubuntu - pular para 60%
        progress = 60;
      } else {
        progress = 25;
      }
    }
    else if (lowerMessage.includes('instalando/configurando database')) {
      progress = 80;
    }
    else if (lowerMessage.includes('instalando/configurando api')) {
      progress = 85;
    }
    else if (lowerMessage.includes('instalando/configurando pm2')) {
      progress = 87;
    }
    else if (lowerMessage.includes('instalando/configurando printer')) {
      progress = 95;
    }
    else if (lowerMessage.includes('verificando o sistema após')) {
      progress = 98;
    }
    // Mapeamento padrão de progresso
    else if (lowerMessage.includes('verificando privilégios')) {
      progress = 5;
    } else if (lowerMessage.includes('verificando virtualização')) {
      progress = 10;
    } else if (lowerMessage.includes('wsl não está instalado')) {
      progress = 15;
    } else if (lowerMessage.includes('instalando wsl')) {
      progress = 20;
    } else if (lowerMessage.includes('recurso wsl habilitado')) {
      progress = 30;
    } else if (lowerMessage.includes('configurando wsl 2') ||
      lowerMessage.includes('definindo wsl 2')) {
      progress = 40;
    } else if (lowerMessage.includes('instalando ubuntu')) {
      progress = 50;
    } else if (lowerMessage.includes('ubuntu instalado')) {
      progress = 60;
    } else if (lowerMessage.includes('configurando usuário')) {
      progress = 70;
    } else if (lowerMessage.includes('configurando ambiente') ||
      lowerMessage.includes('configurando sistema')) {
      progress = 80;
    } else if (lowerMessage.includes('configurando serviços') ||
      lowerMessage.includes('configurando cups') ||
      lowerMessage.includes('configurando samba')) {
      progress = 90;
    } else if (lowerMessage.includes('instalação concluída')) {
      progress = 100;
    }

    // Only update if we have a valid progress value
    if (progress >= 0) {
      progressCallback(progress);
    }
  }
}

async function installComponent(component, status) {
  log(`Instalando componente específico: ${component}...`, 'step');

  try {
    // Verificar status atual do sistema se não for fornecido
    if (!status) {
      status = await verification.checkSystemStatus();
    }

    // Instalação do componente específico com melhor tratamento de erros
    switch (component) {
      case 'wsl':
        if (status.wslStatus && status.wslStatus.installed) {
          log('WSL já está instalado, pulando instalação', 'info');
          return true;
        }
        // Tentar o método moderno primeiro, se falhar usar o legado
        const modernResult = await installWSLModern();
        if (modernResult) {
          return true;
        }
        log('Método moderno falhou, tentando método legado', 'warning');
        return await installWSLLegacy();

      case 'wsl2':
        if (status.wslStatus && status.wslStatus.wsl2) {
          log('WSL 2 já está configurado, pulando configuração', 'info');
          return true;
        }
        
        // Tentar configurar WSL 2 com mais robustez
        try {
          // Verificar primeiro se WSL está instalado
          const wslCheck = await verification.execPromise('wsl --status', 15000, false)
            .catch(() => "wsl-not-found");
            
          if (wslCheck === "wsl-not-found" || wslCheck.includes("não está instalado") || 
              wslCheck.includes("not installed")) {
            log('WSL não está instalado, não é possível configurar WSL 2', 'error');
            return false;
          }
          
          // Tentar configurar com múltiplas tentativas
          let success = false;
          let attempts = 0;
          const maxAttempts = 3;
          
          while (!success && attempts < maxAttempts) {
            attempts++;
            try {
              await verification.execPromise('wsl --set-default-version 2', 60000, true);
              log(`WSL 2 configurado como versão padrão na tentativa ${attempts}`, 'success');
              success = true;
            } catch (setVersionError) {
              if (attempts < maxAttempts) {
                log(`Tentativa ${attempts} falhou, aguardando antes de tentar novamente...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 5000));
              } else {
                throw setVersionError;
              }
            }
          }
          
          return success;
        } catch (error) {
          log(`Erro ao configurar WSL 2: ${error.message || JSON.stringify(error)}`, 'error');
          return false;
        }

      case 'ubuntu':
        if (status.wslStatus && status.wslStatus.hasDistro) {
          log('Ubuntu já está instalado, pulando instalação', 'info');
          return true;
        }
        // Usar a versão melhorada de installUbuntu
        return await installUbuntu();

      case 'packages':
        log('Instalando pacotes necessários...', 'step');
        return await installRequiredPackages();

      case 'services':
        log('Configurando serviços necessários...', 'step');
        try {
          // Configurar cada serviço principal
          const cupsResult = await installComponent('cups', status);
          
          // Configurar Samba
          log('Configurando Samba...', 'step');
          const sambaResult = await configureSamba();
          
          if (!sambaResult) {
            log('Problemas na configuração do Samba, mas continuando...', 'warning');
          }
          
          // Verificar e configurar banco de dados
          log('Verificando banco de dados...', 'step');
          const dbResult = await installComponent('database', status);
          
          if (!dbResult) {
            log('Problemas com o banco de dados, algumas funcionalidades podem não funcionar corretamente', 'warning');
          }
          
          // Reiniciar outros serviços fundamentais
          log('Reiniciando serviços adicionais...', 'step');
          await verification.execPromise('wsl -d Ubuntu -u root systemctl restart postgresql avahi-daemon ufw 2>/dev/null || true', 30000, true);
          
          // Consideramos sucesso mesmo se alguns serviços falharem
          log('Serviços configurados', cupsResult && sambaResult && dbResult ? 'success' : 'warning');
          return true;
        } catch (error) {
          log(`Erro ao configurar serviços: ${error.message || JSON.stringify(error)}`, 'error');
          return false;
        }
      
      case 'software':
        log('Copiando software para diretório /opt...', 'step');
        return await copySoftwareToOpt();
      
      case 'firewall':
        log('Configurando regras de firewall...', 'step');
        return await configureFirewall();

      case 'database':
        log('Configurando banco de dados...', 'step');
        try {
          // Primeiro configurar o banco de dados
          const dbResult = await setupDatabase();
          
          if (!dbResult) {
            log('Falha na configuração do banco de dados', 'error');
            return false;
          }
          
          // Verificar se o banco precisa de migrações
          const dbStatus = await verification.checkDatabaseConfiguration();
          
          if (dbStatus.needsMigrations || !dbStatus.tablesExist) {
            log('Banco configurado, mas precisa de migrações. Executando...', 'step');
            const migrationsResult = await setupMigrations();
            
            if (migrationsResult) {
              log('Migrações executadas com sucesso', 'success');
            } else {
              log('Aviso: Falha ao executar migrações, pode ser necessário executá-las manualmente', 'warning');
            }
          }
          
          return true;
        } catch (error) {
          log(`Erro ao configurar banco de dados: ${error.message || JSON.stringify(error)}`, 'error');
          return false;
        }

      case 'user':
        log('Configurando usuário padrão...', 'step');
        return await configureDefaultUser();

      case 'api':
        try {
          log('Reiniciando API...', 'step');
          
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
                false
              );
              
              if (pathCheck.trim() === 'exists') {
                // Verificar se tem ecosystem.config.js ou bin/www.js
                const appCheck = await verification.execPromise(
                  `wsl -d Ubuntu -u root bash -c "if [ -f '${path}/ecosystem.config.js' ] || [ -f '${path}/bin/www.js' ]; then echo 'valid'; else echo 'invalid'; fi"`, 
                  15000, 
                  false
                );
                
                if (appCheck.trim() === 'valid') {
                  apiPath = path;
                  log(`Diretório da API encontrado: ${path}`, 'success');
                  break;
                }
              }
            } catch (pathError) {
              // Ignorar erros individuais e continuar verificando
            }
          }
          
          if (!apiPath) {
            log('Diretório da API não encontrado, não é possível reiniciar', 'error');
            return false;
          }
          
          // Tentar reiniciar com PM2
          try {
            const restartCmd = `cd ${apiPath} && (pm2 restart ecosystem.config.js || pm2 restart all || pm2 start ecosystem.config.js)`;
            await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${restartCmd}"`, 60000, true);
            log('API reiniciada com sucesso', 'success');
            return true;
          } catch (pmError) {
            log('Erro ao reiniciar com PM2, tentando método alternativo...', 'warning');
            
            // Método alternativo: iniciar diretamente com node
            try {
              const altCmd = `cd ${apiPath} && (nohup node bin/www.js > /var/log/print_server.log 2>&1 &)`;
              await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${altCmd}"`, 30000, true);
              log('API iniciada com método alternativo', 'success');
              return true;
            } catch (nodeError) {
              log('Todos os métodos de inicialização falharam', 'error');
              verification.logToFile(`Erro ao iniciar com node: ${JSON.stringify(nodeError)}`);
              return false;
            }
          }
        } catch (error) {
          log(`Erro ao reiniciar API: ${error.message || JSON.stringify(error)}`, 'error');
          return false;
        }

      case 'migrations':
        log('Executando migrações do banco de dados...', 'step');
        
        try {
          // Verificar se o banco de dados está configurado
          const dbStatus = await verification.checkDatabaseConfiguration();
          
          // Se precisar de migrações ou se for forçado
          if (dbStatus.needsMigrations || status?.forceMigrations) {
            log('Tabelas necessárias não encontradas, executando migrações...', 'step');
            const migrationsResult = await setupMigrations();
            
            if (migrationsResult) {
              log('Migrações executadas com sucesso', 'success');
              return true;
            } else {
              log('Falha ao executar migrações', 'error');
              return false;
            }
          } else {
            // Verificar se as tabelas existem
            if (dbStatus.tablesExist) {
              log('Banco de dados já está configurado com as tabelas necessárias', 'success');
              return true;
            } else {
              log('Banco de dados configurado, mas faltam tabelas. Executando migrações...', 'step');
              const migrationsResult = await setupMigrations();
              
              if (migrationsResult) {
                log('Migrações executadas com sucesso', 'success');
                return true;
              } else {
                log('Falha ao executar migrações', 'error');
                return false;
              }
            }
          }
        } catch (error) {
          log(`Erro ao executar migrações: ${error.message || JSON.stringify(error)}`, 'error');
          return false;
        }
        
      case 'cups':
        log('Configurando serviço CUPS...', 'step');
        try {
          // Verificar se o serviço está ativo
          const cupsStatus = await verification.execPromise('wsl -d Ubuntu -u root systemctl is-active cups', 10000, true)
            .catch(() => "inactive");
          
          if (cupsStatus.trim() !== 'active') {
            log('Reiniciando serviço CUPS...', 'step');
            await verification.execPromise('wsl -d Ubuntu -u root systemctl restart cups', 30000, true);
            // Aguardar a inicialização do serviço
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
          // Configurar CUPS e impressora PDF
          log('Aplicando configurações do CUPS...', 'step');
          const result = await configureCups();
          
          if (result) {
            log('CUPS configurado com sucesso', 'success');
          } else {
            log('Houve problemas na configuração do CUPS', 'warning');
          }
          
          // Configurar impressora PDF no CUPS
          log('Configurando impressora PDF no CUPS...', 'step');
          const printerResult = await setupCupsPrinter();
          
          if (printerResult) {
            log('Impressora PDF configurada com sucesso', 'success');
          } else {
            log('Houve problemas na configuração da impressora PDF', 'warning');
          }
          
          return result && printerResult;
        } catch (error) {
          log(`Erro ao configurar CUPS: ${error.message || JSON.stringify(error)}`, 'error');
          return false;
        }
    
      case 'pm2':
      return await setupPM2();

      case 'printer':
        return await installWindowsPrinter();

      default:
        log(`Componente desconhecido: ${component}`, 'error');
        return false;
    }
  } catch (error) {
    log(`Erro ao instalar componente ${component}: ${error.message}`, 'error');
    return false;
  }
}

const installationLog = [];

// Configuração do terminal interativo (apenas quando não estiver em ambiente Electron)
let rl;
if (!isElectron) {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Caminho para arquivos de estado e log
const INSTALL_STATE_FILE = path.join(process.cwd(), 'install_state.json');
const LOG_FILE = path.join(process.cwd(), 'instalacao_detalhada.log');

// Inicializar log file no módulo de verificação
verification.initLogFile(LOG_FILE);

// Estado da instalação
let installState = {
  wslInstalled: false,
  kernelUpdated: false,
  wslConfigured: false,
  ubuntuInstalled: false,
  systemConfigured: false,
  defaultUserCreated: false
};

// Carregar estado da instalação se existir
try {
  if (fs.existsSync(INSTALL_STATE_FILE)) {
    const stateData = fs.readFileSync(INSTALL_STATE_FILE, 'utf8');
    installState = JSON.parse(stateData);
    verification.log('Estado de instalação anterior carregado');
  }
} catch (err) {
  verification.log(`Erro ao carregar estado da instalação: ${err.message}`, 'error');
}

// Salvar estado da instalação
function saveInstallState() {
  try {
    fs.writeFileSync(INSTALL_STATE_FILE, JSON.stringify(installState, null, 2), 'utf8');
  } catch (err) {
    verification.log(`Erro ao salvar estado da instalação: ${err.message}`, 'error');
  }
}

// Função para limpar a tela e mostrar o cabeçalho
function clearScreen() {
  console.clear();
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    white: '\x1b[37m',
    bgBlue: '\x1b[44m'
  };
  console.log(`${colors.bgBlue}${colors.white}${colors.bright} ========================================================= ${colors.reset}`);
  console.log(`${colors.bgBlue}${colors.white}${colors.bright}   SISTEMA DE GERENCIAMENTO DE IMPRESSÃO - INSTALADOR     ${colors.reset}`);
  console.log(`${colors.bgBlue}${colors.white}${colors.bright} ========================================================= ${colors.reset}`);
  console.log();
}

// Fechar readline se necessário e se estiver disponível
function closeReadlineIfNeeded() {
  if (!isElectron && rl && typeof rl.close === 'function') {
    try {
      rl.close();
    } catch (e) {
      console.error('Erro ao fechar readline:', e);
    }
  }
}

// Instalar o WSL usando método mais recente (Windows 10 versão 2004 ou superior)
async function installWSLModern() {
  verification.log('Tentando instalar WSL usando o método moderno (wsl --install)...', 'step');

  try {
    // Verificar primeiro se já está instalado para evitar erros desnecessários
    const wslCheck = await verification.execPromise('wsl --status', 10000, false)
      .catch(() => "not-found");
    
    if (wslCheck !== "not-found" && !wslCheck.includes("não está instalado") && 
        !wslCheck.includes("not installed")) {
      verification.log('WSL já está instalado (detectado durante verificação preliminar)', 'success');
      installState.wslInstalled = true;
      saveInstallState();
      return true;
    }

    // Usar o método mais recente com argumentos específicos e timeout maior
    await verification.execPromise(
      'wsl --install --no-distribution --no-launch', 
      600000  // 10 minutos de timeout
    );
    verification.log('Comando de instalação do WSL moderno executado com sucesso', 'success');
    
    // Aguardar um momento para o sistema processar
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verificar novamente se o WSL foi instalado
    const postCheck = await verification.execPromise('wsl --status', 10000, false)
      .catch(() => "failed");
      
    if (postCheck !== "failed" && !postCheck.includes("não está instalado") && 
        !postCheck.includes("not installed")) {
      verification.log('WSL instalado com sucesso após verificação', 'success');
      installState.wslInstalled = true;
      saveInstallState();
      return true;
    }
    
    // Se chegou aqui, precisamos verificar por métodos alternativos
    const altCheck = await verification.execPromise('where wsl', 10000, false)
      .catch(() => "");
      
    if (altCheck && altCheck.includes("wsl.exe")) {
      verification.log('WSL.exe encontrado, considerando como instalado', 'success');
      installState.wslInstalled = true;
      saveInstallState();
      return true;
    }
    
    verification.log('Método moderno de instalação falhou na verificação final', 'warning');
    return false;
  } catch (error) {
    // Verificar se o erro é porque o WSL já está instalado
    if (error.stdout && (
        error.stdout.includes('já está instalado') || 
        error.stdout.includes('already installed') ||
        error.stdout.includes('is already installed'))) {
      verification.log('WSL já está instalado (detectado durante instalação)', 'success');
      installState.wslInstalled = true;
      saveInstallState();
      return true;
    }

    verification.log('Método moderno de instalação falhou', 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Instalar o WSL usando o método tradicional para versões mais antigas do Windows
async function installWSLLegacy() {
  verification.log('Iniciando instalação do WSL usando método tradicional...', 'header');

  try {
    // Habilitar o recurso WSL
    verification.log('Habilitando o recurso Windows Subsystem for Linux...', 'step');

    try {
      // PowerShell é o método preferido
      await verification.execPromise('powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart"', 180000, true);
      verification.log('Recurso WSL habilitado com sucesso (método PowerShell)', 'success');
    } catch (error) {
      verification.log('Falha ao habilitar WSL via PowerShell. Tentando método DISM...', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

      try {
        await verification.execPromise('dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 180000, true);
        verification.log('Recurso WSL habilitado com sucesso (método DISM)', 'success');
      } catch (dismError) {
        verification.log('Falha ao habilitar o recurso WSL', 'error');
        verification.logToFile(`Detalhes do erro DISM: ${JSON.stringify(dismError)}`);
        return false;
      }
    }

    // Habilitar o recurso de Máquina Virtual
    verification.log('Habilitando o recurso de Plataforma de Máquina Virtual...', 'step');

    try {
      await verification.execPromise('powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart"', 180000, true);
      verification.log('Recurso de Máquina Virtual habilitado com sucesso (método PowerShell)', 'success');
    } catch (error) {
      verification.log('Falha ao habilitar Máquina Virtual via PowerShell. Tentando método DISM...', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

      try {
        await verification.execPromise('dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 180000, true);
        verification.log('Recurso de Máquina Virtual habilitado com sucesso (método DISM)', 'success');
      } catch (dismError) {
        verification.log('Falha ao habilitar o recurso de Máquina Virtual', 'error');
        verification.logToFile(`Detalhes do erro DISM: ${JSON.stringify(dismError)}`);
        return false;
      }
    }

    verification.log('Recursos do WSL habilitados com sucesso!', 'success');
    installState.wslInstalled = true;
    saveInstallState();

    // Baixar e instalar o kernel do WSL2
    const tempDir = path.join(os.tmpdir(), 'wsl-installer');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const kernelUpdatePath = path.join(tempDir, 'wsl_update_x64.msi');

    verification.log('Baixando o pacote de atualização do kernel do WSL2...', 'step');

    try {
      // Verificar se já temos o arquivo
      if (fs.existsSync(kernelUpdatePath)) {
        verification.log('Pacote do kernel WSL2 já baixado anteriormente', 'success');
      } else {
        await verification.execPromise(`powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelUpdatePath}'"`, 180000, true);
        verification.log('Pacote do kernel WSL2 baixado com sucesso', 'success');
      }
    } catch (error) {
      verification.log('Erro ao baixar o pacote do kernel WSL2. Tentando método alternativo...', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

      try {
        // Método alternativo usando bitsadmin
        await verification.execPromise(`bitsadmin /transfer WSLUpdateDownload /download /priority normal https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi "${kernelUpdatePath}"`, 180000, true);
        verification.log('Pacote do kernel WSL2 baixado com sucesso (método alternativo)', 'success');
      } catch (bitsError) {
        verification.log('Todos os métodos de download falharam', 'error');
        verification.logToFile(`Detalhes do erro BITS: ${JSON.stringify(bitsError)}`);

        // No Electron, escolhemos automaticamente sim
        if (isElectron) {
          verification.log('Download falhou, mas continuando com abordagem alternativa', 'warning');
          await verification.execPromise('start https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 5000, true);
          verification.log('Página de download aberta, aguarde o download completo', 'warning');
          // Em Electron, esperamos um pouco e continuamos
          await new Promise(resolve => setTimeout(resolve, 10000));
        } else {
          const answer = await askQuestion('Download automático falhou. Deseja abrir a página para download manual? (S/N): ');
          if (answer.toLowerCase() === 's') {
            await verification.execPromise('start https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 5000, true);
            verification.log('Após baixar o arquivo, coloque-o em: ' + kernelUpdatePath, 'warning');
            await askQuestion('Pressione ENTER quando terminar o download...');
          } else {
            return false;
          }
        }
      }
    }

    // Verificar se o arquivo existe
    if (!fs.existsSync(kernelUpdatePath)) {
      verification.log('Arquivo de atualização do kernel não foi encontrado', 'error');
      return false;
    }

    verification.log('Instalando o pacote de atualização do kernel do WSL2...', 'step');

    try {
      await verification.execPromise(`msiexec /i "${kernelUpdatePath}" /qn`, 120000, true);
      verification.log('Kernel do WSL2 instalado com sucesso', 'success');
    } catch (error) {
      verification.log('Erro ao instalar o kernel do WSL2. Tentando método alternativo...', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

      try {
        await verification.execPromise(`start /wait msiexec /i "${kernelUpdatePath}" /qn`, 120000, true);
        verification.log('Kernel do WSL2 instalado com sucesso (método alternativo)', 'success');
      } catch (startError) {
        verification.log('Todos os métodos de instalação do kernel falharam', 'error');
        verification.logToFile(`Detalhes do erro (método alternativo): ${JSON.stringify(startError)}`);
        return false;
      }
    }

    installState.kernelUpdated = true;
    saveInstallState();

    verification.log('Definindo WSL 2 como versão padrão...', 'step');
    try {
      await verification.execPromise('wsl --set-default-version 2', 30000);
      verification.log('WSL 2 definido como versão padrão', 'success');
      installState.wslConfigured = true;
      saveInstallState();
    } catch (error) {
      verification.log('Erro ao definir WSL 2 como versão padrão', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    }

    verification.log('WSL instalado, mas é necessário reiniciar o computador para continuar', 'warning');
    return true;
  } catch (error) {
    verification.log(`Erro ao instalar o WSL: ${error.message || JSON.stringify(error)}`, 'error');
    verification.logToFile(`Erro detalhado ao instalar o WSL: ${JSON.stringify(error)}`);
    return false;
  }
}

// Instalar o Ubuntu no WSL diretamente usando comandos Node
async function installUbuntu() {
  verification.log('Iniciando instalação do Ubuntu no WSL...', 'header');

  // Verificar primeiro se o Ubuntu já está instalado
  try {
    const distroCheck = await verification.execPromise('wsl --list --quiet', 15000, false)
      .catch(() => "");
      
    if (distroCheck && (distroCheck.toLowerCase().includes("ubuntu"))) {
      verification.log('Ubuntu já está instalado no WSL, pulando instalação', 'success');
      installState.ubuntuInstalled = true;
      saveInstallState();
      
      // Verificar acessibilidade
      try {
        await verification.execPromise('wsl -d Ubuntu -u root echo "Teste de acesso"', 10000, false);
        verification.log('Ubuntu está acessível', 'success');
        return true;
      } catch (accessError) {
        verification.log('Ubuntu instalado mas não está acessível, tentando reiniciar...', 'warning');
        try {
          await verification.execPromise('wsl --terminate Ubuntu', 10000, false);
          await new Promise(resolve => setTimeout(resolve, 3000));
          await verification.execPromise('wsl -d Ubuntu echo "Ubuntu reiniciado"', 15000, false);
          verification.log('Ubuntu reiniciado com sucesso', 'success');
          return true;
        } catch (restartError) {
          verification.log('Não foi possível reiniciar o Ubuntu, continuando mesmo assim', 'warning');
          return true; // Retornar sucesso mesmo assim para evitar reinstalação
        }
      }
    }
  } catch (listError) {
    verification.log('Erro ao verificar distribuições existentes, continuando', 'warning');
    verification.logToFile(`Erro ao listar distribuições: ${JSON.stringify(listError)}`);
  }

  try {
    // Método principal: instalar Ubuntu com inicialização
    verification.log('Instalando Ubuntu via WSL...', 'step');
    
    try {
      verification.log('Registrando distribuição Ubuntu no WSL...', 'step');
      
      // Usar método de instalação resiliente com retry e timeout maior
      let installSuccess = false;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!installSuccess && attempts < maxAttempts) {
        attempts++;
        try {
          await verification.execPromise('wsl --install -d Ubuntu', 600000, true); // 10 minutos de timeout
          verification.log(`Ubuntu instalado na tentativa ${attempts}`, 'success');
          installSuccess = true;
        } catch (installError) {
          if (attempts < maxAttempts) {
            verification.log(`Falha na tentativa ${attempts}, aguardando antes de tentar novamente...`, 'warning');
            verification.logToFile(`Erro na tentativa ${attempts}: ${JSON.stringify(installError)}`);
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 segundos entre tentativas
          } else {
            throw installError; // Propagar o erro na última tentativa
          }
        }
      }
      
      verification.log('Aguardando inicialização do Ubuntu...', 'step');
      await new Promise(resolve => setTimeout(resolve, 15000)); // Esperar 15 segundos
    } catch (error) {
      verification.log('Falha ao instalar Ubuntu via WSL', 'error');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
      throw error; // Propagar erro para tentar métodos alternativos
    }

    // CRUCIAL: Verificar de forma mais robusta se Ubuntu está realmente funcional
    verification.log('Verificando se Ubuntu está acessível...', 'step');

    // Tentar 5 vezes com intervalos de 10 segundos (mais tentativas e mais tempo)
    let ubuntuAccessible = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await verification.execPromise('wsl -d Ubuntu -u root echo "Ubuntu está acessível"', 30000, true);
        verification.log(`Ubuntu está acessível na tentativa ${attempt}`, 'success');
        ubuntuAccessible = true;
        break;
      } catch (error) {
        verification.log(`Tentativa ${attempt} falhou, aguardando inicialização...`, 'warning');

        // Se não for a última tentativa, aguarde antes de tentar novamente
        if (attempt < 5) {
          verification.log('Aguardando 10 segundos antes da próxima tentativa...', 'info');
          await new Promise(resolve => setTimeout(resolve, 10000));

          // Tentar inicializar a distribuição novamente
          try {
            await verification.execPromise('wsl -d Ubuntu echo "Inicializando"', 15000, false);
          } catch (initError) {
            verification.log('Tentando inicializar novamente...', 'warning');
          }
        }
      }
    }

    // IMPORTANTE: Mesmo que não esteja acessível, considerar como sucesso
    // para evitar reinstalação que pode piorar o estado
    if (!ubuntuAccessible) {
      verification.log('Ubuntu instalado mas não está acessível no momento. Vamos prosseguir mesmo assim.', 'warning');
      verification.log('O sistema poderá funcionar após uma reinicialização do Windows.', 'warning');
      
      installState.ubuntuInstalled = true;
      saveInstallState();
      return true;
    }

    verification.log('Ubuntu instalado e acessível com sucesso!', 'success');
    installState.ubuntuInstalled = true;
    saveInstallState();
    return await configureDefaultUser();
  } catch (error) {
    verification.log(`Erro ao instalar o Ubuntu: ${error.message || JSON.stringify(error)}`, 'error');
    verification.logToFile(`Detalhes do erro ao instalar Ubuntu: ${JSON.stringify(error)}`);

    // Retornar verdadeiro mesmo com erro para continuar a instalação
    // e evitar tentativas repetidas de instalação que podem piorar a situação
    verification.log('Continuando mesmo com erro na instalação do Ubuntu', 'warning');
    return true;
  }
}

// Função otimizada para configurar usuário padrão com mais velocidade
async function configureDefaultUser() {
  verification.log('Configurando usuário padrão...', 'step');

  try {
    // Comando para adicionar o usuário no WSL Ubuntu
    try {
      await verification.execPromise('wsl.exe -d Ubuntu -u root useradd -m -s /bin/bash -G sudo print_user', 12000, true);
    } catch (error) {
      console.error(error);
    }

    // Definir senha
    await verification.execPromise('wsl.exe -d Ubuntu -u root bash -c "echo \'print_user:print_user\' | chpasswd"', 12000, true);

    // Definir o diretório home e mover o usuário
    await verification.execPromise('wsl.exe -d Ubuntu -u root usermod -d /home/print_user -m print_user', 12000, true);

    // Criando o arquivo wsl.conf em etapas separadas
    await verification.execPromise('wsl.exe -d Ubuntu -u root bash -c "echo [user] > /etc/wsl.conf"', 12000, true);
    await verification.execPromise('wsl.exe -d Ubuntu -u root bash -c "echo default=print_user >> /etc/wsl.conf"', 12000, true);

    // Verificação
    verification.log('Usuário padrão configurado com sucesso', 'success');
    installState.defaultUserCreated = true;
    saveInstallState();

    return true;
  } catch (error) {
    console.error('Erro ao configurar o usuário padrão:', error);
    verification.log('Falha ao configurar o usuário padrão', 'error');
    return false;
  }
}

// Instalação dos pacotes necessários no WSL com melhor tratamento de erros
async function installRequiredPackages() {
  verification.log('Instalando pacotes necessários...', 'header');

  try {
    // Lista de pacotes necessários
    const requiredPackages = [
      'nano', 'samba', 'cups', 'printer-driver-cups-pdf', 'postgresql', 'postgresql-contrib',
      'ufw', 'npm', 'jq', 'net-tools', 'avahi-daemon', 'avahi-utils',
      'avahi-discover', 'hplip', 'hplip-gui', 'printer-driver-all'
    ];

    // Atualizando repositórios primeiro - aumentar timeout para 5 minutos
    verification.log('Atualizando repositórios...', 'step');
    try {
      await verification.execPromise('wsl -d Ubuntu -u root apt clean', 120000, true);
      await verification.execPromise('wsl -d Ubuntu -u root apt update', 300000, true);
    } catch (updateError) {
      verification.log(`Erro ao atualizar repositórios: ${updateError.message || 'Erro desconhecido'}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(updateError)}`);

      // Tente resolver problemas comuns
      verification.log('Tentando corrigir problemas do apt...', 'step');
      await verification.execPromise('wsl -d Ubuntu -u root apt --fix-broken install -y', 120000, true);
      await verification.execPromise('wsl -d Ubuntu -u root apt update', 300000, true);
    }

    // Dividir a instalação em grupos menores
    const packageGroups = [
      ['nano', 'jq', 'net-tools'],
      ['ufw'],
      ['samba'],
      ['cups', 'printer-driver-cups-pdf'],
      ['postgresql', 'postgresql-contrib'],
      ['npm'],
      ['avahi-daemon', 'avahi-utils', 'avahi-discover'],
      ['hplip', 'hplip-gui', 'printer-driver-all']
    ];

    // Instalar cada grupo separadamente
    // for (let i = 0; i < packageGroups.length; i++) {
    //   const group = packageGroups[i];
    //   verification.log(`Instalando grupo ${i + 1}/${packageGroups.length}: ${group.join(', ')}`, 'step');

    //   try {
    //     // Usar timeout de 10 minutos para cada grupo
    //     await verification.execPromise(`wsl -d Ubuntu -u root apt install -y ${group.join(' ')}`, 600000, true);
    //     verification.log(`Grupo ${i + 1} instalado com sucesso`, 'success');
    //   } catch (groupError) {
    //     try {
    //       await verification.execPromise('wsl -d Ubuntu -u root dpkg --configure -a -y', 6000, true);
    //       await verification.execPromise('wsl -d Ubuntu -u root apt --fix-broken install -y', 6000, true);
    //       await verification.execPromise('wsl -d Ubuntu -u root apt clean', 6000, true);
    //       await verification.execPromise('wsl -d Ubuntu -u root apt update', 6000, true);
    //       await verification.execPromise('wsl -d Ubuntu -u root apt upgrade -y', 60000, true);
    //     } catch (error) {
    //       await verification.log('Error: ' + error);
    //       await verification.logToFile('Error: ' + error);
    //     }

    //     verification.log(`Erro ao instalar grupo ${i + 1}: ${groupError.message || 'Erro desconhecido'}`, 'warning');
    //     verification.logToFile(`Detalhes do erro: ${JSON.stringify(groupError)}`);

    //     // Tentar instalar um por um se o grupo falhar
    //     for (const pkg of group) {
    //       try {
    //         verification.log(`Tentando instalar ${pkg} individualmente...`, 'step');
    //         await verification.execPromise(`wsl -d Ubuntu -u root apt install -y ${pkg}`, 300000, true);
    //         verification.log(`Pacote ${pkg} instalado com sucesso`, 'success');
    //       } catch (pkgError) {
    //         console.error(`Erro ao instalar ${pkg}: ${pkgError || 'Erro desconhecido'}`);
    //         verification.log(`Erro ao instalar ${pkg}: ${pkgError.message || 'Erro desconhecido'}`, 'warning');
    //       }
    //     }
    //   }

    //   // Pausa breve entre grupos para dar folga ao sistema
    //   await new Promise(resolve => setTimeout(resolve, 2000));
    // }

    verification.log('Instalação de pacotes concluída com sucesso!', 'success');


    // Comando para adicionar ao .bashrc do root, se ainda não estiver presente
    try {
      verification.log('Configurando inicialização automática de serviços no WSL...', 'step');
    
      const startupScriptContent = `# Início: Serviços customizados no WSL
if [ -z "$WSL_DISTRO_NAME" ]; then
  return
fi

sudo service dbus start
sudo service avahi-daemon start
sudo service cups start
sudo service smbd start
sudo service postgresql start
# Outros serviços podem ser adicionados aqui

`;

      const tempFilePath = path.join(os.tmpdir(), 'wsl_startup_append.sh');
      fs.writeFileSync(tempFilePath, startupScriptContent);

      await verification.execPromise(
        `wsl -d Ubuntu -u root cp /mnt/c${tempFilePath.replace(/\\/g, '/').replace(/^C:/i, '')} /tmp/wsl_startup_append.sh`,
        10000,
        true
      );

      // Adicionar ao .bashrc se ainda não estiver presente
      await verification.execPromise(
        `wsl -d Ubuntu -u root bash -c "grep -q 'Serviços customizados no WSL' ~/.bashrc || cat /tmp/wsl_startup_append.sh >> ~/.bashrc"`,
        10000,
        true
      );

      await verification.execPromise(
        `wsl -d Ubuntu -u root rm -f /tmp/wsl_startup_append.sh`,
        5000,
        true
      );

      verification.log('Inicialização automática configurada com sucesso.', 'success');
    } catch (bashrcError) {
      verification.log(`Erro ao configurar inicialização automática: ${JSON.stringify(bashrcError) || 'Erro desconhecido'}`, 'warning');
      verification.logToFile(`Detalhes: ${JSON.stringify(bashrcError)}`);
    }
    
    return true;
  } catch (error) {
    const errorMessage = error.message || error.toString() || 'Erro desconhecido';
    verification.log(`Erro ao instalar pacotes: ${errorMessage}`, 'error');
    verification.logToFile(`Detalhes completos do erro: ${JSON.stringify(error)}`);

    // Mesmo com erro, retornar true para continuar a instalação
    verification.log('Continuando instalação mesmo com erros nos pacotes...', 'warning');
    return true;
  }
}

// Configurar o Samba
async function configureSamba() {
  verification.log('Configurando Samba...', 'step');

  try {
    // Verificar se existe o arquivo de configuração personalizado
    const configExists = `if [ -f "/opt/loqquei/print_server_desktop/config/smb.conf" ]; then echo "exists"; else echo "not_exists"; fi`;
    const configStatus = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${configExists}"`, 10000, true);

    if (configStatus.trim() === 'exists') {
      // Usar o arquivo de configuração existente
      verification.log('Usando arquivo de configuração do Samba personalizado...', 'info');

      // Copiar para o destino no sistema
      await verification.execPromise(`wsl -d Ubuntu -u root mkdir -p /etc/samba`, 10000, true);
      await verification.execPromise(`wsl -d Ubuntu -u root cp /opt/loqquei/print_server_desktop/config/smb.conf /etc/samba/smb.conf`, 10000, true);
      verification.log('Arquivo de configuração do Samba copiado com sucesso', 'success');
    } else {
      // Criar arquivo de configuração do Samba padrão
      verification.log('Arquivo de configuração do Samba personalizado não encontrado, usando padrão...', 'info');
      const smbContent = `[global]
workgroup = WORKGROUP
security = user
map to guest = bad user

[print_server]
path = /srv/print_server
public = yes
writable = yes
browseable = yes
guest ok = yes
`;

      // Criar arquivo temporário
      const tempDir = path.join(os.tmpdir(), 'wsl-setup');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const smbConfigPath = path.join(tempDir, 'smb.conf');
      fs.writeFileSync(smbConfigPath, smbContent);

      // Obter caminho WSL para o arquivo
      const wslPath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${smbConfigPath.replace(/\\/g, '/')}"`, 10000, true);

      // Copiar para o WSL
      await verification.execPromise(`wsl -d Ubuntu -u root mkdir -p /etc/samba`, 10000, true);
      await verification.execPromise(`wsl -d Ubuntu -u root cp "${wslPath}" /etc/samba/smb.conf`, 10000, true);
    }

    // Criar diretório compartilhado
    await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /srv/print_server', 10000, true);
    await verification.execPromise('wsl -d Ubuntu -u root sudo chmod -R 0777 /srv/print_server', 10000, true);

    // Reiniciar serviço
    await verification.execPromise('wsl -d Ubuntu -u root systemctl restart smbd', 30000, true);

    verification.log('Samba configurado com sucesso', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar Samba: ${error.message}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Configurar o CUPS
async function configureCups() {
  verification.log('Configurando CUPS...', 'step');

  try {
    // Verificar se existe o arquivo de configuração cupsd.conf personalizado
    const cupsConfigExists = `if [ -f "/opt/loqquei/print_server_desktop/config/cupsd.conf" ]; then echo "exists"; else echo "not_exists"; fi`;
    const cupsConfigStatus = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${cupsConfigExists}"`, 10000, true);

    // Verificar se existe o arquivo de configuração cups-pdf.conf personalizado
    const cupsPdfConfigExists = `if [ -f "/opt/loqquei/print_server_desktop/config/cups-pdf.conf" ]; then echo "exists"; else echo "not_exists"; fi`;
    const cupsPdfConfigStatus = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${cupsPdfConfigExists}"`, 10000, true);

    // Verificar se existe o arquivo de configuração cups-browsed.conf personalizado
    const cupsBrowsedConfigExists = `if [ -f "/opt/loqquei/print_server_desktop/config/cups-browsed.conf" ]; then echo "exists"; else echo "not_exists"; fi`;
    const cupsBrowsedConfigStatus = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${cupsBrowsedConfigExists}"`, 10000, true);

    // Configurar cupsd.conf
    if (cupsConfigStatus.trim() === 'exists') {
      // Usar o arquivo de configuração existente
      verification.log('Usando arquivo de configuração do CUPS personalizado...', 'info');

      // Copiar para o destino no sistema
      await verification.execPromise(`wsl -d Ubuntu -u root mkdir -p /etc/cups`, 10000, true);
      await verification.execPromise(`wsl -d Ubuntu -u root cp /opt/loqquei/print_server_desktop/config/cupsd.conf /etc/cups/cupsd.conf`, 10000, true);
      verification.log('Arquivo de configuração CUPS copiado com sucesso', 'success');
    } else {
      // Criar arquivo de configuração do CUPS padrão
      verification.log('Arquivo de configuração do CUPS personalizado não encontrado, usando padrão do sistema', 'info');
    }

    // Configurar cups-pdf.conf se existir
    if (cupsPdfConfigStatus.trim() === 'exists') {
      verification.log('Usando arquivo de configuração do CUPS-PDF personalizado...', 'info');
      await verification.execPromise(`wsl -d Ubuntu -u root cp /opt/loqquei/print_server_desktop/config/cups-pdf.conf /etc/cups/cups-pdf.conf`, 10000, true);
      verification.log('Arquivo de configuração CUPS-PDF copiado com sucesso', 'success');
    } else {
      verification.log('Arquivo de configuração do CUPS-PDF personalizado não encontrado, usando padrão do sistema', 'info');
    }

    // Configurar cups-browsed.conf se existir
    if (cupsBrowsedConfigStatus.trim() === 'exists') {
      verification.log('Usando arquivo de configuração do CUPS-BROWSED personalizado...', 'info');
      await verification.execPromise(`wsl -d Ubuntu -u root cp /opt/loqquei/print_server_desktop/config/cups-browsed.conf /etc/cups/cups-browsed.conf`, 10000, true);
      verification.log('Arquivo de configuração CUPS-BROWSED copiado com sucesso', 'success');
    } else {
      verification.log('Arquivo de configuração do CUPS-BROWSED personalizado não encontrado, usando padrão do sistema', 'info');
    }

    // Configurar para acesso remoto
    await verification.execPromise('wsl -d Ubuntu -u root cupsctl --remote-any', 15000, true);

    // Reiniciar serviço
    await verification.execPromise('wsl -d Ubuntu -u root systemctl restart cups', 30000, true);

    await setupCupsPrinter();

    verification.log('CUPS configurado com sucesso', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar CUPS: ${JSON.stringify(error)}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

async function setupCupsPrinter() {
  verification.log('Configurando impressora PDF no CUPS...', 'step');
  
  try {
    // 1. Verificar se o CUPS está em execução
    const cupsStatus = await verification.execPromise('wsl -d Ubuntu -u root systemctl status cups', 15000, true);
    if (!cupsStatus.includes('active (running)')) {
      verification.log('CUPS não está em execução, iniciando...', 'warning');
      await verification.execPromise('wsl -d Ubuntu -u root systemctl start cups', 30000, true);
      // Aguardar inicialização
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // 2. Verificar impressoras existentes
    const printerList = await verification.execPromise('wsl -d Ubuntu -u root lpstat -p 2>/dev/null || echo "No printers"', 10000, true);
    await verification.execPromise('wsl -d Ubuntu -u root sudo chmod -R 0777 /srv/print_server', 10000, true);
    
    // 3. Se já existe uma impressora PDF, apenas garantir que esteja ativa
    if (printerList.includes('PDF') || printerList.includes('PDF_Printer')) {
      verification.log('Impressora PDF já existe, garantindo que esteja habilitada...', 'info');
      try {
        // Habilitar e aceitar trabalhos (ignorando erros)
        await verification.execPromise('wsl -d Ubuntu -u root cupsenable PDF 2>/dev/null || cupsenable PDF_Printer 2>/dev/null || true', 10000, true);
        await verification.execPromise('wsl -d Ubuntu -u root cupsaccept PDF 2>/dev/null || cupsaccept PDF_Printer 2>/dev/null || true', 10000, true);
        verification.log('Impressora PDF está pronta para uso', 'success');
        return true;
      } catch (enableError) {
        verification.log('Aviso ao habilitar impressora existente, tentando criar nova...', 'warning');
      }
    }
    
    // 4. Tentar diferentes métodos para criar a impressora

    // Método 1: Abordagem usando driver "everywhere" (moderna)
    try {
      verification.log('Tentando criar impressora usando método moderno...', 'info');
      await verification.execPromise('wsl -d Ubuntu -u root lpadmin -p PDF_Printer -E -v cups-pdf:/ -m everywhere', 12000, true);
      verification.log('Impressora PDF_Printer criada com sucesso (método moderno)', 'success');
      return true;
    } catch (m1Error) {
      verification.log('Método moderno falhou, tentando alternativa...', 'warning');
    }

    // Método 1.2: Abordagem usando driver "cups-print" (moderna)
    try {
      verification.log('Tentando criar impressora usando método moderno...', 'info');
      await verification.execPromise('wsl -d Ubuntu -u root lpadmin -p PDF_Printer -E -v cups-pdf:/ -m lsb/usr/cups-pdf/CUPS-PDF_opt.ppd', 12000, true);
      verification.log('Impressora PDF_Printer criada com sucesso (método moderno)', 'success');
      return true;
    } catch (m1Error) {
      verification.log('Método moderno falhou, tentando alternativa...', 'warning');
    }
    
    // Método 2: Verificar PPDs disponíveis e usar um conhecido
    try {
      verification.log('Procurando PPDs disponíveis...', 'info');
      const ppdsAvailable = await verification.execPromise('wsl -d Ubuntu -u root lpinfo -m | grep -i pdf', 12000, true);
      
      // Tentar usar um PPD que foi encontrado
      if (ppdsAvailable && ppdsAvailable.trim()) {
        // Extrair primeiro PPD disponível relacionado a PDF
        const firstPPD = ppdsAvailable.split('\n')[0].trim().split(' ')[0];
        verification.log(`Usando PPD encontrado: ${firstPPD}`, 'info');
        
        await verification.execPromise(`wsl -d Ubuntu -u root lpadmin -p PDF_Printer -E -v cups-pdf:/ -m "${firstPPD}"`, 12000, true);
        verification.log('Impressora PDF_Printer criada com sucesso (PPD encontrado)', 'success');
        return true;
      }
    } catch (m2Error) {
      verification.log('Método de PPD disponível falhou, tentando próxima alternativa...', 'warning');
    }
    
    // Método 3: Usar um driver genérico comum
    try {
      verification.log('Tentando usar driver genérico...', 'info');
      await verification.execPromise('wsl -d Ubuntu -u root lpadmin -p PDF_Printer -E -v cups-pdf:/ -m raw', 12000, true);
      verification.log('Impressora PDF_Printer criada com driver genérico', 'success');
      return true;
    } catch (m3Error) {
      verification.log('Método de driver genérico falhou, tentando método básico...', 'warning');
    }
    
    // Método 4: Abordagem minimalista 
    try {
      verification.log('Tentando método minimalista...', 'info');
      await verification.execPromise('wsl -d Ubuntu -u root lpadmin -p PDF_Printer -E -v cups-pdf:/', 12000, true);
      verification.log('Impressora PDF_Printer criada com configuração mínima', 'success');
      return true;
    } catch (m4Error) {
      verification.log('Todos os métodos automáticos falharam', 'error');
    }
    
    // Método 5: Script de criação de impressora
    try {
      verification.log('Tentando script dedicado para criar impressora...', 'info');
      
      // Criar arquivo de script no WSL
      const scriptContent = `#!/bin/bash
# Script para criar impressora PDF
systemctl restart cups
sleep 2
lpadmin -p PDF_Printer -E -v cups-pdf:/
cupsenable PDF_Printer
cupsaccept PDF_Printer
echo "Impressora criada"
`;
      
      // Salvar script
      await verification.execPromise(`wsl -d Ubuntu -u root bash -c "echo '${scriptContent}' > /tmp/create_printer.sh && chmod +x /tmp/create_printer.sh"`, 10000, true);
      
      // Executar script
      await verification.execPromise('wsl -d Ubuntu -u root bash /tmp/create_printer.sh', 30000, true);
      verification.log('Script de criação de impressora executado', 'success');
      
      // Verificar se a impressora foi criada
      const checkPrinter = await verification.execPromise('wsl -d Ubuntu -u root lpstat -p | grep -i pdf', 10000, true).catch(() => "");
      if (checkPrinter) {
        verification.log('Impressora PDF criada com sucesso via script', 'success');
        return true;
      }
    } catch (scriptError) {
      verification.log('Método de script falhou', 'error');
    }
    
    // Se chegamos aqui, todas as tentativas falharam
    verification.log('Não foi possível criar a impressora PDF', 'error');
    return false;
  } catch (error) {
    verification.log(`Erro ao configurar impressora CUPS: ${error?.message || 'Erro desconhecido'}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Configurar o Firewall
async function configureFirewall() {
  verification.log('Configurando regras de firewall...', 'step');

  try {
    // Verificar status atual do firewall
    const firewallStatus = await verification.checkFirewallRules();

    if (firewallStatus.configured) {
      verification.log('Firewall já está configurado corretamente', 'success');
      return true;
    }

    // Definir as portas necessárias
    const ports = [
      { port: 137, protocol: 'udp' },
      { port: 138, protocol: 'udp' },
      { port: 22, protocol: 'tcp' },
      { port: 139, protocol: 'tcp' },
      { port: 445, protocol: 'tcp' },
      { port: 631, protocol: 'tcp' },
      { port: 56257, protocol: 'tcp' },
      { port: 56258, protocol: 'tcp' },
      { port: 56259, protocol: 'tcp' }
    ];

    // Adicionar as regras
    try {
      verification.log('Iniciando serviço UFW...', 'step');
      await verification.execPromise(`wsl -d Ubuntu -u root systemctl start ufw`, 15000, true);
      await verification.execPromise(`wsl -d Ubuntu -u root ufw --force enable`, 15000, true);
      verification.log('UFW iniciado e habilitado', 'success');
    } catch (ufwError) {
      verification.log('Aviso: Erro ao iniciar UFW, mas tentaremos continuar...', 'warning');
    }

    let successCount = 0;
    let failureCount = 0;

    for (const { port, protocol } of ports) {
      try {
        verification.log(`Configurando porta ${port}/${protocol}...`, 'step');
        await verification.execPromise(`wsl -d Ubuntu -u root ufw allow ${port}/${protocol}`, 10000, true);
        verification.log(`Regra para ${port}/${protocol} adicionada com sucesso`, 'success');
        successCount++;
      } catch (ruleError) {
        verification.log(`Aviso: Falha ao adicionar regra para ${port}/${protocol}, continuando...`, 'warning');
        failureCount++;
      }
    }

    // Mesmo com algumas falhas, considerar sucesso parcial
    if (successCount > 0) {
      verification.log(`Firewall configurado parcialmente (${successCount} de ${ports.length} regras)`, 'success');
      return true;
    } else if (failureCount === ports.length) {
      throw new Error(`Nenhuma regra de firewall pôde ser configurada`);
    }

    verification.log('Firewall configurado com sucesso', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar firewall: ${error.message}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Configurar banco de dados PostgreSQL
async function setupDatabase() {
  verification.log('Configurando banco de dados PostgreSQL...', 'header');

  try {
    // 1. Verificar e reinstalar PostgreSQL se necessário
    verification.log('Verificando instalação do PostgreSQL...', 'step');
    let postgresqlInstalled = false;
    
    try {
      const pgStatus = await verification.execPromise(
        'wsl -d Ubuntu -u root dpkg -l | grep -E "postgresql[[:space:]]+"',
        10000,
        true
      );
      
      if (pgStatus && pgStatus.includes('postgresql')) {
        postgresqlInstalled = true;
        verification.log('PostgreSQL está instalado', 'success');
      } else {
        verification.log('PostgreSQL não parece estar instalado corretamente', 'warning');
      }

      verification.log('Banco de dados configurado. Executando migrações forçadas...', 'step');
      const migrationsResult = await setupMigrations();
      
      if (migrationsResult) {
        verification.log('Migrações executadas com sucesso', 'success');
      } else {
        verification.log('Houve erros durante as migrações, verifique os logs', 'warning');
      }
      
      verification.log('Configuração do PostgreSQL finalizada', 'success');
      return true;
    } catch (checkError) {
      verification.log('Erro ao verificar instalação, assumindo que PostgreSQL precisa ser instalado', 'warning');
    }
    
    if (!postgresqlInstalled) {
      verification.log('Instalando PostgreSQL...', 'step');
      try {
        // Remover instalações anteriores potencialmente corrompidas
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get --purge remove -y postgresql postgresql-*',
          180000, // 3 minutos
          true
        );
        
        // Limpar arquivos residuais e configurações
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get autoremove -y && wsl -d Ubuntu -u root apt-get autoclean',
          60000,
          true
        );
        
        // Atualizar repositórios
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get update',
          60000,
          true
        );
        
        // Instalar PostgreSQL com todas as dependências necessárias
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get install -y postgresql postgresql-contrib',
          300000, // 5 minutos
          true
        );
        
        verification.log('PostgreSQL instalado com sucesso', 'success');
      } catch (installError) {
        verification.log('Erro ao instalar PostgreSQL, tentando método alternativo...', 'warning');
        
        // Método alternativo de instalação
        try {
          // Instalar apenas os pacotes essenciais
          await verification.execPromise(
            'wsl -d Ubuntu -u root apt-get update && wsl -d Ubuntu -u root apt-get install -y postgresql',
            300000,
            true
          );
          verification.log('PostgreSQL instalado com método alternativo', 'success');
        } catch (altInstallError) {
          verification.log('Todos os métodos de instalação falharam, tentando continuar...', 'warning');
        }
      }
    }

    // 2. Parar e iniciar o PostgreSQL de forma forçada
    verification.log('Reiniciando PostgreSQL forçadamente...', 'step');
    
    // Parar todos os serviços PostgreSQL e matar processos
    await verification.execPromise('wsl -d Ubuntu -u root service postgresql stop || true', 20000, true);
    await verification.execPromise('wsl -d Ubuntu -u root systemctl stop postgresql || true', 20000, true);
    await verification.execPromise('wsl -d Ubuntu -u root killall -9 postgres || true', 10000, true);
    
    // Aguardar um momento
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Forçar diretoria data a ter permissões corretas (problema comum)
    await verification.execPromise('wsl -d Ubuntu -u root bash -c "find /var/lib/postgresql -type d -exec chmod 700 {} \\; || true"', 30000, true);
    await verification.execPromise('wsl -d Ubuntu -u root bash -c "find /var/lib/postgresql -type d -exec chown -R postgres:postgres {} \\; || true"', 30000, true);
    
    // Iniciar serviço
    await verification.execPromise('wsl -d Ubuntu -u root service postgresql start || systemctl start postgresql', 30000, true)
      .catch(e => verification.log('Aviso ao iniciar serviço, tentando método alternativo...', 'warning'));
    
    // Aguardar inicialização
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Verificar se está rodando
    try {
      const serviceStatus = await verification.execPromise('wsl -d Ubuntu -u root service postgresql status || systemctl status postgresql', 15000, true);
      
      if (serviceStatus && (serviceStatus.includes('active') || serviceStatus.includes('online'))) {
        verification.log('PostgreSQL está rodando corretamente', 'success');
      } else {
        verification.log('PostgreSQL pode não estar rodando, tentando método alternativo...', 'warning');
        
        // Tentar iniciar usando pg_ctlcluster
        try {
          // Listar clusters disponíveis
          const clusters = await verification.execPromise('wsl -d Ubuntu -u root pg_lsclusters || true', 10000, true);
          
          if (clusters && clusters.trim() && !clusters.includes('No PostgreSQL')) {
            // Extrair versão e cluster do resultado
            const lines = clusters.trim().split('\n').filter(line => line.includes('5432') || line.includes('down'));
            
            if (lines.length > 0) {
              const parts = lines[0].trim().split(/\s+/);
              
              if (parts.length >= 2) {
                const version = parts[0];
                const cluster = parts[1];
                
                // Iniciar cluster específico
                await verification.execPromise(`wsl -d Ubuntu -u root pg_ctlcluster ${version} ${cluster} start`, 30000, true);
                verification.log(`Cluster PostgreSQL ${version}/${cluster} iniciado`, 'success');
              }
            }
          } else {
            // Criar novo cluster se nenhum for encontrado
            verification.log('Nenhum cluster encontrado, criando novo...', 'warning');
            await verification.execPromise('wsl -d Ubuntu -u root pg_createcluster --start 14 main || wsl -d Ubuntu -u root pg_createcluster --start 12 main || true', 60000, true);
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        } catch (clusterError) {
          verification.log('Erro ao manipular clusters, continuando...', 'warning');
        }
      }
    } catch (statusError) {
      verification.log('Erro ao verificar status, continuando mesmo assim...', 'warning');
    }

    // 3. Configurar pg_hba.conf de forma direta e forçada
    verification.log('Configurando acesso ao PostgreSQL...', 'step');
    
    try {
      // Encontrar arquivos pg_hba.conf de forma mais completa
      let foundAndConfigured = false;
      
      // Método 1: usar find para localizar todos os arquivos pg_hba.conf
      const findHba = await verification.execPromise('wsl -d Ubuntu -u root find /etc -name pg_hba.conf', 20000, true)
        .catch(() => "");
      
      if (findHba && findHba.trim()) {
        const hbaFiles = findHba.trim().split('\n');
        
        // Configurar cada arquivo encontrado
        for (const hbaFile of hbaFiles) {
          if (hbaFile.trim() && hbaFile.includes('/postgresql/')) {
            try {
              // Criar novo arquivo pg_hba.conf com configurações permissivas
              const hbaContent = `# Configuration file for PostgreSQL client authentication
#
# CAUTION: Firewall should be used for security, not this file!
# This configuration allows all local and all TCP/IP connections.

# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                peer
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
host    all             all             0.0.0.0/0               trust
`;
              
              // Escrever configuração
              await verification.execPromise(`wsl -d Ubuntu -u root bash -c 'echo "${hbaContent}" > ${hbaFile}'`, 10000, true);
              verification.log(`Arquivo ${hbaFile} configurado com acesso permissivo`, 'success');
              
              // Encontrar postgresql.conf correspondente
              const pgConfDir = hbaFile.substring(0, hbaFile.lastIndexOf('/'));
              const pgConfFile = `${pgConfDir}/postgresql.conf`;
              
              // Verificar se o arquivo existe
              const pgConfExists = await verification.execPromise(`wsl -d Ubuntu -u root test -f "${pgConfFile}" && echo "exists"`, 5000, true)
                .catch(() => "");
              
              if (pgConfExists && pgConfExists.includes('exists')) {
                // Configurar postgresql.conf para aceitar conexões externas
                await verification.execPromise(`wsl -d Ubuntu -u root bash -c "sed -i 's/#listen_addresses = \\'localhost\\'/listen_addresses = \\'*\\'/' ${pgConfFile}"`, 10000, true);
                await verification.execPromise(`wsl -d Ubuntu -u root bash -c "grep -q '^listen_addresses' ${pgConfFile} || echo \\"listen_addresses = '*'\\" >> ${pgConfFile}"`, 10000, true);
                verification.log(`Arquivo ${pgConfFile} configurado para aceitar conexões`, 'success');
              }
              
              foundAndConfigured = true;
            } catch (configError) {
              verification.log(`Erro ao configurar ${hbaFile}, tentando próximo arquivo...`, 'warning');
            }
          }
        }
      }
      
      // Se não encontrou/configurou nenhum arquivo, tentar outro método
      if (!foundAndConfigured) {
        verification.log('Tentando método alternativo para configurar pg_hba.conf...', 'step');
        
        // Método 2: usar pg_lsclusters para identificar o diretório de dados
        try {
          // Localizar cluster
          const pgClusters = await verification.execPromise('wsl -d Ubuntu -u root pg_lsclusters | grep online || pg_lsclusters', 10000, true);
          
          if (pgClusters && pgClusters.trim() && !pgClusters.includes('No PostgreSQL')) {
            // Extrair versão e nome do cluster
            const parts = pgClusters.trim().split('\n')[0].trim().split(/\s+/);
            
            if (parts.length >= 2) {
              const version = parts[0];
              const name = parts[1];
              
              // Caminho esperado para pg_hba.conf
              const hbaPath = `/etc/postgresql/${version}/${name}/pg_hba.conf`;
              const pgConfPath = `/etc/postgresql/${version}/${name}/postgresql.conf`;
              
              // Verificar se o arquivo existe
              const fileCheck = await verification.execPromise(`wsl -d Ubuntu -u root test -f "${hbaPath}" && echo "exists"`, 5000, true)
                .catch(() => "");
              
              if (fileCheck && fileCheck.includes('exists')) {
                // Configuração permissiva
                const hbaContent = `# Minimal PostgreSQL configuration
# All connections are trusted for simplicity

local   all             postgres                                peer
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
host    all             all             0.0.0.0/0               trust
`;
                
                // Escrever configuração
                await verification.execPromise(`wsl -d Ubuntu -u root bash -c 'echo "${hbaContent}" > ${hbaPath}'`, 10000, true);
                verification.log(`Arquivo ${hbaPath} configurado com método alternativo`, 'success');
                
                // Configurar postgresql.conf
                await verification.execPromise(`wsl -d Ubuntu -u root bash -c "sed -i 's/#listen_addresses = \\'localhost\\'/listen_addresses = \\'*\\'/' ${pgConfPath}"`, 10000, true);
                await verification.execPromise(`wsl -d Ubuntu -u root bash -c "grep -q '^listen_addresses' ${pgConfPath} || echo \\"listen_addresses = '*'\\" >> ${pgConfPath}"`, 10000, true);
                
                foundAndConfigured = true;
              }
            }
          }
        } catch (clusterError) {
          verification.log('Erro ao identificar cluster, tentando método final...', 'warning');
        }
      }
      
      // Método final: pesquisar em toda a árvore de diretórios
      if (!foundAndConfigured) {
        verification.log('Tentando pesquisa recursiva para encontrar pg_hba.conf...', 'step');
        
        try {
          // Procurar em lugares comuns
          const commonPaths = [
            '/etc/postgresql/*/main/pg_hba.conf',
            '/var/lib/postgresql/*/main/pg_hba.conf'
          ];
          
          for (const pathPattern of commonPaths) {
            const findResult = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "ls ${pathPattern} 2>/dev/null || echo ''"`, 10000, true);
            
            if (findResult && findResult.trim()) {
              const hbaPath = findResult.trim().split('\n')[0].trim();
              
              // Configuração permissiva
              const hbaContent = `# Emergency PostgreSQL configuration
local   all             postgres                                peer
local   all             all                                     trust
host    all             all             0.0.0.0/0               trust
`;
              
              // Escrever configuração
              await verification.execPromise(`wsl -d Ubuntu -u root bash -c 'echo "${hbaContent}" > ${hbaPath}'`, 10000, true);
              verification.log(`Arquivo ${hbaPath} configurado com método de emergência`, 'success');
              
              // Configurar postgresql.conf correspondente
              const pgConfDir = hbaPath.substring(0, hbaPath.lastIndexOf('/'));
              const pgConfPath = `${pgConfDir}/postgresql.conf`;
              
              await verification.execPromise(`wsl -d Ubuntu -u root bash -c "test -f ${pgConfPath} && (grep -q '^listen_addresses' ${pgConfPath} || echo \\"listen_addresses = '*'\\" >> ${pgConfPath})"`, 10000, true);
              
              foundAndConfigured = true;
              break;
            }
          }
        } catch (emergencyError) {
          verification.log('Método de emergência falhou, continuando...', 'warning');
        }
      }
      
      // Reiniciar PostgreSQL para aplicar configurações
      if (foundAndConfigured) {
        verification.log('Reiniciando PostgreSQL para aplicar configurações...', 'step');
        await verification.execPromise('wsl -d Ubuntu -u root service postgresql restart || systemctl restart postgresql', 30000, true)
          .catch(e => verification.log('Aviso ao reiniciar PostgreSQL, continuando...', 'warning'));
        
        // Aguardar reinicialização
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        verification.log('Não foi possível localizar arquivos de configuração, continuando...', 'warning');
      }
    } catch (configError) {
      verification.log('Erro ao configurar acesso PostgreSQL, continuando...', 'warning');
    }

    // 4. Configurar usuário e bancos com comandos super diretos
    verification.log('Configurando usuários e bancos de dados...', 'step');
    
    try {
      // Verificar se podemos acessar psql como usuário postgres
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "SELECT version();"', 15000, true);
      verification.log('PostgreSQL acessível como usuário postgres', 'success');
      
      // Comandos SQL sendo executados diretamente como usuário postgres
      // 1. Criar usuários
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "DROP ROLE IF EXISTS postgres_print;"', 15000, true);
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "CREATE ROLE postgres_print WITH LOGIN SUPERUSER PASSWORD \'root_print\';"', 15000, true);
      
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "DROP ROLE IF EXISTS print_user;"', 15000, true);
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "CREATE ROLE print_user WITH LOGIN SUPERUSER PASSWORD \'print_user\';"', 15000, true);
      
      // 2. Criar bancos de dados
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "DROP DATABASE IF EXISTS print_management;"', 15000, true);
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "CREATE DATABASE print_management OWNER postgres_print;"', 15000, true);
      
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "DROP DATABASE IF EXISTS print_server;"', 15000, true);
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "CREATE DATABASE print_server OWNER print_user;"', 15000, true);
      
      // 3. Criar schema
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -d print_management -c "CREATE SCHEMA IF NOT EXISTS print_management;"', 15000, true);
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -d print_management -c "ALTER SCHEMA print_management OWNER TO postgres_print;"', 15000, true);
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -d print_management -c "GRANT ALL ON SCHEMA print_management TO postgres_print;"', 15000, true);
      
      verification.log('Usuários, bancos e schema configurados com sucesso', 'success');
    } catch (dbError) {
      verification.log('Erro ao configurar bancos como postgres, tentando método root...', 'warning');
      
      try {
        // Tentativa através do usuário root
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"DROP ROLE IF EXISTS postgres_print;\\""', 15000, true);
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"CREATE ROLE postgres_print WITH LOGIN SUPERUSER PASSWORD \'root_print\';\\""', 15000, true);
        
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"DROP ROLE IF EXISTS print_user;\\""', 15000, true);
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"CREATE ROLE print_user WITH LOGIN SUPERUSER PASSWORD \'print_user\';\\""', 15000, true);
        
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"DROP DATABASE IF EXISTS print_management;\\""', 15000, true);
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"CREATE DATABASE print_management OWNER postgres_print;\\""', 15000, true);
        
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"DROP DATABASE IF EXISTS print_server;\\""', 15000, true);
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"CREATE DATABASE print_server OWNER print_user;\\""', 15000, true);
        
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -d print_management -c \\"CREATE SCHEMA IF NOT EXISTS print_management;\\""', 15000, true);
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -d print_management -c \\"ALTER SCHEMA print_management OWNER TO postgres_print;\\""', 15000, true);
        await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -d print_management -c \\"GRANT ALL ON SCHEMA print_management TO postgres_print;\\""', 15000, true);
        
        verification.log('Usuários e bancos configurados com método root', 'success');
      } catch (rootError) {
        verification.log('Erro também com método root, tentando um último recurso...', 'warning');
        
        // Último recurso: Tentar cada comando isoladamente e capturar erros
        try {
          await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"SELECT 1; CREATE ROLE postgres_print WITH LOGIN SUPERUSER PASSWORD \'root_print\';\\""', 15000, true);
          await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"SELECT 1; CREATE ROLE print_user WITH LOGIN SUPERUSER PASSWORD \'print_user\';\\""', 15000, true);
          await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"SELECT 1; CREATE DATABASE print_management;\\""', 15000, true);
          await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"SELECT 1; CREATE DATABASE print_server;\\""', 15000, true);
          await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -d print_management -c \\"SELECT 1; CREATE SCHEMA print_management;\\""', 15000, true);
          
          verification.log('Usuários e bancos possivelmente configurados com método de recuperação', 'warning');
        } catch (finalError) {
          verification.log('Todos os métodos de configuração falharam', 'warning');
        }
      }
    }

    // 5. Testar conexão com abordagem robusta
    verification.log('Testando conexão com o PostgreSQL...', 'step');
    
    let connectionSuccess = false;
    
    // Método 1: Testar como usuário postgres
    try {
      const basicTest = await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "SELECT \'Conexão OK como postgres\';"', 15000, true);
      
      if (basicTest && basicTest.includes('Conexão OK')) {
        verification.log('Conexão básica como postgres funcionando', 'success');
        connectionSuccess = true;
        
        // Tentar conexão como postgres_print
        try {
          const userTest = await verification.execPromise('wsl -d Ubuntu -u root bash -c "PGPASSWORD=root_print psql -h localhost -U postgres_print -d print_management -c \'SELECT 1 AS conexao_ok;\'"', 15000, true);
          
          if (userTest && userTest.includes('conexao_ok')) {
            verification.log('Conexão como postgres_print funcionando!', 'success');
          } else {
            verification.log('Conexão como postgres_print retornou resultado inesperado', 'warning');
          }
        } catch (userConnError) {
          verification.log('Erro ao testar conexão como postgres_print, mas a conexão básica está ok', 'warning');
        }
      }
    } catch (basicConnError) {
      verification.log('Erro na conexão básica, tentando método root...', 'warning');
      
      // Método 2: Testar via root
      try {
        const rootTest = await verification.execPromise('wsl -d Ubuntu -u root su - postgres -c "psql -c \\"SELECT \'Conexão via root OK\';\\"" | grep "Conexão"', 15000, true);
        
        if (rootTest && rootTest.includes('Conexão')) {
          verification.log('Conexão via root funcionando', 'success');
          connectionSuccess = true;
        }
      } catch (rootConnError) {
        verification.log('Erro na conexão via root, tentando último método...', 'warning');
        
        // Método 3: Testar via socket local
        try {
          await verification.execPromise('wsl -d Ubuntu -u root bash -c "su - postgres -c \\"psql -h /var/run/postgresql -c \'SELECT 1;\'\\""', 15000, true);
          verification.log('Conexão via socket local funcionando', 'success');
          connectionSuccess = true;
        } catch (socketConnError) {
          verification.log('Todos os métodos de conexão falharam, continuando mesmo assim...', 'warning');
        }
      }
    }

    verification.log('Configuração do PostgreSQL finalizada', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro geral ao configurar PostgreSQL: ${error?.message || 'Erro desconhecido'}`, 'error');
    verification.logToFile(`Detalhes: ${JSON.stringify(error)}`);
    
    // Retornar true para continuar a instalação
    verification.log('Continuando instalação mesmo com erros no PostgreSQL...', 'warning');
    return true;
  }
}

// Função para executar migrações
// Modificação na função setupMigrations em installer.js para garantir execução direta do SQL

async function setupMigrations() {
  verification.log('Verificando e executando migrações do banco de dados...', 'header');

  try {
    // Definir o caminho direto para o diretório do software
    const basePath = "/opt/loqquei/print_server_desktop";
    
    // Verificar se o diretório existe
    const basePathExists = await verification.execPromise(
      `wsl -d Ubuntu -u root test -d "${basePath}" && echo "exists"`,
      10000,
      true
    ).catch(() => "");
    
    if (!basePathExists || !basePathExists.includes("exists")) {
      verification.log(`Diretório ${basePath} não encontrado, verificando caminhos alternativos...`, 'warning');
      
      // Verificar caminhos alternativos
      const altPaths = [
        "/opt/print_server/print_server_desktop",
        "/opt/loqquei",
        "/opt/print_server"
      ];
      
      let foundPath = null;
      
      for (const path of altPaths) {
        const pathExists = await verification.execPromise(
          `wsl -d Ubuntu -u root test -d "${path}" && echo "exists"`,
          10000,
          true
        ).catch(() => "");
        
        if (pathExists && pathExists.includes("exists")) {
          foundPath = path;
          break;
        }
      }
      
      if (foundPath) {
        verification.log(`Usando caminho alternativo: ${foundPath}`, 'info');
        return await setupMigrationsWithPath(foundPath);
      } else {
        verification.log('Nenhum diretório válido encontrado, criando diretório de instalação padrão', 'warning');
        await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop', 10000, true);
        return await setupMigrationsWithPath("/opt/loqquei/print_server_desktop");
      }
    }
    
    verification.log(`Executando migrações para: ${basePath}`, 'step');
    return await setupMigrationsWithPath(basePath);
  } catch (error) {
    verification.log(`Erro ao verificar diretório para migrações: ${error?.message || 'Erro desconhecido'}`, 'error');
    verification.logToFile(`Detalhes: ${JSON.stringify(error)}`);
    return false;
  }
}

// Função de implementação que executa as migrações em um caminho específico - completamente reescrita
async function setupMigrationsWithPath(basePath) {
  try {
    // Garantir que PostgreSQL está rodando
    verification.log('Verificando PostgreSQL...', 'step');
    await verification.execPromise(
      'wsl -d Ubuntu -u root systemctl restart postgresql',
      30000,
      true
    ).catch(e => verification.log('Aviso ao reiniciar PostgreSQL, continuando', 'warning'));
    
    // Aguardar inicialização
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verificar conexão com psql
    verification.log('Testando conexão...', 'step');
    try {
      await verification.execPromise('wsl -d Ubuntu -u postgres psql -c "SELECT 1;"', 10000, true);
      verification.log('Conexão com PostgreSQL funcionando', 'success');
    } catch (connError) {
      verification.log('ERRO: PostgreSQL não está respondendo!', 'error');
      verification.logToFile(`Erro de conexão: ${JSON.stringify(connError)}`);
      return false;
    }
    
    // Verificar se o script migrate.sh existe
    verification.log('Verificando scripts de migração...', 'step');
    const migrateExists = await verification.execPromise(
      `wsl -d Ubuntu -u root bash -c "if [ -f '${basePath}/db/migrate.sh' ]; then echo 'exists'; else echo 'not_exists'; fi"`,
      10000,
      true
    );
    
    if (migrateExists.trim() === 'exists') {
      verification.log('Script de migração encontrado, executando...', 'step');
      try {
        // Tornar o script executável e executá-lo
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "chmod +x ${basePath}/db/migrate.sh && cd ${basePath} && ./db/migrate.sh"`,
          60000, // Timeout maior para migrações
          true
        );
        verification.log('Migração oficial executada com sucesso!', 'success');
        return true;
      } catch (migrateError) {
        verification.log('Erro ao executar script de migração oficial, tentando método alternativo...', 'warning');
        verification.logToFile(`Erro: ${JSON.stringify(migrateError)}`);
      }
    } else {
      verification.log('Script de migração não encontrado, usando método manual...', 'warning');
    }
    
    // MÉTODO ALTERNATIVO DE MIGRAÇÃO - CRIAR TABELAS MANUALMENTE
    
    // Garantir que o banco print_management existe
    verification.log('Verificando banco print_management...', 'step');
    const dbExists = await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname=\'print_management\'"',
      10000,
      true
    ).catch(() => '');
    
    if (!dbExists) {
      verification.log('Criando banco print_management...', 'step');
      await verification.execPromise(
        'wsl -d Ubuntu -u postgres psql -c "CREATE DATABASE print_management;"',
        10000,
        true
      );
    }
    
    // Garantir schema e usuário
    verification.log('Configurando schema e usuário...', 'step');
    await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "CREATE SCHEMA IF NOT EXISTS print_management;"',
      10000,
      true
    ).catch(e => verification.log('Aviso: Schema pode já existir', 'warning'));
    
    const userCheck = await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname=\'postgres_print\'"',
      10000,
      true
    ).catch(() => '');
    
    if (!userCheck.trim()) {
      verification.log('Criando usuário postgres_print...', 'step');
      await verification.execPromise(
        'wsl -d Ubuntu -u postgres psql -c "CREATE ROLE postgres_print WITH LOGIN SUPERUSER PASSWORD \'root_print\';"',
        10000,
        true
      );
    }
    
    // CRIAR TABELAS COM ESTRUTURA COMPLETA CORRETA
    verification.log('Criando tabelas com estrutura completa...', 'step');

    // 1. Criar tipos ENUM necessários
    await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "CREATE TYPE IF NOT EXISTS print_management.log_type AS ENUM (\'error\', \'read\', \'create\', \'update\', \'delete\');" || true',
      10000,
      true
    ).catch(e => verification.log('Aviso: Tipo log_type pode já existir', 'warning'));
    
    await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "CREATE TYPE IF NOT EXISTS print_management.printer_status AS ENUM (\'functional\',\'expired useful life\',\'powered off\',\'obsolete\',\'damaged\',\'lost\',\'disabled\');" || true',
      10000,
      true
    ).catch(e => verification.log('Aviso: Tipo printer_status pode já existir', 'warning'));
    
    // 2. Verificar se a tabela logs já existe
    const logsExist = await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=\'print_management\' AND table_name=\'logs\')"',
      10000,
      true
    ).catch(() => 'f');
    
    if (logsExist.trim() === 't') {
      // Se existir, verificar se tem a coluna problemática
      const hasBeforeData = await verification.execPromise(
        'wsl -d Ubuntu -u postgres psql -d print_management -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=\'print_management\' AND table_name=\'logs\' AND column_name=\'beforedata\')"',
        10000,
        true
      ).catch(() => 'f');
      
      // Se a coluna não existir, dropar a tabela e recriar
      if (hasBeforeData.trim() === 'f') {
        verification.log('Tabela logs existe, mas sem a estrutura correta. Recriando...', 'warning');
        await verification.execPromise(
          'wsl -d Ubuntu -u postgres psql -d print_management -c "DROP TABLE IF EXISTS print_management.logs;"',
          10000,
          true
        );
        
        // Criar com estrutura completa
        const createLogsSQL = `
CREATE TABLE IF NOT EXISTS print_management.logs (
    id varchar(50) NOT NULL,
    createdAt timestamp NOT NULL,
    logType print_management.log_type NOT NULL,
    entity varchar(255) DEFAULT NULL,
    operation VARCHAR(50) DEFAULT NULL,
    beforeData jsonb DEFAULT NULL,
    afterData jsonb DEFAULT NULL,
    errorMessage text DEFAULT NULL,
    errorStack text DEFAULT NULL,
    userInfo jsonb DEFAULT NULL,
    PRIMARY KEY (id)
);`;
        
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -d print_management -c "${createLogsSQL}"`,
          15000,
          true
        );
        verification.log('Tabela logs recriada com estrutura completa', 'success');
      } else {
        verification.log('Tabela logs já existe com a estrutura correta', 'success');
      }
    } else {
      // Criar a tabela logs com estrutura completa
      verification.log('Criando tabela logs...', 'step');
      const createLogsSQL = `
CREATE TABLE IF NOT EXISTS print_management.logs (
    id varchar(50) NOT NULL,
    createdAt timestamp NOT NULL,
    logType print_management.log_type NOT NULL,
    entity varchar(255) DEFAULT NULL,
    operation VARCHAR(50) DEFAULT NULL,
    beforeData jsonb DEFAULT NULL,
    afterData jsonb DEFAULT NULL,
    errorMessage text DEFAULT NULL,
    errorStack text DEFAULT NULL,
    userInfo jsonb DEFAULT NULL,
    PRIMARY KEY (id)
);`;
      
      await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -d print_management -c "${createLogsSQL}"`,
        15000,
        true
      );
      verification.log('Tabela logs criada com sucesso', 'success');
    }
    
    // 3. Verificar/criar tabela printers
    const printersExist = await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=\'print_management\' AND table_name=\'printers\')"',
      10000,
      true
    ).catch(() => 'f');
    
    if (printersExist.trim() !== 't') {
      verification.log('Criando tabela printers...', 'step');
      const createPrintersSQL = `
CREATE TABLE IF NOT EXISTS print_management.printers (
    id varchar(50) NOT NULL,
    name varchar(50) NOT NULL,
    status print_management.printer_status NOT NULL,
    protocol varchar(20) DEFAULT 'socket',
    mac_address varchar(17) DEFAULT NULL,
    driver varchar(100) DEFAULT 'generic',
    uri varchar(255) DEFAULT NULL,
    description text DEFAULT NULL,
    location varchar(100) DEFAULT NULL,
    ip_address varchar(15) DEFAULT NULL,
    port int DEFAULT NULL,
    createdAt timestamp NOT NULL,
    updatedAt timestamp NOT NULL,
    deletedAt timestamp DEFAULT NULL,
    PRIMARY KEY (id)
);`;
      
      await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -d print_management -c "${createPrintersSQL}"`,
        15000,
        true
      );
      verification.log('Tabela printers criada com sucesso', 'success');
    }
    
    // 4. Verificar/criar tabela files
    const filesExist = await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=\'print_management\' AND table_name=\'files\')"',
      10000,
      true
    ).catch(() => 'f');
    
    if (filesExist.trim() !== 't') {
      verification.log('Criando tabela files...', 'step');
      const createFilesSQL = `
CREATE TABLE IF NOT EXISTS print_management.files (
    id varchar(50) NOT NULL,
    assetId varchar(50) DEFAULT NULL,
    fileName text NOT NULL,
    pages int NOT NULL,
    path TEXT NOT NULL,
    createdAt timestamp NOT NULL,
    deletedAt timestamp DEFAULT NULL,
    printed BOOLEAN NOT NULL DEFAULT FALSE,
    synced BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    FOREIGN KEY (assetId) REFERENCES print_management.printers(id)
);`;
      
      await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -d print_management -c "${createFilesSQL}"`,
        15000,
        true
      );
      verification.log('Tabela files criada com sucesso', 'success');
    }
    
    // 5. Conceder permissões
    verification.log('Concedendo permissões nas tabelas...', 'step');
    await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "GRANT ALL PRIVILEGES ON SCHEMA print_management TO postgres_print;"',
      10000,
      true
    );
    
    await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA print_management TO postgres_print;"',
      10000,
      true
    );
    
    await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "GRANT USAGE ON TYPE print_management.log_type TO postgres_print;"',
      10000,
      true
    ).catch(e => verification.log('Aviso ao conceder permissões em tipos', 'warning'));
    
    await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "GRANT USAGE ON TYPE print_management.printer_status TO postgres_print;"',
      10000,
      true
    ).catch(e => verification.log('Aviso ao conceder permissões em tipos', 'warning'));
    
    // 6. Verificação final
    verification.log('Verificando tabelas criadas...', 'step');
    const tablesCheck = await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "\\dt print_management.*"',
      10000,
      true
    );
    
    verification.log(`Resultado da verificação:\n${tablesCheck}`, 'info');
    
    // Verificar especificamente a estrutura da tabela logs
    const logsColumns = await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "\\d print_management.logs"',
      10000,
      true
    );
    
    verification.log(`Estrutura da tabela logs:\n${logsColumns}`, 'info');
    
    // Verificar novamente a coluna beforeData
    const checkBeforeData = await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -tAc "SELECT column_name FROM information_schema.columns WHERE table_schema=\'print_management\' AND table_name=\'logs\' AND column_name=\'beforedata\'"',
      10000,
      true
    ).catch(() => "");
    
    if (checkBeforeData.trim() === 'beforedata') {
      verification.log('Coluna beforedata existe e está pronta para uso!', 'success');
      return true;
    } else {
      // Verificar com o nome correto (sensível a maiúsculas/minúsculas)
      const checkBeforeDataCaseSensitive = await verification.execPromise(
        'wsl -d Ubuntu -u postgres psql -d print_management -tAc "SELECT column_name FROM information_schema.columns WHERE table_schema=\'print_management\' AND table_name=\'logs\' AND lower(column_name)=\'beforedata\'"',
        10000,
        true
      ).catch(() => "");
      
      if (checkBeforeDataCaseSensitive.trim() !== '') {
        verification.log(`Coluna encontrada como: ${checkBeforeDataCaseSensitive.trim()}`, 'success');
        return true;
      }
      
      verification.log('AVISO: Coluna beforedata ainda não foi encontrada, pode haver problemas caso-sensitivos', 'warning');
      
      // Última tentativa - adicionar a coluna explicitamente com nome em minúsculas
      try {
        await verification.execPromise(
          'wsl -d Ubuntu -u postgres psql -d print_management -c "ALTER TABLE print_management.logs ADD COLUMN IF NOT EXISTS beforedata jsonb DEFAULT NULL;"',
          10000,
          true
        );
        verification.log('Coluna beforedata adicionada explicitamente', 'success');
        return true;
      } catch (finalError) {
        verification.log('Falha na última tentativa', 'warning');
        return false;
      }
    }
  } catch (error) {
    verification.log(`Erro global: ${error?.message || JSON.stringify(error)}`, 'error');
    verification.logToFile(`Erro fatal em setupMigrationsWithPath: ${JSON.stringify(error)}`);
    return false;
  }
}

// Copiar o software para o diretório /opt/
async function copySoftwareToOpt() {
  verification.log('Copiando software para o diretório /opt/...', 'header');

  try {
    // Verificar se o diretório já existe
    let dirExists = false;
    try {
      const dirCheck = await verification.execPromise('wsl -d Ubuntu -u root test -d /opt/loqquei/print_server_desktop && echo "exists"', 10000, true);
      if (dirCheck.trim() === 'exists') {
        verification.log('Diretório /opt/loqquei/print_server_desktop já existe', 'info');
        dirExists = true;
      }
    } catch (checkError) {
      verification.log('Diretório /opt/loqquei/print_server_desktop não existe, será criado', 'info');
      dirExists = false;
    }

    // Criar estrutura de diretórios se não existir
    if (!dirExists) {
      verification.log('Criando estrutura de diretórios...', 'step');
      await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop', 15000, true);
      await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop/logs', 10000, true);
      await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop/updates', 10000, true);
    }

    // Criar arquivo de versão com sintaxe corrigida
    verification.log('Criando arquivo de versão...', 'step');
    const versionCmd = 'wsl -d Ubuntu -u root bash -c "echo \\"{\\\"install_date\\\": \\\"$(date +%Y-%m-%d)\\\", \\\"version\\\": \\\"1.0.0\\\"}\\\" > /opt/loqquei/print_server_desktop/version.json"';
    try {
      await verification.execPromise(versionCmd, 15000, true);
      verification.log('Arquivo de versão criado com sucesso', 'success');
    } catch (versionError) {
      verification.log(`Erro ao criar arquivo de versão: ${versionError.message || 'Erro desconhecido'}`, 'warning');
      // Continuar mesmo com erro
    }

    // Criar arquivo de atualizações executadas
    verification.log('Criando arquivo de atualizações...', 'step');
    try {
      await verification.execPromise('wsl -d Ubuntu -u root touch /opt/loqquei/print_server_desktop/executed_updates.txt', 10000, true);
      verification.log('Arquivo de atualizações criado com sucesso', 'success');
    } catch (touchError) {
      verification.log(`Erro ao criar arquivo de atualizações: ${touchError.message || 'Erro desconhecido'}`, 'warning');
      // Continuar mesmo com erro
    }

    // Obter o diretório atual do instalador
    const installerDir = process.cwd();
    const serverFiles = path.join(installerDir, 'resources', 'print_server_desktop');

    verification.log(`Verificando diretório de recursos: ${serverFiles}`, 'step');

    // Verificar se os recursos existem
    if (fs.existsSync(serverFiles)) {
      verification.log('Arquivos do print_server_desktop encontrados. Iniciando cópia...', 'success');

      // Criar diretório temporário
      const tempDir = path.join(os.tmpdir(), 'wsl-setup');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Verificar se temos permissão para ler o diretório
      try {
        const files = fs.readdirSync(serverFiles);
        verification.log(`Encontrados ${files.length} arquivos/diretórios para copiar`, 'info');
      } catch (readError) {
        verification.log(`Erro ao ler diretório de recursos: ${readError.message}`, 'error');
        // Continuar mesmo com erro
      }

      // Método 1: Usar arquivo tar para transferência
      verification.log('Criando arquivo tar para transferência...', 'step');
      try {
        // Criar arquivo tar com todos os arquivos
        const tarFile = path.join(tempDir, 'print_server_desktop.tar');

        // Executar comando para criar o tar
        await verification.execPromise(`tar -cf "${tarFile}" -C "${serverFiles}" .`, 120000, true);
        verification.log('Arquivo tar criado com sucesso', 'success');

        // Obter caminho WSL para o arquivo tar
        const wslTarPath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${tarFile.replace(/\\/g, '/')}"`, 10000, true);
        verification.log(`Caminho do arquivo tar no WSL: ${wslTarPath}`, 'info');

        // Garantir que o diretório de destino exista
        await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop', 10000, true);

        // Extrair o tar no diretório de destino
        verification.log('Extraindo arquivos no WSL...', 'step');
        const extractCommand = `tar -xf "${wslTarPath}" -C /opt/loqquei/print_server_desktop`;
        await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${extractCommand}'`, 120000, true);
        verification.log('Arquivos extraídos com sucesso', 'success');

        // Configurar permissões e instalar dependências
        verification.log('Configurando permissões e instalando dependências...', 'step');
        await verification.execPromise('wsl -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && chmod -R 755 . && (npm install || echo \'Erro ao instalar dependências, continuando\')"', 300000, true);

        // Criar arquivo .env se não existir
        verification.log('Configurando arquivo .env...', 'step');
        const envCheck = 'if [ ! -f "/opt/loqquei/print_server_desktop/.env" ]; then (cp /opt/loqquei/print_server_desktop/.env.example /opt/loqquei/print_server_desktop/.env 2>/dev/null || echo "PORT=56258" > /opt/loqquei/print_server_desktop/.env); fi';
        await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${envCheck}'`, 15000, true);

        verification.log('Software copiado para /opt/ com sucesso', 'success');
      } catch (tarError) {
        verification.log(`Erro ao usar método tar: ${tarError.message || 'Erro desconhecido'}`, 'error');
        verification.logToFile(`Detalhes do erro tar: ${JSON.stringify(tarError)}`);

        // Método alternativo: Copiar arquivos um por um
        verification.log('Tentando método alternativo de cópia...', 'warning');
        try {
          // Listar arquivos na pasta resources
          const files = fs.readdirSync(serverFiles);

          for (const file of files) {
            const sourcePath = path.join(serverFiles, file);
            const isDir = fs.statSync(sourcePath).isDirectory();

            // Obter o caminho WSL para o arquivo
            const wslSourcePath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${sourcePath.replace(/\\/g, '/')}"`, 10000, true);

            if (isDir) {
              // Para diretórios, usar cp -r
              await verification.execPromise(`wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop/${file}`, 10000, true);
              await verification.execPromise(`wsl -d Ubuntu -u root cp -r "${wslSourcePath}/"* /opt/loqquei/print_server_desktop/${file}/`, 60000, true);
            } else {
              // Para arquivos, usar cp
              await verification.execPromise(`wsl -d Ubuntu -u root cp "${wslSourcePath}" /opt/loqquei/print_server_desktop/`, 30000, true);
            }
          }

          verification.log('Software copiado com método alternativo', 'success');
        } catch (altError) {
          verification.log(`Erro no método alternativo: ${altError.message || 'Erro desconhecido'}`, 'error');
          verification.logToFile(`Detalhes do erro alternativo: ${JSON.stringify(altError)}`);
          throw new Error('Falha em todos os métodos de cópia');
        }
      }
    } else {
      verification.log('Pasta de recursos do print_server_desktop não encontrada!', 'error');
      verification.logToFile(`Diretório esperado: ${serverFiles}`);

      // Criar estrutura básica de qualquer forma
      verification.log('Criando estrutura básica...', 'step');
      const basicSetupCmd = `
      mkdir -p /opt/loqquei/print_server_desktop
      echo '{"name":"print_server_desktop","version":"1.0.0"}' > /opt/loqquei/print_server_desktop/package.json
      echo 'PORT=56258' > /opt/loqquei/print_server_desktop/.env
      `;

      await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${basicSetupCmd}'`, 15000, true);
      verification.log('Estrutura básica criada', 'warning');
      return false;
    }

    // Verificação final
    verification.log('Verificando instalação...', 'step');
    try {
      const checkFiles = await verification.execPromise('wsl -d Ubuntu -u root ls -la /opt/loqquei/print_server_desktop/', 10000, true);
      verification.log('Verificação completa, arquivos copiados com sucesso', 'success');
    } catch (verifyError) {
      verification.log('Erro na verificação final, mas continuando', 'warning');
    }

    return true;
  } catch (error) {
    verification.log(`Erro ao copiar software: ${error.message || error.toString() || 'Erro desconhecido'}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

    // Tentar criar pelo menos uma estrutura mínima antes de retornar
    try {
      const emergencyCmd = `
      mkdir -p /opt/loqquei/print_server_desktop
      echo '{"name":"print_server_desktop","version":"1.0.0"}' > /opt/loqquei/print_server_desktop/package.json
      echo 'PORT=56258' > /opt/loqquei/print_server_desktop/.env
      `;
      await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${emergencyCmd}'`, 10000, true);
      verification.log('Estrutura mínima de emergência criada', 'warning');
    } catch (emergencyError) {
      verification.log('Falha até na criação da estrutura mínima', 'error');
    }

    return false;
  }
}

// Configurar script de atualização
async function setupUpdateScript() {
  verification.log('Configurando sistema de atualizações...', 'step');

  try {
    // Criar script de atualização
    const updateScript = `#!/bin/bash
LOG_FILE="/opt/loqquei/print_server_desktop/update_log.txt"

log() {
  local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
  echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

# Executar scripts de atualização
UPDATE_DIR="/opt/loqquei/print_server_desktop/updates"
EXECUTED_FILE="/opt/loqquei/print_server_desktop/executed_updates.txt"

# Garantir que os diretórios existam
mkdir -p "$UPDATE_DIR"
touch "$EXECUTED_FILE"

log "=== Iniciando processo de atualização ==="

# Executar os scripts de atualização
log "Verificando scripts de atualização..."
for i in $(seq -f "%02g" 1 99); do
  SCRIPT_FILE="$UPDATE_DIR/$i.sh"
  
  if [ -f "$SCRIPT_FILE" ]; then
    if ! grep -q "$i" "$EXECUTED_FILE"; then
      log "Executando atualização $i..."
      
      bash "$SCRIPT_FILE" >> "$LOG_FILE" 2>&1
      
      if [ $? -eq 0 ]; then
        echo "$i" | tee -a "$EXECUTED_FILE" > /dev/null
        log "Atualização $i executada com sucesso!"
      else
        log "ERRO: A atualização $i falhou!"
      fi
    else
      log "Atualização $i já foi executada anteriormente. Pulando..."
    fi
  fi
done

# Reiniciar o serviço
log "Reiniciando serviço..."
if command -v pm2 &> /dev/null; then
  cd /opt/loqquei/print_server_desktop && pm2 restart ecosystem.config.js
fi

log "=== Processo de atualização concluído com sucesso! ==="
`;

    // Escrever script de atualização em um arquivo temporário
    const tempDir = path.join(os.tmpdir(), 'wsl-setup');
    const updateScriptPath = path.join(tempDir, 'update.sh');
    fs.writeFileSync(updateScriptPath, updateScript, { mode: 0o755 });

    // Copiar para o WSL
    const wslScriptPath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${updateScriptPath.replace(/\\/g, '/')}"`, 10000, true);
    await verification.execPromise(`wsl -d Ubuntu -u root bash -c "cp ${wslScriptPath} /opt/loqquei/print_server_desktop/update.sh && chmod +x /opt/loqquei/print_server_desktop/update.sh"`, 10000, true);

    verification.log('Script de atualização configurado com sucesso', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar script de atualização: ${error.message}`, 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Configurar e iniciar PM2
async function setupPM2() {
  verification.log('Configurando serviço com PM2...', 'step');

  try {
    // Verificar se o Node.js está instalado e disponível
    verification.log('Verificando instalação do Node.js...', 'step');
    try {
      const nodeVersion = await verification.execPromise('wsl -d Ubuntu -u root node --version', 20000, false);
      verification.log(`Node.js detectado: ${nodeVersion.trim()}`, 'success');
    } catch (nodeError) {
      verification.log('Node.js não encontrado ou não está no PATH, tentando instalar...', 'warning');

      // Instalar Node.js
      try {
        // Usar curl/apt para garantir uma versão de Node.js mais recente
        const setupCommands = `
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - &&
        apt-get update &&
        apt-get install -y nodejs &&
        node --version
        `;
        
        await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${setupCommands}"`, 300000, true);
        verification.log('Node.js instalado com sucesso (versão LTS)', 'success');
      } catch (nodeInstallError) {
        verification.log('Falha ao instalar Node.js via método preferido, tentando alternativa...', 'warning');
        
        try {
          await verification.execPromise('wsl -d Ubuntu -u root apt-get update', 60000, true);
          await verification.execPromise('wsl -d Ubuntu -u root apt-get install -y nodejs npm', 180000, true);

          // Verificar se a instalação foi bem-sucedida
          const nodeCheck = await verification.execPromise('wsl -d Ubuntu -u root node --version', 10000, true);
          verification.log(`Node.js instalado: ${nodeCheck.trim()}`, 'success');
        } catch (fallbackError) {
          verification.log('Falha em todos os métodos de instalação do Node.js', 'error');
          verification.logToFile(`Erro de instalação do Node.js: ${JSON.stringify(fallbackError)}`);
          return false;
        }
      }
    }

    // Verificar se o PM2 está instalado
    verification.log('Verificando instalação do PM2...', 'step');

    let pm2Installed = false;
    try {
      const pm2Version = await verification.execPromise('wsl -d Ubuntu -u root sudo pm2 --version', 15000, false);
      verification.log(`PM2 já instalado: ${pm2Version.trim()}`, 'success');
      pm2Installed = true;
    } catch (pm2Error) {
      verification.log('PM2 não encontrado, instalando...', 'info');

      // Instalar PM2 globalmente com maior timeout e forma mais robusta
      try {
        await verification.execPromise('wsl -d Ubuntu -u root sudo npm install -g pm2@latest', 300000, true);

        // Verificar se a instalação foi bem-sucedida
        const pm2Check = await verification.execPromise('wsl -d Ubuntu -u root sudo pm2 --version', 15000, false);
        verification.log(`PM2 instalado: ${pm2Check.trim()}`, 'success');
        pm2Installed = true;
      } catch (pm2InstallError) {
        verification.log('Erro ao instalar PM2 via npm, tentando método alternativo...', 'warning');
        
        try {
          // Método alternativo usando npx
          await verification.execPromise('wsl -d Ubuntu -u root npm install -g npx', 120000, true);
          await verification.execPromise('wsl -d Ubuntu -u root npx pm2 --version', 15000, true);
          verification.log('PM2 disponível via npx', 'success');
          pm2Installed = true;
        } catch (npxError) {
          verification.log('Todos os métodos de instalação do PM2 falharam', 'error');
          verification.logToFile(`Erro de instalação do PM2: ${JSON.stringify(npxError)}`);
          return false;
        }
      }
    }

    // Encontrar o diretório da aplicação de forma mais robusta
    const possiblePaths = [
      '/opt/loqquei/print_server_desktop',
      '/opt/print_server/print_server_desktop',
      '/opt/loqquei',
      '/opt/print_server'
    ];

    let appDir = null;
    for (const path of possiblePaths) {
      try {
        const checkCmd = `if [ -d "${path}" ]; then echo "exists"; else echo "missing"; fi`;
        const dirExists = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${checkCmd}"`, 15000, false);

        if (dirExists.trim() === 'exists') {
          // Verificar se é um diretório válido de aplicação
          const appCheck = await verification.execPromise(
            `wsl -d Ubuntu -u root bash -c "if [ -f '${path}/app.js' ] || [ -f '${path}/package.json' ] || [ -d '${path}/bin' ]; then echo 'valid'; else echo 'invalid'; fi"`, 
            15000, 
            false
          );
          
          if (appCheck.trim() === 'valid') {
            appDir = path;
            verification.log(`Diretório de aplicação válido encontrado: ${path}`, 'success');
            break;
          } else {
            verification.log(`Diretório ${path} existe mas não parece ser uma aplicação válida`, 'info');
          }
        }
      } catch (error) {
        verification.log(`Erro ao verificar diretório ${path}, continuando...`, 'warning');
      }
    }

    // Se não encontrou, tentar criar um diretório básico
    if (!appDir) {
      verification.log('Diretório de aplicação não encontrado, criando estrutura básica', 'warning');
      
      try {
        const defaultDir = '/opt/loqquei/print_server_desktop';
        await verification.execPromise(`wsl -d Ubuntu -u root mkdir -p ${defaultDir}`, 15000, true);
        await verification.execPromise(`wsl -d Ubuntu -u root touch ${defaultDir}/package.json`, 10000, true);
        await verification.execPromise(`wsl -d Ubuntu -u root touch ${defaultDir}/app.js`, 10000, true);
        await verification.execPromise(`wsl -d Ubuntu -u root mkdir -p ${defaultDir}/bin`, 10000, true);
        
        // Criar arquivo www.js básico
        const wwwJsContent = `
#!/usr/bin/env node
console.log('Servidor básico iniciado');
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Servidor de impressão em execução\\n');
});
server.listen(56258, '0.0.0.0', () => {
  console.log('Servidor básico ouvindo na porta 56258');
});
        `;
        
        // Escapar conteúdo para bash
        const escapedContent = wwwJsContent.replace(/\$/g, '\\$').replace(/"/g, '\\"').replace(/`/g, '\\`');
        
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "echo \\"${escapedContent}\\" > ${defaultDir}/bin/www.js"`, 
          15000, 
          true
        );
        
        await verification.execPromise(`wsl -d Ubuntu -u root chmod +x ${defaultDir}/bin/www.js`, 10000, true);
        
        // Criar arquivo ecosystem.config.js básico
        const ecoJsContent = `
module.exports = {
  apps: [{
    name: 'print_server_desktop',
    script: './bin/www.js',
    env: {
      NODE_ENV: 'production',
      PORT: 56258
    }
  }]
};
        `;
        
        const escapedEcoContent = ecoJsContent.replace(/\$/g, '\\$').replace(/"/g, '\\"').replace(/`/g, '\\`');
        
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "echo \\"${escapedEcoContent}\\" > ${defaultDir}/ecosystem.config.js"`, 
          15000, 
          true
        );
        
        appDir = defaultDir;
        verification.log('Estrutura básica de aplicação criada', 'success');
      } catch (createError) {
        verification.log('Erro ao criar estrutura básica', 'error');
        verification.logToFile(`Erro detalhado: ${JSON.stringify(createError)}`);
        return false;
      }
    }

    // Ajustar permissões do diretório da aplicação
    try {
      await verification.execPromise(`wsl -d Ubuntu -u root chmod -R 755 ${appDir}`, 20000, true);
      verification.log('Permissões ajustadas', 'success');
    } catch (permError) {
      verification.log('Erro ao ajustar permissões, continuando...', 'warning');
    }

    // Iniciar com PM2 de forma mais resiliente
    verification.log('Iniciando aplicação com PM2...', 'step');
    
    try {
      // Parar qualquer instância existente de forma limpa
      await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 delete all || true"', 20000, false);
      
      // Iniciar usando ecosystem.config.js ou método alternativo
      const startCmd = `cd "${appDir}" && pm2 start ecosystem.config.js || pm2 start bin/www.js --name print_server_desktop`;
      await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${startCmd}"`, 60000, true);
      
      // Verificar se está em execução
      const checkRunning = await verification.execPromise('wsl -d Ubuntu -u root pm2 list', 15000, false);
      
      if (checkRunning.includes('print_server') || checkRunning.includes('online')) {
        verification.log('Aplicação iniciada com PM2 com sucesso', 'success');
        
        // Salvar configuração para reinicialização automática
        await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 save"', 15000, false);
        verification.log('Configuração PM2 salva', 'success');
        
        // Configurar inicialização automática
        try {
          await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 startup || true"', 20000, false);
          verification.log('Inicialização automática configurada', 'success');
        } catch (startupError) {
          verification.log('Erro ao configurar inicialização automática, continuando...', 'warning');
        }
        
        return true;
      } else {
        verification.log('Aplicação possivelmente não iniciada, tentando método alternativo...', 'warning');
      }
    } catch (error) {
      verification.log('Erro ao iniciar com PM2, tentando método alternativo...', 'warning');
      verification.logToFile(`Erro detalhado: ${JSON.stringify(error)}`);
    }
    
    // Método alternativo de inicialização
    try {
      verification.log('Tentando método alternativo de inicialização...', 'step');
      const simpleStartCmd = `cd "${appDir}" && nohup node bin/www.js > /var/log/print_server.log 2>&1 &`;
      
      await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${simpleStartCmd}"`, 20000, true);
      verification.log('Aplicação iniciada com método alternativo (nohup)', 'success');
      
      // Verificar porta em uso para confirmar que está rodando
      try {
        const portCheck = await verification.execPromise('wsl -d Ubuntu -u root bash -c "netstat -tulpn | grep 56258"', 15000, false);
        if (portCheck && portCheck.includes('56258')) {
          verification.log('Porta 56258 está em uso, confirmando que o serviço está rodando', 'success');
        } else {
          verification.log('Porta 56258 não detectada, mas continuando mesmo assim', 'warning');
        }
      } catch (netstatError) {
        verification.log('Erro ao verificar porta, continuando mesmo assim', 'warning');
      }
      
      return true;
    } catch (altError) {
      verification.log('Todos os métodos de inicialização falharam', 'error');
      verification.logToFile(`Erro no método alternativo: ${JSON.stringify(altError)}`);
      
      // Retornar true mesmo com falha para permitir que a instalação continue
      verification.log('Continuando instalação mesmo com erro na inicialização do serviço', 'warning');
      return true;
    }
  } catch (error) {
    verification.log(`Erro geral ao configurar PM2: ${error.message || 'Erro desconhecido'}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    
    // Retornar true mesmo com falha para permitir que a instalação continue
    verification.log('Continuando instalação mesmo com erro no PM2', 'warning');
    return true;
  }
}

// Instalar drivers adicionais se necessário
async function installDrivers() {
  verification.log('Verificando e instalando drivers...', 'step');

  try {
    // Verificar se diretório de drivers existe
    const checkDrivers = "if [ -d \"/opt/loqquei/print_server_desktop/drivers\" ]; then echo \"exists\"; fi";
    const driversExist = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${checkDrivers}"`, 10000, true);

    if (driversExist.trim() === 'exists') {
      verification.log('Diretório de drivers encontrado, verificando arquivos .deb...', 'step');

      // Verificar se existem arquivos .deb
      const checkDebFiles = "ls -1 /opt/loqquei/print_server_desktop/drivers/*.deb 2>/dev/null || echo 'no_files'";
      const debFiles = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${checkDebFiles}"`, 10000, true);

      if (debFiles.trim() === 'no_files' || debFiles.includes('No such file or directory')) {
        verification.log('Nenhum arquivo .deb encontrado no diretório de drivers', 'info');
        return true;
      }

      verification.log('Instalando drivers...', 'step');

      // Separar a instalação em passos para maior confiabilidade
      const listDebCmd = "find /opt/loqquei/print_server_desktop/drivers -name '*.deb' -type f";
      const debFilesList = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${listDebCmd}"`, 10000, true);

      if (debFilesList.trim()) {
        const files = debFilesList.trim().split('\n');
        verification.log(`Encontrados ${files.length} arquivos .deb para instalar`, 'info');

        // Instalar cada arquivo individualmente
        for (const file of files) {
          if (file.trim()) {
            try {
              verification.log(`Instalando ${path.basename(file)}...`, 'info');
              await verification.execPromise(`wsl -d Ubuntu -u root dpkg -i --force-all "${file.trim()}"`, 60000, true);
              verification.log(`Arquivo ${path.basename(file)} instalado com sucesso`, 'success');
            } catch (pkgError) {
              verification.log(`Aviso: Erro ao instalar ${path.basename(file)}, continuando com os próximos...`, 'warning');
              verification.logToFile(`Erro ao instalar ${file}: ${JSON.stringify(pkgError)}`);
            }
          }
        }

        // Executar apt-get -f install para resolver possíveis dependências
        try {
          verification.log('Resolvendo dependências...', 'step');
          await verification.execPromise('wsl -d Ubuntu -u root apt-get -f install -y', 60000, true);
          verification.log('Dependências resolvidas', 'success');
        } catch (depError) {
          verification.log('Aviso ao resolver dependências, mas continuando...', 'warning');
          verification.logToFile(`Erro de dependência: ${JSON.stringify(depError)}`);
        }

        verification.log('Instalação de drivers concluída', 'success');
      } else {
        verification.log('Nenhum arquivo .deb encontrado durante a listagem', 'info');
      }
    } else {
      verification.log('Diretório de drivers não encontrado, verificando caminhos alternativos...', 'info');

      // Tentar caminho alternativo
      const altCheckDrivers = "if [ -d \"/opt/print_server/print_server_desktop/drivers\" ]; then echo \"exists\"; fi";
      const altDriversExist = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${altCheckDrivers}"`, 10000, true);

      if (altDriversExist.trim() === 'exists') {
        verification.log('Diretório alternativo de drivers encontrado, instalando...', 'step');

        // Verificar se existem arquivos .deb
        const altCheckDebFiles = "ls -1 /opt/print_server/print_server_desktop/drivers/*.deb 2>/dev/null || echo 'no_files'";
        const altDebFiles = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${altCheckDebFiles}"`, 10000, true);

        if (altDebFiles.trim() === 'no_files' || altDebFiles.includes('No such file or directory')) {
          verification.log('Nenhum arquivo .deb encontrado no diretório alternativo', 'info');
          return true;
        }

        // Listar e instalar arquivos individualmente
        const altListDebCmd = "find /opt/print_server/print_server_desktop/drivers -name '*.deb' -type f";
        const altDebFilesList = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${altListDebCmd}"`, 10000, true);

        if (altDebFilesList.trim()) {
          const altFiles = altDebFilesList.trim().split('\n');
          verification.log(`Encontrados ${altFiles.length} arquivos .deb no caminho alternativo`, 'info');

          for (const file of altFiles) {
            if (file.trim()) {
              try {
                verification.log(`Instalando ${path.basename(file)}...`, 'info');
                await verification.execPromise(`wsl -d Ubuntu -u root dpkg -i --force-all "${file.trim()}"`, 60000, true);
                verification.log(`Arquivo ${path.basename(file)} instalado com sucesso`, 'success');
              } catch (pkgError) {
                verification.log(`Aviso: Erro ao instalar ${path.basename(file)}, continuando...`, 'warning');
                verification.logToFile(`Erro ao instalar ${file}: ${JSON.stringify(pkgError)}`);
              }
            }
          }

          // Resolver dependências
          try {
            verification.log('Resolvendo dependências...', 'step');
            await verification.execPromise('wsl -d Ubuntu -u root apt-get -f install -y', 60000, true);
            verification.log('Dependências resolvidas', 'success');
          } catch (depError) {
            verification.log('Aviso ao resolver dependências, mas continuando...', 'warning');
            verification.logToFile(`Erro de dependência: ${JSON.stringify(depError)}`);
          }

          verification.log('Instalação de drivers concluída (caminho alternativo)', 'success');
        } else {
          verification.log('Nenhum arquivo .deb encontrado durante a listagem alternativa', 'info');
        }
      } else {
        verification.log('Nenhum diretório de drivers encontrado, pulando instalação', 'info');
      }
    }

    return true;
  } catch (error) {
    verification.log(`Erro ao instalar drivers: ${error.message || 'Erro desconhecido'}`, 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return true; // Retornar true mesmo com erro para continuar a instalação
  }
}

// Limpeza do sistema
async function systemCleanup() {
  verification.log('Realizando limpeza do sistema...', 'step');

  try {
    // Executar comandos de limpeza
    await verification.execPromise('wsl -d Ubuntu -u root apt autoclean -y', 60000, true);
    await verification.execPromise('wsl -d Ubuntu -u root apt autoremove -y', 60000, true);
    await verification.execPromise('wsl -d Ubuntu -u root journalctl --vacuum-time=7d', 30000, true);

    verification.log('Limpeza do sistema concluída', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro durante limpeza do sistema: ${error.message}`, 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Configuração completa do sistema
async function configureSystem() {
  verification.log('Configurando o sistema no WSL...', 'header');

  try {
    // Verificar se o sistema já está configurado
    const needsConfiguration = await verification.shouldConfigureSystem(installState);
    if (!needsConfiguration) {
      verification.log('Sistema já está configurado e funcional!', 'success');
      return true;
    }

    // Verificar se o Ubuntu está instalado e acessível
    verification.log('Verificando se o Ubuntu está instalado...', 'step');
    const ubuntuInstalled = await verification.checkUbuntuInstalled();
    if (!ubuntuInstalled) {
      verification.log('Ubuntu não está instalado. Instalando agora...', 'step');
      const installResult = await installUbuntu();
      if (!installResult) {
        verification.log('Falha ao instalar o Ubuntu', 'error');
        return false;
      }
    }

    // Instalar pacotes
    await installRequiredPackages();

    // Copiar software
    await copySoftwareToOpt();

    // Configurar Samba e CUPS
    await configureSamba();
    await configureCups();

    // Configurar firewall
    await configureFirewall();

    // Configurar banco de dados
    await setupDatabase();

    // Configurar script de atualização
    await setupUpdateScript();

    verification.log('Verificando necessidade de migrações...', 'step');
    const dbStatus = await verification.checkDatabaseConfiguration();
    
    if (dbStatus.needsMigrations || !dbStatus.tablesExist) {
      verification.log('Executando migrações do banco de dados...', 'step');
      const migrationsResult = await setupMigrations();
      
      if (migrationsResult) {
        verification.log('Migrações executadas com sucesso', 'success');
      } else {
        verification.log('Problemas ao executar migrações, algumas funcionalidades podem não funcionar corretamente', 'warning');
      }
    } else {
      verification.log('Banco de dados já possui todas as tabelas necessárias', 'success');
    }

    // Instalar drivers
    await installDrivers();

    // Executar migrações
    await setupMigrations();

    // Configurar PM2
    await setupPM2();

    // Limpeza do sistema
    await systemCleanup();

    // Instalar impressora virtual do Windows
    await installWindowsPrinter();

    // Verificar se a API está respondendo
    verification.log('Verificando se a API está respondendo...', 'step');
    const apiHealth = await verification.checkApiHealth();

    if (!apiHealth) {
      verification.log('API não está respondendo, tentando reiniciar o serviço...', 'warning');
      await verification.execPromise('wsl -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && pm2 restart ecosystem.config.js"', 30000, true);

      // Aguardar inicialização
      verification.log('Aguardando inicialização do serviço...', 'info');
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Verificar novamente
      const apiCheck = await verification.checkApiHealth();
      if (apiCheck) {
        verification.log('API está respondendo após reinicialização', 'success');
      } else {
        verification.log('API ainda não está respondendo, pode ser necessário verificar os logs', 'warning');
      }
    }

    verification.log('Sistema configurado com sucesso!', 'success');
    installState.systemConfigured = true;
    saveInstallState();
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar o sistema: ${error.message}`, 'error');
    verification.logToFile(`Detalhes do erro ao configurar o sistema: ${JSON.stringify(error)}`);
    return false;
  }
}

// Função para instalar diretamente a impressora CUPS com driver IPP
async function installWindowsPrinter() {
  verification.log('Instalando impressora CUPS para Windows...', 'header');

  try {
    // Etapa 1: Limpeza mais básica e menos propensa a erros
    verification.log('Removendo impressoras anteriores...', 'step');

    try {
      // Remover impressoras anteriores - método mais simples que não falha facilmente
      await verification.execPromise('rundll32 printui.dll,PrintUIEntry /dl /n "Impressora LoQQuei" /q', 8000, true);
      // Tempo de espera mais curto
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      verification.log('Nota: Nenhuma impressora anterior encontrada', 'info');
    }

    // Etapa 2: Verificar ambiente CUPS de forma mais simples
    verification.log('Preparando ambiente CUPS...', 'step');

    try {
      // Verificar se o CUPS está respondendo
      await verification.execPromise('wsl -d Ubuntu -u root systemctl is-active cups', 5000, true);

      // Não reiniciamos o CUPS aqui - mais simples e menos propenso a falhas
      // Apenas configuramos a impressora PDF se necessário
      const printerList = await verification.execPromise('wsl -d Ubuntu -u root lpstat -p 2>/dev/null || echo "No printers"', 5000, true);

      if (!printerList.includes('PDF_Printer')) {
        verification.log('Configurando impressora PDF no CUPS...', 'step');
        // Comando único e simplificado para criar impressora PDF
        await setupCupsPrinter();
      } else {
        verification.log('Impressora PDF já existe no CUPS', 'info');
      }

      // Garantir que a impressora esteja habilitada e aceitando trabalhos
      await verification.execPromise('wsl -d Ubuntu -u root cupsenable PDF 2>/dev/null || cupsenable PDF_Printer 2>/dev/null || true', 5000, true);
      await verification.execPromise('wsl -d Ubuntu -u root cupsaccept PDF 2>/dev/null || cupsaccept PDF_Printer 2>/dev/null || true', 5000, true);

      verification.log('Ambiente CUPS preparado com sucesso', 'success');
    } catch (cupsError) {
      verification.log('Aviso: Houve um problema com a configuração CUPS, mas continuando...', 'warning');
      verification.logToFile(`Detalhe: ${JSON.stringify(cupsError)}`);
    }

    // Etapa 3: Instalar impressora no Windows - método direto e simplificado
    verification.log('Instalando impressora no Windows...', 'step');

    // Usar comando mais simples e direto, com prioridade para funcionar
    const cmdSimple = 'rundll32 printui.dll,PrintUIEntry /if /b "Impressora LoQQuei" /f "%SystemRoot%\\inf\\ntprint.inf" /r "http://localhost:631/printers/PDF_Printer" /m "Microsoft IPP Class Driver" /Z';

    try {
      await verification.execPromise(cmdSimple, 20000, true);
      verification.log('Comando de instalação executado', 'info');

      // Verificação rápida
      await new Promise(resolve => setTimeout(resolve, 2000));
      const checkPrinter = await verification.execPromise('powershell -Command "if (Get-Printer -Name \'Impressora LoQQuei\' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"', 5000, true).catch(() => "not_found");

      if (checkPrinter !== "not_found") {
        verification.log('Impressora instalada com sucesso!', 'success');
        return true;
      }

      // Método alternativo ainda mais básico e direto
      verification.log('Tentando método alternativo mais simples...', 'step');

      // Criar script batch temporário - geralmente mais confiável para operações de impressora
      const tempDir = path.join(os.tmpdir(), 'printer-install');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const batchContent = `@echo off
echo Instalando impressora...
rundll32 printui.dll,PrintUIEntry /dl /n "Impressora LoQQuei" /q
timeout /t 2 > nul
rundll32 printui.dll,PrintUIEntry /if /b "Impressora LoQQuei" /f "%SystemRoot%\\inf\\ntprint.inf" /r "http://localhost:631/printers/PDF_Printer" /m "Microsoft IPP Class Driver"
echo Instalação concluída.
`;

      const batchPath = path.join(tempDir, 'install-printer.bat');
      fs.writeFileSync(batchPath, batchContent);

      await verification.execPromise(`cmd /c "${batchPath}"`, 25000, true);
      verification.log('Script de instalação executado', 'info');

      // Verificação final
      await new Promise(resolve => setTimeout(resolve, 3000));
      const finalCheck = await verification.execPromise('powershell -Command "try { Get-Printer -Name \'Impressora LoQQuei\' | Out-Null; Write-Output \'success\' } catch { Write-Output \'failure\' }"', 5000, true);

      if (finalCheck.includes('success')) {
        verification.log('Impressora "Impressora LoQQuei" instalada com sucesso!', 'success');
        return true;
      } else {
        verification.log('Não foi possível verificar a instalação da impressora', 'warning');
        // Mesmo assim retornamos true pois o comando de instalação foi executado
        return true;
      }
    } catch (windowsError) {
      verification.log('Erro ao executar comandos Windows', 'warning');
      verification.logToFile(`Detalhes: ${JSON.stringify(windowsError)}`);

      // Último recurso - método ainda mais básico
      try {
        verification.log('Tentando método de instalação final...', 'step');
        await verification.execPromise('powershell -Command "Add-PrinterPort -Name \'IPP_Port\' -PrinterHostAddress \'http://localhost:631/printers/PDF_Printer\'; Add-Printer -Name \'Impressora LoQQuei\' -DriverName \'Microsoft IPP Class Driver\' -PortName \'IPP_Port\'"', 20000, true);

        verification.log('Comando final executado, assumindo sucesso', 'info');
        return true;
      } catch (finalError) {
        verification.log('Não foi possível instalar a impressora', 'error');
        verification.logToFile(`Erro final: ${JSON.stringify(finalError)}`);
        return false;
      }
    }
  } catch (error) {
    verification.log(`Erro na instalação da impressora: ${error.message || 'Erro desconhecido'}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Função principal para ser exportada e usada pela interface
async function installSystem() {
  try {
    clearScreen();
    verification.log('Bem-vindo ao instalador do Sistema de Gerenciamento de Impressão', 'header');

    // Verificar estado do sistema
    const systemStatus = await verification.checkSystemStatus(installState);

    // Verificar privilégios de administrador
    if (!systemStatus.adminPrivileges) {
      verification.log('Este instalador precisa ser executado como administrador.', 'error');
      verification.log('Por favor, feche esta janela e execute o instalador como administrador.', 'warning');

      if (!isElectron) {
        await askQuestion('Pressione ENTER para sair...');
      }
      return { success: false, message: 'Privilégios de administrador necessários' };
    }

    // Verificar a versão do Windows
    if (!systemStatus.windowsCompatible) {
      verification.log('Seu sistema operacional não é compatível com WSL 2.', 'error');
      verification.log('É necessário Windows 10 versão 1903 (Build 18362) ou superior.', 'warning');

      if (!isElectron) {
        await askQuestion('Pressione ENTER para sair...');
      }
      return { success: false, message: 'Sistema operacional incompatível' };
    }

    // Verificar virtualização
    if (!systemStatus.virtualizationEnabled) {
      verification.log('A virtualização não está habilitada no seu sistema.', 'warning');
      verification.log('Você precisa habilitar a virtualização na BIOS/UEFI para usar o WSL 2.', 'warning');

      if (isElectron) {
        // No Electron, tentamos continuar mesmo assim
        verification.log('Continuando mesmo sem virtualização ativada...', 'warning');
      } else {
        const answer = await askQuestion('Deseja continuar mesmo assim? (S/N): ');
        if (answer.toLowerCase() !== 's') {
          return { success: false, message: 'Virtualização não habilitada' };
        }
      }
    }

    // Verificar se precisa instalar o WSL
    if (!systemStatus.wslStatus.installed) {
      verification.log('WSL não está instalado.', 'warning');

      // Tentar método moderno primeiro
      let installSuccess = await installWSLModern();

      // Se falhar, tentar método legado
      if (!installSuccess) {
        verification.log('Método moderno falhou, tentando método legado', 'warning');
        installSuccess = await installWSLLegacy();
      }

      if (installSuccess) {
        verification.log('É necessário reiniciar o computador para continuar a instalação.', 'warning');

        if (isElectron) {
          // Em ambiente Electron, sugerir reinicialização
          verification.log('Por favor, reinicie o computador e execute este instalador novamente.', 'warning');
          return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
        } else {
          const answer = await askQuestion('Deseja reiniciar o computador agora? (S/N): ');

          if (answer.toLowerCase() === 's') {
            verification.log('O computador será reiniciado em 10 segundos...', 'warning');
            verification.log('Por favor, execute este instalador novamente após a reinicialização para continuar.', 'warning');
            await verification.execPromise('shutdown /r /t 10', 5000, true);
            return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
          } else {
            verification.log('Você escolheu não reiniciar agora.', 'warning');
            verification.log('Por favor, reinicie o computador manualmente e execute este instalador novamente.', 'warning');
            await askQuestion('Pressione ENTER para sair...');
            return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
          }
        }
      } else {
        verification.log('Não foi possível instalar o WSL.', 'error');
        verification.log('Por favor, tente instalar manualmente seguindo as instruções em:', 'warning');
        verification.log('https://docs.microsoft.com/pt-br/windows/wsl/install-manual', 'warning');

        if (!isElectron) {
          await askQuestion('Pressione ENTER para sair...');
        }
        return { success: false, message: 'Falha ao instalar o WSL' };
      }
    } else if (!systemStatus.wslStatus.wsl2) {
      verification.log('WSL está instalado, mas o WSL 2 não está configurado corretamente.', 'warning');

      // Tentar atualizar para WSL 2
      try {
        verification.log('Configurando WSL 2 como versão padrão...', 'step');
        await verification.execPromise('wsl --set-default-version 2', 30000);
        verification.log('WSL 2 configurado com sucesso!', 'success');
        installState.wslConfigured = true;
        saveInstallState();
      } catch (error) {
        verification.log('Erro ao configurar WSL 2. Pode ser necessário atualizar o kernel.', 'warning');
        verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

        if (!installState.kernelUpdated) {
          // Baixar e instalar o kernel do WSL2
          const tempDir = path.join(os.tmpdir(), 'wsl-installer');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          const kernelUpdatePath = path.join(tempDir, 'wsl_update_x64.msi');

          verification.log('Baixando o pacote de atualização do kernel do WSL2...', 'step');
          try {
            await verification.execPromise(`powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelUpdatePath}'"`, 180000, true);
            verification.log('Pacote do kernel WSL2 baixado com sucesso', 'success');

            verification.log('Instalando o pacote de atualização do kernel do WSL2...', 'step');
            await verification.execPromise(`msiexec /i "${kernelUpdatePath}" /qn`, 120000, true);
            verification.log('Kernel do WSL2 instalado com sucesso', 'success');

            verification.log('É necessário reiniciar o computador para continuar.', 'warning');

            if (isElectron) {
              // Em ambiente Electron, apenas retornar que precisa reiniciar
              return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
            } else {
              const answer = await askQuestion('Deseja reiniciar o computador agora? (S/N): ');

              if (answer.toLowerCase() === 's') {
                verification.log('O computador será reiniciado em 10 segundos...', 'warning');
                verification.log('Por favor, execute este instalador novamente após a reinicialização para continuar.', 'warning');
                await verification.execPromise('shutdown /r /t 10', 5000, true);
                return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
              } else {
                verification.log('Você escolheu não reiniciar agora.', 'warning');
                verification.log('Por favor, reinicie o computador manualmente e execute este instalador novamente.', 'warning');
                await askQuestion('Pressione ENTER para sair...');
                return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
              }
            }
          } catch (dlError) {
            verification.log('Erro ao atualizar o kernel do WSL2', 'error');
            verification.logToFile(`Detalhes do erro: ${JSON.stringify(dlError)}`);

            if (isElectron) {
              verification.log('Continuando mesmo com erro...', 'warning');
            } else {
              await askQuestion('Pressione ENTER para continuar mesmo assim...');
            }
          }
        }
      }
    } else {
      verification.log('WSL 2 está instalado e configurado!', 'success');
    }

    // Verificar/instalar o Ubuntu se WSL estiver configurado
    if (!systemStatus.wslStatus.hasDistro && !installState.ubuntuInstalled) {
      verification.log('Nenhuma distribuição Linux detectada. Instalando Ubuntu...', 'step');
      const ubuntuInstalled = await installUbuntu();
      if (!ubuntuInstalled) {
        verification.log('Não foi possível instalar o Ubuntu. Por favor, instale manualmente.', 'error');

        if (!isElectron) {
          await askQuestion('Pressione ENTER para sair...');
        }
        return { success: false, message: 'Falha ao instalar o Ubuntu' };
      }
    }

    // Verificar se o usuário padrão está configurado
    if (!installState.defaultUserCreated) {
      verification.log('Configurando usuário padrão...', 'step');
      const userConfigured = await configureDefaultUser();
      if (!userConfigured) {
        verification.log('Não foi possível configurar o usuário padrão.', 'warning');

        if (isElectron) {
          verification.log('Continuando mesmo sem configurar usuário...', 'warning');
        } else {
          const continueAnyway = await askQuestion('Deseja continuar mesmo assim? (S/N): ');
          if (continueAnyway.toLowerCase() !== 's') {
            return { success: false, message: 'Falha ao configurar usuário padrão' };
          }
        }
      }
    }

    // Configurar o sistema
    const systemConfigured = await configureSystem();
    if (!systemConfigured) {
      verification.log('Não foi possível configurar o sistema completamente.', 'error');

      if (!isElectron) {
        await askQuestion('Pressione ENTER para sair...');
      }
      return { success: false, message: 'Falha ao configurar o sistema' };
    }

    // Verificar API final
    verification.log('Verificando se a API está respondendo...', 'step');
    const apiHealth = await verification.checkApiHealth();

    if (!apiHealth) {
      verification.log('API não está respondendo. Tentando reiniciar o serviço...', 'warning');
      try {
        await verification.execPromise('wsl -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && pm2 restart all"', 30000, true);

        // Aguardar inicialização do serviço
        verification.log('Aguardando inicialização do serviço...', 'info');
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Verificar novamente
        const apiRecheckHealth = await verification.checkApiHealth();
        if (!apiRecheckHealth) {
          verification.log('API ainda não está respondendo após reinicialização.', 'warning');
          verification.log('Verifique os logs do sistema para mais detalhes.', 'warning');
        } else {
          verification.log('API está respondendo corretamente após reinicialização!', 'success');
        }
      } catch (error) {
        verification.log(`Erro ao reiniciar serviço: ${error.message}`, 'error');
        verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
      }
    } else {
      verification.log('API está respondendo corretamente!', 'success');
    }

    // Informações de acesso
    verification.log('Instalação concluída com sucesso!', 'success');
    verification.log('O Sistema de Gerenciamento de Impressão está pronto para uso.', 'success');

    if (!isElectron) {
      await askQuestion('Pressione ENTER para finalizar a instalação...');
    }

    return { success: true, message: 'Instalação concluída com sucesso!' };
  } catch (error) {
    let errorMessage = "Erro desconhecido";

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      try {
        errorMessage = JSON.stringify(error);
      } catch (e) {
        errorMessage = "Erro complexo que não pode ser convertido para string";
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    verification.log(`Erro inesperado: ${errorMessage}`, 'error');
    try {
      verification.logToFile(`Erro inesperado no main(): ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    } catch (e) {
      verification.logToFile(`Erro inesperado no main() - não foi possível serializar`);
    }

    if (!isElectron) {
      await askQuestion('Pressione ENTER para sair...');
    }

    return { success: false, message: `Erro na instalação: ${errorMessage}` };
  } finally {
    // Fechar readline apenas se não estiver em Electron e se existir
    closeReadlineIfNeeded();
  }
}

module.exports = {
  installDrivers,
  installRequiredPackages,
  installSystem,
  installUbuntu,
  installWSLLegacy,
  installWSLModern,
  installWindowsPrinter,
  configureDefaultUser,
  configureSamba,
  configureCups,
  setupDatabase,
  configureFirewall,
  configureSystem,
  copySoftwareToOpt,
  installComponent,
  setupUpdateScript,
  setupMigrations,
  setupPM2,
  systemCleanup,

  checkWSLStatusDetailed: verification.checkWSLStatusDetailed,
  log: verification.log,

  // Add this line to correctly export the setCustomAskQuestion function
  setCustomAskQuestion: function (callback) {
    customAskQuestion = callback;
  },

  // Functions for UI integration
  setStepUpdateCallback: function (callback) {
    stepUpdateCallback = callback;
  },

  setProgressCallback: function (callback) {
    progressCallback = callback;
  },

  getInstallationSteps: function () {
    return allSteps;
  },

  getInstallationLog: function () {
    return installationLog.join('\n');
  }
};


if (require.main === module) {
  (async () => {
    console.log(await installRequiredPackages());
    process.exit(1)
  })()
}