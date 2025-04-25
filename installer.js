/**
 * Sistema de Gerenciamento de Impressão - Instalador
 * 
 * Este script instala o ambiente WSL, Ubuntu e o sistema de gerenciamento de impressão.
 * Versão refatorada com funções de verificação movidas para verification.js
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const verification = require('./verification'); // Importar o módulo de verificação

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

// Função para fazer perguntas ao usuário - modificada para funcionar no Electron
function askQuestion(question) {
  // Se uma função de pergunta personalizada foi definida (para Electron)
  if (customAskQuestion) {
    return customAskQuestion(question);
  }

  // Se estamos em modo Electron, mas sem função personalizada, apenas retornar sim
  if (isElectron) {
    verification.log(`[PERGUNTA AUTOMÁTICA] ${question}`, 'info');
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
    // Usar o método mais recente e simples com argumento --no-distribution para evitar instalação automática do Ubuntu
    // Isso vai garantir que possamos controlar a instalação do Ubuntu separadamente
    await verification.execPromise('wsl --install --no-distribution --no-launch', 300000);
    verification.log('Comando de instalação do WSL moderno executado com sucesso', 'success');
    installState.wslInstalled = true;
    saveInstallState();
    return true;
  } catch (error) {
    // Verificar se o erro é porque o WSL já está instalado
    if (error.stdout && (error.stdout.includes('já está instalado') || error.stdout.includes('already installed'))) {
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
  
  try {
    // Método 1: Instalar Ubuntu com inicialização
    verification.log('Instalando Ubuntu via WSL...', 'step');
    try {
      // Primeiro, verificar se a distribuição já foi registrada
      const distributions = await verification.execPromise('wsl --list --verbose', 10000, true);
      const cleanedDistributions = distributions.replace(/\x00/g, '').trim();
      const lines = cleanedDistributions.split('\n').slice(1);
      const ubuntuExists = lines.some(line => line.toLowerCase().includes('ubuntu'));
      
      if (!ubuntuExists) {
        verification.log('Registrando distribuição Ubuntu no WSL...', 'step');
        await verification.execPromise('wsl --install -d Ubuntu', 120000, true);
        verification.log('Ubuntu instalado, aguardando inicialização...', 'step');
      } else {
        verification.log('Distribuição Ubuntu já registrada no WSL', 'info');
      }
      
      // CRUCIAL: Verificar se Ubuntu está realmente funcional
      verification.log('Verificando se Ubuntu está acessível...', 'step');
      
      // Tentar 3 vezes com intervalos de 10 segundos
      let ubuntuAccessible = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await verification.execPromise('wsl -d Ubuntu -u root echo "Ubuntu está acessível"', 30000, true);
          verification.log(`Ubuntu está acessível na tentativa ${attempt}`, 'success');
          ubuntuAccessible = true;
          break;
        } catch (error) {
          verification.log(`Tentativa ${attempt} falhou, aguardando inicialização...`, 'warning');
          
          // Se não for a última tentativa, aguarde antes de tentar novamente
          if (attempt < 3) {
            verification.log('Aguardando 10 segundos antes da próxima tentativa...', 'info');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Tentar inicializar a distribuição novamente
            try {
              await verification.execPromise('wsl -d Ubuntu -u root echo "Inicializando"', 15000, true);
            } catch (initError) {
              verification.log('Tentando inicializar novamente...', 'warning');
            }
          }
        }
      }
      
      if (!ubuntuAccessible) {
        // Se ainda não está acessível, tentar uma abordagem mais agressiva
        verification.log('Ubuntu não está respondendo, tentando método alternativo...', 'warning');
        
        try {
          // Tentar reiniciar o serviço WSL
          verification.log('Reiniciando serviço WSL...', 'step');
          await verification.execPromise('powershell -Command "Restart-Service LxssManager -Force"', 30000, true);
          verification.log('Serviço WSL reiniciado, aguardando...', 'info');
          await new Promise(resolve => setTimeout(resolve, 15000));
          
          // Tentar acessar novamente
          await verification.execPromise('wsl -d Ubuntu -u root echo "Ubuntu está acessível após reinício"', 30000, true);
          verification.log('Ubuntu está acessível após reinício do serviço WSL', 'success');
          ubuntuAccessible = true;
        } catch (restartError) {
          verification.log('Reinício do serviço WSL não resolveu, tentando último método...', 'warning');
          
          try {
            // Tentar terminar e reiniciar a distribuição
            verification.log('Terminando e reiniciando Ubuntu...', 'step');
            await verification.execPromise('wsl --terminate Ubuntu', 10000, true);
            await new Promise(resolve => setTimeout(resolve, 5000));
            await verification.execPromise('wsl -d Ubuntu echo "Iniciando Ubuntu novamente"', 30000, true);
            
            // Verificar uma última vez
            await verification.execPromise('wsl -d Ubuntu -u root echo "Verificação final"', 30000, true);
            verification.log('Ubuntu está acessível após terminar e reiniciar', 'success');
            ubuntuAccessible = true;
          } catch (finalError) {
            verification.log('Todos os métodos falharam para acessar o Ubuntu', 'error');
            verification.logToFile(`Erro final: ${JSON.stringify(finalError)}`);
            
            // Se estamos no Electron, tente abrir e inicializar manualmente
            if (isElectron) {
              verification.log('Tentando inicializar Ubuntu manualmente...', 'step');
              
              // Abrir um terminal WSL para inicializar manualmente
              await verification.execPromise('start wsl -d Ubuntu', 5000, true);
              verification.log('Terminal WSL aberto. Por favor, aguarde a inicialização e feche o terminal.', 'warning');
              
              // Aguardar bastante tempo para a inicialização manual
              verification.log('Aguardando 30 segundos para a inicialização manual...', 'info');
              await new Promise(resolve => setTimeout(resolve, 30000));
              
              // Verificar uma última vez
              try {
                await verification.execPromise('wsl -d Ubuntu -u root echo "Verificação após inicialização manual"', 15000, true);
                verification.log('Ubuntu acessível após inicialização manual!', 'success');
                ubuntuAccessible = true;
              } catch (manualError) {
                verification.log('Inicialização manual não resolveu o problema', 'error');
                throw new Error('Não foi possível acessar o Ubuntu após múltiplas tentativas');
              }
            } else {
              throw new Error('Não foi possível acessar o Ubuntu após múltiplas tentativas');
            }
          }
        }
      }
      
      if (ubuntuAccessible) {
        verification.log('Ubuntu instalado e acessível com sucesso!', 'success');
        installState.ubuntuInstalled = true;
        saveInstallState();
        return await configureDefaultUser();
      } else {
        throw new Error('Ubuntu instalado mas não está acessível');
      }
    } catch (wslError) {
      verification.log('Falha ao instalar ou acessar Ubuntu via WSL', 'error');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(wslError)}`);
      throw wslError; // Propagar erro para tentar métodos alternativos
    }
  } catch (error) {
    verification.log(`Erro ao instalar o Ubuntu: ${error.message}`, 'error');
    verification.logToFile(`Detalhes do erro ao instalar Ubuntu: ${JSON.stringify(error)}`);
    
    // Método de último recurso: via Microsoft Store
    try {
      verification.log('Tentando último recurso: instalação via Microsoft Store...', 'step');
      await verification.execPromise('start ms-windows-store://pdp/?productid=9PDXGNCFSCZV', 5000, true);
      verification.log('Microsoft Store aberta. Por favor, instale o Ubuntu manualmente.', 'warning');
      verification.log('Após instalar, reinicie este instalador para continuar.', 'warning');
      
      if (isElectron) {
        // Em Electron, informar o usuário que precisa instalar manualmente
        return false;
      } else {
        await askQuestion('Pressione ENTER para sair após instalar o Ubuntu manualmente...');
        return false;
      }
    } catch (storeError) {
      verification.log('Todos os métodos de instalação falharam', 'error');
      return false;
    }
  }
}

// Função otimizada para configurar usuário padrão com mais velocidade
async function configureDefaultUser() {
  
  if (installState.defaultUserCreated) {
    verification.log('Usuário padrão já foi configurado anteriormente', 'success');
    return true;
  }

  verification.log('Configurando usuário padrão print_user...', 'step');
  
  try {
    // CRUCIAL: Verificar explicitamente se o Ubuntu está acessível antes de configurar o usuário
    try {
      verification.log('Verificando acesso antes de configurar usuário...', 'step');
      await verification.execPromise('wsl -d Ubuntu -u root echo "Verificação de acesso"', 20000, true);
      verification.log('Ubuntu está acessível para configuração de usuário', 'success');
    } catch (accessError) {
      verification.log('Ubuntu não está acessível para configuração de usuário, tentando reiniciar...', 'warning');
      
      try {
        // Tentar reiniciar o WSL
        await verification.execPromise('wsl --terminate Ubuntu', 10000, true);
        verification.log('Distribuição Ubuntu terminada, aguardando...', 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await verification.execPromise('wsl -d Ubuntu echo "Reinicializando Ubuntu"', 20000, true);
        verification.log('Ubuntu reinicializado com sucesso', 'success');
      } catch (restartError) {
        verification.log('Falha ao reiniciar Ubuntu para configuração de usuário', 'error');
        verification.logToFile(`Erro ao reiniciar: ${JSON.stringify(restartError)}`);
        return false;
      }
    }
    
    // Criar script de configuração de usuário
    verification.log('Preparando script de configuração de usuário...', 'step');
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
      verification.log('Script de configuração de usuário criado', 'success');
      
      // Copiar script para o WSL
      verification.log('Copiando script para o WSL...', 'step');
      
      // Primeiro, criar diretório no WSL
      await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /tmp/setup', 20000, true);
      
      // Obter caminho do WSL para o arquivo
      const wslPath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${setupScript.replace(/\\/g, '/')}"`, 10000, true);
      
      // Copiar o script
      await verification.execPromise(`wsl -d Ubuntu -u root cp "${wslPath}" /tmp/setup/setup_user.sh`, 15000, true);
      await verification.execPromise('wsl -d Ubuntu -u root chmod +x /tmp/setup/setup_user.sh', 10000, true);
      
      // Executar o script com log detalhado
      verification.log('Executando script de configuração de usuário...', 'step');
      const scriptOutput = await verification.execPromise('wsl -d Ubuntu -u root bash -x /tmp/setup/setup_user.sh', 30000, true);
      
      // Logar saída do script para diagnóstico
      verification.log('Resultado da configuração de usuário:', 'info');
      scriptOutput.split('\n').forEach(line => {
        if (line.trim()) verification.log(`  ${line}`, 'info');
      });
      
      // Verificar se o usuário foi criado
      verification.log('Verificando se o usuário foi configurado corretamente...', 'step');
      try {
        const checkUser = await verification.execPromise('wsl -d Ubuntu -u root id print_user', 10000, true);
        if (checkUser.includes('print_user')) {
          verification.log('Usuário print_user configurado com sucesso!', 'success');
          installState.defaultUserCreated = true;
          saveInstallState();
          return true;
        } else {
          verification.log('Verificação do usuário falhou, mas continuando mesmo assim', 'warning');
          installState.defaultUserCreated = true; // Assumir que foi criado para avançar
          saveInstallState();
          return true;
        }
      } catch (verifyError) {
        verification.log('Erro ao verificar usuário, mas continuando mesmo assim', 'warning');
        verification.logToFile(`Erro na verificação: ${JSON.stringify(verifyError)}`);
        installState.defaultUserCreated = true; // Assumir que foi criado para avançar
        saveInstallState();
        return true;
      }
    } catch (scriptError) {
      verification.log('Erro ao configurar usuário via script', 'error');
      verification.logToFile(`Erro no script: ${JSON.stringify(scriptError)}`);
      
      // Método alternativo: comandos diretos
      verification.log('Tentando método alternativo para criar usuário...', 'step');
      
      try {
        // Criar usuário diretamente
        await verification.execPromise('wsl -d Ubuntu -u root useradd -m -s /bin/bash print_user', 15000, true);
        verification.log('Usuário criado diretamente', 'success');
        
        // Definir senha
        await verification.execPromise('wsl -d Ubuntu -u root bash -c "echo print_user:print_user | chpasswd"', 15000, true);
        verification.log('Senha configurada', 'success');
        
        // Adicionar ao sudo
        await verification.execPromise('wsl -d Ubuntu -u root usermod -aG sudo print_user', 15000, true);
        verification.log('Usuário adicionado ao grupo sudo', 'success');
        
        verification.log('Usuário configurado com método alternativo', 'success');
        installState.defaultUserCreated = true;
        saveInstallState();
        return true;
      } catch (altError) {
        verification.log('Todos os métodos de configuração de usuário falharam', 'error');
        verification.logToFile(`Erro no método alternativo: ${JSON.stringify(altError)}`);
        
        // No ambiente Electron, tentar continuar mesmo assim
        if (isElectron) {
          verification.log('Continuando sem usuário configurado corretamente', 'warning');
          installState.defaultUserCreated = true; // Apenas para continuar
          saveInstallState();
          return true;
        }
        return false;
      }
    }
  } catch (error) {
    verification.log(`Erro geral ao configurar usuário: ${error.message}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    
    if (isElectron) {
      // Em ambiente Electron, tentar continuar mesmo assim
      verification.log('Continuando apesar do erro na configuração de usuário', 'warning');
      installState.defaultUserCreated = true; // Apenas para continuar
      saveInstallState();
      return true;
    }
    return false;
  }
}

// Executar os comandos no WSL diretamente para instalar a aplicação
async function configureSystem() {
  verification.log('Configurando o sistema no WSL...', 'header');
  
  try {
    const needsConfiguration = await verification.shouldConfigureSystem(installState);
    if (!needsConfiguration) {
      verification.log('Sistema já está configurado e funcional!', 'success');
      return true;
    }
    
    // CRUCIAL: Garantir que o WSL esteja acessível
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
    
    // Definir os comandos a serem executados sequencialmente
    const commands = [
      {
        desc: "Atualizando pacotes",
        cmd: "DEBIAN_FRONTEND=noninteractive apt update && DEBIAN_FRONTEND=noninteractive apt upgrade -y"
      },
      {
        desc: "Instalando dependências",
        cmd: "DEBIAN_FRONTEND=noninteractive apt install -y nano samba cups nginx postgresql postgresql-contrib ufw npm jq"
      },
      {
        desc: "Criando estrutura de diretórios",
        cmd: "mkdir -p /opt/print_server/print_server_desktop"
      },
      {
        desc: "Criando diretórios para logs e atualizações",
        cmd: "mkdir -p /opt/print_server/logs /opt/print_server/updates /opt/print_server/print_server_desktop/logs"
      },
      {
        desc: "Configurando Git",
        cmd: "git config --global pull.rebase false && git config --global status.showUntrackedFiles no"
      },
      {
        desc: "Salvando informações de instalação",
        cmd: "echo '{\"install_date\": \"'$(date +%Y-%m-%d)'\", \"version\": \"1.0.0\"}' > /opt/print_server/version.json"
      },
      {
        desc: "Configurando arquivos de atualização",
        cmd: "touch /opt/print_server/executed_updates.txt"
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
      }
    ];
    
    // Executar os comandos sequencialmente
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      verification.log(`${i+1}/${commands.length}: ${command.desc}...`, 'step');
      
      // Tentar executar o comando com até 3 tentativas
      let success = false;
      let attempts = 0;
      let lastError = null;
      
      while (!success && attempts < 3) {
        attempts++;
        try {
          // Executar comando com timeout adequado
          await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${command.cmd}"`, 300000, true);
          verification.log(`${command.desc} concluído com sucesso (tentativa ${attempts})`, 'success');
          success = true;
        } catch (error) {
          lastError = error;
          
          if (attempts < 3) {
            verification.log(`Erro na tentativa ${attempts}, tentando novamente...`, 'warning');
            verification.logToFile(`Comando: ${command.cmd}`);
            verification.logToFile(`Erro: ${JSON.stringify(error)}`);
            
            // Aguardar antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 5000));
          } else {
            verification.log(`Falha após ${attempts} tentativas: ${command.desc}`, 'error');
            verification.logToFile(`Comando final: ${command.cmd}`);
            verification.logToFile(`Erro final: ${JSON.stringify(error)}`);
          }
        }
      }
      
      // Se todas as tentativas falharam
      if (!success) {
        // Em ambiente Electron, continuamos automaticamente
        if (isElectron) {
          verification.log('Ocorreu um erro, mas continuando mesmo assim', 'warning');
        } else {
          // Perguntar se deve continuar
          const answer = await askQuestion('Ocorreu um erro. Deseja continuar mesmo assim? (S/N): ');
          if (answer.toLowerCase() !== 's') {
            throw new Error(`Instalação interrompida em: ${command.desc}`);
          }
        }
      }
    }
    
    // Copiar os arquivos do print_server_desktop embutido no instalador para o WSL
    verification.log('Instalando o print_server_desktop...', 'step');
    
    try {
      // Obter o diretório atual do instalador
      const installerDir = process.cwd();
      const serverFiles = path.join(installerDir, 'resources', 'print_server_desktop');
      
      // Verificar se os recursos existem
      if (fs.existsSync(serverFiles)) {
        verification.log('Arquivos do print_server_desktop encontrados. Iniciando cópia...', 'info');
        
        // Criar um arquivo temporário contendo a lista de arquivos a serem copiados
        const tempDir = path.join(os.tmpdir(), 'wsl-setup');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Criar um script de instalação para executar no WSL
        const setupScript = path.join(tempDir, 'copy_server_files.sh');
        const scriptContent = `#!/bin/bash
echo "Iniciando instalação dos arquivos do print_server_desktop..."
TARGET_DIR="/opt/print_server/print_server_desktop"

# Garantir que o diretório de destino existe
mkdir -p "$TARGET_DIR"

# Limpar arquivos existentes, mantendo apenas os logs e configurações
find "$TARGET_DIR" -type f ! -name "*.log" ! -name ".env" -delete

echo "Diretório preparado, copiando arquivos..."
`;
        
        fs.writeFileSync(setupScript, scriptContent, { mode: 0o755 });
        
        // Agora criar um arquivo tar com todos os arquivos do print_server_desktop
        const tarFile = path.join(tempDir, 'print_server_desktop.tar');
        
        // Executar comando para criar o tar
        await verification.execPromise(`tar -cf "${tarFile}" -C "${serverFiles}" .`, 60000, true);
        
        // Obter o caminho WSL para o arquivo tar
        const wslTarPath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${tarFile.replace(/\\/g, '/')}"`, 10000, true);
        
        // Extrair o tar no diretório de destino
        const extractCommand = `tar -xf "${wslTarPath}" -C /opt/print_server/print_server_desktop`;
        await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${extractCommand}'`, 60000, true);
        
        // Configurar permissões e instalar dependências
        await verification.execPromise('wsl -d Ubuntu -u root bash -c "cd /opt/print_server/print_server_desktop && npm install"', 180000, true);
        
        // Criar o arquivo .env se não existir
        const envCheck = 'if [ ! -f "/opt/print_server/print_server_desktop/.env" ]; then cp /opt/print_server/print_server_desktop/.env.example /opt/print_server/print_server_desktop/.env || echo "PORT=56258" > /opt/print_server/print_server_desktop/.env; fi';
        await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${envCheck}'`, 10000, true);
        
        verification.log('Instalação do print_server_desktop concluída com sucesso', 'success');
      } else {
        verification.log('Pasta de recursos do print_server_desktop não encontrada!', 'error');
        verification.logToFile(`Diretório esperado: ${serverFiles}`);
        
        // Ainda assim, tentar criar uma estrutura básica
        const basicSetupCmd = `
        mkdir -p /opt/print_server/print_server_desktop
        echo '{"name":"print_server_desktop","version":"1.0.0"}' > /opt/print_server/print_server_desktop/package.json
        echo 'PORT=56258' > /opt/print_server/print_server_desktop/.env
        `;
        
        await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${basicSetupCmd}'`, 10000, true);
      }
    } catch (error) {
      verification.log(`Erro ao instalar o print_server_desktop: ${error.message}`, 'error');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
      
      // Continuar mesmo com erro na instalação do servidor
      if (isElectron) {
        verification.log('Ocorreu um erro, mas continuando mesmo assim', 'warning');
      } else {
        const answer = await askQuestion('Erro na instalação do servidor. Deseja continuar mesmo assim? (S/N): ');
        if (answer.toLowerCase() !== 's') {
          throw new Error(`Instalação interrompida na instalação do servidor`);
        }
      }
    }
    
    // Configurar inicialização do serviço
    verification.log('Configurando inicialização do serviço...', 'step');
    try {
      // Verificar se o PM2 está instalado, se não, instalá-lo
      const pm2Check = 'if ! command -v pm2 &> /dev/null; then npm install -g pm2; fi';
      await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${pm2Check}'`, 120000, true);
      
      // Configurar o serviço para iniciar com o PM2
      const startupCmd = 'cd /opt/print_server/print_server_desktop && pm2 start ecosystem.config.js && pm2 save && pm2 startup';
      await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${startupCmd}'`, 30000, true);
      
      verification.log('Serviço configurado com sucesso', 'success');
    } catch (error) {
      verification.log(`Erro ao configurar o serviço: ${error.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    }
    
    // Criar script de update.sh personalizado
    verification.log('Configurando sistema de atualizações...', 'step');
    try {
      const updateScript = `#!/bin/bash
LOG_FILE="/opt/print_server/update_log.txt"

log() {
  local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
  echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

# Executar scripts de atualização
UPDATE_DIR="/opt/print_server/updates"
EXECUTED_FILE="/opt/print_server/executed_updates.txt"

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
  cd /opt/print_server/print_server_desktop && pm2 restart ecosystem.config.js
fi

log "=== Processo de atualização concluído com sucesso! ==="
`;
      
      // Escrever o script de atualização em um arquivo temporário
      const tempDir = path.join(os.tmpdir(), 'wsl-setup');
      const updateScriptPath = path.join(tempDir, 'update.sh');
      fs.writeFileSync(updateScriptPath, updateScript, { mode: 0o755 });
      
      // Copiar para o WSL
      const wslScriptPath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${updateScriptPath.replace(/\\/g, '/')}"`, 10000, true);
      await verification.execPromise(`wsl -d Ubuntu -u root bash -c "cp ${wslScriptPath} /opt/print_server/update.sh && chmod +x /opt/print_server/update.sh"`, 10000, true);
      
      verification.log('Script de atualização configurado com sucesso', 'success');
    } catch (error) {
      verification.log(`Erro ao configurar script de atualização: ${error.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
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

    // Informações de acesso
    verification.log('Instalação concluída com sucesso!', 'success');
    verification.log('O Sistema de Gerenciamento de Impressão está pronto para uso.', 'success');

    try {
      // Obter o IP local
      const localIp = (await verification.execPromise('wsl -d Ubuntu hostname -I', 10000, true)).trim();
      verification.log(`Acesse http://${localIp} em um navegador para utilizar o sistema.`, 'info');
    } catch (error) {
      verification.log('Não foi possível determinar o endereço IP. Por favor, verifique as configurações de rede.', 'warning');
      verification.logToFile(`Detalhes do erro ao obter IP: ${JSON.stringify(error)}`);
    }

    verification.log('Para administrar o sistema:', 'info');
    verification.log('1. Acesse o WSL usando o comando "wsl" no Prompt de Comando ou PowerShell.', 'info');
    verification.log('2. Navegue até /opt/print-management para acessar os arquivos do sistema.', 'info');

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

// Configurar a função de perguntas personalizada (usado pelo Electron)
function setCustomAskQuestion(fn) {
  customAskQuestion = fn;
}

// Se for executado diretamente
if (require.main === module) {
  installSystem().catch(async (error) => {
    console.error(`Erro fatal: ${error.message || error}`);
    verification.logToFile(`Erro fatal na execução principal: ${JSON.stringify(error)}`);

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
    verification, // Exportar o módulo de verificação completo
    log: verification.log,
    clearScreen,
    checkWSLStatusDetailed: verification.checkWSLStatusDetailed,
    askQuestion,
    setCustomAskQuestion,
    configureDefaultUser
  };
}

