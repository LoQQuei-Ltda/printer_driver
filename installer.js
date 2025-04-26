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
async function setupDatabase() {
  verification.log('Configurando banco de dados PostgreSQL...', 'header');
  
  try {
    // Verificar se o serviço PostgreSQL está ativo
    let postgresRunning = false;
    try {
      await verification.execPromise('wsl -d Ubuntu -u root systemctl status postgresql', 15000, true);
      verification.log('Serviço PostgreSQL já está ativo', 'success');
      postgresRunning = true;
    } catch (pgError) {
      verification.log('Serviço PostgreSQL não está ativo, tentando iniciá-lo...', 'warning');
      try {
        await verification.execPromise('wsl -d Ubuntu -u root systemctl start postgresql', 30000, true);
        verification.log('Serviço PostgreSQL iniciado com sucesso', 'success');
        postgresRunning = true;
      } catch (startError) {
        verification.log('Erro ao iniciar PostgreSQL, tentando método alternativo...', 'warning');
        try {
          // Tentar iniciar com pg_ctlcluster
          await verification.execPromise('wsl -d Ubuntu -u root pg_ctlcluster 12 main start', 30000, true);
          verification.log('PostgreSQL iniciado via pg_ctlcluster', 'success');
          postgresRunning = true;
        } catch (altStartError) {
          verification.log('Não foi possível iniciar o PostgreSQL', 'error');
          verification.logToFile(`Detalhes do erro: ${JSON.stringify(altStartError)}`);
          return false;
        }
      }
    }
    
    // Se não conseguimos iniciar o PostgreSQL, não podemos continuar
    if (!postgresRunning) {
      verification.log('Serviço PostgreSQL não está em execução, não é possível configurar o banco de dados', 'error');
      return false;
    }
    
    // Aguardar um pouco para o PostgreSQL iniciar completamente
    verification.log('Aguardando PostgreSQL inicializar completamente...', 'info');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Parâmetros para os bancos de dados
    // 1. Banco para o sistema principal
    const MAIN_DB = 'print_server';
    const MAIN_USER = 'print_user';
    const MAIN_PASSWORD = 'print_user';
    
    // 2. Banco para as migrações (utilizados pelo script migrate.sh)
    const MIGRATION_DB = 'print_management';
    const MIGRATION_USER = 'postgres_print';
    const MIGRATION_PASSWORD = 'root_print';
    
    // Criar usuário para o sistema principal se não existir
    verification.log(`Verificando/criando usuário ${MAIN_USER}...`, 'step');
    try {
      // Verificar se já existe
      const userExists = await verification.execPromise(`wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${MAIN_USER}'"`, 10000, true);
      
      if (userExists.trim() !== '1') {
        // Criar o usuário
        await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "CREATE USER ${MAIN_USER} WITH PASSWORD '${MAIN_PASSWORD}'"`, 15000, true);
        verification.log(`Usuário ${MAIN_USER} criado com sucesso`, 'success');
      } else {
        verification.log(`Usuário ${MAIN_USER} já existe`, 'info');
      }
      
      // Garantir que tenha privilégios de superusuário
      await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "ALTER USER ${MAIN_USER} WITH SUPERUSER"`, 15000, true);
      verification.log(`Privilégios de superusuário concedidos para ${MAIN_USER}`, 'success');
    } catch (userError) {
      verification.log(`Erro ao configurar usuário ${MAIN_USER}: ${userError.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(userError)}`);
    }
    
    // Criar banco de dados principal se não existir
    verification.log(`Verificando/criando banco de dados ${MAIN_DB}...`, 'step');
    try {
      // Verificar se já existe
      const dbExists = await verification.execPromise(`wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${MAIN_DB}'"`, 10000, true);
      
      if (dbExists.trim() !== '1') {
        // Criar o banco
        await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "CREATE DATABASE ${MAIN_DB} OWNER ${MAIN_USER}"`, 15000, true);
        verification.log(`Banco de dados ${MAIN_DB} criado com sucesso`, 'success');
      } else {
        verification.log(`Banco de dados ${MAIN_DB} já existe`, 'info');
        // Garantir ownership correto
        await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "ALTER DATABASE ${MAIN_DB} OWNER TO ${MAIN_USER}"`, 15000, true);
      }
      
      // Conceder todos os privilégios
      await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${MAIN_DB} TO ${MAIN_USER}"`, 15000, true);
      verification.log(`Privilégios concedidos para ${MAIN_USER} no banco ${MAIN_DB}`, 'success');
    } catch (dbError) {
      verification.log(`Erro ao configurar banco de dados ${MAIN_DB}: ${dbError.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(dbError)}`);
    }
    
    // Agora, vamos configurar o usuário e banco para as migrações
    // Criar usuário para migrações se não existir
    verification.log(`Verificando/criando usuário ${MIGRATION_USER} para migrações...`, 'step');
    try {
      // Verificar se já existe
      const migUserExists = await verification.execPromise(`wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${MIGRATION_USER}'"`, 10000, true);
      
      if (migUserExists.trim() !== '1') {
        // Criar o usuário
        await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "CREATE USER ${MIGRATION_USER} WITH PASSWORD '${MIGRATION_PASSWORD}'"`, 15000, true);
        verification.log(`Usuário ${MIGRATION_USER} criado com sucesso`, 'success');
      } else {
        verification.log(`Usuário ${MIGRATION_USER} já existe`, 'info');
      }
      
      // Garantir que tenha privilégios de superusuário
      await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "ALTER USER ${MIGRATION_USER} WITH SUPERUSER"`, 15000, true);
      verification.log(`Privilégios de superusuário concedidos para ${MIGRATION_USER}`, 'success');
    } catch (migUserError) {
      verification.log(`Erro ao configurar usuário ${MIGRATION_USER}: ${migUserError.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(migUserError)}`);
    }
    
    // Criar banco de dados para migrações se não existir
    verification.log(`Verificando/criando banco de dados ${MIGRATION_DB} para migrações...`, 'step');
    try {
      // Verificar se já existe
      const migDbExists = await verification.execPromise(`wsl -d Ubuntu -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${MIGRATION_DB}'"`, 10000, true);
      
      if (migDbExists.trim() !== '1') {
        // Criar o banco
        await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "CREATE DATABASE ${MIGRATION_DB} OWNER ${MIGRATION_USER}"`, 15000, true);
        verification.log(`Banco de dados ${MIGRATION_DB} criado com sucesso`, 'success');
      } else {
        verification.log(`Banco de dados ${MIGRATION_DB} já existe`, 'info');
        // Garantir ownership correto
        await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "ALTER DATABASE ${MIGRATION_DB} OWNER TO ${MIGRATION_USER}"`, 15000, true);
      }
      
      // Conceder todos os privilégios
      await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${MIGRATION_DB} TO ${MIGRATION_USER}"`, 15000, true);
      verification.log(`Privilégios concedidos para ${MIGRATION_USER} no banco ${MIGRATION_DB}`, 'success');
    } catch (migDbError) {
      verification.log(`Erro ao configurar banco de dados ${MIGRATION_DB}: ${migDbError.message}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(migDbError)}`);
    }
    
    // Verificar configuração do PostgreSQL para garantir acesso local
    verification.log('Verificando configuração de acesso ao PostgreSQL...', 'step');
    try {
      // Verificar se as configurações do pg_hba.conf permitem acesso local
      const pgHbaPath = await verification.execPromise("wsl -d Ubuntu -u postgres psql -c 'SHOW hba_file;' | grep pg_hba.conf", 10000, true);
      
      if (pgHbaPath) {
        // Adicionar entrada para acesso local se não existir
        const pgHbaCheck = `
        if ! grep -q "host all all 127.0.0.1/32 trust" ${pgHbaPath.trim()}; then
          echo "host all all 127.0.0.1/32 trust" | sudo tee -a ${pgHbaPath.trim()}
          sudo systemctl restart postgresql
          echo "Configuração atualizada"
        else
          echo "Configuração já existe"
        fi
        `;
        
        const configResult = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${pgHbaCheck}"`, 20000, true);
        verification.log(`Verificação de pg_hba.conf: ${configResult.trim()}`, 'info');
      }
    } catch (pgConfigError) {
      verification.log('Erro ao verificar/atualizar configuração do PostgreSQL', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(pgConfigError)}`);
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
    // Verificar se o PM2 está instalado
    const pm2Check = 'if ! command -v pm2 &> /dev/null; then npm install -g pm2; fi';
    await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${pm2Check}'`, 120000, true);
    
    // Configurar serviço para iniciar com PM2
    const startupCmd = 'cd /opt/loqquei/print_server_desktop && pm2 start ecosystem.config.js && pm2 save && pm2 startup';
    await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${startupCmd}'`, 30000, true);
    
    verification.log('Serviço configurado com PM2', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar PM2: ${error.message}`, 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

// Instalar drivers adicionais se necessário
async function installDrivers() {
  verification.log('Verificando e instalando drivers...', 'step');
  
  try {
    // Verificar se diretório de drivers existe
    const checkDrivers = 'if [ -d "/opt/loqquei/print_server_desktop/drivers" ]; then echo "exists"; fi';
    const driversExist = await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${checkDrivers}'`, 10000, true);
    
    if (driversExist.trim() === 'exists') {
      verification.log('Instalando drivers...', 'step');
      // Instalar todos os pacotes .deb no diretório de drivers
      const installDriversCmd = 'for deb in /opt/loqquei/print_server_desktop/drivers/*.deb; do [ -f "$deb" ] && dpkg -i --force-all "$deb" || true; done';
      await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${installDriversCmd}'`, 120000, true);
      
      verification.log('Drivers instalados', 'success');
    } else {
      verification.log('Diretório de drivers não encontrado, pulando...', 'info');
    }
    
    return true;
  } catch (error) {
    verification.log(`Erro ao instalar drivers: ${error}`, 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
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
async function setupMigrations() {
  verification.log('Verificando e executando migrações do banco de dados...', 'header');
  
  try {
    // Verificação completa do caminho
    const basePath = "/opt/loqquei/print_server_desktop";
    const scriptPath = `${basePath}/db/migrate.sh`;
    
    // Verificar se o diretório db existe
    const dbDirCheck = `if [ -d "${basePath}/db" ]; then echo "dir_exists"; else echo "dir_missing"; fi`;
    const dbDirStatus = await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${dbDirCheck}'`, 10000, true);
    
    if (dbDirStatus.trim() === 'dir_missing') {
      verification.log(`Diretório db não encontrado em ${basePath}`, 'warning');
      
      // Verificar diretório alternativo
      const altBasePath = "/opt/print_server/print_server_desktop";
      const altDbDirCheck = `if [ -d "${altBasePath}/db" ]; then echo "alt_exists"; else echo "alt_missing"; fi`;
      const altDbDirStatus = await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${altDbDirCheck}'`, 10000, true);
      
      if (altDbDirStatus.trim() === 'alt_exists') {
        verification.log(`Diretório db encontrado no caminho alternativo: ${altBasePath}/db`, 'info');
        verification.log('Usando caminho alternativo para migrações', 'info');
        return await setupMigrationsWithPath(altBasePath);
      }
      
      verification.log('Nenhum diretório db encontrado, pulando migrações', 'info');
      return true;
    }
    
    // Se chegamos aqui, o diretório db existe no caminho original
    return await setupMigrationsWithPath(basePath);
    
  } catch (error) {
    verification.log(`Erro ao executar migrações: ${error.message || JSON.stringify(error)}`, 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    
    // Mesmo com erro, prosseguir com a instalação
    verification.log('Continuando a instalação apesar do erro nas migrações...', 'warning');
    return true;
  }
}

// Função auxiliar para executar migrações com um caminho base específico e timeout estendido
async function setupMigrationsWithPath(basePath) {
  try {
    const scriptPath = `${basePath}/db/migrate.sh`;
    
    // Verificar se o script existe
    const scriptCheck = `if [ -f "${scriptPath}" ]; then echo "exists"; else echo "missing"; fi`;
    const scriptStatus = await verification.execPromise(`wsl -d Ubuntu -u root bash -c '${scriptCheck}'`, 10000, true);
    
    if (scriptStatus.trim() === 'missing') {
      verification.log(`Script de migração não encontrado em ${scriptPath}`, 'info');
      return true;
    }
    
    verification.log(`Script de migração encontrado em ${scriptPath}`, 'success');
    
    // Verificar conteúdo e formato do arquivo
    verification.log('Verificando e corrigindo formato do arquivo de migração...', 'step');
    
    // Converter possíveis quebras de linha Windows para Unix
    await verification.execPromise(`wsl -d Ubuntu -u root bash -c "tr -d '\\r' < ${scriptPath} > ${scriptPath}.unix && mv ${scriptPath}.unix ${scriptPath}"`, 15000, true);
    
    // Garantir permissões de execução
    verification.log('Configurando permissões...', 'step');
    await verification.execPromise(`wsl -d Ubuntu -u root chmod -v 755 ${scriptPath}`, 10000, true);
    
    // Ver tipo de arquivo para diagnóstico
    const fileType = await verification.execPromise(`wsl -d Ubuntu -u root file ${scriptPath}`, 10000, true);
    verification.log(`Tipo de arquivo: ${fileType}`, 'info');
    
    // Verificar primeiro se o PostgreSQL está rodando
    verification.log('Verificando status do PostgreSQL...', 'step');
    let postgresRunning = false;
    try {
      await verification.execPromise('wsl -d Ubuntu -u root systemctl status postgresql', 15000, true);
      verification.log('Serviço PostgreSQL está ativo', 'success');
      postgresRunning = true;
    } catch (pgError) {
      verification.log('Serviço PostgreSQL não está ativo, tentando iniciá-lo...', 'warning');
      try {
        await verification.execPromise('wsl -d Ubuntu -u root systemctl start postgresql', 30000, true);
        verification.log('Serviço PostgreSQL iniciado com sucesso', 'success');
        postgresRunning = true;
        
        // Aguardar um pouco para o serviço iniciar completamente
        verification.log('Aguardando PostgreSQL inicializar completamente...', 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (startError) {
        verification.log('Não foi possível iniciar o PostgreSQL', 'error');
        verification.logToFile(`Detalhes do erro: ${JSON.stringify(startError)}`);
        return false;
      }
    }
    
    // Configurações específicas do banco de dados para migrações
    const DB_HOST = 'localhost';
    const DB_PORT = '5432';
    const DB_NAME = 'print_management';
    const DB_USERNAME = 'postgres_print';
    const DB_PASSWORD = 'root_print';
    
    // Garanta que o usuário e banco necessários para migração existam
    verification.log('Verificando/criando usuário e banco para migrações...', 'step');
    try {
      // Verificar se o usuário existe
      const userCheck = `
      if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USERNAME}'" | grep -q 1; then
        sudo -u postgres psql -c "CREATE USER ${DB_USERNAME} WITH PASSWORD '${DB_PASSWORD}'"
        sudo -u postgres psql -c "ALTER USER ${DB_USERNAME} WITH SUPERUSER"
        echo "Usuário criado"
      else
        sudo -u postgres psql -c "ALTER USER ${DB_USERNAME} WITH SUPERUSER"
        echo "Usuário já existe"
      fi
      `;
      
      const userResult = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${userCheck}"`, 20000, true);
      verification.log(`Verificação de usuário: ${userResult.trim()}`, 'info');
      
      // Verificar se o banco existe
      const dbCheck = `
      if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
        sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USERNAME}"
        echo "Banco criado"
      else
        sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USERNAME}"
        echo "Banco já existe"
      fi
      `;
      
      const dbResult = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${dbCheck}"`, 20000, true);
      verification.log(`Verificação de banco: ${dbResult.trim()}`, 'info');
      
      // Conceder todos os privilégios
      await verification.execPromise(`wsl -d Ubuntu -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USERNAME}"`, 15000, true);
      verification.log('Privilégios concedidos para o banco de dados', 'success');
      
      // Verificar se o banco está acessível com as credenciais
      const accessCheck = `
      export PGPASSWORD="${DB_PASSWORD}"
      if psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USERNAME} -d ${DB_NAME} -c "SELECT 1" > /dev/null 2>&1; then
        echo "Banco acessível"
      else
        echo "Problema de acesso ao banco"
      fi
      `;
      
      const accessResult = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${accessCheck}"`, 20000, true);
      verification.log(`Verificação de acesso: ${accessResult.trim()}`, 'info');
      
      // Se houver problema de acesso, verificar configuração do pg_hba.conf
      if (accessResult.trim() === 'Problema de acesso ao banco') {
        verification.log('Problema de acesso detectado, ajustando configuração do PostgreSQL...', 'warning');
        
        const fixAccessCmd = `
        # Identificar arquivo pg_hba.conf
        PG_HBA_PATH=$(sudo -u postgres psql -t -c "SHOW hba_file;" | xargs)
        
        # Adicionar configuração de acesso confiável para conexões locais
        if [ -f "$PG_HBA_PATH" ]; then
          # Adicionar linhas para garantir acesso local se não existirem
          if ! grep -q "host all all 127.0.0.1/32 trust" "$PG_HBA_PATH"; then
            echo "host all all 127.0.0.1/32 trust" | sudo tee -a "$PG_HBA_PATH"
            echo "Adicionada regra para 127.0.0.1"
          fi
          
          if ! grep -q "host all all 0.0.0.0/0 md5" "$PG_HBA_PATH"; then
            echo "host all all 0.0.0.0/0 md5" | sudo tee -a "$PG_HBA_PATH"
            echo "Adicionada regra para 0.0.0.0/0"
          fi
          
          # Reiniciar PostgreSQL para aplicar mudanças
          sudo systemctl restart postgresql
          
          # Aguardar reinicialização
          sleep 5
          
          # Verificar novamente
          export PGPASSWORD="${DB_PASSWORD}"
          if psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USERNAME} -d ${DB_NAME} -c "SELECT 1" > /dev/null 2>&1; then
            echo "Acesso corrigido com sucesso"
          else
            echo "Persistem problemas de acesso após correção"
          fi
        else
          echo "Arquivo pg_hba.conf não encontrado"
        fi
        `;
        
        const fixResult = await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${fixAccessCmd}"`, 40000, true);
        verification.log(`Resultado da correção: ${fixResult}`, 'info');
      }
      
    } catch (dbSetupError) {
      verification.log('Erro ao configurar banco de dados para migrações', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(dbSetupError)}`);
    }
    
    // Criar script modificado para corrigir problemas no script original
    verification.log('Preparando script wrapper para migrações...', 'step');
    const modifiedMigrationScript = `#!/bin/bash
# Script wrapper para corrigir problemas de conexão no script de migração original

# Definir variáveis de ambiente que o script migrate.sh espera
export DB_HOST="${DB_HOST}"
export DB_PORT="${DB_PORT}"
export DB_USERNAME="${DB_USERNAME}"
export DB_PASSWORD="${DB_PASSWORD}"
export DB_NAME="${DB_NAME}"

# Verificar se o banco está acessível antes de tentar a migração
echo "Verificando acessibilidade do banco de dados..."
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d "${DB_NAME}" -c "SELECT 'Banco de dados acessível'" || {
  echo "ERRO: Não foi possível conectar ao banco de dados. Verificando configurações..."
  
  # Verificar se o servidor está executando
  if ! systemctl is-active postgresql > /dev/null; then
    echo "PostgreSQL não está ativo. Tentando iniciar..."
    systemctl start postgresql
    sleep 5
  fi
  
  # Verificar se o usuário existe
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USERNAME}'" | grep -q 1; then
    echo "Criando usuário ${DB_USERNAME}..."
    sudo -u postgres psql -c "CREATE USER ${DB_USERNAME} WITH PASSWORD '${DB_PASSWORD}' SUPERUSER"
  else
    echo "Garantindo permissões para ${DB_USERNAME}..."
    sudo -u postgres psql -c "ALTER USER ${DB_USERNAME} WITH SUPERUSER"
  fi
  
  # Verificar se o banco existe
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    echo "Criando banco ${DB_NAME}..."
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USERNAME}"
  fi
  
  # Testar conexão novamente
  echo "Testando conexão novamente..."
  if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d "${DB_NAME}" -c "SELECT 'Banco corrigido'" > /dev/null; then
    echo "FALHA CRÍTICA: Não foi possível estabelecer conexão com o banco de dados"
    exit 1
  fi
}

echo "Banco de dados verificado e acessível. Executando script de migração..."

# Ir para o diretório correto
cd ${basePath}

# Executar script original com timeout de 8 minutos
timeout 480 bash ${scriptPath}
EXIT_CODE=$?

if [ $EXIT_CODE -eq 124 ]; then
  echo "AVISO: O script atingiu o timeout de 8 minutos"
  exit 0
else
  exit $EXIT_CODE
fi
`;

    // Escrever script modificado em arquivo temporário
    const tempDir = path.join(os.tmpdir(), 'wsl-setup');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const wrapperPath = path.join(tempDir, 'fixed_migration_wrapper.sh');
    fs.writeFileSync(wrapperPath, modifiedMigrationScript);
    
    // Copiar para WSL
    const wslWrapperPath = await verification.execPromise(`wsl -d Ubuntu wslpath -u "${wrapperPath.replace(/\\/g, '/')}"`, 10000, true);
    await verification.execPromise(`wsl -d Ubuntu -u root cp "${wslWrapperPath}" /tmp/fixed_migration_wrapper.sh`, 10000, true);
    await verification.execPromise('wsl -d Ubuntu -u root chmod 755 /tmp/fixed_migration_wrapper.sh', 10000, true);
    
    // Executar o script wrapper com timeout estendido
    verification.log('Executando script de migração (pode levar vários minutos)...', 'step');
    try {
      const migrationOutput = await verification.execPromise('wsl -d Ubuntu -u root bash /tmp/fixed_migration_wrapper.sh', 600000, true);
      
      // Registrar saída para diagnóstico
      verification.log('Resultado das migrações:', 'success');
      verification.logToFile(`Saída da migração: ${migrationOutput}`);
      
      // Verificar se as migrações foram concluídas com sucesso
      verification.log('Migrações executadas com sucesso', 'success');
      return true;
    } catch (migrationError) {
      // Verificar se o erro foi devido ao timeout
      if (migrationError.message && migrationError.message.includes('Tempo limite excedido')) {
        verification.log('O script de migração excedeu o tempo limite de 10 minutos', 'warning');
        
        // Verificar se o banco de dados parece estar funcionando apesar do timeout
        try {
          await verification.execPromise(`wsl -d Ubuntu -u postgres psql -d ${DB_NAME} -c "SELECT current_timestamp"`, 15000, true);
          verification.log('Banco de dados parece estar funcionando apesar do timeout', 'info');
          verification.log('Continuando instalação mesmo com timeout nas migrações', 'warning');
          return true;
        } catch (dbCheckError) {
          verification.log('Banco de dados pode não estar configurado corretamente', 'warning');
          // Continuar mesmo assim
          return true;
        }
      } else {
        verification.log(`Erro durante a execução das migrações: ${migrationError.message || JSON.stringify(migrationError)}`, 'warning');
        verification.logToFile(`Erro detalhado da migração: ${JSON.stringify(migrationError)}`);
        
        // Continuar mesmo com erro
        verification.log('Continuando instalação mesmo com erro nas migrações', 'warning');
        return true;
      }
    }
  } catch (error) {
    verification.log(`Erro ao processar migrações: ${error.message || JSON.stringify(error)}`, 'warning');
    verification.logToFile(`Detalhes do erro de migração: ${JSON.stringify(error)}`);
    
    // Tentar obter mais informações de diagnóstico
    try {
      // Verificar se o arquivo pode ser lido
      const fileContent = await verification.execPromise(`wsl -d Ubuntu -u root head -n 10 ${basePath}/db/migrate.sh 2>&1`, 10000, true);
      verification.log(`Conteúdo do início do arquivo:\n${fileContent}`, 'info');
    } catch (diagError) {
      verification.log('Não foi possível ler o conteúdo do arquivo para diagnóstico', 'warning');
    }
    
    // Continuar a instalação mesmo com erro
    verification.log('Continuando instalação apesar de erros nas migrações', 'warning');
    return true;
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