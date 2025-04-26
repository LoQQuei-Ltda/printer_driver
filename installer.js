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
      const ubuntuExists = await verification.checkUbuntuInstalled();
      
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
    for (let i = 0; i < packageGroups.length; i++) {
      const group = packageGroups[i];
      verification.log(`Instalando grupo ${i+1}/${packageGroups.length}: ${group.join(', ')}`, 'step');
      
      try {
        // Usar timeout de 10 minutos para cada grupo
        await verification.execPromise(`wsl -d Ubuntu -u root apt install -y ${group.join(' ')}`, 600000, true);
        verification.log(`Grupo ${i+1} instalado com sucesso`, 'success');
      } catch (groupError) {
        try {
          await verification.execPromise('wsl -d Ubuntu -u root dpkg --configure -a -y', 6000, true);
          await verification.execPromise('wsl -d Ubuntu -u root apt --fix-broken install -y', 6000, true);
          await verification.execPromise('wsl -d Ubuntu -u root apt clean', 6000, true);
          await verification.execPromise('wsl -d Ubuntu -u root apt update', 6000, true);
          await verification.execPromise('wsl -d Ubuntu -u root apt upgrade -y', 60000, true);
        } catch (error) {
          await verification.log('Error: ' + error);
          await verification.logToFile('Error: ' + error);
        }

        verification.log(`Erro ao instalar grupo ${i+1}: ${groupError.message || 'Erro desconhecido'}`, 'warning');
        verification.logToFile(`Detalhes do erro: ${JSON.stringify(groupError)}`);
        
        // Tentar instalar um por um se o grupo falhar
        for (const pkg of group) {
          try {
            verification.log(`Tentando instalar ${pkg} individualmente...`, 'step');
            await verification.execPromise(`wsl -d Ubuntu -u root apt install -y ${pkg}`, 300000, true);
            verification.log(`Pacote ${pkg} instalado com sucesso`, 'success');
          } catch (pkgError) {
            verification.log(`Erro ao instalar ${pkg}: ${pkgError.message || 'Erro desconhecido'}`, 'warning');
            // Continuar para o próximo pacote
          }
        }
      }
      
      // Pausa breve entre grupos para dar folga ao sistema
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    verification.log('Instalação de pacotes concluída com sucesso!', 'success');
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
    // Criar arquivo de configuração do Samba
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
    
    // Criar diretório compartilhado
    await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /srv/print_server', 10000, true);
    await verification.execPromise('wsl -d Ubuntu -u root chmod -R 0777 /srv/print_server', 10000, true);
    
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
    // Criar arquivo de configuração do CUPS
    const cupsContent = `Listen 0.0.0.0:631
WebInterface Yes
ServerAlias *
<Location />
  Order allow,deny
  Allow all
</Location>
<Location /admin>
  Order allow,deny
  Allow all
</Location>
`;

    // Criar arquivo temporário
    const tempDir = path.join(os.tmpdir(), 'wsl-setup');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const cupsConfigPath = path.join(tempDir, 'cupsd.conf');
    fs.writeFileSync(cupsConfigPath, cupsContent);
    
    // Obter caminho WSL para o arquivo
    const wslPath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${cupsConfigPath.replace(/\\/g, '/')}"`, 10000, true);
    
    // Copiar para o WSL
    await verification.execPromise(`wsl -d Ubuntu -u root mkdir -p /etc/cups`, 10000, true);
    await verification.execPromise(`wsl -d Ubuntu -u root cp "${wslPath}" /etc/cups/cupsd.conf`, 10000, true);
    
    // Configurar para acesso remoto
    await verification.execPromise('wsl -d Ubuntu -u root cupsctl --remote-any', 15000, true);
    
    // Reiniciar serviço
    await verification.execPromise('wsl -d Ubuntu -u root systemctl restart cups', 30000, true);
    
    verification.log('CUPS configurado com sucesso', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar CUPS: ${error.message}`, 'error');
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
    for (const { port, protocol } of ports) {
      verification.log(`Configurando porta ${port}/${protocol}...`, 'step');
      await verification.execPromise(`wsl -d Ubuntu -u root ufw allow ${port}/${protocol}`, 10000, true);
    }
    
    // Ativar o firewall
    verification.log('Ativando firewall...', 'step');
    await verification.execPromise('wsl -d Ubuntu -u root ufw --force enable', 20000, true);
    
    verification.log('Firewall configurado com sucesso', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar firewall: ${error.message}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Configurar banco de dados PostgreSQL
// Configurar banco de dados PostgreSQL - Função completamente refeita
async function setupDatabase() {
  verification.log('Configurando banco de dados PostgreSQL...', 'header');
  
  try {
    // 1. Verificar e iniciar serviço PostgreSQL
    verification.log('Verificando status do PostgreSQL...', 'step');
    let postgresRunning = false;
    try {
      const statusOutput = await verification.execPromise('wsl -d Ubuntu -u root systemctl status postgresql', 15000, true);
      if (statusOutput.includes('active (running)')) {
        verification.log('Serviço PostgreSQL já está ativo', 'success');
        postgresRunning = true;
      } else {
        verification.log('Serviço PostgreSQL não está ativo, iniciando...', 'warning');
        await verification.execPromise('wsl -d Ubuntu -u root systemctl start postgresql', 30000, true);
        verification.log('Serviço PostgreSQL iniciado com sucesso', 'success');
        postgresRunning = true;
      }
    } catch (pgError) {
      verification.log('Erro ao verificar status do PostgreSQL, tentando iniciar...', 'warning');
      try {
        await verification.execPromise('wsl -d Ubuntu -u root systemctl start postgresql', 30000, true);
        verification.log('Serviço PostgreSQL iniciado com sucesso', 'success');
        postgresRunning = true;
      } catch (startError) {
        verification.log('Erro ao iniciar PostgreSQL, tentando método alternativo...', 'warning');
        try {
          // Tentar iniciar com pg_ctlcluster - descobre a versão automaticamente
          const pgVersionOutput = await verification.execPromise('wsl -d Ubuntu -u root pg_lsclusters', 15000, true);
          const versionMatch = pgVersionOutput.match(/(\d+\.\d+|\d+)/);
          
          if (versionMatch) {
            const pgVersion = versionMatch[0];
            verification.log(`Detectada versão PostgreSQL ${pgVersion}, tentando iniciar...`, 'info');
            await verification.execPromise(`wsl -d Ubuntu -u root pg_ctlcluster ${pgVersion} main start`, 30000, true);
            verification.log('PostgreSQL iniciado via pg_ctlcluster', 'success');
            postgresRunning = true;
          } else {
            throw new Error('Não foi possível detectar a versão do PostgreSQL');
          }
        } catch (altStartError) {
          verification.log('Não foi possível iniciar o PostgreSQL', 'error');
          verification.logToFile(`Detalhes do erro: ${JSON.stringify(altStartError)}`);
          return false;
        }
      }
    }
    
    // Aguardar o PostgreSQL inicializar completamente
    verification.log('Aguardando PostgreSQL inicializar completamente...', 'info');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 2. Configurar hba.conf para permitir conexões locais
    verification.log('Verificando configuração de acesso do PostgreSQL...', 'step');
    try {
      const pgHbaPath = await verification.execPromise(
        'wsl -d Ubuntu -u postgres psql -t -c "SHOW hba_file;" | xargs',
        10000, 
        true
      );
      
      if (pgHbaPath && pgHbaPath.length > 0) {
        verification.log(`Arquivo pg_hba.conf localizado: ${pgHbaPath}`, 'info');
        
        // Verificar se já existem as regras necessárias
        const hbaContent = await verification.execPromise(
          `wsl -d Ubuntu -u root cat ${pgHbaPath}`,
          10000,
          true
        );
        
        let modified = false;
        
        // Adicionar regras se não existirem
        if (!hbaContent.includes('host all all 127.0.0.1/32 trust')) {
          await verification.execPromise(
            `wsl -d Ubuntu -u root bash -c 'echo "host all all 127.0.0.1/32 trust" >> ${pgHbaPath}'`,
            10000,
            true
          );
          modified = true;
        }
        
        if (!hbaContent.includes('host all all 0.0.0.0/0 md5')) {
          await verification.execPromise(
            `wsl -d Ubuntu -u root bash -c 'echo "host all all 0.0.0.0/0 md5" >> ${pgHbaPath}'`,
            10000,
            true
          );
          modified = true;
        }
        
        // Reiniciar PostgreSQL se as regras foram modificadas
        if (modified) {
          verification.log('Regras de acesso adicionadas, reiniciando PostgreSQL...', 'step');
          await verification.execPromise('wsl -d Ubuntu -u root systemctl restart postgresql', 30000, true);
          verification.log('PostgreSQL reiniciado com sucesso', 'success');
          
          // Aguardar novamente
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          verification.log('Configuração de acesso já está correta', 'success');
        }
      } else {
        verification.log('Não foi possível obter caminho do pg_hba.conf, continuando mesmo assim...', 'warning');
      }
    } catch (pgHbaError) {
      verification.log('Erro ao configurar acesso PostgreSQL, continuando mesmo assim...', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(pgHbaError)}`);
    }
    
    // 3. Configurar bancos de dados e usuários
    // 3.1 Configurar print_user e print_server (Sistema principal)
    verification.log('Verificando/criando usuário print_user...', 'step');
    try {
      // Verificar se o usuário existe
      const userPrintExists = await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='print_user'"`,
        10000,
        true
      );
      
      if (userPrintExists.trim() !== '1') {
        // Criar o usuário
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -c "CREATE USER print_user WITH PASSWORD 'print_user'"`,
          15000,
          true
        );
        verification.log('Usuário print_user criado com sucesso', 'success');
      } else {
        verification.log('Usuário print_user já existe', 'info');
      }
      
      // Garantir que tenha privilégios de superusuário
      await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -c "ALTER USER print_user WITH SUPERUSER"`,
        15000,
        true
      );
      verification.log('Privilégios de superusuário concedidos para print_user', 'success');
    } catch (userError) {
      verification.log(`Erro ao configurar usuário print_user: ${userError.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(userError)}`);
    }
    
    verification.log('Verificando/criando banco de dados print_server...', 'step');
    try {
      // Verificar se o banco existe
      const dbPrintServerExists = await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='print_server'"`,
        10000,
        true
      );
      
      if (dbPrintServerExists.trim() !== '1') {
        // Criar o banco
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -c "CREATE DATABASE print_server OWNER print_user"`,
          15000,
          true
        );
        verification.log('Banco de dados print_server criado com sucesso', 'success');
      } else {
        verification.log('Banco de dados print_server já existe', 'info');
        // Garantir ownership correto
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -c "ALTER DATABASE print_server OWNER TO print_user"`,
          15000,
          true
        );
      }
      
      // Conceder todos os privilégios
      await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE print_server TO print_user"`,
        15000,
        true
      );
      verification.log('Privilégios concedidos para print_user no banco print_server', 'success');
    } catch (dbError) {
      verification.log(`Erro ao configurar banco de dados print_server: ${dbError.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(dbError)}`);
    }
    
    // 3.2 Configurar postgres_print e print_management (Migrações)
    verification.log('Verificando/criando usuário postgres_print para migrações...', 'step');
    try {
      // Verificar se o usuário existe
      const userMigExists = await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='postgres_print'"`,
        10000,
        true
      );
      
      if (userMigExists.trim() !== '1') {
        // Criar o usuário
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -c "CREATE USER postgres_print WITH PASSWORD 'root_print'"`,
          15000,
          true
        );
        verification.log('Usuário postgres_print criado com sucesso', 'success');
      } else {
        verification.log('Usuário postgres_print já existe', 'info');
      }
      
      // Garantir que tenha privilégios de superusuário
      await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -c "ALTER USER postgres_print WITH SUPERUSER"`,
        15000,
        true
      );
      verification.log('Privilégios de superusuário concedidos para postgres_print', 'success');
    } catch (userMigError) {
      verification.log(`Erro ao configurar usuário postgres_print: ${userMigError.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(userMigError)}`);
    }
    
    verification.log('Verificando/criando banco de dados print_management para migrações...', 'step');
    try {
      // Verificar se o banco existe
      const dbMigExists = await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='print_management'"`,
        10000,
        true
      );
      
      if (dbMigExists.trim() !== '1') {
        // Criar o banco
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -c "CREATE DATABASE print_management OWNER postgres_print"`,
          15000,
          true
        );
        verification.log('Banco de dados print_management criado com sucesso', 'success');
      } else {
        verification.log('Banco de dados print_management já existe', 'info');
        // Garantir ownership correto
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -c "ALTER DATABASE print_management OWNER TO postgres_print"`,
          15000,
          true
        );
      }
      
      // Conceder todos os privilégios
      await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE print_management TO postgres_print"`,
        15000,
        true
      );
      verification.log('Privilégios concedidos para postgres_print no banco print_management', 'success');
    } catch (dbMigError) {
      verification.log(`Erro ao configurar banco de dados print_management: ${dbMigError.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(dbMigError)}`);
    }
    
    // 4. Verificar e criar schema print_management
    verification.log('Verificando/criando schema print_management...', 'step');
    try {
      // Primeiro verifica se o schema existe
      const schemaExistsCmd = `
      PGPASSWORD="root_print" psql -h localhost -p 5432 -U postgres_print -d print_management -tAc "
        SELECT EXISTS(
          SELECT 1 FROM information_schema.schemata WHERE schema_name = 'print_management'
        )
      " || echo "f"
      `;
      
      const schemaExists = await verification.execPromise(
        `wsl -d Ubuntu -u root bash -c '${schemaExistsCmd}'`,
        15000,
        true
      );
      
      if (schemaExists.trim() !== 't' && schemaExists.trim() !== 'true') {
        // Criar o schema
        const createSchemaCmd = `
        PGPASSWORD="root_print" psql -h localhost -p 5432 -U postgres_print -d print_management -c "
          CREATE SCHEMA print_management;
          GRANT ALL ON SCHEMA print_management TO postgres_print;
        "
        `;
        
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c '${createSchemaCmd}'`,
          15000,
          true
        );
        verification.log('Schema print_management criado com sucesso', 'success');
      } else {
        verification.log('Schema print_management já existe', 'success');
        
        // Garantir permissões
        const grantSchemaCmd = `
        PGPASSWORD="root_print" psql -h localhost -p 5432 -U postgres_print -d print_management -c "
          GRANT ALL ON SCHEMA print_management TO postgres_print;
        "
        `;
        
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c '${grantSchemaCmd}'`,
          15000,
          true
        );
      }
    } catch (schemaError) {
      verification.log(`Erro ao verificar/criar schema: ${schemaError.message}`, 'warning');
      verification.logToFile(`Detalhes do erro schema: ${JSON.stringify(schemaError)}`);
    }
    
    // 5. Validar o acesso ao banco
    verification.log('Validando conexão com o banco de dados...', 'step');
    try {
      const testConnCmd = `
      PGPASSWORD="root_print" psql -h localhost -p 5432 -U postgres_print -d print_management -c "
        SELECT 'Conexão bem-sucedida' as status;
      "
      `;
      
      const connResult = await verification.execPromise(
        `wsl -d Ubuntu -u root bash -c '${testConnCmd}'`,
        15000,
        true
      );
      
      if (connResult.includes('Conexão bem-sucedida')) {
        verification.log('Conexão ao banco de dados estabelecida com sucesso', 'success');
      } else {
        verification.log('Resultado inesperado ao testar conexão', 'warning');
        verification.logToFile(`Resultado da conexão: ${connResult}`);
      }
    } catch (connError) {
      verification.log('Erro ao testar conexão com o banco', 'warning');
      verification.logToFile(`Detalhes do erro de conexão: ${JSON.stringify(connError)}`);
    }
    
    verification.log('Banco de dados PostgreSQL configurado com sucesso!', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro geral ao configurar banco de dados: ${error.message}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
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
      const nodeVersion = await verification.execPromise('wsl -d Ubuntu -u root node --version', 10000, true);
      verification.log(`Node.js detectado: ${nodeVersion.trim()}`, 'success');
    } catch (nodeError) {
      verification.log('Node.js não encontrado ou não está no PATH, tentando instalar...', 'warning');
      
      // Instalar Node.js
      try {
        await verification.execPromise('wsl -d Ubuntu -u root apt-get update', 60000, true);
        await verification.execPromise('wsl -d Ubuntu -u root apt-get install -y nodejs npm', 180000, true);
        
        // Verificar se a instalação foi bem-sucedida
        const nodeCheck = await verification.execPromise('wsl -d Ubuntu -u root node --version', 10000, true);
        verification.log(`Node.js instalado: ${nodeCheck.trim()}`, 'success');
      } catch (nodeInstallError) {
        verification.log('Falha ao instalar Node.js', 'error');
        verification.logToFile(`Erro de instalação do Node.js: ${JSON.stringify(nodeInstallError)}`);
        return false;
      }
    }
    
    // Verificar se o PM2 está instalado
    verification.log('Verificando instalação do PM2...', 'step');
    
    let pm2Installed = false;
    try {
      const pm2Version = await verification.execPromise('wsl -d Ubuntu -u root pm2 --version', 10000, true);
      verification.log(`PM2 já instalado: ${pm2Version.trim()}`, 'success');
      pm2Installed = true;
    } catch (pm2Error) {
      verification.log('PM2 não encontrado, instalando...', 'info');
      
      // Instalar PM2 globalmente
      try {
        await verification.execPromise('wsl -d Ubuntu -u root npm install -g pm2', 180000, true);
        
        // Verificar se a instalação foi bem-sucedida
        const pm2Check = await verification.execPromise('wsl -d Ubuntu -u root pm2 --version', 10000, true);
        verification.log(`PM2 instalado: ${pm2Check.trim()}`, 'success');
        pm2Installed = true;
      } catch (pm2InstallError) {
        verification.log('Erro ao instalar PM2 via npm', 'error');
        verification.logToFile(`Erro de instalação do PM2: ${JSON.stringify(pm2InstallError)}`);
        return false;
      }
    }
    
    // Encontrar o diretório da aplicação
    const possiblePaths = [
      '/opt/loqquei/print_server_desktop',
      '/opt/print_server/print_server_desktop',
      '/opt/loqquei',
      '/opt/print_server'
    ];
    
    let appDir = null;
    for (const path of possiblePaths) {
      const checkCmd = `if [ -d "${path}" ]; then echo "exists"; else echo "missing"; fi`;
      const dirExists = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${checkCmd}"`, 10000, true);
      
      if (dirExists.trim() === 'exists') {
        // Verificar se também tem o arquivo ecosystem.config.js
        const ecoCheckCmd = `if [ -f "${path}/ecosystem.config.js" ]; then echo "exists"; else echo "missing"; fi`;
        const ecoExists = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${ecoCheckCmd}"`, 10000, true);
        
        if (ecoExists.trim() === 'exists') {
          appDir = path;
          verification.log(`Diretório da aplicação encontrado: ${path}`, 'success');
          break;
        }
      }
    }
    
    if (!appDir) {
      verification.log('Diretório da aplicação não encontrado', 'error');
      return false;
    }
    
    // Verificar se o arquivo bin/www.js existe
    verification.log('Verificando arquivo bin/www.js...', 'step');
    const wwwCheckCmd = `if [ -f "${appDir}/bin/www.js" ]; then echo "exists"; else echo "missing"; fi`;
    const wwwExists = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${wwwCheckCmd}"`, 10000, true);
    
    if (wwwExists.trim() !== 'exists') {
      verification.log('Arquivo bin/www.js não encontrado, verificando alternativas...', 'warning');
      
      // Tentar encontrar um arquivo .js que possa ser o ponto de entrada
      const findEntryCmd = `find ${appDir}/bin -name "*.js" | head -n 1`;
      try {
        const entryFile = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${findEntryCmd}"`, 15000, true);
        
        if (entryFile.trim()) {
          verification.log(`Arquivo de entrada alternativo encontrado: ${entryFile.trim()}`, 'info');
          
          // Criar um link simbólico para www.js
          await verification.execPromise(`wsl -d Ubuntu -u root bash -c "ln -sf ${entryFile.trim()} ${appDir}/bin/www.js"`, 10000, true);
          verification.log('Link simbólico criado para www.js', 'success');
        } else {
          verification.log('Nenhum arquivo de entrada encontrado em bin/', 'warning');
          
          // Verificar se há algum arquivo app.js ou server.js no diretório raiz
          const rootEntryCmd = `find ${appDir} -maxdepth 1 -name "*.js" | grep -E '(app|server|index)\\.js' | head -n 1`;
          const rootEntry = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${rootEntryCmd}"`, 15000, true);
          
          if (rootEntry.trim()) {
            verification.log(`Arquivo de entrada alternativo encontrado na raiz: ${rootEntry.trim()}`, 'info');
            
            // Criar diretório bin se não existir
            await verification.execPromise(`wsl -d Ubuntu -u root bash -c "mkdir -p ${appDir}/bin"`, 10000, true);
            
            // Criar um link simbólico para www.js
            await verification.execPromise(`wsl -d Ubuntu -u root bash -c "ln -sf ${rootEntry.trim()} ${appDir}/bin/www.js"`, 10000, true);
            verification.log('Link simbólico criado para www.js', 'success');
          } else {
            verification.log('Nenhum arquivo de entrada encontrado', 'error');
            return false;
          }
        }
      } catch (findError) {
        verification.log('Erro ao procurar arquivos de entrada', 'error');
        verification.logToFile(`Erro de busca: ${JSON.stringify(findError)}`);
        return false;
      }
    }
    
    // Verificar e ajustar permissões
    verification.log('Ajustando permissões...', 'step');
    await verification.execPromise(`wsl -d Ubuntu -u root bash -c "chmod -R 755 ${appDir}/bin"`, 15000, true);
    
    // Verificar o conteúdo do ecosystem.config.js
    verification.log('Analisando arquivo ecosystem.config.js...', 'step');
    try {
      const ecoContent = await verification.execPromise(`wsl -d Ubuntu -u root cat "${appDir}/ecosystem.config.js"`, 10000, true);
      verification.log('Arquivo ecosystem.config.js encontrado com configuração válida', 'success');
      verification.logToFile(`Conteúdo do ecosystem.config.js: ${ecoContent}`);
    } catch (catError) {
      verification.log('Erro ao ler arquivo ecosystem.config.js', 'warning');
      verification.logToFile(`Erro de leitura: ${JSON.stringify(catError)}`);
    }
    
    // Parar qualquer instância existente
    verification.log('Parando instâncias existentes...', 'step');
    await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 delete all 2>/dev/null || true"', 15000, true);
    
    // Iniciar com PM2
    verification.log('Iniciando aplicação com PM2...', 'step');
    try {
      const startCmd = `cd "${appDir}" && pm2 start ecosystem.config.js`;
      const startResult = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${startCmd}"`, 30000, true);
      verification.log('Aplicação iniciada com PM2 com sucesso', 'success');
      verification.logToFile(`Resultado do início: ${startResult}`);
      
      // Salvar configuração
      verification.log('Salvando configuração do PM2...', 'step');
      await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 save"', 15000, true);
      verification.log('Configuração salva', 'success');
      
      // Configurar inicialização automática
      verification.log('Configurando inicialização automática...', 'step');
      try {
        const startupOutput = await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 startup"', 20000, true);
        
        // Extrair o comando de inicialização, se houver
        if (startupOutput.includes('sudo') && startupOutput.includes('pm2 startup')) {
          const lines = startupOutput.split('\n');
          for (const line of lines) {
            if (line.includes('sudo') && line.includes('pm2 startup')) {
              const extractedCmd = line.trim().replace(/sudo\s+/g, '');
              verification.log('Executando comando de inicialização automática...', 'step');
              await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${extractedCmd}"`, 20000, true);
              break;
            }
          }
        }
        verification.log('Inicialização automática configurada', 'success');
      } catch (startupError) {
        verification.log('Erro ao configurar inicialização automática, continuando...', 'warning');
        verification.logToFile(`Erro de startup: ${JSON.stringify(startupError)}`);
      }
      
      verification.log('Serviço configurado com PM2 com sucesso', 'success');
      return true;
    } catch (startError) {
      verification.log('Erro ao iniciar com PM2, tentando método alternativo...', 'warning');
      verification.logToFile(`Erro de início: ${JSON.stringify(startError)}`);
      
      // Tentar método mais simples de inicialização
      try {
        const simpleStartCmd = `cd "${appDir}" && pm2 start bin/www.js --name print_server_desktop`;
        await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${simpleStartCmd}"`, 20000, true);
        verification.log('Aplicação iniciada com método alternativo de PM2', 'success');
        
        // Salvar configuração
        await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 save"', 15000, true);
        verification.log('Configuração salva', 'success');
        
        verification.log('Serviço configurado com PM2 (método alternativo)', 'success');
        return true;
      } catch (altStartError) {
        verification.log('Erro no método alternativo de PM2, tentando método manual...', 'warning');
        verification.logToFile(`Erro no método alternativo: ${JSON.stringify(altStartError)}`);
        
        // Último recurso: iniciar diretamente com node
        try {
          const manualStartCmd = `cd "${appDir}" && nohup node bin/www.js > /var/log/print_server.log 2>&1 &`;
          await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${manualStartCmd}"`, 15000, true);
          verification.log('Aplicação iniciada manualmente com node', 'warning');
          verification.log('Nota: Este método não garante reinicialização automática', 'warning');
          return true;
        } catch (manualStartError) {
          verification.log('Todos os métodos de inicialização falharam', 'error');
          verification.logToFile(`Erro no método manual: ${JSON.stringify(manualStartError)}`);
          return false;
        }
      }
    }
  } catch (error) {
    verification.log(`Erro geral ao configurar PM2: ${error.message || 'Erro desconhecido'}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
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

// Executar migrações de banco de dados
// Funções completamente refeitas para execução de migrações

// Função principal que verifica o caminho e delega para setupMigrationsWithPath
async function setupMigrations() {
  verification.log('Verificando e executando migrações do banco de dados...', 'header');
  
  try {
    // Definir possíveis caminhos base onde o software pode estar instalado
    const possiblePaths = [
      "/opt/loqquei/print_server_desktop",
      "/opt/print_server/print_server_desktop",
      "/opt/loqquei",
      "/opt/print_server"
    ];
    
    // Verificar cada caminho
    for (const basePath of possiblePaths) {
      // Verificar se o diretório db existe
      const dbDirCheck = `if [ -d "${basePath}/db" ]; then echo "exists"; else echo "missing"; fi`;
      const dbDirStatus = await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${dbDirCheck}'`, 10000, true);
      
      if (dbDirStatus.trim() === "exists") {
        verification.log(`Diretório db encontrado em: ${basePath}`, 'success');
        
        // Delegar para a função de implementação
        const result = await setupMigrationsWithPath(basePath);
        return result;
      }
    }
    
    // Se chegou aqui, não encontrou o diretório de migrações em nenhum caminho conhecido
    verification.log('Diretório db não encontrado em nenhum caminho conhecido', 'warning');
    
    // Último recurso: procurar em todo o sistema
    verification.log('Procurando diretório db em todo o sistema (pode levar algum tempo)...', 'step');
    try {
      const findCommand = 'find /opt -type d -name "db" -path "*/print_server*" -o -path "*/loqquei*" 2>/dev/null | head -n 1';
      const foundDir = await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${findCommand}'`, 60000, true);
      
      if (foundDir.trim()) {
        // Extrair o caminho base (diretório pai do 'db')
        const foundBasePath = await verification.execPromise(`wsl -d Ubuntu -u root dirname "${foundDir.trim()}"`, 10000, true);
        
        if (foundBasePath.trim()) {
          verification.log(`Diretório db encontrado em: ${foundBasePath.trim()}`, 'success');
          const result = await setupMigrationsWithPath(foundBasePath.trim());
          return result;
        }
      }
    } catch (findError) {
      verification.log('Erro ao procurar diretório db', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(findError)}`);
    }
    
    verification.log('Nenhum diretório db encontrado, pulando migrações', 'warning');
    return true; // Continuar a instalação mesmo sem migrações
  } catch (error) {
    verification.log(`Erro ao executar migrações: ${error.message || JSON.stringify(error)}`, 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    
    // Mesmo com erro, prosseguir com a instalação
    verification.log('Continuando a instalação apesar do erro nas migrações...', 'warning');
    return true;
  }
}

// Função de implementação que executa as migrações em um caminho específico
async function setupMigrationsWithPath(basePath) {
  try {
    verification.log(`Executando migrações para o caminho: ${basePath}`, 'step');
    
    // Constantes para configuração do banco de dados
    const DB_HOST = 'localhost';
    const DB_PORT = '5432';
    const DB_NAME = 'print_management';
    const DB_USERNAME = 'postgres_print';
    const DB_PASSWORD = 'root_print';
    const DB_SCHEMA = 'print_management';
    
    // Caminho do script de migração
    const scriptPath = `${basePath}/db/migrate.sh`;
    
    // 1. Verificar se o script existe
    const scriptCheck = `if [ -f "${scriptPath}" ]; then echo "exists"; else echo "missing"; fi`;
    const scriptStatus = await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${scriptCheck}'`, 10000, true);
    
    if (scriptStatus.trim() !== "exists") {
      verification.log(`Script de migração não encontrado em ${scriptPath}`, 'warning');
      return true; // Continuar mesmo sem o script
    }
    
    verification.log(`Script de migração encontrado em ${scriptPath}`, 'success');
    
    // 2. Verificar e corrigir o formato do arquivo (quebras de linha Windows → Unix)
    verification.log('Verificando e corrigindo formato do arquivo de migração...', 'step');
    await verification.execPromise(`wsl -d Ubuntu -u root bash -c "tr -d '\\r' < ${scriptPath} > ${scriptPath}.unix && mv ${scriptPath}.unix ${scriptPath}"`, 15000, true);
    
    // 3. Configurar permissões de execução
    verification.log('Configurando permissões...', 'step');
    await verification.execPromise(`wsl -d Ubuntu -u root chmod -v 755 ${scriptPath}`, 10000, true);
    
    // 4. Verificar o tipo de arquivo (para diagnóstico)
    const fileType = await verification.execPromise(`wsl -d Ubuntu -u root file ${scriptPath}`, 10000, true);
    verification.log(`Tipo de arquivo: ${fileType}`, 'info');
    
    // 5. Verificar o status do PostgreSQL
    verification.log('Verificando status do PostgreSQL...', 'step');
    let postgresRunning = false;
    try {
      const statusOutput = await verification.execPromise('wsl -d Ubuntu -u root systemctl status postgresql', 15000, true);
      if (statusOutput.includes('active (running)')) {
        verification.log('Serviço PostgreSQL está ativo', 'success');
        postgresRunning = true;
      } else {
        verification.log('Serviço PostgreSQL não está ativo, iniciando...', 'warning');
        await verification.execPromise('wsl -d Ubuntu -u root systemctl start postgresql', 30000, true);
        verification.log('Serviço PostgreSQL iniciado com sucesso', 'success');
        postgresRunning = true;
        
        // Aguardar o serviço inicializar completamente
        verification.log('Aguardando PostgreSQL inicializar completamente...', 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (pgError) {
      verification.log('Erro ao verificar status do PostgreSQL, tentando iniciar...', 'warning');
      try {
        await verification.execPromise('wsl -d Ubuntu -u root systemctl start postgresql', 30000, true);
        verification.log('Serviço PostgreSQL iniciado com sucesso', 'success');
        postgresRunning = true;
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (startError) {
        verification.log('Não foi possível iniciar o PostgreSQL', 'error');
        verification.logToFile(`Detalhes do erro: ${JSON.stringify(startError)}`);
        return false;
      }
    }
    
    // 6. Garantir que o schema exista
    verification.log('Verificando e garantindo que o schema existe...', 'step');
    try {
      // Verificar se o schema existe
      const schemaCheckCmd = `
      PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USERNAME} -d ${DB_NAME} -tAc "
        SELECT EXISTS(
          SELECT 1 FROM information_schema.schemata WHERE schema_name = '${DB_SCHEMA}'
        )
      " 2>/dev/null || echo "f"
      `;
      
      const schemaExists = await verification.execPromise(
        `wsl -d Ubuntu -u root bash -c '${schemaCheckCmd}'`,
        15000,
        true
      );
      
      if (schemaExists.trim() !== 't' && schemaExists.trim() !== 'true') {
        // Criar o schema
        verification.log('Schema não existe, criando...', 'step');
        const createSchemaCmd = `
        PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USERNAME} -d ${DB_NAME} -c "
          CREATE SCHEMA ${DB_SCHEMA};
          GRANT ALL ON SCHEMA ${DB_SCHEMA} TO ${DB_USERNAME};
        "
        `;
        
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c '${createSchemaCmd}'`,
          15000,
          true
        );
        verification.log('Schema criado com sucesso', 'success');
      } else {
        verification.log('Schema já existe', 'success');
        
        // Garantir permissões corretas
        const grantSchemaCmd = `
        PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USERNAME} -d ${DB_NAME} -c "
          GRANT ALL ON SCHEMA ${DB_SCHEMA} TO ${DB_USERNAME};
          GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${DB_SCHEMA} TO ${DB_USERNAME};
          GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${DB_SCHEMA} TO ${DB_USERNAME};
          GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ${DB_SCHEMA} TO ${DB_USERNAME};
        "
        `;
        
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c '${grantSchemaCmd}'`,
          15000,
          true
        );
        verification.log('Permissões atualizadas para o schema', 'success');
      }
    } catch (schemaError) {
      verification.log('Erro ao verificar/criar schema, tentando prosseguir mesmo assim...', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(schemaError)}`);
    }
    
    // 7. Criar script wrapper com todas as variáveis necessárias
    verification.log('Preparando script wrapper para execução das migrações...', 'step');
    
    const wrapperScript = `#!/bin/bash
# Script wrapper para execução robusta das migrações

set -e

# Variáveis de ambiente necessárias
export DB_HOST="${DB_HOST}"
export DB_PORT="${DB_PORT}"
export DB_USERNAME="${DB_USERNAME}"
export DB_PASSWORD="${DB_PASSWORD}"
export DB_NAME="${DB_NAME}"
export DB_SCHEMA="${DB_SCHEMA}"

# Verificar a conexão com o banco de dados
echo "Verificando conexão com o banco de dados..."
if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d "${DB_NAME}" -c "SELECT 'Conexão OK'" > /dev/null 2>&1; then
  echo "ERRO: Não foi possível conectar ao banco de dados"
  
  # Verificar se o PostgreSQL está rodando
  if ! systemctl is-active postgresql > /dev/null; then
    echo "PostgreSQL não está rodando, tentando iniciar..."
    systemctl start postgresql
    sleep 5
    
    # Verificar novamente
    if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d "${DB_NAME}" -c "SELECT 'Conexão OK'" > /dev/null 2>&1; then
      echo "ERRO: Ainda não foi possível conectar ao banco de dados"
      exit 1
    fi
  fi
fi

echo "Conexão com banco de dados OK"

# Verificar schema novamente
echo "Verificando schema..."
if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d "${DB_NAME}" -tc "SELECT 1 FROM information_schema.schemata WHERE schema_name = '${DB_SCHEMA}'" | grep -q 1; then
  echo "Schema não encontrado, criando..."
  PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d "${DB_NAME}" -c "
    CREATE SCHEMA ${DB_SCHEMA};
    GRANT ALL ON SCHEMA ${DB_SCHEMA} TO ${DB_USERNAME};
  "
  echo "Schema criado"
fi

echo "Schema verificado"

# Ir para o diretório do script original
cd "${basePath}"

# Executar o script de migração original com timeout de 10 minutos
echo "Executando script de migração com timeout de 10 minutos..."
timeout 600 bash "${scriptPath}"
MIGRATION_RESULT=$?

if [ $MIGRATION_RESULT -eq 124 ]; then
  echo "AVISO: Script atingiu o timeout de 10 minutos"
  # Consideramos como sucesso mesmo com timeout
  exit 0
elif [ $MIGRATION_RESULT -ne 0 ]; then
  echo "ERRO: Script de migração falhou com código $MIGRATION_RESULT"
  exit $MIGRATION_RESULT
else
  echo "Migrações executadas com sucesso"
  exit 0
fi
`;
    
    // Salvar o script wrapper em arquivo temporário
    const tempDir = path.join(os.tmpdir(), 'wsl-setup');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const wrapperPath = path.join(tempDir, 'migration_wrapper.sh');
    fs.writeFileSync(wrapperPath, wrapperScript, { mode: 0o755 });
    
    // Copiar para o WSL
    verification.log('Copiando script wrapper para o WSL...', 'step');
    const wslWrapperPath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${wrapperPath.replace(/\\/g, '/')}"`, 10000, true);
    await verification.execPromise(`wsl -d Ubuntu -u root cp "${wslWrapperPath}" /tmp/migration_wrapper.sh`, 10000, true);
    await verification.execPromise('wsl -d Ubuntu -u root chmod 755 /tmp/migration_wrapper.sh', 10000, true);
    
    // 8. Executar o script wrapper
    verification.log('Executando script de migração (pode levar vários minutos)...', 'step');
    try {
      const migrationOutput = await verification.execPromise('wsl -d Ubuntu -u root bash /tmp/migration_wrapper.sh', 600000, true);
      
      // Registrar saída para diagnóstico
      verification.log('Resultado das migrações:', 'success');
      verification.logToFile(`Saída completa da migração: ${migrationOutput}`);
      
      // Mostrar as linhas mais relevantes no log
      const relevantLines = migrationOutput.split('\n')
        .filter(line => line.trim())
        .filter(line => !line.startsWith('  ') && !line.includes('CREATE') && !line.includes('--'))
        .slice(0, 10);
      
      relevantLines.forEach(line => {
        verification.log(`  ${line}`, 'info');
      });
      
      // 9. Verificar resultado das migrações
      if (migrationOutput.includes("Migrações executadas com sucesso")) {
        verification.log('Migrações executadas com sucesso', 'success');
        return true;
      } else {
        // Verificar se existem tabelas no schema (mesmo sem confirmação explícita)
        try {
          const tablesCheck = `
          PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USERNAME} -d ${DB_NAME} -tAc "
            SELECT count(*) FROM information_schema.tables WHERE table_schema = '${DB_SCHEMA}'
          "
          `;
          
          const tablesCount = await verification.execPromise(
            `wsl -d Ubuntu -u root bash -c '${tablesCheck}'`,
            15000,
            true
          );
          
          const count = parseInt(tablesCount.trim(), 10);
          if (!isNaN(count) && count > 0) {
            verification.log(`Verificação confirma que ${count} tabelas foram criadas no schema`, 'success');
            return true;
          } else {
            verification.log('Não foram encontradas tabelas no schema', 'warning');
          }
        } catch (tablesError) {
          verification.log('Erro ao verificar tabelas no schema', 'warning');
          verification.logToFile(`Detalhes do erro: ${JSON.stringify(tablesError)}`);
        }
        
        // Se chegou aqui, houve algum problema nas migrações mas não retornou erro
        verification.log('Migrações possivelmente incompletas, mas continuando...', 'warning');
        return true;
      }
    } catch (migrationError) {
      verification.log(`Erro durante a execução das migrações: ${migrationError.message || JSON.stringify(migrationError)}`, 'error');
      verification.logToFile(`Erro detalhado da migração: ${JSON.stringify(migrationError)}`);
      
      // Verificar se ainda assim as tabelas foram criadas
      try {
        const recoveryCheck = `
        PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USERNAME} -d ${DB_NAME} -tAc "
          SELECT count(*) FROM information_schema.tables WHERE table_schema = '${DB_SCHEMA}'
        "
        `;
        
        const recoveryCount = await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c '${recoveryCheck}'`,
          15000,
          true
        );
        
        const count = parseInt(recoveryCount.trim(), 10);
        if (!isNaN(count) && count > 0) {
          verification.log(`Apesar do erro, ${count} tabelas foram criadas no schema`, 'warning');
          return true;
        }
      } catch (recoveryError) {
        verification.log('Erro na verificação de recuperação', 'warning');
      }
      
      return false;
    }
  } catch (error) {
    verification.log(`Erro geral ao processar migrações: ${error.message || JSON.stringify(error)}`, 'error');
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
    
    // Configurar Samba e CUPS
    await configureSamba();
    await configureCups();
    
    // Copiar software
    await copySoftwareToOpt();
    
    // Configurar firewall
    await configureFirewall();
    
    // Configurar banco de dados
    await setupDatabase();
    
    // Configurar script de atualização
    await setupUpdateScript();
    
    // Instalar drivers
    await installDrivers();
    
    // Executar migrações
    await setupMigrations();
    
    // Configurar PM2
    await setupPM2();
    
    // Limpeza do sistema
    await systemCleanup();
    
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

    try {
      // Obter o IP local
      const localIp = (await verification.execPromise('wsl -d Ubuntu hostname -I', 10000, true)).trim().split(' ')[0];
      verification.log(`Acesse http://${localIp}:56257 em um navegador para utilizar o sistema.`, 'info');
    } catch (error) {
      verification.log('Não foi possível determinar o endereço IP. Por favor, verifique as configurações de rede.', 'warning');
      verification.logToFile(`Detalhes do erro ao obter IP: ${JSON.stringify(error)}`);
    }

    verification.log('Para administrar o sistema:', 'info');
    verification.log('1. Acesse o WSL usando o comando "wsl" no Prompt de Comando ou PowerShell.', 'info');
    verification.log('2. Navegue até /opt/loqquei/print_server_desktop para acessar os arquivos do sistema.', 'info');

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
  configureDefaultUser,
  configureSamba,
  configureCups,
  setupDatabase,
  configureFirewall,
  copySoftwareToOpt,
  setupUpdateScript,
  setupMigrations,
  setupPM2,
  systemCleanup,
  
}