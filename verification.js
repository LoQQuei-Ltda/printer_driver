/**
 * Sistema de Gerenciamento de Impressão - Módulo de Verificação
 *
 * Este módulo contém funções para verificar os requisitos e componentes do sistema.
 */

const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Cores para o console
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
};

// Variáveis para armazenar caminhos
let LOG_FILE;

// Inicializar arquivos de log
function initLogFile(logFilePath) {
  LOG_FILE = logFilePath;
  try {
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, `Log de verificação - ${new Date().toISOString()}\n`, "utf8");
      fs.appendFileSync(LOG_FILE, `Sistema: ${os.type()} ${os.release()} ${os.arch()}\n`, "utf8");
      fs.appendFileSync(LOG_FILE, `Node.js: ${process.version}\n`, "utf8");
      fs.appendFileSync(LOG_FILE, `Diretório: ${process.cwd()}\n\n`, "utf8");
    } else {
      fs.appendFileSync(LOG_FILE, `\n\n=== Continuação da verificação em ${new Date().toISOString()} ===\n`, "utf8");
    }
  } catch (err) {
    console.error(`Erro ao criar arquivo de log: ${err.message}`);
  }
}

// Função para registrar no log
function logToFile(message) {
  try {
    if (LOG_FILE) {
      fs.appendFileSync(LOG_FILE, `${message}\n`, "utf8");
    }
  } catch (err) {
    console.error(`Erro ao escrever no log: ${err.message}`);
  }
}

// Função para exibir mensagens no console
function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  let formattedMessage = "";

  switch (type) {
    case "success":
      formattedMessage = `${colors.green}[${timestamp}] ✓ ${message}${colors.reset}`;
      break;
    case "error":
      formattedMessage = `${colors.red}[${timestamp}] ✗ ${message}${colors.reset}`;
      break;
    case "warning":
      formattedMessage = `${colors.yellow}[${timestamp}] ⚠ ${message}${colors.reset}`;
      break;
    case "step":
      formattedMessage = `${colors.blue}[${timestamp}] → ${message}${colors.reset}`;
      break;
    case "header":
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
    log(`Executando: ${command}`, "step");
  }

  logToFile(`Executando comando: ${command} (timeout: ${timeoutMs}ms)`);

  return new Promise((resolve, reject) => {
    // Criar um timer para o timeout
    const timeout = setTimeout(() => {
      logToFile(`TIMEOUT: Comando excedeu ${timeoutMs / 1000}s: ${command}`);

      // Em caso de timeout, tentar matar o processo
      if (childProcess && childProcess.pid) {
        try {
          process.kill(childProcess.pid);
        } catch (e) {
          logToFile(`Erro ao matar processo: ${e.message}`);
        }
      }

      reject(new Error(`Tempo limite excedido (${timeoutMs / 1000}s): ${command}`));
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

// Verificar se o usuário tem privilégios de administrador
async function checkAdminPrivileges() {
  log("Verificando privilégios de administrador...", "step");

  if (process.platform !== "win32") {
    log("Sistema não é Windows, assumindo privilégios suficientes", "warning");
    return true;
  }

  try {
    // Método mais confiável usando PowerShell
    const output = await execPromise(
      'powershell -Command "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
      5000,
      true
    );

    if (output.trim() === "True") {
      log("O script está sendo executado com privilégios de administrador", "success");
      return true;
    } else {
      log("O script não está sendo executado com privilégios de administrador", "warning");
      return false;
    }
  } catch (error) {
    log("Não foi possível determinar os privilégios", "warning");
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

    // Tentar método alternativo mais simples
    try {
      await execPromise("net session >nul 2>&1", 5000, true);
      log("Método alternativo confirma privilégios de administrador", "success");
      return true;
    } catch (err) {
      log("Método alternativo confirma que não há privilégios de administrador", "warning");
      return false;
    }
  }
}

// Verificar a versão do Windows
async function checkWindowsVersion() {
  log("Verificando versão do Windows...", "step");

  try {
    const winVer = await execPromise('powershell -Command "(Get-WmiObject -class Win32_OperatingSystem).Version"', 10000, true);
    logToFile(`Versão do Windows: ${winVer}`);

    // Verificar se é pelo menos Windows 10 versão 1903 (10.0.18362)
    const versionParts = winVer.split(".");
    if (versionParts.length >= 3) {
      const major = parseInt(versionParts[0], 10);
      const build = parseInt(versionParts[2], 10);

      if (major > 10 || (major === 10 && build >= 18362)) {
        log(`Windows ${winVer} é compatível com WSL 2`, "success");
        return true;
      } else {
        log(`Windows ${winVer} não é compatível com WSL 2 (requer Windows 10 versão 1903 ou superior)`, "error");
        return false;
      }
    }

    log(`Não foi possível determinar se a versão do Windows (${winVer}) é compatível`, "warning");
    return true; // Continuar mesmo assim
  } catch (error) {
    log("Erro ao verificar a versão do Windows", "error");
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return true; // Continuar mesmo assim
  }
}

// Verificar se a virtualização está habilitada
async function checkVirtualization() {
  log("Verificando se a virtualização está habilitada...", "step");

  const methods = [
    // Método 1: Verificação direta do Hyper-V
    async () => {
      try {
        const stdout = await execPromise('powershell "(Get-ComputerInfo HyperVRequirementVirtualizationFirmwareEnabled).HyperVRequirementVirtualizationFirmwareEnabled"');

        return stdout.trim().toLowerCase() === "true";
      } catch (error) {
        log("Erro ao verificar virtualização", "warning");
        logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
        return false;
      }
    },

    // Método 2: Verificação de recursos do Hyper-V
    async () => {
      try {
        const stdout = await execPromise("powershell \"Get-WindowsOptionalFeature -Online | Where-Object {$_.FeatureName -like '*Hyper-V*' -and $_.State -eq 'Enabled'}\"");

        return stdout.trim().length > 0;
      } catch (error) {
        log("Erro ao verificar virtualização", "warning");
        logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
        return false;
      }
    },

    // Método 3: Verificação via WMIC
    async () => {
      try {
        const stdout = await execPromise("wmic computersystem get virtualizationfirmware");

        return stdout.toLowerCase().includes("true");
      } catch (error) {
        log("Erro ao verificar virtualização", "warning");
        logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
        return false;
      }
    },

    // Método 4: Verificação via systeminfo
    async () => {
      try {
        const stdout = await execPromise('systeminfo | findstr /C:"Virtualization"');

        return stdout.toLowerCase().includes("enabled");
      } catch (error) {
        log("Erro ao verificar virtualização", "warning");
        logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
        return false;
      }
    },
  ];

  for (const method of methods) {
    try {
      const result = await method();

      if (result) {
        log("Virtualização habilitada no firmware", "success");
        return true;
      }
    } catch (error) {
      log("Erro ao verificar virtualização", "warning");
      logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

      log("Não foi possível verificar o status da virtualização. Continuando mesmo assim...", "warning");
      return true;
    }
  }
}

// Verificação detalhada do WSL - verifica se está realmente instalado e funcionando
async function checkWSLStatusDetailed() {
  log("Verificando status detalhado do WSL...", "step");

  try {
    // Verificar se o WSL está presente
    if (!fs.existsSync("C:\\Windows\\System32\\wsl.exe")) {
      log("WSL não encontrado no sistema", "warning");
      return { installed: false, wsl2: false, hasDistro: false };
    }

    // Verificar se o WSL pode ser executado
    try {
      // Tentar verificar versão WSL primeiro (método mais novo)
      const wslVersion = await execPromise("wsl --version", 10000, true);
      log(`WSL instalado: ${wslVersion}`, "success");
    } catch (e) {
      try {
        // Algumas versões não têm o comando --version
        const wslStatus = await execPromise("wsl --status", 10000, true);
        log("WSL está instalado e responde a comandos", "success");
      } catch (e2) {
        // Tente um comando muito básico como último recurso
        try {
          await execPromise("wsl --list", 10000, true);
          log("WSL está instalado (verificado via --list)", "success");
        } catch (e3) {
          log("WSL está instalado mas não responde corretamente a comandos", "warning");
          return { installed: true, wsl2: false, hasDistro: false };
        }
      }
    }

    // Verificar se o WSL 2 está configurado
    try {
      const wslDefault = await execPromise("wsl --set-default-version 2", 10000, true);

      function verifyDefaultWsl(message) {
        const cleanMessage = message.replace(/\u0000/g, '');
        
        const concluded = cleanMessage.toLowerCase().includes("conclu");
        const exited = cleanMessage.toLowerCase().includes("xito") || 
                            cleanMessage.toLowerCase().includes("exito");
        
        return concluded || exited;
      }

      const resultVerify = verifyDefaultWsl(wslDefault);

      if (resultVerify) {
        log("WSL 2 configurado como padrão", "success");
      } else {
        log(wslDefault);
        log("Não foi possível confirmar a configuração do WSL 2", "error");
      }

      // Se não der erro, verificar se já tem distribuição
      try {
        const distributions = await execPromise("wsl --list --verbose", 10000, true);
        const cleanedDistributions = distributions.replace(/\x00/g, "").trim();
        const lines = cleanedDistributions.split("\n").slice(1);
        const hasDistribution = lines.some((line) => line.toLowerCase().includes("ubuntu"));

        if (hasDistribution) {
          log("WSL 2 configurado e com distribuição instalada", "success");
          return { installed: true, wsl2: true, hasDistro: true };
        } else {
          log("WSL 2 configurado, mas sem distribuição instalada", "success");
          return { installed: true, wsl2: true, hasDistro: false };
        }
      } catch (e3) {
        log("Erro ao listar distribuições do WSL", "warning");
        return { installed: true, wsl2: true, hasDistro: false };
      }
    } catch (e4) {
      // Verificar se o erro é porque o WSL2 já está configurado
      if (e4.stdout && (e4.stdout.includes("já está configurado") || e4.stdout.includes("already configured"))) {
        log("WSL 2 já está configurado como padrão", "success");

        // Verificar se tem distribuição
        try {
          const wslList = await execPromise("wsl --list", 10000, true);
          const hasDistribution = wslList.toLowerCase().includes("ubuntu");

          if (hasDistribution) {
            log("WSL 2 configurado e com distribuição instalada", "success");
            return { installed: true, wsl2: true, hasDistro: true };
          } else {
            log("WSL 2 configurado, mas sem distribuição instalada", "success");
            return { installed: true, wsl2: true, hasDistro: false };
          }
        } catch (e5) {
          log("Erro ao listar distribuições do WSL", "warning");
          return { installed: true, wsl2: true, hasDistro: false };
        }
      } else {
        log("Erro ao configurar WSL 2 como padrão", "warning");
        logToFile(`Detalhes do erro: ${JSON.stringify(e4)}`);
        return { installed: true, wsl2: false, hasDistro: false };
      }
    }
  } catch (error) {
    log("Erro ao verificar status do WSL", "error");
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return { installed: false, wsl2: false, hasDistro: false };
  }
}

/**
 * Verifica se o Ubuntu está instalado no WSL com tratamento robusto para erros
 */
async function checkUbuntuInstalled() {
  log("Verificando se o Ubuntu está instalado no WSL...", "step");
  
  try {
    // Tentar o método detalhado primeiro
    try {
      const distributions = await execPromise("wsl --list --verbose", 10000, true);
      const cleanedDistributions = distributions.replace(/\x00/g, "").trim();
      const lines = cleanedDistributions.split("\n").filter(line => line.trim());
      
      // Verificar se há mais de uma linha (além do cabeçalho)
      if (lines.length > 1) {
        const hasUbuntu = lines.slice(1).some((line) => line.toLowerCase().includes("ubuntu"));
        if (hasUbuntu) {
          log("Ubuntu já está instalado no WSL", "success");
          return true;
        } else {
          log("Há distribuições WSL instaladas, mas nenhuma Ubuntu", "warning");
          return false;
        }
      } else {
        log("Nenhuma distribuição WSL encontrada (lista vazia)", "warning");
        return false;
      }
    } catch (listError) {
      // Verificar se o erro é por falta de distribuições
      let stdout = "";
      if (listError.stdout) {
        stdout = typeof listError.stdout === 'string' ? listError.stdout : listError.stdout.toString();
      }
      
      if (stdout && (
          stdout.includes("não tem distribuições") || 
          stdout.includes("no distributions") ||
          stdout.replace(/\x00/g, '').includes("o tem distribui")
      )) {
        log("WSL está instalado, mas sem distribuições", "warning");
        return false;
      }
      
      // Se não for o erro específico de "não tem distribuições", tentar método alternativo
      log("Erro na listagem detalhada, tentando método alternativo...", "warning");
      try {
        const simpleList = await execPromise("wsl --list", 10000, true);
        const cleanedSimpleList = typeof simpleList === 'string' ? simpleList : simpleList.toString();
        const hasUbuntu = cleanedSimpleList.toLowerCase().includes('ubuntu');
        
        if (hasUbuntu) {
          log("Ubuntu encontrado via listagem simples", "success");
          return true;
        } else {
          log("Ubuntu não encontrado via listagem simples", "warning");
          return false;
        }
      } catch (simpleListError) {
        // Verificar novamente o erro por falta de distribuições
        let simpleStdout = "";
        if (simpleListError.stdout) {
          simpleStdout = typeof simpleListError.stdout === 'string' ? 
            simpleListError.stdout : simpleListError.stdout.toString();
        }
        
        if (simpleStdout && (
            simpleStdout.includes("não tem distribuições") || 
            simpleStdout.includes("no distributions") ||
            simpleStdout.replace(/\x00/g, '').includes("o tem distribui")
        )) {
          log("Confirmado: WSL não tem distribuições instaladas", "warning");
          return false;
        }
        
        // Último recurso - tentar método com PowerShell
        log("Tentando verificar Ubuntu com PowerShell...", "warning");
        try {
          const psCommand = 'powershell -Command "(Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss | ForEach-Object { $_.GetValue(\'DistributionName\') })" 2>nul';
          const psOutput = await execPromise(psCommand, 10000, true);
          const hasUbuntu = psOutput.toLowerCase().includes('ubuntu');
          
          if (hasUbuntu) {
            log("Ubuntu encontrado via PowerShell registry check", "success");
            return true;
          } else {
            log("Ubuntu não encontrado via PowerShell registry check", "warning");
            return false;
          }
        } catch (psError) {
          log("Todos os métodos de verificação falharam", "error");
          logToFile(`Detalhes do erro final: ${JSON.stringify(psError)}`);
          return false;
        }
      }
    }
  } catch (error) {
    log(`Erro ao verificar distribuições WSL: ${error.message}`, "warning");
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}


// Verifica se o sistema já está completamente configurado ou se precisa de configuração
async function shouldConfigureSystem(installState) {
  // Se o estado diz que já está configurado, verifica explicitamente
  if (installState.systemConfigured) {
    log("Verificando se o sistema realmente está configurado...", "step");

    // Testar explicitamente se o Ubuntu existe e está acessível
    try {
      const distributions = await execPromise("wsl --list --verbose", 10000, true);
      const cleanedDistributions = distributions.replace(/\x00/g, "").trim();
      const lines = cleanedDistributions.split("\n").slice(1);
      const ubuntuExists = lines.some((line) => line.toLowerCase().includes("ubuntu"));
      if (!ubuntuExists) {
        log("Ubuntu não encontrado apesar do estado indicar configuração completa", "warning");
        // Corrigir o estado
        return true; // Precisamos configurar
      }

      // Verificar se está acessível
      await execPromise('wsl -d Ubuntu -u root echo "Verificação de sistema"', 15000, true);
      log("Sistema previamente configurado e funcional", "success");
      return false; // Não precisa configurar
    } catch (error) {
      log("Sistema marcado como configurado, mas não está acessível", "warning");
      return true; // Precisamos configurar
    }
  }

  // Se o estado já indica que não está configurado
  return true;
}

// Verificação completa do sistema
async function checkSystemStatus(installState) {
  log("Iniciando verificação completa do sistema...", "header");

  const results = {
    adminPrivileges: await checkAdminPrivileges(),
    windowsCompatible: await checkWindowsVersion(),
    virtualizationEnabled: await checkVirtualization(),
    wslStatus: await checkWSLStatusDetailed(),
    ubuntuInstalled: false,
    systemConfigured: false,
    needsConfiguration: true,
  };

  // Verificar se o Ubuntu está instalado, se WSL estiver ok
  if (results.wslStatus.installed && results.wslStatus.wsl2) {
    results.ubuntuInstalled = await checkUbuntuInstalled();
  }

  // Verificar se o sistema precisa ser configurado
  if (installState && results.wslStatus.installed && results.wslStatus.wsl2 && results.ubuntuInstalled) {
    results.needsConfiguration = await shouldConfigureSystem(installState);
    results.systemConfigured = !results.needsConfiguration;
  }

  log("Verificação do sistema concluída", "success");
  return results;
}

// Exportar funções
module.exports = {
  // Inicialização
  initLogFile,

  // Funções principais de verificação
  checkAdminPrivileges,
  checkWindowsVersion,
  checkVirtualization,
  checkWSLStatusDetailed,
  checkUbuntuInstalled,
  shouldConfigureSystem,
  checkSystemStatus,

  // Funções auxiliares
  log,
  logToFile,
  execPromise,
};
