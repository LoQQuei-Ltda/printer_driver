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
function execPromise(command, timeoutMs = 60000, quiet = false) {
  if (!quiet) {
    log(`Executando: ${command}`, 'step');
  }
  
  logToFile(`Executando comando: ${command}`);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      logToFile(`TIMEOUT: Comando excedeu ${timeoutMs/1000}s: ${command}`);
      reject(new Error(`Tempo limite excedido (${timeoutMs/1000}s): ${command}`));
    }, timeoutMs);
    
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      clearTimeout(timeout);
      
      logToFile(`Saída stdout: ${stdout.trim()}`);
      if (stderr) logToFile(`Saída stderr: ${stderr.trim()}`);
      
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
  
  try {
    // Tenta executar um comando que requer privilégios de administrador
    await execPromise('powershell -Command "Start-Process -FilePath cmd.exe -ArgumentList \'/c echo Teste de privilégios administrativos\' -Verb RunAs -WindowStyle Hidden -ErrorAction Stop"', 10000, true);
    log('O script está sendo executado com privilégios de administrador', 'success');
    return true;
  } catch (error) {
    log('O script não está sendo executado com privilégios de administrador', 'warning');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    
    log('Tentando método alternativo para verificar...', 'step');
    try {
      const output = await execPromise('powershell -Command "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"', 5000, true);
      if (output.trim() === 'True') {
        log('Método alternativo confirma privilégios de administrador', 'success');
        return true;
      } else {
        log('Método alternativo confirma que não há privilégios de administrador', 'warning');
        return false;
      }
    } catch (err) {
      log('Não foi possível determinar os privilégios', 'warning');
      logToFile(`Detalhes do erro (método alternativo): ${JSON.stringify(err)}`);
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
      const minor = parseInt(versionParts[1], 10);
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
    const output = await execPromise('powershell -Command "Get-ComputerInfo -Property HyperVRequirementVirtualizationFirmwareEnabled"', 10000, true);
    
    if (output.includes('True')) {
      log('Virtualização habilitada no firmware', 'success');
      return true;
    } else if (output.includes('False')) {
      log('Virtualização NÃO habilitada no firmware. Isso pode causar problemas com o WSL2', 'warning');
      return false;
    } else {
      log('Não foi possível determinar o status da virtualização', 'warning');
      logToFile(`Saída do comando: ${output}`);
      return true; // Continuar mesmo assim
    }
  } catch (error) {
    log('Erro ao verificar virtualização', 'warning');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    
    // Tentar método alternativo
    try {
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
    } catch (e) {
      logToFile(`Erro no método alternativo: ${e.message}`);
    }
    
    log('Não foi possível verificar o status da virtualização. Continuando mesmo assim...', 'warning');
    return true;
  }
}

// Verificação detalhada do WSL - verifica se está realmente instalado e funcionando
async function checkWSLStatusDetailed() {
  log('Verificando status detalhado do WSL...', 'step');
  
  try {
    // Verificar se o WSL está presente
    if (!fs.existsSync('C:\\Windows\\System32\\wsl.exe')) {
      log('WSL não encontrado no sistema', 'warning');
      return { installed: false, wsl2: false, hasDistro: false };
    }
    
    // Verificar se o WSL pode ser executado
    try {
      const wslVersion = await execPromise('wsl --version', 10000, true);
      log(`WSL instalado: ${wslVersion}`, 'success');
    } catch (e) {
      try {
        // Algumas versões não têm o comando --version
        const wslStatus = await execPromise('wsl --status', 10000, true);
        log('WSL está instalado e responde a comandos', 'success');
      } catch (e2) {
        log('WSL está instalado mas não responde corretamente', 'warning');
        return { installed: true, wsl2: false, hasDistro: false };
      }
    }
    
    // Verificar se o WSL 2 está configurado
    try {
      const wslDefault = await execPromise('wsl --set-default-version 2', 10000, true);
      
      // Se não der erro, verificar se já tem distribuição
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
      } catch (e3) {
        log('Erro ao listar distribuições do WSL', 'warning');
        return { installed: true, wsl2: true, hasDistro: false };
      }
    } catch (e4) {
      log('Erro ao configurar WSL 2 como padrão', 'warning');
      return { installed: true, wsl2: false, hasDistro: false };
    }
  } catch (error) {
    log('Erro ao verificar status do WSL', 'error');
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return { installed: false, wsl2: false, hasDistro: false };
  }
}

// Instalar o WSL usando método mais recente (Windows 10 versão 2004 ou superior)
async function installWSLModern() {
  log('Tentando instalar WSL usando o método moderno (wsl --install)...', 'step');
  
  try {
    await execPromise('wsl --install', 300000);
    log('Comando de instalação do WSL moderno executado com sucesso', 'success');
    installState.wslInstalled = true;
    saveInstallState();
    return true;
  } catch (error) {
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
      await execPromise(`powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelUpdatePath}'"`, 180000, true);
      log('Pacote do kernel WSL2 baixado com sucesso', 'success');
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
    const distributions = await execPromise('wsl --list', 10000, true);
    if (distributions.toLowerCase().includes('ubuntu')) {
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
    // Usar o método wsl --install -d Ubuntu com aceite automático
    log('Baixando e instalando o Ubuntu (isso pode levar alguns minutos)...', 'step');
    log('A Microsoft Store pode ser aberta durante este processo.', 'warning');
    
    try {
      // Método 1: Usar echo y para aceitar os termos automaticamente
      log('Tentando instalar Ubuntu com aceite automático...', 'step');
      await execPromise('powershell -Command "echo y | wsl --install -d Ubuntu"', 600000, true);
      log('Ubuntu instalado com sucesso!', 'success');
    } catch (error) {
      log('O método de instalação com aceite automático falhou. Tentando método alternativo...', 'warning');
      logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
      
      try {
        // Método 2: Usar winget com opção de aceite automático
        log('Tentando instalar via winget com aceite automático...', 'step');
        await execPromise('powershell -Command "winget install -e --id Canonical.Ubuntu --accept-package-agreements --accept-source-agreements"', 600000, true);
        log('Ubuntu instalado com sucesso via winget!', 'success');
      } catch (wingetError) {
        log('O método winget também falhou. Tentando método manual...', 'warning');
        logToFile(`Detalhes do erro winget: ${JSON.stringify(wingetError)}`);
        
        try {
          log('Tentando método direto com WSL...', 'step');
          await execPromise('wsl --install -d Ubuntu', 600000, true);
          log('Ubuntu instalado com sucesso usando comando direto!', 'success');
        } catch (wslError) {
          log('Todos os métodos automáticos falharam.', 'error');
          logToFile(`Detalhes do erro WSL direto: ${JSON.stringify(wslError)}`);
          
          // No Electron, escolhemos automaticamente sim para continuar
          if (isElectron) {
            log('Abrindo a Microsoft Store automaticamente...', 'step');
            await execPromise('start ms-windows-store://pdp/?productid=9PDXGNCFSCZV', 5000, true);
            log('Microsoft Store aberta, aguarde a instalação', 'warning');
            // Em Electron, esperamos um pouco e continuamos
            await new Promise(resolve => setTimeout(resolve, 15000));
          } else {
            const answer = await askQuestion('Deseja abrir a Microsoft Store para instalar o Ubuntu manualmente? (S/N): ');
            
            if (answer.toLowerCase() === 's') {
              log('Abrindo a Microsoft Store...', 'step');
              await execPromise('start ms-windows-store://pdp/?productid=9PDXGNCFSCZV', 5000, true);
              
              log('Por favor, instale o Ubuntu da Microsoft Store e aceite os termos quando solicitado.', 'warning');
              await askQuestion('Pressione ENTER para continuar quando a instalação for concluída...');
            } else {
              log('Por favor, instale o Ubuntu manualmente da Microsoft Store.', 'warning');
              log('Após instalar, execute este instalador novamente.', 'warning');
              await askQuestion('Pressione ENTER para sair...');
              return false;
            }
          }
        }
      }
    }
    
    installState.ubuntuInstalled = true;
    saveInstallState();
    
    log('Ubuntu instalado com sucesso!', 'success');
    
    // Criar usuário padrão print_user
    return await configureDefaultUser();
  } catch (error) {
    log(`Erro ao instalar o Ubuntu: ${error.message}`, 'error');
    logToFile(`Detalhes do erro ao instalar Ubuntu: ${JSON.stringify(error)}`);
    return false;
  }
}

// Configurar usuário padrão print_user
async function configureDefaultUser() {
  if (installState.defaultUserCreated) {
    log('Usuário padrão já foi configurado anteriormente', 'success');
    return true;
  }

  log('Configurando usuário padrão print_user...', 'step');
  
  try {
    // Criar arquivo de configuração para o usuário padrão
    const tempDir = path.join(os.tmpdir(), 'wsl-installer');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const setupUserScriptPath = path.join(tempDir, 'setup_user.sh');
    const setupUserScript = `#!/bin/bash
# Verificar se usuário já existe
if id "print_user" &>/dev/null; then
  echo "Usuário print_user já existe"
else
  # Criar o usuário print_user com senha print_user
  useradd -m -s /bin/bash print_user
  echo "print_user:print_user" | chpasswd
  # Adicionar ao grupo sudo
  usermod -aG sudo print_user
  echo "Usuário print_user criado com sucesso"
fi
echo "Configuração de usuário concluída"
`;
    
    fs.writeFileSync(setupUserScriptPath, setupUserScript, 'utf8');
    log('Script de configuração de usuário criado', 'success');
    
    // Copiar o script para o WSL
    log('Copiando script para o Ubuntu...', 'step');
    
    // Primeiro criar um diretório temporário no WSL
    try {
      await execPromise('wsl -d Ubuntu -u root mkdir -p /tmp/setup', 10000, true);
      
      // Determinar o caminho do arquivo no WSL
      const wslPath = await execPromise(`wsl -d Ubuntu wslpath -u "${setupUserScriptPath.replace(/\\/g, '\\\\')}"`, 10000, true);
      
      // Copiar o script para o WSL
      if (wslPath) {
        await execPromise(`wsl -d Ubuntu -u root cp "${wslPath}" /tmp/setup/setup_user.sh`, 10000, true);
        await execPromise('wsl -d Ubuntu -u root chmod +x /tmp/setup/setup_user.sh', 10000, true);
        
        // Executar o script como root no WSL
        log('Executando script de configuração de usuário...', 'step');
        await execPromise('wsl -d Ubuntu -u root bash /tmp/setup/setup_user.sh', 30000, true);
        
        log('Usuário padrão print_user configurado com sucesso!', 'success');
        installState.defaultUserCreated = true;
        saveInstallState();
        return true;
      } else {
        throw new Error('Não foi possível determinar o caminho WSL para o script');
      }
    } catch (error) {
      log(`Erro ao configurar usuário padrão: ${error.message}`, 'error');
      logToFile(`Detalhes do erro ao configurar usuário: ${JSON.stringify(error)}`);
      
      // Método alternativo usando comandos diretamente
      try {
        log('Tentando método alternativo para configurar usuário...', 'step');
        
        await execPromise('wsl -d Ubuntu -u root bash -c "useradd -m -s /bin/bash print_user || echo Usuário já existe"', 30000, true);
        await execPromise('wsl -d Ubuntu -u root bash -c "echo print_user:print_user | chpasswd"', 30000, true);
        await execPromise('wsl -d Ubuntu -u root bash -c "usermod -aG sudo print_user"', 30000, true);
        
        log('Usuário padrão print_user configurado com sucesso! (método alternativo)', 'success');
        installState.defaultUserCreated = true;
        saveInstallState();
        return true;
      } catch (altError) {
        log(`Todos os métodos de configuração de usuário falharam: ${altError.message}`, 'error');
        logToFile(`Detalhes do erro (método alternativo): ${JSON.stringify(altError)}`);
        return false;
      }
    }
  } catch (error) {
    log(`Erro ao configurar usuário padrão: ${error.message}`, 'error');
    logToFile(`Detalhes do erro ao configurar usuário: ${JSON.stringify(error)}`);
    return false;
  }
}

// Executar os comandos no WSL diretamente para instalar a aplicação
async function configureSystem() {
  log('Configurando o sistema no WSL...', 'header');
  
  try {
    // Verificar se o sistema já está configurado
    if (installState.systemConfigured) {
      log('Sistema já está configurado!', 'success');
      return true;
    }
    
    // Definir os comandos a serem executados sequencialmente
    const commands = [
      {
        desc: "Atualizando pacotes",
        cmd: "sudo apt update && sudo apt upgrade -y"
      },
      {
        desc: "Instalando dependências",
        cmd: "sudo apt install -y nano samba cups nginx postgresql postgresql-contrib ufw npm jq git"
      },
      {
        desc: "Clonando repositório",
        cmd: "sudo git clone https://github.com/LoQQuei-Ltda/print-management.git /opt/print-management || echo 'Repositório já existe'"
      },
      {
        desc: "Configurando ambiente",
        cmd: "cd /opt/print-management && sudo cp .env.example .env"
      },
      {
        desc: "Configurando Git",
        cmd: "sudo git config --global pull.rebase false && sudo git config --global status.showUntrackedFiles no"
      },
      {
        desc: "Salvando informações de instalação",
        cmd: "cd /opt/print-management && COMMIT_HASH=$(git rev-parse HEAD) && INSTALL_DATE=$(date +%Y-%m-%d) && echo '{\"commit_hash\": \"'$COMMIT_HASH'\", \"install_date\": \"'$INSTALL_DATE'\"}' > version.json"
      },
      {
        desc: "Configurando arquivos de atualização",
        cmd: "mkdir -p /opt/print-management/updates && touch /opt/print-management/executed_updates.txt"
      },
      {
        desc: "Configurando Samba",
        cmd: "cd /opt/print-management && sudo cp smb.conf /etc/samba/smb.conf && sudo mkdir -p /srv/print_server && sudo chown -R nobody:nogroup /srv/print_server && sudo chmod -R 0777 /srv/print_server && sudo systemctl restart smbd"
      },
      {
        desc: "Configurando CUPS",
        cmd: "sudo cupsctl --remote-any && cd /opt/print-management && sudo cp cupsd.conf /etc/cups/cupsd.conf && sudo systemctl restart cups"
      },
      {
        desc: "Configurando Node.js",
        cmd: "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && export NVM_DIR=\"$HOME/.nvm\" && [ -s \"$NVM_DIR/nvm.sh\" ] && \\. \"$NVM_DIR/nvm.sh\" && nvm install 20 && nvm use 20"
      },
      {
        desc: "Instalando dependências do projeto",
        cmd: "cd /opt/print-management && sudo npm install npm@latest && sudo npm install"
      },
      {
        desc: "Configurando servidor",
        cmd: "cd /opt/print-management && node setup.js"
      },
      {
        desc: "Configurando firewall",
        cmd: "cd /opt/print-management && PORT=$(grep '^PORT=' .env | cut -d '=' -f2 | tr -d '[:space:]') && sudo ufw allow 137/udp && sudo ufw allow 138/udp && sudo ufw allow 22/tcp && sudo ufw allow 139/tcp && sudo ufw allow 445/tcp && sudo ufw allow 631/tcp && sudo ufw allow $PORT/tcp && sudo ufw --force enable"
      },
      {
        desc: "Criando banco de dados PostgreSQL",
        cmd: "cd /opt/print-management && DB_DATABASE=$(grep DB_DATABASE .env | cut -d '=' -f2) && sudo -u postgres psql -c \"create database $DB_DATABASE\" || echo 'Banco já existe'"
      },
      {
        desc: "Configurando usuário do banco de dados",
        cmd: "cd /opt/print-management && DB_USER=$(grep DB_USER .env | cut -d '=' -f2) && DB_PASSWORD=$(grep DB_PASSWORD .env | cut -d '=' -f2) && sudo -u postgres psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';\" || echo 'Usuário já existe' && sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE $DB_DATABASE TO $DB_USER;\" && sudo -u postgres psql -c \"ALTER USER $DB_USER WITH SUPERUSER;\""
      },
      {
        desc: "Executando migrações",
        cmd: "cd /opt/print-management && sudo chmod +x db/migrate.sh && sudo ./db/migrate.sh"
      },
      {
        desc: "Configurando PM2",
        cmd: "sudo npm install -g pm2 && cd /opt/print-management && pm2 start ecosystem.config.js && sudo pm2 save && sudo pm2 startup"
      },
      {
        desc: "Configurando NGINX",
        cmd: "cd /opt/print-management && sudo cp nginx.conf /etc/nginx/sites-available/print-management && sudo ln -s /etc/nginx/sites-available/print-management /etc/nginx/sites-enabled/ || echo 'Link já existe' && sudo nginx -t && sudo systemctl reload nginx"
      },
      {
        desc: "Limpando sistema",
        cmd: "sudo apt autoclean -y && sudo apt autoremove -y && sudo journalctl --vacuum-time=7d"
      }
    ];
    
    // Executar os comandos sequencialmente
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      log(`${i+1}/${commands.length}: ${command.desc}...`, 'step');
      
      try {
        // Executar comando com timeout generoso (10 minutos)
        await execPromise(`wsl -d Ubuntu -u print_user bash -c "${command.cmd}"`, 600000, true);
        log(`${command.desc} concluído com sucesso`, 'success');
      } catch (error) {
        log(`Erro ao executar: ${command.desc}`, 'error');
        logToFile(`Comando: ${command.cmd}`);
        logToFile(`Erro: ${JSON.stringify(error)}`);
        
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
    setCustomAskQuestion
  };
}