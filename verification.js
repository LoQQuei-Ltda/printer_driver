/**
 * Sistema de Gerenciamento de Impressão - Módulo de Verificação
 *
 * Este módulo contém funções para verificar os requisitos e componentes do sistema.
 */

const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
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
    // Método 1: Usar curl dentro do WSL
    try {
      const output = await execPromise(`wsl -d Ubuntu -u root curl -s -o /dev/null -w "%{http_code}" http://localhost:56258/api`, 10000, true);
      if (output.trim() === '200') {
        log("API está respondendo corretamente (via curl)", "success");
        return true;
      }
    } catch (error) {
      log("API não respondeu via curl, tentando com axios...", "warning");
    }
    
    // Método 2: Usar axios diretamente
    try {
      const response = await axios.get('http://localhost:56258/api', { timeout: 5000 });
      if (response.status === 200) {
        log("API está respondendo corretamente (via axios)", "success");
        return true;
      }
    } catch (error) {
      log("API não está respondendo via axios", "warning");
    }
    
    log("API não está respondendo em nenhum método", "error");
    return false;
  } catch (error) {
    log("Erro ao verificar a API", "error");
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
// Improved checkDatabaseConfiguration function for verification.js
async function checkDatabaseConfiguration() {
  log("Verificando configuração do banco de dados...", "step");
  
  try {
    // Verificar se o PostgreSQL está em execução
    const postgresRunning = await checkServiceRunning('postgresql');
    if (!postgresRunning) {
      log("Serviço PostgreSQL não está em execução", "warning");
      
      // Tentar iniciar o serviço PostgreSQL
      try {
        await execPromise('wsl -d Ubuntu -u root systemctl start postgresql', 30000, true);
        log("Serviço PostgreSQL iniciado com sucesso", "success");
        // Aguardar um pouco para o serviço iniciar completamente
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (startError) {
        log("Não foi possível iniciar o PostgreSQL", "error");
        logToFile(`Detalhes do erro: ${JSON.stringify(startError)}`);
        return {
          configured: false,
          error: 'Não foi possível iniciar o PostgreSQL',
          postgresRunning: false
        };
      }
    }
    
    // Definir configurações padrão para os bancos de dados
    const configs = [{
      name: 'print_server',
      user: 'print_user',
      schema: null
    }, {
      name: 'print_management',
      user: 'postgres_print',
      schema: 'print_management'
    }];
    
    const results = {};
    
    // Verificar cada configuração de banco de dados
    for (const config of configs) {
      try {
        // Verificar se o banco existe
        const checkDb = await execPromise(
          `wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${config.name}'"`, 
          10000, 
          true
        );
        
        const dbExists = checkDb.trim() === '1';
        
        // Verificar se o usuário existe
        const checkUser = await execPromise(
          `wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${config.user}'"`,
          10000,
          true
        );
        
        const userExists = checkUser.trim() === '1';
        
        // Verificar schema se existir
        let schemaExists = null;
        if (config.schema) {
          try {
            const checkSchema = await execPromise(
              `wsl -d Ubuntu -u postgres psql -d ${config.name} -tAc "SELECT 1 FROM information_schema.schemata WHERE schema_name='${config.schema}'"`,
              10000,
              true
            );
            schemaExists = checkSchema.trim() === '1';
          } catch (schemaError) {
            schemaExists = false;
          }
        }
        
        results[config.name] = {
          dbExists,
          userExists,
          schemaExists
        };
        
        if (dbExists && userExists && (schemaExists !== false)) {
          log(`Banco de dados '${config.name}' configurado corretamente`, "success");
        } else {
          log(`Banco de dados '${config.name}' não está completamente configurado`, "warning");
          log(`- Banco existe: ${dbExists ? 'Sim' : 'Não'}`, "info");
          log(`- Usuário existe: ${userExists ? 'Sim' : 'Não'}`, "info");
          if (config.schema) {
            log(`- Schema existe: ${schemaExists ? 'Sim' : 'Não'}`, "info");
          }
        }
      } catch (configError) {
        log(`Erro ao verificar configuração do banco '${config.name}'`, "warning");
        logToFile(`Detalhes do erro: ${JSON.stringify(configError)}`);
        results[config.name] = { error: configError.message || 'Erro desconhecido' };
      }
    }
    
    // Verificar acesso ao PostgreSQL
    try {
      const accessCheck = await execPromise(
        `wsl -d Ubuntu -u root bash -c "PGPASSWORD=root_print psql -h localhost -p 5432 -U postgres_print -d print_management -c 'SELECT 1' -q -t"`,
        15000,
        true
      );
      
      if (accessCheck.trim() === '1') {
        log("Conexão ao banco de dados está funcional", "success");
        results.accessOk = true;
      } else {
        log("Resultado inesperado ao testar conexão", "warning");
        results.accessOk = false;
      }
    } catch (accessError) {
      log("Não foi possível estabelecer conexão com o banco de dados", "warning");
      logToFile(`Detalhes do erro de acesso: ${JSON.stringify(accessError)}`);
      results.accessOk = false;
      
      // Verificar configuração de pg_hba.conf
      log("Verificando configuração de pg_hba.conf...", "step");
      try {
        const pgHbaPath = await execPromise("wsl -d Ubuntu -u postgres psql -t -c \"SHOW hba_file;\" | xargs", 10000, true);
        log(`Arquivo pg_hba.conf: ${pgHbaPath}`, "info");
        
        // Verificar configuração atual
        const pgHbaContent = await execPromise(`wsl -d Ubuntu -u root cat ${pgHbaPath}`, 10000, true);
        logToFile(`Conteúdo de pg_hba.conf: ${pgHbaContent}`);
        
        // Verificar se tem linhas de acesso local
        const hasLocalAccess = pgHbaContent.includes('127.0.0.1/32') && 
                             (pgHbaContent.includes('trust') || pgHbaContent.includes('md5'));
        
        if (!hasLocalAccess) {
          log("Configuração pg_hba.conf não possui regras para acesso local", "warning");
        } else {
          log("Configuração pg_hba.conf parece correta, mas ainda há problemas de acesso", "warning");
        }
      } catch (pgHbaError) {
        log("Erro ao verificar configuração pg_hba.conf", "warning");
        logToFile(`Detalhes do erro pg_hba: ${JSON.stringify(pgHbaError)}`);
      }
    }
    
    // Determinar se o banco está completamente configurado
    const allConfigured = results.print_management && 
                          results.print_management.dbExists && 
                          results.print_management.userExists &&
                          (results.print_management.schemaExists !== false) &&
                          results.accessOk;
    
    return {
      configured: allConfigured,
      postgresRunning: true,
      details: results
    };
  } catch (error) {
    log("Erro geral ao verificar configuração do banco de dados", "warning");
    logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return {
      configured: false,
      error: error.message || 'Erro desconhecido'
    };
  }
}

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
    const output = await execPromise(`wsl -d Ubuntu -u root bash -c "command -v pm2 && pm2 list | grep print_server"`, 5000, true);
    return output.includes('online');
  } catch (error) {
    return false;
  }
}

// Verifica se o sistema já está completamente configurado ou se precisa de configuração
async function shouldConfigureSystem(installState) {
  // Se o estado diz que já está configurado, verifica explicitamente
  if (installState && installState.systemConfigured) {
    log("Verificando se o sistema realmente está configurado...", "step");

    // Verificar abrangentemente o sistema
    const softwareStatus = await checkSoftwareConfigurations();
    if (softwareStatus.fullyConfigured) {
      log("Sistema previamente configurado e funcional", "success");
      return false; // Não precisa configurar
    } else {
      log("Sistema marcado como configurado, mas apresenta problemas", "warning");
      return true; // Precisamos configurar
    }
  }

  // Se o estado já indica que não está configurado
  return true;
}

// Verificação completa do sistema
async function checkSystemStatus(installState) {
  log("Iniciando verificação completa do sistema...", "header");

  // Run all base checks in parallel for better performance
  const [adminPrivileges, windowsCompatible, virtualizationEnabled, wslStatus] = await Promise.all([
    checkAdminPrivileges(),
    checkWindowsVersion(),
    checkVirtualization(),
    checkWSLStatusDetailed()
  ]);

  const results = {
    adminPrivileges,
    windowsCompatible,
    virtualizationEnabled,
    wslStatus,
    ubuntuInstalled: false,
    userConfigured: true, // Always set to true to bypass this check
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
    console.log(await checkWindowsPrinterInstalled());
    process.exit(1)
  })()
}