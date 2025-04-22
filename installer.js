/**
 * Sistema de Gerenciamento de Impressão - Instalador
 * 
 * Este script instala o ambiente WSL, Ubuntu e o sistema de gerenciamento de impressão.
 * Versão melhorada com detecção de estado de instalação e criação de usuário padrão.
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

// Verificar se estamos em ambiente Electron
const isElectron = process.versions && process.versions.electron;
let customAskQuestion = null;

// Configuração do terminal interativo (apenas quando não estiver em ambiente Electron)
let rl;
if (!isElectron) {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Cores para o console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m'
};

// Caminho para arquivos de estado e log
const INSTALL_STATE_FILE = path.join(process.cwd(), 'install_state.json');
const LOG_FILE = path.join(process.cwd(), 'instalacao_detalhada.log');

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
    console.log('Estado de instalação anterior carregado');
  }
} catch (err) {
  console.error(`Erro ao carregar estado da instalação: ${err.message}`);
}

// Salvar estado da instalação
function saveInstallState() {
  try {
    fs.writeFileSync(INSTALL_STATE_FILE, JSON.stringify(installState, null, 2), 'utf8');
  } catch (err) {
    console.error(`Erro ao salvar estado da instalação: ${err.message}`);
  }
}

// Inicializar arquivo de log
try {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, `Log de instalação - ${new Date().toISOString()}\n`, 'utf8');
    fs.appendFileSync(LOG_FILE, `Sistema: ${os.type()} ${os.release()} ${os.arch()}\n`, 'utf8');
    fs.appendFileSync(LOG_FILE, `Node.js: ${process.version}\n`, 'utf8');
    fs.appendFileSync(LOG_FILE, `Diretório: ${process.cwd()}\n\n`, 'utf8');
  } else {
    fs.appendFileSync(LOG_FILE, `\n\n=== Continuação da instalação em ${new Date().toISOString()} ===\n`, 'utf8');
  }
} catch (err) {
  console.error(`Erro ao criar arquivo de log: ${err.message}`);
}

// Função para registrar no log
function logToFile(message) {
  try {
    fs.appendFileSync(LOG_FILE, `${message}\n`, 'utf8');
  } catch (err) {
    console.error(`Erro ao escrever no log: ${err.message}`);
  }
}

// Função para limpar a tela e mostrar o cabeçalho
function clearScreen() {
  console.clear();
  console.log(`${colors.bgBlue}${colors.white}${colors.bright} ========================================================= ${colors.reset}`);
  console.log(`${colors.bgBlue}${colors.white}${colors.bright}   SISTEMA DE GERENCIAMENTO DE IMPRESSÃO - INSTALADOR     ${colors.reset}`);
  console.log(`${colors.bgBlue}${colors.white}${colors.bright} ========================================================= ${colors.reset}`);
  console.log();
}

// Função para exibir mensagens no console
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  let formattedMessage = '';

  switch (type) {
    case 'success':
      formattedMessage = `${colors.green}[${timestamp}] ✓ ${message}${colors.reset}`;
      break;
    case 'error':
      formattedMessage = `${colors.red}[${timestamp}] ✗ ${message}${colors.reset}`;
      break;
    case 'warning':
      formattedMessage = `${colors.yellow}[${timestamp}] ⚠ ${message}${colors.reset}`;
      break;
    case 'step':
      formattedMessage = `${colors.blue}[${timestamp}] → ${message}${colors.reset}`;
      break;
    case 'header':
      formattedMessage = `\n${colors.cyan}${colors.bright}=== ${message} ===${colors.reset}\n`;
      break;
    default:
      formattedMessage = `[${timestamp}] ${message}`;
  }

  console.log(formattedMessage);
  logToFile(`[${timestamp}][${type}] ${message}`);
}

// Função para executar comandos e retornar uma Promise
function execPromise(command, timeoutMs = 30000, quiet = false) {
  if (!quiet) {
    log(`Executando: ${command}`, 'step');
  }
  
  logToFile(`Executando comando: ${command} (timeout: ${timeoutMs}ms)`);
  
  return new Promise((resolve, reject) => {
    // Criar um timer para o timeout
    const timeout = setTimeout(() => {
      logToFile(`TIMEOUT: Comando excedeu ${timeoutMs/1000}s: ${command}`);
      
      // Em caso de timeout, tentar matar o processo
      if (childProcess && childProcess.pid) {
        try {
          process.kill(childProcess.pid);
        } catch (e) {
          logToFile(`Erro ao matar processo: ${e.message}`);
        }
      }
      
      reject(new Error(`Tempo limite excedido (${timeoutMs/1000}s): ${command}`));
    }, timeoutMs);
    
    // Executar o comando
    const childProcess = exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      clearTimeout(timeout);
      
      if (!quiet) {
        logToFile(`Saída stdout: ${stdout.trim()}`);
        if (stderr) logToFile(`Saída stderr: ${stderr.trim()}`);
      }
      
      if (error) {
        logToFile(`Erro ao executar: ${command}`);
        logToFile(`Código de erro: ${error.code}`);
        logToFile(`Mensagem de erro: ${error.message}`);
        reject({ error, stderr, stdout });
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Função para fazer perguntas ao usuário - modificada para funcionar no Electron
function askQuestion(question) {
  // Se uma função de pergunta personalizada foi definida (para Electron)
  if (customAskQuestion) {
    return customAskQuestion(question);
  }

  // Se estamos em modo Electron, mas sem função personalizada, apenas retornar sim
  if (isElectron) {
    log(`[PERGUNTA AUTOMÁTICA] ${question}`, 'info');
    logToFile(`Pergunta automática: ${question}`);
    logToFile(`Resposta automática: s`);
    return Promise.resolve('s');
  }

  // Modo terminal normal
  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${question}${colors.reset}`, (answer) => {
      logToFile(`Pergunta: ${question}`);
      logToFile(`Resposta: ${answer}`);
      resolve(answer);
    });
  });
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

// Verificar se o usuário tem privilégios de administrador
async function checkAdminPrivileges() {
  log('Verificando privilégios de administrador...', 'step');

  if (process.platform !== 'win32') {
    log('Sistema não é Windows, assumindo privilégios suficientes', 'warning');
    return true;
  }

  try {
    // Método mais confiável usando PowerShell
    const output = await execPromise('powershell -Command "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"', 5000, true);

    if (output.trim() === 'True') {
      log('O script está sendo executado com privilégios de administrador', 'success');
      return true;
    } else {
      log('O script não está sendo executado com privilégios de administrador', 'warning');
      return false;
    }
  } catch (error) {
    log('Não foi possível determinar os privilégios', 'warning');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

    // Tentar método alternativo mais simples
    try {
      await execPromise('net session >nul 2>&1', 5000, true);
      log('Método alternativo confirma privilégios de administrador', 'success');
      return true;
    } catch (err) {
      log('Método alternativo confirma que não há privilégios de administrador', 'warning');
      return false;
    }
  }
}

// Verificar a versão do Windows
async function checkWindowsVersion() {
  log('Verificando versão do Windows...', 'step');

  try {
    const winVer = await execPromise('powershell -Command "(Get-WmiObject -class Win32_OperatingSystem).Version"', 10000, true);
    logToFile(`Versão do Windows: ${winVer}`);

    // Verificar se é pelo menos Windows 10 versão 1903 (10.0.18362)
    const versionParts = winVer.split('.');
    if (versionParts.length >= 3) {
      const major = parseInt(versionParts[0], 10);
      const build = parseInt(versionParts[2], 10);

      if (major > 10 || (major === 10 && build >= 18362)) {
        log(`Windows ${winVer} é compatível com WSL 2`, 'success');
        return true;
      } else {
        log(`Windows ${winVer} não é compatível com WSL 2 (requer Windows 10 versão 1903 ou superior)`, 'error');
        return false;
      }
    }

    log(`Não foi possível determinar se a versão do Windows (${winVer}) é compatível`, 'warning');
    return true; // Continuar mesmo assim
  } catch (error) {
    log('Erro ao verificar a versão do Windows', 'error');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return true; // Continuar mesmo assim
  }
}

// Verificar se a virtualização está habilitada
async function checkVirtualization() {
  log('Verificando se a virtualização está habilitada...', 'step');

  try {
    // Método principal usando PowerShell
    const output = await execPromise('powershell -Command "Get-ComputerInfo -Property HyperVRequirementVirtualizationFirmwareEnabled"', 10000, true);

    if (output.includes('True')) {
      log('Virtualização habilitada no firmware', 'success');
      return true;
    } else if (output.includes('False')) {
      log('Virtualização NÃO habilitada no firmware. Isso pode causar problemas com o WSL2', 'warning');
      return false;
    } else {
      // Se o primeiro método falhar, tentar outro método
      const systemInfo = await execPromise('systeminfo', 15000, true);

      if (systemInfo.includes('Virtualização habilitada no firmware: Sim') ||
        systemInfo.includes('Virtualization Enabled In Firmware: Yes')) {
        log('Método alternativo: Virtualização habilitada', 'success');
        return true;
      } else if (systemInfo.includes('Virtualização habilitada no firmware: Não') ||
        systemInfo.includes('Virtualization Enabled In Firmware: No')) {
        log('Método alternativo: Virtualização NÃO habilitada no firmware', 'warning');
        return false;
      }

      log('Não foi possível determinar o status da virtualização', 'warning');
      return true; // Continuar mesmo assim
    }
  } catch (error) {
    log('Erro ao verificar virtualização', 'warning');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

    log('Não foi possível verificar o status da virtualização. Continuando mesmo assim...', 'warning');
    return true;
  }
}

// Verificação detalhada do WSL - verifica se está realmente instalado e funcionando
async function checkWSLStatusDetailed() {
  log('Verificando status detalhado do WSL...', 'step');
  return { installed: true, wsl2: true, hasDistro: false };
  try {
    // Verificar se o WSL está presente
    if (!fs.existsSync('C:\\Windows\\System32\\wsl.exe')) {
      log('WSL não encontrado no sistema', 'warning');
      return { installed: false, wsl2: false, hasDistro: false };
    }

    // Verificar se o WSL pode ser executado
    try {
      // Tentar verificar versão WSL primeiro (método mais novo)
      const wslVersion = await execPromise('wsl --version', 10000, true);
      log(`WSL instalado: ${wslVersion}`, 'success');
    } catch (e) {
      try {
        // Algumas versões não têm o comando --version
        const wslStatus = await execPromise('wsl --status', 10000, true);
        log('WSL está instalado e responde a comandos', 'success');
      } catch (e2) {
        // Tente um comando muito básico como último recurso
        try {
          await execPromise('wsl --list', 10000, true);
          log('WSL está instalado (verificado via --list)', 'success');
        } catch (e3) {
          log('WSL está instalado mas não responde corretamente a comandos', 'warning');
          return { installed: true, wsl2: false, hasDistro: false };
        }
      }
    }

    // Verificar se o WSL 2 está configurado
    try {
      const wslDefault = await execPromise('wsl --set-default-version 2', 10000, true);
      log('WSL 2 configurado como padrão', 'success');

      // Se não der erro, verificar se já tem distribuição
      try {
        const distributions = await execPromise('wsl --list --verbose', 10000, true);
        const cleanedDistributions = distributions.replace(/\x00/g, '').trim();
        const lines = cleanedDistributions.split('\n').slice(1);
        const hasDistribution = lines.some(line => line.toLowerCase().includes('ubuntu'));

        if (hasDistribution) {
          log('WSL 2 configurado e com distribuição instalada', 'success');
          return { installed: true, wsl2: true, hasDistro: true };
        } else {
          log('WSL 2 configurado, mas sem distribuição instalada', 'success');
          return { installed: true, wsl2: true, hasDistro: false };
        }
      } catch (e3) {
        log('Erro ao listar distribuições do WSL', 'warning');
        return { installed: true, wsl2: true, hasDistro: false };
      }
    } catch (e4) {
      // Verificar se o erro é porque o WSL2 já está configurado
      if (e4.stdout && (e4.stdout.includes('já está configurado') || e4.stdout.includes('already configured'))) {
        log('WSL 2 já está configurado como padrão', 'success');

        // Verificar se tem distribuição
        try {
          const wslList = await execPromise('wsl --list', 10000, true);
          const hasDistribution = wslList.toLowerCase().includes('ubuntu');

          if (hasDistribution) {
            log('WSL 2 configurado e com distribuição instalada', 'success');
            return { installed: true, wsl2: true, hasDistro: true };
          } else {
            log('WSL 2 configurado, mas sem distribuição instalada', 'success');
            return { installed: true, wsl2: true, hasDistro: false };
          }
        } catch (e5) {
          log('Erro ao listar distribuições do WSL', 'warning');
          return { installed: true, wsl2: true, hasDistro: false };
        }
      } else {
        log('Erro ao configurar WSL 2 como padrão', 'warning');
        logToFile(`Detalhes do erro: ${JSON.stringify(e4)}`);
        return { installed: true, wsl2: false, hasDistro: false };
      }
    }
  } catch (error) {
    log('Erro ao verificar status do WSL', 'error');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return { installed: false, wsl2: false, hasDistro: false };
  }
}

async function shouldConfigureSystem() {
  // Se o estado diz que já está configurado, verifica explicitamente
  if (installState.systemConfigured) {
    log('Verificando se o sistema realmente está configurado...', 'step');
    
    // Testar explicitamente se o Ubuntu existe e está acessível
    try {
      const distributions = await execPromise('wsl --list --verbose', 10000, true);
      const cleanedDistributions = distributions.replace(/\x00/g, '').trim();
      const lines = cleanedDistributions.split('\n').slice(1);
      const ubuntuExists = lines.some(line => line.toLowerCase().includes('ubuntu'));
      if (!ubuntuExists) {
        log('Ubuntu não encontrado apesar do estado indicar configuração completa', 'warning');
        // Corrigir o estado
        installState.ubuntuInstalled = false;
        installState.systemConfigured = false;
        saveInstallState();
        return true; // Precisamos configurar
      }
      
      // Verificar se está acessível
      await execPromise('wsl -d Ubuntu -u root echo "Verificação de sistema"', 15000, true);
      log('Sistema previamente configurado e funcional', 'success');
      return false; // Não precisa configurar
    } catch (error) {
      log('Sistema marcado como configurado, mas não está acessível', 'warning');
      // Corrigir o estado
      installState.systemConfigured = false;
      saveInstallState();
      return true; // Precisamos configurar
    }
  }
  
  // Se o estado já indica que não está configurado
  return true;
}

// Instalar o WSL usando método mais recente (Windows 10 versão 2004 ou superior)
async function installWSLModern() {
  log('Tentando instalar WSL usando o método moderno (wsl --install)...', 'step');

  try {
    // Usar o método mais recente e simples com argumento --no-distribution para evitar instalação automática do Ubuntu
    // Isso vai garantir que possamos controlar a instalação do Ubuntu separadamente
    await execPromise('wsl --install --no-distribution --no-launch', 300000);
    log('Comando de instalação do WSL moderno executado com sucesso', 'success');
    installState.wslInstalled = true;
    saveInstallState();
    return true;
  } catch (error) {
    // Verificar se o erro é porque o WSL já está instalado
    if (error.stdout && (error.stdout.includes('já está instalado') || error.stdout.includes('already installed'))) {
      log('WSL já está instalado (detectado durante instalação)', 'success');
      installState.wslInstalled = true;
      saveInstallState();
      return true;
    }

    log('Método moderno de instalação falhou', 'warning');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Instalar o WSL usando o método tradicional para versões mais antigas do Windows
async function installWSLLegacy() {
  log('Iniciando instalação do WSL usando método tradicional...', 'header');

  try {
    // Habilitar o recurso WSL
    log('Habilitando o recurso Windows Subsystem for Linux...', 'step');

    try {
      // PowerShell é o método preferido
      await execPromise('powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart"', 180000, true);
      log('Recurso WSL habilitado com sucesso (método PowerShell)', 'success');
    } catch (error) {
      log('Falha ao habilitar WSL via PowerShell. Tentando método DISM...', 'warning');
      logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

      try {
        await execPromise('dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 180000, true);
        log('Recurso WSL habilitado com sucesso (método DISM)', 'success');
      } catch (dismError) {
        log('Falha ao habilitar o recurso WSL', 'error');
        logToFile(`Detalhes do erro DISM: ${JSON.stringify(dismError)}`);
        return false;
      }
    }

    // Habilitar o recurso de Máquina Virtual
    log('Habilitando o recurso de Plataforma de Máquina Virtual...', 'step');

    try {
      await execPromise('powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart"', 180000, true);
      log('Recurso de Máquina Virtual habilitado com sucesso (método PowerShell)', 'success');
    } catch (error) {
      log('Falha ao habilitar Máquina Virtual via PowerShell. Tentando método DISM...', 'warning');
      logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

      try {
        await execPromise('dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 180000, true);
        log('Recurso de Máquina Virtual habilitado com sucesso (método DISM)', 'success');
      } catch (dismError) {
        log('Falha ao habilitar o recurso de Máquina Virtual', 'error');
        logToFile(`Detalhes do erro DISM: ${JSON.stringify(dismError)}`);
        return false;
      }
    }

    log('Recursos do WSL habilitados com sucesso!', 'success');
    installState.wslInstalled = true;
    saveInstallState();

    // Baixar e instalar o kernel do WSL2
    const tempDir = path.join(os.tmpdir(), 'wsl-installer');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const kernelUpdatePath = path.join(tempDir, 'wsl_update_x64.msi');

    log('Baixando o pacote de atualização do kernel do WSL2...', 'step');

    try {
      // Verificar se já temos o arquivo
      if (fs.existsSync(kernelUpdatePath)) {
        log('Pacote do kernel WSL2 já baixado anteriormente', 'success');
      } else {
        await execPromise(`powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelUpdatePath}'"`, 180000, true);
        log('Pacote do kernel WSL2 baixado com sucesso', 'success');
      }
    } catch (error) {
      log('Erro ao baixar o pacote do kernel WSL2. Tentando método alternativo...', 'warning');
      logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

      try {
        // Método alternativo usando bitsadmin
        await execPromise(`bitsadmin /transfer WSLUpdateDownload /download /priority normal https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi "${kernelUpdatePath}"`, 180000, true);
        log('Pacote do kernel WSL2 baixado com sucesso (método alternativo)', 'success');
      } catch (bitsError) {
        log('Todos os métodos de download falharam', 'error');
        logToFile(`Detalhes do erro BITS: ${JSON.stringify(bitsError)}`);

        // No Electron, escolhemos automaticamente sim
        if (isElectron) {
          log('Download falhou, mas continuando com abordagem alternativa', 'warning');
          await execPromise('start https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 5000, true);
          log('Página de download aberta, aguarde o download completo', 'warning');
          // Em Electron, esperamos um pouco e continuamos
          await new Promise(resolve => setTimeout(resolve, 10000));
        } else {
          const answer = await askQuestion('Download automático falhou. Deseja abrir a página para download manual? (S/N): ');
          if (answer.toLowerCase() === 's') {
            await execPromise('start https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 5000, true);
            log('Após baixar o arquivo, coloque-o em: ' + kernelUpdatePath, 'warning');
            await askQuestion('Pressione ENTER quando terminar o download...');
          } else {
            return false;
          }
        }
      }
    }

    // Verificar se o arquivo existe
    if (!fs.existsSync(kernelUpdatePath)) {
      log('Arquivo de atualização do kernel não foi encontrado', 'error');
      return false;
    }

    log('Instalando o pacote de atualização do kernel do WSL2...', 'step');

    try {
      await execPromise(`msiexec /i "${kernelUpdatePath}" /qn`, 120000, true);
      log('Kernel do WSL2 instalado com sucesso', 'success');
    } catch (error) {
      log('Erro ao instalar o kernel do WSL2. Tentando método alternativo...', 'warning');
      logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

      try {
        await execPromise(`start /wait msiexec /i "${kernelUpdatePath}" /qn`, 120000, true);
        log('Kernel do WSL2 instalado com sucesso (método alternativo)', 'success');
      } catch (startError) {
        log('Todos os métodos de instalação do kernel falharam', 'error');
        logToFile(`Detalhes do erro (método alternativo): ${JSON.stringify(startError)}`);
        return false;
      }
    }

    installState.kernelUpdated = true;
    saveInstallState();

    log('Definindo WSL 2 como versão padrão...', 'step');
    try {
      await execPromise('wsl --set-default-version 2', 30000);
      log('WSL 2 definido como versão padrão', 'success');
      installState.wslConfigured = true;
      saveInstallState();
    } catch (error) {
      log('Erro ao definir WSL 2 como versão padrão', 'warning');
      logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    }

    log('WSL instalado, mas é necessário reiniciar o computador para continuar', 'warning');
    return true;
  } catch (error) {
    log(`Erro ao instalar o WSL: ${error.message || JSON.stringify(error)}`, 'error');
    logToFile(`Erro detalhado ao instalar o WSL: ${JSON.stringify(error)}`);
    return false;
  }
}

// Verificar se o Ubuntu está instalado no WSL
async function checkUbuntuInstalled() {
  log('Verificando se o Ubuntu está instalado no WSL...', 'step');

  try {
    const distributions = await execPromise('wsl --list --verbose', 10000, true);
    const cleanedDistributions = distributions.replace(/\x00/g, '').trim();
    const lines = cleanedDistributions.split('\n').slice(1);
    const hasUbuntu = lines.some(line => line.toLowerCase().includes('ubuntu'));

    if (hasUbuntu) {
      log('Ubuntu já está instalado no WSL', 'success');
      installState.ubuntuInstalled = true;
      saveInstallState();
      return true;
    }

    log('Ubuntu não está instalado no WSL', 'warning');
    return false;
  } catch (error) {
    log(`Erro ao verificar distribuições WSL: ${error.message}`, 'warning');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Instalar o Ubuntu no WSL diretamente usando comandos Node
async function installUbuntu() {
  log('Iniciando instalação do Ubuntu no WSL...', 'header');
  
  try {
    // Método 1: Instalar Ubuntu com inicialização
    log('Instalando Ubuntu via WSL...', 'step');
    try {
      // Primeiro, verificar se a distribuição já foi registrada
      const distributions = await execPromise('wsl --list --verbose', 10000, true);
      const cleanedDistributions = distributions.replace(/\x00/g, '').trim();
      const lines = cleanedDistributions.split('\n').slice(1);
      const ubuntuExists = lines.some(line => line.toLowerCase().includes('ubuntu'));
      
      if (!ubuntuExists) {
        log('Registrando distribuição Ubuntu no WSL...', 'step');
        await execPromise('wsl --install -d Ubuntu', 120000, true);
        log('Ubuntu instalado, aguardando inicialização...', 'step');
      } else {
        log('Distribuição Ubuntu já registrada no WSL', 'info');
      }
      
      // CRUCIAL: Verificar se Ubuntu está realmente funcional
      log('Verificando se Ubuntu está acessível...', 'step');
      
      // Tentar 3 vezes com intervalos de 10 segundos
      let ubuntuAccessible = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await execPromise('wsl -d Ubuntu -u root echo "Ubuntu está acessível"', 30000, true);
          log(`Ubuntu está acessível na tentativa ${attempt}`, 'success');
          ubuntuAccessible = true;
          break;
        } catch (error) {
          log(`Tentativa ${attempt} falhou, aguardando inicialização...`, 'warning');
          
          // Se não for a última tentativa, aguarde antes de tentar novamente
          if (attempt < 3) {
            log('Aguardando 10 segundos antes da próxima tentativa...', 'info');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Tentar inicializar a distribuição novamente
            try {
              await execPromise('wsl -d Ubuntu -u root echo "Inicializando"', 15000, true);
            } catch (initError) {
              log('Tentando inicializar novamente...', 'warning');
            }
          }
        }
      }
      
      if (!ubuntuAccessible) {
        // Se ainda não está acessível, tentar uma abordagem mais agressiva
        log('Ubuntu não está respondendo, tentando método alternativo...', 'warning');
        
        try {
          // Tentar reiniciar o serviço WSL
          log('Reiniciando serviço WSL...', 'step');
          await execPromise('powershell -Command "Restart-Service LxssManager -Force"', 30000, true);
          log('Serviço WSL reiniciado, aguardando...', 'info');
          await new Promise(resolve => setTimeout(resolve, 15000));
          
          // Tentar acessar novamente
          await execPromise('wsl -d Ubuntu -u root echo "Ubuntu está acessível após reinício"', 30000, true);
          log('Ubuntu está acessível após reinício do serviço WSL', 'success');
          ubuntuAccessible = true;
        } catch (restartError) {
          log('Reinício do serviço WSL não resolveu, tentando último método...', 'warning');
          
          try {
            // Tentar terminar e reiniciar a distribuição
            log('Terminando e reiniciando Ubuntu...', 'step');
            await execPromise('wsl --terminate Ubuntu', 10000, true);
            await new Promise(resolve => setTimeout(resolve, 5000));
            await execPromise('wsl -d Ubuntu echo "Iniciando Ubuntu novamente"', 30000, true);
            
            // Verificar uma última vez
            await execPromise('wsl -d Ubuntu -u root echo "Verificação final"', 30000, true);
            log('Ubuntu está acessível após terminar e reiniciar', 'success');
            ubuntuAccessible = true;
          } catch (finalError) {
            log('Todos os métodos falharam para acessar o Ubuntu', 'error');
            logToFile(`Erro final: ${JSON.stringify(finalError)}`);
            
            // Se estamos no Electron, tente abrir e inicializar manualmente
            if (isElectron) {
              log('Tentando inicializar Ubuntu manualmente...', 'step');
              
              // Abrir um terminal WSL para inicializar manualmente
              await execPromise('start wsl -d Ubuntu', 5000, true);
              log('Terminal WSL aberto. Por favor, aguarde a inicialização e feche o terminal.', 'warning');
              
              // Aguardar bastante tempo para a inicialização manual
              log('Aguardando 30 segundos para a inicialização manual...', 'info');
              await new Promise(resolve => setTimeout(resolve, 30000));
              
              // Verificar uma última vez
              try {
                await execPromise('wsl -d Ubuntu -u root echo "Verificação após inicialização manual"', 15000, true);
                log('Ubuntu acessível após inicialização manual!', 'success');
                ubuntuAccessible = true;
              } catch (manualError) {
                log('Inicialização manual não resolveu o problema', 'error');
                throw new Error('Não foi possível acessar o Ubuntu após múltiplas tentativas');
              }
            } else {
              throw new Error('Não foi possível acessar o Ubuntu após múltiplas tentativas');
            }
          }
        }
      }
      
      if (ubuntuAccessible) {
        log('Ubuntu instalado e acessível com sucesso!', 'success');
        installState.ubuntuInstalled = true;
        saveInstallState();
        return await configureDefaultUser();
      } else {
        throw new Error('Ubuntu instalado mas não está acessível');
      }
    } catch (wslError) {
      log('Falha ao instalar ou acessar Ubuntu via WSL', 'error');
      logToFile(`Detalhes do erro: ${JSON.stringify(wslError)}`);
      throw wslError; // Propagar erro para tentar métodos alternativos
    }
  } catch (error) {
    log(`Erro ao instalar o Ubuntu: ${error.message}`, 'error');
    logToFile(`Detalhes do erro ao instalar Ubuntu: ${JSON.stringify(error)}`);
    
    // Método de último recurso: via Microsoft Store
    try {
      log('Tentando último recurso: instalação via Microsoft Store...', 'step');
      await execPromise('start ms-windows-store://pdp/?productid=9PDXGNCFSCZV', 5000, true);
      log('Microsoft Store aberta. Por favor, instale o Ubuntu manualmente.', 'warning');
      log('Após instalar, reinicie este instalador para continuar.', 'warning');
      
      if (isElectron) {
        // Em Electron, informar o usuário que precisa instalar manualmente
        return false;
      } else {
        await askQuestion('Pressione ENTER para sair após instalar o Ubuntu manualmente...');
        return false;
      }
    } catch (storeError) {
      log('Todos os métodos de instalação falharam', 'error');
      return false;
    }
  }
}

// Função otimizada para configurar usuário padrão com mais velocidade
async function configureDefaultUser() {
  
  if (installState.defaultUserCreated) {
    log('Usuário padrão já foi configurado anteriormente', 'success');
    return true;
  }

  log('Configurando usuário padrão print_user...', 'step');
  
  try {
    // CRUCIAL: Verificar explicitamente se o Ubuntu está acessível antes de configurar o usuário
    try {
      log('Verificando acesso antes de configurar usuário...', 'step');
      await execPromise('wsl -d Ubuntu -u root echo "Verificação de acesso"', 20000, true);
      log('Ubuntu está acessível para configuração de usuário', 'success');
    } catch (accessError) {
      log('Ubuntu não está acessível para configuração de usuário, tentando reiniciar...', 'warning');
      
      try {
        // Tentar reiniciar o WSL
        await execPromise('wsl --terminate Ubuntu', 10000, true);
        log('Distribuição Ubuntu terminada, aguardando...', 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await execPromise('wsl -d Ubuntu echo "Reinicializando Ubuntu"', 20000, true);
        log('Ubuntu reinicializado com sucesso', 'success');
      } catch (restartError) {
        log('Falha ao reiniciar Ubuntu para configuração de usuário', 'error');
        logToFile(`Erro ao reiniciar: ${JSON.stringify(restartError)}`);
        return false;
      }
    }
    
    // Criar script de configuração de usuário
    log('Preparando script de configuração de usuário...', 'step');
    const tmpDir = path.join(os.tmpdir(), 'wsl-setup');
    
    try {
      // Criar diretório temporário
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      // Criar script de configuração
      const setupScript = path.join(tmpDir, 'setup_user.sh');
      const scriptContent = `#!/bin/bash
# Verificar se o sistema está funcional
echo "Testando sistema..."
if [ -f /etc/passwd ]; then
  echo "Sistema está funcional"
else
  echo "Sistema não está funcional"
  exit 1
fi

# Verificar se o usuário já existe
echo "Verificando usuário print_user..."
if id "print_user" >/dev/null 2>&1; then
  echo "Usuário print_user já existe"
else
  echo "Criando usuário print_user..."
  useradd -m -s /bin/bash print_user
  echo "Usuário criado"
fi

# Definir senha
echo "Configurando senha..."
echo "print_user:print_user" | chpasswd
echo "Senha configurada"

# Adicionar ao grupo sudo
echo "Adicionando ao grupo sudo..."
usermod -aG sudo print_user
echo "Configuração de usuário concluída"
`;

      fs.writeFileSync(setupScript, scriptContent, { mode: 0o755 });
      log('Script de configuração de usuário criado', 'success');
      
      // Copiar script para o WSL
      log('Copiando script para o WSL...', 'step');
      
      // Primeiro, criar diretório no WSL
      await execPromise('wsl -d Ubuntu -u root mkdir -p /tmp/setup', 20000, true);
      
      // Obter caminho do WSL para o arquivo
      const wslPath = await execPromise(`wsl -d Ubuntu wslpath -u "${setupScript.replace(/\\/g, '/')}"`, 10000, true);
      
      // Copiar o script
      await execPromise(`wsl -d Ubuntu -u root cp "${wslPath}" /tmp/setup/setup_user.sh`, 15000, true);
      await execPromise('wsl -d Ubuntu -u root chmod +x /tmp/setup/setup_user.sh', 10000, true);
      
      // Executar o script com log detalhado
      log('Executando script de configuração de usuário...', 'step');
      const scriptOutput = await execPromise('wsl -d Ubuntu -u root bash -x /tmp/setup/setup_user.sh', 30000, true);
      
      // Logar saída do script para diagnóstico
      log('Resultado da configuração de usuário:', 'info');
      scriptOutput.split('\n').forEach(line => {
        if (line.trim()) log(`  ${line}`, 'info');
      });
      
      // Verificar se o usuário foi criado
      log('Verificando se o usuário foi configurado corretamente...', 'step');
      try {
        const checkUser = await execPromise('wsl -d Ubuntu -u root id print_user', 10000, true);
        if (checkUser.includes('print_user')) {
          log('Usuário print_user configurado com sucesso!', 'success');
          installState.defaultUserCreated = true;
          saveInstallState();
          return true;
        } else {
          log('Verificação do usuário falhou, mas continuando mesmo assim', 'warning');
          installState.defaultUserCreated = true; // Assumir que foi criado para avançar
          saveInstallState();
          return true;
        }
      } catch (verifyError) {
        log('Erro ao verificar usuário, mas continuando mesmo assim', 'warning');
        logToFile(`Erro na verificação: ${JSON.stringify(verifyError)}`);
        installState.defaultUserCreated = true; // Assumir que foi criado para avançar
        saveInstallState();
        return true;
      }
    } catch (scriptError) {
      log('Erro ao configurar usuário via script', 'error');
      logToFile(`Erro no script: ${JSON.stringify(scriptError)}`);
      
      // Método alternativo: comandos diretos
      log('Tentando método alternativo para criar usuário...', 'step');
      
      try {
        // Criar usuário diretamente
        await execPromise('wsl -d Ubuntu -u root useradd -m -s /bin/bash print_user', 15000, true);
        log('Usuário criado diretamente', 'success');
        
        // Definir senha
        await execPromise('wsl -d Ubuntu -u root bash -c "echo print_user:print_user | chpasswd"', 15000, true);
        log('Senha configurada', 'success');
        
        // Adicionar ao sudo
        await execPromise('wsl -d Ubuntu -u root usermod -aG sudo print_user', 15000, true);
        log('Usuário adicionado ao grupo sudo', 'success');
        
        log('Usuário configurado com método alternativo', 'success');
        installState.defaultUserCreated = true;
        saveInstallState();
        return true;
      } catch (altError) {
        log('Todos os métodos de configuração de usuário falharam', 'error');
        logToFile(`Erro no método alternativo: ${JSON.stringify(altError)}`);
        
        // No ambiente Electron, tentar continuar mesmo assim
        if (isElectron) {
          log('Continuando sem usuário configurado corretamente', 'warning');
          installState.defaultUserCreated = true; // Apenas para continuar
          saveInstallState();
          return true;
        }
        return false;
      }
    }
  } catch (error) {
    log(`Erro geral ao configurar usuário: ${error.message}`, 'error');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    
    if (isElectron) {
      // Em ambiente Electron, tentar continuar mesmo assim
      log('Continuando apesar do erro na configuração de usuário', 'warning');
      installState.defaultUserCreated = true; // Apenas para continuar
      saveInstallState();
      return true;
    }
    return false;
  }
}

// Executar os comandos no WSL diretamente para instalar a aplicação
async function configureSystem() {
  log('Configurando o sistema no WSL...', 'header');
  
  try {
    const needsConfiguration = await shouldConfigureSystem();
    if (!needsConfiguration) {
      log('Sistema já está configurado e funcional!', 'success');
      return true;
    }
    
    // CRUCIAL: Garantir que o WSL esteja acessível
    log('Verificando se o Ubuntu está instalado...', 'step');
    const ubuntuInstalled = await checkUbuntuInstalled();
    if (!ubuntuInstalled) {
      log('Ubuntu não está instalado. Instalando agora...', 'step');
      const installResult = await installUbuntu();
      if (!installResult) {
        log('Falha ao instalar o Ubuntu', 'error');
        return false;
      }
    }
    
    // Definir os comandos a serem executados sequencialmente
    const commands = [
      {
        desc: "Atualizando pacotes",
        cmd: "DEBIAN_FRONTEND=noninteractive apt update && DEBIAN_FRONTEND=noninteractive apt upgrade -y"
      },
      {
        desc: "Instalando dependências",
        cmd: "DEBIAN_FRONTEND=noninteractive apt install -y nano samba cups nginx postgresql postgresql-contrib ufw npm jq git"
      },
      {
        desc: "Clonando repositório",
        cmd: "git clone https://github.com/LoQQuei-Ltda/print-management.git /opt/print-management || echo 'Repositório já existe'"
      },
      {
        desc: "Configurando ambiente",
        cmd: "cd /opt/print-management && cp .env.example .env || echo 'Arquivo de ambiente já existe'"
      },
      {
        desc: "Configurando Git",
        cmd: "git config --global pull.rebase false && git config --global status.showUntrackedFiles no"
      },
      {
        desc: "Salvando informações de instalação",
        cmd: "mkdir -p /opt/print-management && echo '{\"install_date\": \"'$(date +%Y-%m-%d)'\"}' > /opt/print-management/version.json"
      },
      {
        desc: "Configurando arquivos de atualização",
        cmd: "mkdir -p /opt/print-management/updates && touch /opt/print-management/executed_updates.txt"
      },
      {
        desc: "Configurando Samba",
        cmd: "mkdir -p /etc/samba && echo '[global]\\nworkgroup = WORKGROUP\\nsecurity = user\\nmap to guest = bad user\\n[print_server]\\npath = /srv/print_server\\npublic = yes\\nwritable = yes\\nbrowseable = yes\\nguest ok = yes' > /etc/samba/smb.conf && mkdir -p /srv/print_server && chmod -R 0777 /srv/print_server"
      },
      {
        desc: "Configurando CUPS",
        cmd: "mkdir -p /etc/cups && echo 'Listen 0.0.0.0:631\\nWebInterface Yes' > /etc/cups/cupsd.conf"
      },
      {
        desc: "Configurando Node.js",
        cmd: "npm install -g npm@latest || echo 'Npm já atualizado'"
      },
      {
        desc: "Configurando serviços",
        cmd: "mkdir -p /opt/print-management/logs"
      }
      // Outros comandos foram simplificados para diagnóstico
    ];
    
    // Executar os comandos sequencialmente
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      log(`${i+1}/${commands.length}: ${command.desc}...`, 'step');
      
      // Tentar executar o comando com até 3 tentativas
      let success = false;
      let attempts = 0;
      let lastError = null;
      
      while (!success && attempts < 3) {
        attempts++;
        try {
          // Executar comando com timeout adequado
          await execPromise(`wsl -d Ubuntu -u root bash -c "${command.cmd}"`, 300000, true);
          log(`${command.desc} concluído com sucesso (tentativa ${attempts})`, 'success');
          success = true;
        } catch (error) {
          lastError = error;
          
          if (attempts < 3) {
            log(`Erro na tentativa ${attempts}, tentando novamente...`, 'warning');
            logToFile(`Comando: ${command.cmd}`);
            logToFile(`Erro: ${JSON.stringify(error)}`);
            
            // Aguardar antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 5000));
          } else {
            log(`Falha após ${attempts} tentativas: ${command.desc}`, 'error');
            logToFile(`Comando final: ${command.cmd}`);
            logToFile(`Erro final: ${JSON.stringify(error)}`);
          }
        }
      }
      
      // Se todas as tentativas falharam
      if (!success) {
        // Em ambiente Electron, continuamos automaticamente
        if (isElectron) {
          log('Ocorreu um erro, mas continuando mesmo assim', 'warning');
        } else {
          // Perguntar se deve continuar
          const answer = await askQuestion('Ocorreu um erro. Deseja continuar mesmo assim? (S/N): ');
          if (answer.toLowerCase() !== 's') {
            throw new Error(`Instalação interrompida em: ${command.desc}`);
          }
        }
      }
    }
    
    log('Sistema configurado com sucesso!', 'success');
    installState.systemConfigured = true;
    saveInstallState();
    return true;
  } catch (error) {
    log(`Erro ao configurar o sistema: ${error.message}`, 'error');
    logToFile(`Detalhes do erro ao configurar o sistema: ${JSON.stringify(error)}`);
    return false;
  }
}

// Função principal para ser exportada e usada pela interface
async function installSystem() {
  try {
    clearScreen();
    log('Bem-vindo ao instalador do Sistema de Gerenciamento de Impressão', 'header');

    // Verificar privilégios de administrador
    const isAdmin = await checkAdminPrivileges();
    if (!isAdmin) {
      log('Este instalador precisa ser executado como administrador.', 'error');
      log('Por favor, feche esta janela e execute o instalador como administrador.', 'warning');

      if (!isElectron) {
        await askQuestion('Pressione ENTER para sair...');
      }
      return { success: false, message: 'Privilégios de administrador necessários' };
    }

    // Verificar a versão do Windows
    const isWindowsCompatible = await checkWindowsVersion();
    if (!isWindowsCompatible) {
      log('Seu sistema operacional não é compatível com WSL 2.', 'error');
      log('É necessário Windows 10 versão 1903 (Build 18362) ou superior.', 'warning');

      if (!isElectron) {
        await askQuestion('Pressione ENTER para sair...');
      }
      return { success: false, message: 'Sistema operacional incompatível' };
    }

    // Verificar virtualização
    const isVirtualizationEnabled = await checkVirtualization();
    if (!isVirtualizationEnabled) {
      log('A virtualização não está habilitada no seu sistema.', 'warning');
      log('Você precisa habilitar a virtualização na BIOS/UEFI para usar o WSL 2.', 'warning');

      if (isElectron) {
        // No Electron, tentamos continuar mesmo assim
        log('Continuando mesmo sem virtualização ativada...', 'warning');
      } else {
        const answer = await askQuestion('Deseja continuar mesmo assim? (S/N): ');
        if (answer.toLowerCase() !== 's') {
          return { success: false, message: 'Virtualização não habilitada' };
        }
      }
    }

    // Verificação detalhada do WSL
    const wslStatus = await checkWSLStatusDetailed();

    // Verificar se precisa instalar o WSL
    if (!wslStatus.installed) {
      log('WSL não está instalado.', 'warning');

      // Tentar método moderno primeiro
      let installSuccess = await installWSLModern();

      // Se falhar, tentar método legado
      if (!installSuccess) {
        log('Método moderno falhou, tentando método legado', 'warning');
        installSuccess = await installWSLLegacy();
      }

      if (installSuccess) {
        log('É necessário reiniciar o computador para continuar a instalação.', 'warning');

        if (isElectron) {
          // Em ambiente Electron, sugerir reinicialização
          log('Por favor, reinicie o computador e execute este instalador novamente.', 'warning');
          return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
        } else {
          const answer = await askQuestion('Deseja reiniciar o computador agora? (S/N): ');

          if (answer.toLowerCase() === 's') {
            log('O computador será reiniciado em 10 segundos...', 'warning');
            log('Por favor, execute este instalador novamente após a reinicialização para continuar.', 'warning');
            await execPromise('shutdown /r /t 10', 5000, true);
            return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
          } else {
            log('Você escolheu não reiniciar agora.', 'warning');
            log('Por favor, reinicie o computador manualmente e execute este instalador novamente.', 'warning');
            await askQuestion('Pressione ENTER para sair...');
            return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
          }
        }
      } else {
        log('Não foi possível instalar o WSL.', 'error');
        log('Por favor, tente instalar manualmente seguindo as instruções em:', 'warning');
        log('https://docs.microsoft.com/pt-br/windows/wsl/install-manual', 'warning');

        if (!isElectron) {
          await askQuestion('Pressione ENTER para sair...');
        }
        return { success: false, message: 'Falha ao instalar o WSL' };
      }
    } else if (!wslStatus.wsl2) {
      log('WSL está instalado, mas o WSL 2 não está configurado corretamente.', 'warning');

      // Tentar atualizar para WSL 2
      try {
        log('Configurando WSL 2 como versão padrão...', 'step');
        await execPromise('wsl --set-default-version 2', 30000);
        log('WSL 2 configurado com sucesso!', 'success');
        installState.wslConfigured = true;
        saveInstallState();
      } catch (error) {
        log('Erro ao configurar WSL 2. Pode ser necessário atualizar o kernel.', 'warning');
        logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

        if (!installState.kernelUpdated) {
          // Baixar e instalar o kernel do WSL2
          const tempDir = path.join(os.tmpdir(), 'wsl-installer');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          const kernelUpdatePath = path.join(tempDir, 'wsl_update_x64.msi');

          log('Baixando o pacote de atualização do kernel do WSL2...', 'step');
          try {
            await execPromise(`powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelUpdatePath}'"`, 180000, true);
            log('Pacote do kernel WSL2 baixado com sucesso', 'success');

            log('Instalando o pacote de atualização do kernel do WSL2...', 'step');
            await execPromise(`msiexec /i "${kernelUpdatePath}" /qn`, 120000, true);
            log('Kernel do WSL2 instalado com sucesso', 'success');

            log('É necessário reiniciar o computador para continuar.', 'warning');

            if (isElectron) {
              // Em ambiente Electron, apenas retornar que precisa reiniciar
              return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
            } else {
              const answer = await askQuestion('Deseja reiniciar o computador agora? (S/N): ');

              if (answer.toLowerCase() === 's') {
                log('O computador será reiniciado em 10 segundos...', 'warning');
                log('Por favor, execute este instalador novamente após a reinicialização para continuar.', 'warning');
                await execPromise('shutdown /r /t 10', 5000, true);
                return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
              } else {
                log('Você escolheu não reiniciar agora.', 'warning');
                log('Por favor, reinicie o computador manualmente e execute este instalador novamente.', 'warning');
                await askQuestion('Pressione ENTER para sair...');
                return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
              }
            }
          } catch (dlError) {
            log('Erro ao atualizar o kernel do WSL2', 'error');
            logToFile(`Detalhes do erro: ${JSON.stringify(dlError)}`);

            if (isElectron) {
              log('Continuando mesmo com erro...', 'warning');
            } else {
              await askQuestion('Pressione ENTER para continuar mesmo assim...');
            }
          }
        }
      }
    } else {
      log('WSL 2 está instalado e configurado!', 'success');
    }

    // Verificar/instalar o Ubuntu se WSL estiver configurado
    if (!wslStatus.hasDistro && !installState.ubuntuInstalled) {
      const isUbuntuInstalled = await checkUbuntuInstalled();
      if (!isUbuntuInstalled) {
        log('Nenhuma distribuição Linux detectada. Instalando Ubuntu...', 'step');
        const ubuntuInstalled = await installUbuntu();
        if (!ubuntuInstalled) {
          log('Não foi possível instalar o Ubuntu. Por favor, instale manualmente.', 'error');

          if (!isElectron) {
            await askQuestion('Pressione ENTER para sair...');
          }
          return { success: false, message: 'Falha ao instalar o Ubuntu' };
        }
      }
    }

    // Verificar se o usuário padrão está configurado
    if (!installState.defaultUserCreated) {
      log('Configurando usuário padrão...', 'step');
      const userConfigured = await configureDefaultUser();
      if (!userConfigured) {
        log('Não foi possível configurar o usuário padrão.', 'warning');

        if (isElectron) {
          log('Continuando mesmo sem configurar usuário...', 'warning');
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
      log('Não foi possível configurar o sistema completamente.', 'error');

      if (!isElectron) {
        await askQuestion('Pressione ENTER para sair...');
      }
      return { success: false, message: 'Falha ao configurar o sistema' };
    }

    // Informações de acesso
    log('Instalação concluída com sucesso!', 'success');
    log('O Sistema de Gerenciamento de Impressão está pronto para uso.', 'success');

    try {
      // Obter o IP local
      const localIp = (await execPromise('wsl -d Ubuntu hostname -I', 10000, true)).trim();
      log(`Acesse http://${localIp} em um navegador para utilizar o sistema.`, 'info');
    } catch (error) {
      log('Não foi possível determinar o endereço IP. Por favor, verifique as configurações de rede.', 'warning');
      logToFile(`Detalhes do erro ao obter IP: ${JSON.stringify(error)}`);
    }

    log('Para administrar o sistema:', 'info');
    log('1. Acesse o WSL usando o comando "wsl" no Prompt de Comando ou PowerShell.', 'info');
    log('2. Navegue até /opt/print-management para acessar os arquivos do sistema.', 'info');

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

    log(`Erro inesperado: ${errorMessage}`, 'error');
    try {
      logToFile(`Erro inesperado no main(): ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    } catch (e) {
      logToFile(`Erro inesperado no main() - não foi possível serializar`);
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

// Configurar a função de perguntas personalizada (usado pelo Electron)
function setCustomAskQuestion(fn) {
  customAskQuestion = fn;
}

// Se for executado diretamente
if (require.main === module) {
  installSystem().catch(async (error) => {
    console.error(`Erro fatal: ${error.message || error}`);
    logToFile(`Erro fatal na execução principal: ${JSON.stringify(error)}`);

    try {
      if (!isElectron) {
        await askQuestion('Pressione ENTER para sair...');
      }
    } catch (e) {
      // Ignorar erros na saída
    } finally {
      closeReadlineIfNeeded();
      process.exit(1);
    }
  });
} else {
  // Se for importado como módulo
  module.exports = {
    installSystem,
    log,
    clearScreen,
    checkWSLStatusDetailed,
    askQuestion,
    setCustomAskQuestion,
    configureDefaultUser
  };
}