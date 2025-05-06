/**
 * Sistema de Gerenciamento de Impressão - Módulo de Verificação
 *
 * Este módulo contém funções para verificar os requisitos e componentes do sistema.
 */

const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const axios = require("axios");

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
  
  // Aplicar correções em comandos problemáticos
  let fixedCommand = command;
  
  // 1. Corrigir padrões "|| true" que não funcionam quando passados do Windows para WSL
  if (fixedCommand.includes('wsl') && fixedCommand.includes(' || true')) {
    fixedCommand = fixedCommand.replace(/ \|\| true/g, '; exit 0');
  }
  
  // 2. Corrigir problemas de redirecionamento para /dev/null no WSL
  if (fixedCommand.includes('wsl') && fixedCommand.includes('>/dev/null')) {
    // Garantir que não há espaços entre > e /dev/null
    fixedCommand = fixedCommand.replace(/ > \/dev\/null/g, ' >/dev/null');
  }

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
    const childProcess = exec(fixedCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      clearTimeout(timeout);

      if (!quiet) {
        logToFile(`Saída stdout: ${stdout.trim()}`);
        if (stderr) logToFile(`Saída stderr: ${stderr.trim()}`);
      }

      if (error) {
        logToFile(`Erro ao executar: ${fixedCommand}`);
        logToFile(`Código de erro: ${error.code}`);
        logToFile(`Mensagem de erro: ${error.message}`);
        
        // Para erros específicos de WSL, tentar interpretar e oferecer mais detalhes
        if (fixedCommand.includes('wsl')) {
          if (stderr.includes('não está instalado') || stderr.includes('not installed')) {
            logToFile('Erro: WSL ou distribuição não está instalada');
          } else if (stderr.includes('não encontrado') || stderr.includes('command not found')) {
            logToFile('Erro: Comando não encontrado dentro do WSL');
          }
        }
        
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
    }
  }

  log("Não foi possível verificar o status da virtualização. Continuando mesmo assim...", "warning");
  return true;
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

// Verifica se um pacote específico está instalado no Ubuntu
async function checkPackageInstalled(packageName) {
  try {
    const output = await execPromise(`wsl -d Ubuntu -u root dpkg -l ${packageName}`, 10000, true);
    
    return output.includes('ii');
  } catch (error) {
    return false;
  }
}

// Verifica vários pacotes de uma vez
async function checkPackagesInstalled(packageNames) {
  const results = {};
  for (const pkg of packageNames) {
    results[pkg] = await checkPackageInstalled(pkg);
  }
  return results;
}

// Verifica se um serviço específico está em execução
async function checkServiceRunning(serviceName) {
  try {
    const output = await execPromise(`wsl -d Ubuntu -u root systemctl is-active ${serviceName}`, 10000, true);
    return output.trim() === 'active';
  } catch (error) {
    return false; // Serviço não está em execução ou erro
  }
}

// Verifica vários serviços de uma vez
async function checkServicesRunning(serviceNames) {
  const results = {};
  for (const service of serviceNames) {
    results[service] = await checkServiceRunning(service);
  }
  return results;
}

// Verifica se a API está em execução e respondendo na porta 56257
async function checkApiHealth() {
  log("Verificando se a API está respondendo...", "step");
  
  try {
    // Método 1: Verificar porta com netstat
    try {
      const netstatOutput = await execPromise(
        `wsl -d Ubuntu -u root bash -c "netstat -tulpn | grep 56258" || echo "not found"`,
        10000,
        true
      );
      
      if (netstatOutput.includes('56258')) {
        log("API está com porta 56258 aberta", "success");
      } else {
        log("Porta 56258 não encontrada, API pode não estar rodando", "warning");
      }
    } catch (netstatError) {
      log("Não foi possível verificar portas abertas", "warning");
    }
    
    // Método 2: Tentar acessar a API diretamente
    try {
      // Usar curl do Windows em vez do WSL para testar a API localmente
      const curlOutput = await execPromise(
        `curl -s -o nul -w "%%{http_code}" http://localhost:56258/api`,
        10000,
        true
      );
      
      if (curlOutput.trim() === '200') {
        log("API respondeu com status 200 (OK)", "success");
        return true;
      } else {
        log(`API respondeu com status ${curlOutput.trim()}, diferente de 200`, "warning");
      }
    } catch (curlError) {
      log("Não foi possível acessar API via curl", "warning");
    }
    
    // Método 3: Verificar processo Node no WSL
    try {
      const nodeProcess = await execPromise(
        `wsl -d Ubuntu -u root bash -c "ps aux | grep node | grep -v grep" || echo "not found"`,
        10000,
        true
      );
      
      if (nodeProcess !== "not found" && (nodeProcess.includes('node') || nodeProcess.includes('www.js'))) {
        log("Processo Node encontrado em execução no WSL", "success");
        // Se o processo existe, assumimos que está funcionando mesmo que não possamos acessar via HTTP
        return true;
      } else {
        log("Nenhum processo Node encontrado em execução no WSL", "warning");
      }
    } catch (psError) {
      log("Erro ao verificar processos Node", "warning");
    }
    
    // Método 4: Verificar PM2
    try {
      const pm2Status = await execPromise(
        `wsl -d Ubuntu -u root bash -c "pm2 list | grep online" || echo "not found"`,
        15000,
        true
      );
      
      if (pm2Status !== "not found" && pm2Status.includes('online')) {
        log("Serviço encontrado em execução via PM2", "success");
        return true;
      } else {
        log("Serviço não encontrado ou não está 'online' no PM2", "warning");
      }
    } catch (pm2Error) {
      log("Erro ao verificar PM2", "warning");
    }
    
    log("API não está respondendo em nenhum método de verificação", "error");
    return false;
  } catch (error) {
    log("Erro geral ao verificar a API", "error");
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Verifica se as regras de firewall estão configuradas corretamente
async function checkFirewallRules() {
  log("Verificando regras de firewall...", "step");
  
  try {
    const output = await execPromise(`wsl -d Ubuntu -u root ufw status`, 10000, true);
    
    // Verificar se todas as portas necessárias estão permitidas
    const requiredPorts = [
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
    
    const missingPorts = [];
    
    for (const {port, protocol} of requiredPorts) {
      if (!output.includes(port.toString())) {
        missingPorts.push(`${port}/${protocol}`);
      }
    }
    
    if (missingPorts.length === 0) {
      log("Regras de firewall configuradas corretamente", "success");
    } else {
      log(`Portas não configuradas no firewall: ${missingPorts.join(', ')}`, "warning");
    }
    
    return {
      configured: missingPorts.length === 0,
      missingPorts
    };
  } catch (error) {
    log("Erro ao verificar regras de firewall", "warning");
    return {
      configured: false,
      missingPorts: null,
      error: error.message
    };
  }
}

// Verifica a configuração do banco de dados
async function checkDatabaseConfiguration() {
  log("Verificando configuração detalhada do banco de dados...", 'step');
  
  try {
    // 1. Verificar instalação do PostgreSQL com vários métodos
    let pgInstalled = false;
    
    try {
      const pgInstallCheck = await execPromise(
        'wsl -d Ubuntu -u root dpkg -l postgresql',
        10000,
        true
      ).catch(() => "");
      
      pgInstalled = pgInstallCheck.includes('postgresql');
    } catch (checkError) {
      // Tentar método alternativo
      try {
        const altCheck = await execPromise(
          'wsl -d Ubuntu -u root bash -c "which psql 2>/dev/null || echo not_found"',
          10000,
          true
        );
        
        pgInstalled = altCheck !== "not_found" && !altCheck.includes("not_found");
      } catch (altError) {
        pgInstalled = false;
      }
    }
    
    if (!pgInstalled) {
      log("PostgreSQL não está instalado", 'error');
      return {
        configured: false,
        error: 'PostgreSQL não está instalado',
        postgresRunning: false,
        tablesExist: false,
        needsMigrations: true
      };
    }
    
    log("PostgreSQL está instalado, verificando status do serviço...", 'info');
    
    // 2. Verificar se o serviço está em execução com abordagem redundante
    let postgresRunning = false;
    
    try {
      // Método 1: systemctl
      const serviceStatus = await execPromise(
        'wsl -d Ubuntu -u root bash -c "systemctl is-active postgresql || service postgresql status | grep -q running && echo active || echo inactive"',
        10000,
        true
      ).catch(() => "inactive");
      
      postgresRunning = serviceStatus.trim() === 'active';
      
      if (!postgresRunning) {
        // Método 2: ps aux
        const processCheck = await execPromise(
          'wsl -d Ubuntu -u root bash -c "ps aux | grep postgres[q]"',
          10000,
          true
        ).catch(() => "");
        
        postgresRunning = processCheck.length > 0;
        
        if (!postgresRunning) {
          // Método 3: netstat
          const portCheck = await execPromise(
            'wsl -d Ubuntu -u root bash -c "netstat -tuln | grep 5432"',
            10000,
            true
          ).catch(() => "");
          
          postgresRunning = portCheck.length > 0 && portCheck.includes('5432');
        }
      }
    } catch (statusError) {
      postgresRunning = false;
    }
    
    log(`PostgreSQL está ${postgresRunning ? 'em execução' : 'parado'}`, postgresRunning ? 'success' : 'warning');
    
    // Se o PostgreSQL não estiver em execução, tentar iniciar
    if (!postgresRunning) {
      log("Tentando iniciar PostgreSQL...", 'step');
      
      // Determinar a versão do PostgreSQL com método mais robusto
      const pgVersionCmd = "wsl -d Ubuntu -u root bash -c \"if [ -d /etc/postgresql ]; then ls -d /etc/postgresql/*/ 2>/dev/null | cut -d'/' -f4 | head -n 1 || echo '14'; else echo '14'; fi\"";
      const pgVersion = await execPromise(pgVersionCmd, 10000, true).catch(() => "14");
      const version = pgVersion.trim() || "14";
      
      try {
        // Tentar iniciar de formas diferentes, um método por vez
        try {
          await execPromise('wsl -d Ubuntu -u root systemctl start postgresql', 15000, true);
          postgresRunning = true;
        } catch (e1) {
          try {
            await execPromise('wsl -d Ubuntu -u root service postgresql start', 15000, true);
            postgresRunning = true;
          } catch (e2) {
            try {
              await execPromise(`wsl -d Ubuntu -u root pg_ctlcluster ${version} main start`, 15000, true);
              postgresRunning = true;
            } catch (e3) {
              await execPromise(
                `wsl -d Ubuntu -u root bash -c "mkdir -p /var/run/postgresql && chown postgres:postgres /var/run/postgresql && su - postgres -c 'pg_ctl -D /var/lib/postgresql/${version}/main start'"`,
                20000,
                true
              );
              postgresRunning = true;
            }
          }
        }
        
        log("PostgreSQL iniciado com sucesso", 'success');
        
        // Aguardar inicialização
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (startError) {
        log("Aviso: Não foi possível iniciar o PostgreSQL, mas continuando verificação", 'warning');
        logToFile(`Erro ao iniciar: ${JSON.stringify(startError)}`);
      }
    }
    
    // 3. Verificar banco de dados - MÉTODO MELHORADO
    log("Verificando estrutura do banco de dados...", 'step');
    
    // Verificar se o banco existe - MÚLTIPLOS MÉTODOS
    let dbExists = false;
    
    // Método 1: Lista de bancos com grep (pode falhar por causa de formatação)
    try {
      const dbCheck = await execPromise(
        `wsl -d Ubuntu -u postgres psql -lqt | grep -w print_management || echo "not_exists"`,
        15000,
        true
      );
      
      dbExists = !dbCheck.includes('not_exists') && dbCheck.includes('print_management');
      
      if (dbExists) {
        log("Banco de dados 'print_management' detectado via listagem", 'success');
      }
    } catch (dbCheckError) {
      log("Método 1 falhou, tentando alternativa", 'info');
      logToFile(`Erro no método 1: ${JSON.stringify(dbCheckError)}`);
    }
    
    // Método 2: Tentar conectar diretamente (mais confiável)
    if (!dbExists) {
      try {
        const connCheck = await execPromise(
          `wsl -d Ubuntu -u postgres psql -d print_management -c "SELECT 1;" -t`,
          15000,
          true
        );
        
        if (connCheck.trim().includes('1')) {
          dbExists = true;
          log("Banco de dados 'print_management' detectado via conexão direta", 'success');
        }
      } catch (connError) {
        log("Método 2 falhou, tentando alternativa", 'info');
        logToFile(`Erro no método 2: ${JSON.stringify(connError)}`);
      }
    }
    
    // Método 3: Consultar pg_database (método mais técnico)
    if (!dbExists) {
      try {
        const pgDbCheck = await execPromise(
          `wsl -d Ubuntu -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'print_management';" -t`,
          15000,
          true
        );
        
        if (pgDbCheck.trim().includes('1')) {
          dbExists = true;
          log("Banco de dados 'print_management' detectado via pg_database", 'success');
        }
      } catch (pgDbError) {
        log("Método 3 falhou", 'info');
        logToFile(`Erro no método 3: ${JSON.stringify(pgDbError)}`);
      }
    }
    
    if (!dbExists) {
      log("Banco de dados 'print_management' não existe", 'warning');
      return {
        configured: false,
        postgresRunning: postgresRunning,
        needsMigrations: true,
        tablesExist: false,
        dbExists: false
      };
    }
    
    log("Banco de dados 'print_management' existe", 'success');
    
    // 4. Verificar se o schema existe - MÉTODO MELHORADO
    let schemaExists = false;
    
    // Método direto para verificar schema
    try {
      const schemaCheck = await execPromise(
        `wsl -d Ubuntu -u postgres psql -d print_management -c "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'print_management';" -t`,
        15000,
        true
      );
      
      schemaExists = schemaCheck.trim().includes('1');
    } catch (schemaError) {
      // Método alternativo via namespace
      try {
        const altSchemaCheck = await execPromise(
          `wsl -d Ubuntu -u postgres psql -d print_management -c "SELECT 1 FROM pg_namespace WHERE nspname = 'print_management';" -t`,
          15000,
          true
        );
        
        schemaExists = altSchemaCheck.trim().includes('1');
      } catch (altSchemaError) {
        schemaExists = false;
        logToFile(`Erro ao verificar schema: ${JSON.stringify(altSchemaError)}`);
      }
    }
    
    if (!schemaExists) {
      log("Schema 'print_management' não existe", 'warning');
      return {
        configured: false,
        postgresRunning: postgresRunning,
        needsMigrations: true,
        tablesExist: false,
        dbExists: true,
        schemaExists: false
      };
    }
    
    log("Schema 'print_management' existe", 'success');
    
    // 5. Verificar tabelas - MÉTODO COMPLETAMENTE NOVO E MAIS ROBUSTO
    // Usar o comando \dt que mostra as tabelas diretamente - evita problemas com nomes de colunas
    const requiredTables = ['logs', 'printers', 'files'];
    let missingTables = [];
    let tableResults = {};
    
    try {
      // Obter lista de tabelas diretamente usando o comando \dt com print_management.* para garantir o schema correto
      const tableList = await execPromise(
        `wsl -d Ubuntu -u postgres psql -d print_management -c "\\dt print_management.*"`,
        15000,
        true
      );
      
      logToFile(`Lista de tabelas encontrada: ${tableList}`);
      
      // Verificar cada tabela na lista retornada
      for (const table of requiredTables) {
        const tableExists = tableList.toLowerCase().includes(table);
        tableResults[table] = tableExists;
        
        if (!tableExists) {
          missingTables.push(table);
        }
      }
    } catch (tableListError) {
      log("Erro ao obter lista de tabelas, tentando método alternativo", 'warning');
      logToFile(`Erro na listagem: ${JSON.stringify(tableListError)}`);
      
      // Método alternativo: verificar cada tabela individualmente
      for (const table of requiredTables) {
        try {
          const tableCheck = await execPromise(
            `wsl -d Ubuntu -u postgres psql -d print_management -c "SELECT 1 FROM information_schema.tables WHERE table_schema = 'print_management' AND table_name = '${table}';" -t`,
            10000,
            true
          );
          
          const exists = tableCheck.trim().includes('1');
          tableResults[table] = exists;
          
          if (!exists) {
            missingTables.push(table);
          }
        } catch (tableError) {
          tableResults[table] = false;
          missingTables.push(table);
          logToFile(`Erro ao verificar tabela ${table}: ${JSON.stringify(tableError)}`);
        }
      }
    }
    
    // Verificar se todas as tabelas existem
    const allTablesExist = missingTables.length === 0;
    
    if (allTablesExist) {
      log("Todas as tabelas necessárias existem", 'success');
    } else {
      log(`Tabelas faltando: ${missingTables.join(', ')}`, 'warning');
    }
    
    // 6. Verificar tipos ENUM (versão simplificada)
    let missingEnums = [];
    const enumsToCheck = ['log_type', 'printer_status'];
    
    for (const enumType of enumsToCheck) {
      try {
        const enumCheck = await execPromise(
          `wsl -d Ubuntu -u postgres psql -d print_management -c "SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '${enumType}' AND n.nspname = 'print_management';" -t`,
          10000,
          true
        );
        
        const exists = enumCheck.trim().includes('1');
        
        if (!exists) {
          missingEnums.push(enumType);
        }
      } catch (enumError) {
        missingEnums.push(enumType);
        logToFile(`Erro ao verificar enum ${enumType}: ${JSON.stringify(enumError)}`);
      }
    }
    
    if (missingEnums.length === 0) {
      log("Tipos ENUM necessários estão presentes", 'success');
    } else {
      log(`Tipos ENUM faltando: ${missingEnums.join(', ')}`, 'warning');
    }
    
    // 7. Determinar estado geral do banco de dados
    const needsMigrations = missingTables.length > 0 || missingEnums.length > 0;
    const configured = !needsMigrations;
    
    if (configured) {
      log("Banco de dados está completamente configurado!", 'success');
    } else {
      log("Banco de dados requer migrações ou configurações adicionais", 'warning');
    }
    
    // Retornar resultado completo com informações detalhadas
    return {
      configured: configured,
      postgresRunning: postgresRunning,
      needsMigrations: needsMigrations,
      tablesExist: allTablesExist,
      dbExists: dbExists,
      schemaExists: schemaExists,
      missingTables: missingTables,
      missingEnums: missingEnums,
      details: {
        tables: tableResults
      }
    };
  } catch (error) {
    log(`Erro ao verificar banco de dados: ${error.message || JSON.stringify(error)}`, 'error');
    logToFile(`Erro detalhado: ${JSON.stringify(error)}`);
    
    return {
      configured: false,
      postgresRunning: false,
      needsMigrations: true,
      tablesExist: false,
      error: error?.message || 'Erro desconhecido'
    };
  }
}uste

// Realiza uma verificação abrangente de todas as configurações do software
async function checkSoftwareConfigurations() {
  log("Verificando configurações do software...", "step");
  
  const requiredPackages = [
    'nano', 'samba', 'cups', 'printer-driver-cups-pdf', 'postgresql', 'postgresql-contrib',
    'ufw', 'npm', 'jq', 'net-tools', 'avahi-daemon', 'avahi-utils',
    'avahi-discover', 'hplip', 'hplip-gui', 'printer-driver-all'
  ];
  
  const requiredServices = [
    'smbd', 'cups', 'postgresql', 'avahi-daemon', 'ufw'
  ];
  
  // Run all checks in parallel for better performance
  const [
    packagesResults,
    servicesResults,
    firewallStatus,
    dbStatus,
    apiHealth,
    optDirExists,
    pm2Running
  ] = await Promise.all([
    checkPackagesInstalled(requiredPackages),
    checkServicesRunning(requiredServices),
    checkFirewallRules(),
    checkDatabaseConfiguration(),
    checkApiHealth(),
    checkOptDirectory(),
    checkPM2Status()
  ]);
  
  // Process results
  const missingPackages = Object.keys(packagesResults).filter(pkg => !packagesResults[pkg]);
  const inactiveServices = Object.keys(servicesResults).filter(svc => !servicesResults[svc]);
  
  // Report results
  if (missingPackages.length === 0) {
    log("Todos os pacotes necessários estão instalados", "success");
  } else {
    log(`Pacotes faltando: ${missingPackages.join(', ')}`, "warning");
  }
  
  if (inactiveServices.length === 0) {
    log("Todos os serviços necessários estão em execução", "success");
  } else {
    log(`Serviços inativos: ${inactiveServices.join(', ')}`, "warning");
  }
  
  const fullyConfigured = missingPackages.length === 0 && 
                    inactiveServices.length === 0 && 
                    firewallStatus.configured && 
                    dbStatus.configured && 
                    apiHealth && 
                    optDirExists && 
                    pm2Running;
                    
  if (fullyConfigured) {
    log("Sistema está totalmente configurado e operacional!", "success");
  } else {
    log("Sistema requer configuração adicional", "warning");
  }
  
  return {
    packagesStatus: {
      allInstalled: missingPackages.length === 0,
      missing: missingPackages
    },
    servicesStatus: {
      allRunning: inactiveServices.length === 0,
      inactive: inactiveServices
    },
    firewallStatus,
    dbStatus,
    apiHealth,
    optDirExists,
    pm2Running,
    fullyConfigured
  };
}

async function checkOptDirectory() {
  try {
    const result = await execPromise(`wsl -d Ubuntu -u root bash -c "if [ -d '/opt/loqquei/print_server_desktop' ]; then echo 'EXISTS'; else echo 'NOT_EXISTS'; fi"`, 5000, true);
    const exists = result.trim() === 'EXISTS';
    
    if (!exists) {
      const altResult = await execPromise(`wsl -d Ubuntu -u root bash -c "if [ -d '/opt/print_server/print_server_desktop' ]; then echo 'EXISTS'; else echo 'NOT_EXISTS'; fi"`, 5000, true);
      if (altResult.trim() === 'EXISTS') {
        log("Diretório alternativo encontrado em /opt/print_server/print_server_desktop", "info");
        return true;
      }
    }
    return exists;
  } catch (error) {
    return false;
  }
}

async function checkPM2Status() {
  try {
    const output = await execPromise('wsl -d Ubuntu -u root sudo pm2 list ', 15000, true);
    return output.includes('online') && output.includes('print_server_desktop');
  } catch (error) {
    return false;
  }
}

// Verifica se o sistema já está completamente configurado ou se precisa de configuração
async function shouldConfigureSystem(installState) {
  // Se o estado diz que já está configurado, verifica explicitamente
  if (installState && installState.systemConfigured) {
    log("Verificando se o sistema realmente está configurado...", "step");

    try {
      // Verificar elementos críticos para funcionamento
      const [dbStatus, apiRunning, softwareInstalled] = await Promise.all([
        // Verificar banco de dados
        execPromise('wsl -d Ubuntu -u postgres psql -lqt | grep -w print_management', 10000, true)
          .then(() => true)
          .catch(() => false),
        
        // Verificar API
        execPromise('wsl -d Ubuntu -u root bash -c "netstat -tulpn | grep 56258"', 10000, true)
          .then(() => true)
          .catch(() => false),
        
        // Verificar instalação do software
        execPromise('wsl -d Ubuntu -u root test -d /opt/loqquei/print_server_desktop && echo "exists"', 10000, true)
          .then(result => result.includes("exists"))
          .catch(() => false)
      ]);
      
      const systemFunctional = dbStatus && (apiRunning || softwareInstalled);
      
      if (systemFunctional) {
        log("Sistema previamente configurado e parece funcional", "success");
        return false; // Não precisa configurar
      } else {
        log("Sistema marcado como configurado, mas parece ter problemas", "warning");
        
        // Listar problemas encontrados
        if (!dbStatus) log("Banco de dados não parece estar configurado", "warning");
        if (!apiRunning) log("API não parece estar em execução", "warning");
        if (!softwareInstalled) log("Software não encontrado no diretório esperado", "warning");
        
        return true; // Precisamos configurar
      }
    } catch (error) {
      log("Erro ao verificar estado do sistema, por segurança vamos configurar", "warning");
      return true;
    }
  }

  // Se o estado já indica que não está configurado
  return true;
}

async function checkIfDefaultUserConfigured() {
  log('Verificando se o usuário padrão está configurado...', 'step');
  logToFile('Iniciando verificação do usuário padrão');
  
  try {
    // Verificar primeiro se o WSL está acessível
    try {
      await execPromise('wsl -d Ubuntu echo "WSL Test"', 10000, true);
    } catch (wslError) {
      logToFile(`Erro ao acessar WSL: ${JSON.stringify(wslError)}`);
      log('WSL não está acessível para verificar usuário', 'error');
      return false;
    }
    
    // 1. Verificar se o usuário 'print_user' existe no sistema WSL com comando mais simples
    const userExistsCommand = 'wsl -d Ubuntu -u root bash -c "id print_user &>/dev/null && echo exists || echo not_exists"';
    const userExists = await execPromise(userExistsCommand, 15000, true)
      .catch(err => {
        logToFile(`Erro ao verificar existência do usuário: ${JSON.stringify(err)}`);
        return "error";
      });
    
    logToFile(`Resultado da verificação de usuário: ${userExists}`);
    
    if (userExists !== "exists") {
      log('Usuário "print_user" não encontrado no WSL ou erro na verificação', 'error');
      return false;
    }
    
    // 2. Verificar se o arquivo wsl.conf existe
    const wslConfExistsCommand = 'wsl -d Ubuntu -u root bash -c "test -f /etc/wsl.conf && echo exists || echo not_exists"';
    const wslConfExists = await execPromise(wslConfExistsCommand, 15000, true)
      .catch(err => {
        logToFile(`Erro ao verificar existência do wsl.conf: ${JSON.stringify(err)}`);
        return "error";
      });
      
    logToFile(`Resultado da verificação do arquivo wsl.conf: ${wslConfExists}`);
    
    if (wslConfExists !== "exists") {
      log('Arquivo wsl.conf não encontrado no WSL', 'error');
      return false;
    }
    
    // 3. Verificar se o usuário está configurado como padrão com comando mais simples
    const userDefaultCommand = 'wsl -d Ubuntu -u root bash -c "grep -q \'default=print_user\' /etc/wsl.conf && echo configured || echo not_configured"';
    const userDefault = await execPromise(userDefaultCommand, 15000, true)
      .catch(err => {
        logToFile(`Erro ao verificar configuração padrão: ${JSON.stringify(err)}`);
        return "error";
      });
      
    logToFile(`Resultado da verificação de usuário padrão: ${userDefault}`);
    
    if (userDefault !== "configured") {
      log('Usuário "print_user" não está configurado como padrão no wsl.conf', 'error');
      return false;
    }
    
    log('Usuário "print_user" está configurado corretamente como padrão no WSL', 'success');
    return true;
  } catch (error) {
    logToFile(`Erro geral ao verificar usuário padrão: ${JSON.stringify(error)}`);
    log('Falha ao verificar a configuração do usuário padrão', 'error');
    return false;
  }
}

// Verificação completa do sistema
async function checkSystemStatus(installState) {
  log("Iniciando verificação completa do sistema...", "header");

  // Run all base checks in parallel for better performance
  const [adminPrivileges, windowsCompatible, virtualizationEnabled, wslStatus, userConfigured] = await Promise.all([
    checkAdminPrivileges(),
    checkWindowsVersion(),
    checkVirtualization(),
    checkWSLStatusDetailed(),
    checkIfDefaultUserConfigured()
  ]);

  const results = {
    adminPrivileges,
    windowsCompatible,
    virtualizationEnabled,
    wslStatus,
    ubuntuInstalled: false,
    userConfigured,
    systemConfigured: false,
    needsConfiguration: true
  };

  // Run secondary checks only if base requirements are met
  if (results.wslStatus.installed && results.wslStatus.wsl2) {
    // Check Ubuntu and additional components in parallel
    const [ubuntuInstalled, printerStatus] = await Promise.all([
      checkUbuntuInstalled(),
      checkWindowsPrinterInstalled()
    ]);
    
    results.ubuntuInstalled = ubuntuInstalled;
    results.printerStatus = printerStatus;

    if (results.ubuntuInstalled) {
      // Only check software configurations if Ubuntu is installed
      results.softwareStatus = await checkSoftwareConfigurations();
      
      // Determine if system is fully configured
      results.systemConfigured = results.softwareStatus.fullyConfigured && 
                             (results.printerStatus && results.printerStatus.installed);
    }
  }

  results.needsConfiguration = !results.systemConfigured;
  
  // Cache results for future use
  global.lastSystemStatus = results;

  log("Verificação do sistema concluída", "success");
  return results;
}

// Função para verificar a impressora virtual no Windows
async function checkWindowsPrinterInstalled() {
  log('Verificando se a impressora LoQQuei está instalada...', 'step');
  
  try {
    // Método principal usando PowerShell para verificação mais confiável
    try {
      const powershellCmd = 'powershell -Command "Get-Printer | Where-Object { $_.Name -eq \'Impressora LoQQuei\' } | Format-List Name,PortName,DriverName"';
      const psOutput = await execPromise(powershellCmd, 15000, true);
      
      // Se a saída contém o nome da impressora, ela está instalada
      if (psOutput.includes('Impressora LoQQuei')) {
        log('Impressora LoQQuei encontrada via PowerShell', 'success');
        
        // Extrair informações da porta
        const portMatch = psOutput.match(/PortName\s*:\s*(.+)/i);
        const port = portMatch ? portMatch[1].trim() : 'Desconhecido';
        
        log(`Porta da impressora: ${port}`, 'info');
        
        // Verificar explicitamente se é a porta CUPS correta
        const correctConfig = port.includes('localhost:631/printers/PDF_Printer') || 
                              port.includes('CUPS_PDF_Port');
        
        if (correctConfig) {
          log('Impressora está corretamente configurada para PDF_Printer', 'success');
        } else {
          log('Impressora encontrada, mas não está com a porta correta configurada', 'warning');
        }
        
        return {
          installed: true,
          port: port,
          correctConfig: correctConfig
        };
      } else {
        log('Impressora LoQQuei não foi encontrada via PowerShell', 'warning');
      }
    } catch (psError) {
      log('Erro ao verificar impressora via PowerShell', 'warning');
      logToFile(`Erro PowerShell: ${JSON.stringify(psError)}`);
    }
    
    // Método alternativo usando wmic (mais compatível com versões antigas do Windows)
    try {
      const wmicOutput = await execPromise('wmic printer where name="Impressora LoQQuei" get name,portname /format:list', 15000, true);
      
      if (wmicOutput.includes('Impressora LoQQuei')) {
        log('Impressora LoQQuei encontrada via WMIC', 'success');
        
        // Extrair porta
        const portMatch = wmicOutput.match(/PortName=(.+)/);
        const port = portMatch ? portMatch[1].trim() : 'Desconhecido';
        
        // Verificar porta correta
        const correctConfig = port.includes('localhost:631/printers/PDF_Printer') || 
                              port.includes('CUPS_PDF_Port');
        
        if (correctConfig) {
          log('Impressora está corretamente configurada para PDF_Printer (WMIC)', 'success');
        } else {
          log('Impressora encontrada, mas não está com a porta correta configurada (WMIC)', 'warning');
        }
        
        return {
          installed: true,
          port: port,
          correctConfig: correctConfig
        };
      }
    } catch (wmicError) {
      log('Erro ao verificar impressora via WMIC', 'warning');
    }
    
    // Se chegamos aqui, nenhum método conseguiu encontrar a impressora
    log('Impressora LoQQuei não foi encontrada no sistema', 'warning');
    return {
      installed: false,
      port: null,
      correctConfig: false
    };
  } catch (error) {
    log(`Erro ao verificar instalação da impressora: ${error.message}`, 'error');
    return {
      installed: false,
      port: null,
      correctConfig: false,
      error: error.message
    };
  }
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
  checkWindowsPrinterInstalled,
  
  // Novas funções de verificação detalhada
  checkPackageInstalled,
  checkPackagesInstalled,
  checkServiceRunning,
  checkServicesRunning,
  checkApiHealth,
  checkFirewallRules,
  checkDatabaseConfiguration,
  checkSoftwareConfigurations,

  // Funções auxiliares
  log,
  logToFile,
  execPromise,
};


if (require.main === module) {
  (async () => {
    console.log(await checkDatabaseConfiguration());
    process.exit(1)
  })()
}