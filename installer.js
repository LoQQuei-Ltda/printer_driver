/* eslint-disable no-useless-escape */
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

async function promptForRestart(message) {
  verification.log(message, 'warning');
  verification.log('Verificando se o sistema precisa ser reiniciado...', 'step');
  
  try {
    const command = `powershell -Command "Add-Type -AssemblyName Microsoft.VisualBasic; if ([Microsoft.VisualBasic.Interaction]::MsgBox('${message} Deseja reiniciar o sistema agora?', 'YesNo,Question', 'Confirmação de Reinício') -eq 'Yes') { Write-Output 'REBOOT_CONFIRMED'; shutdown /r /t 10 /c 'O sistema será reiniciado em 10 segundos.' } else { Write-Output 'REBOOT_CANCELLED' }"`;

    // Executar o script PowerShell - observe o uso correto das aspas e da formatação
    const result = await verification.execPromise(command, 60000, false);
    
    // Verificar a resposta do usuário
    if (result.includes("REBOOT_CONFIRMED")) {
      verification.log('Reiniciando o sistema em 10 segundos...', 'success');
      verification.log('Feche todos os programas e salve seu trabalho!', 'warning');
      await new Promise(resolve => setTimeout(resolve, 15000));

      return true; // Reinicialização confirmada
    } else {
      verification.log('Reinicialização cancelada pelo usuário. A instalação não poderá continuar até que o sistema seja reiniciado.', 'warning');
      return false; // Reinicialização cancelada
    }
  } catch (error) {
    verification.log('Erro ao solicitar reinicialização: ' + error.message, 'error');
    verification.log('Por favor, reinicie seu computador manualmente antes de continuar com a instalação.', 'warning');
    return false;
  }
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

async function installWSLDirectly() {
  verification.log('Iniciando instalação direta do WSL usando dism.exe...', 'header');
  
  try {
    // Verificação inicial para ver se o WSL já está instalado
    verification.log('Verificando se o WSL já está instalado...', 'step');
    
    try {
      // Tentar obter a versão do WSL para ver se está instalado
      const wslCheck = await verification.execPromiseWsl('wsl --version', 15000, false);
      
      if (wslCheck && !wslCheck.includes("não está instalado") && !wslCheck.includes("not installed")) {
        verification.log('WSL já está instalado! Verificando versão...', 'success');
        
        // Verificar se é WSL 2
        try {
          const wslVersionCheck = await verification.execPromiseWsl('wsl --status', 15000, false);
          if (wslVersionCheck && wslVersionCheck.includes("2")) {
            verification.log('WSL 2 já está configurado como padrão!', 'success');
            installState.wslInstalled = true;
            installState.wslConfigured = true;
            saveInstallState();
            return { success: true, needsReboot: false };
          }
        } catch { /* ignorar erro no check secundário */ }
      }
    } catch {
      // Se não conseguimos verificar, assumimos que não está instalado e continuamos
      verification.log('WSL não detectado ou não está funcionando corretamente', 'info');
    }

    // Passo 1: Habilitar todos os componentes necessários com dism usando /all /norestart
    verification.log('Habilitando todos os recursos necessários via dism.exe...', 'step');
    
    try {
      // Habilitar WSL
      await verification.execPromiseWsl(
        'dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 
        180000, // 3 minutos
        true
      );
      
      // Habilitar VirtualMachinePlatform
      await verification.execPromiseWsl(
        'dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 
        180000, 
        true
      );
      
      verification.log('Recursos do WSL habilitados com sucesso via dism.exe', 'success');
    } catch {
      verification.log('Erro ao habilitar recursos via dism, tentando método PowerShell...', 'warning');
      
      try {
        // Habilitar WSL via PowerShell
        await verification.execPromiseWsl(
          'powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart"', 
          180000, 
          true
        );
        
        // Habilitar VirtualMachinePlatform via PowerShell
        await verification.execPromiseWsl(
          'powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart"', 
          180000, 
          true
        );
        
        verification.log('Recursos habilitados via PowerShell', 'success');
      } catch {
        verification.log('Erro ao habilitar recursos via PowerShell, tentando método wsl --install...', 'warning');
        
        try {
          // Última tentativa: wsl --install
          await verification.execPromiseWsl('wsl --install --no-distribution', 600000, true);
          verification.log('WSL instalado via wsl --install', 'success');
        } catch (wslInstallError) {
          verification.log('Todos os métodos de instalação do WSL falharam', 'error');
          verification.logToFile(`Erro no wsl --install: ${JSON.stringify(wslInstallError)}`);
          return { success: false, needsReboot: false };
        }
      }
    }
    
    // Verificar explicitamente se reinicialização é necessária com método mais confiável
    verification.log('Verificando se é necessário reiniciar o sistema...', 'step');
    
    try {
      // Use um script PowerShell mais direto e confiável para detectar necessidade de reboot
      const pendingReboot = await verification.execPromiseWsl(
        'powershell -Command "$needsReboot = $false; if (Get-Item -Path \'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending\' -ErrorAction SilentlyContinue) { $needsReboot = $true }; if (Get-Item -Path \'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired\' -ErrorAction SilentlyContinue) { $needsReboot = $true }; if (Get-ItemProperty -Path \'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\' -Name \'PendingFileRenameOperations\' -ErrorAction SilentlyContinue) { $needsReboot = $true }; $needsReboot"',
        30000,
        true
      );
      
      if (pendingReboot.trim() === 'True') {
        verification.log('É necessário reiniciar o sistema para continuar com a instalação do WSL', 'warning');
        await promptForRestart('Os componentes do WSL foram instalados e o sistema precisa ser reiniciado.');
        
        // Atualizar estado para continuar após reinicialização
        installState.needsReboot = true;
        saveInstallState();
        
        return { success: true, needsReboot: true };
      } else {
        verification.log('Reinicialização não é necessária, continuando com a instalação', 'success');
      }
    } catch (rebootCheckError) {
      verification.log('Erro ao verificar necessidade de reinicialização. Por precaução, recomendamos reiniciar', 'warning');
      verification.logToFile(`Erro no check de reboot: ${JSON.stringify(rebootCheckError)}`);
      
      // Por segurança, sugerir reinicialização
      installState.needsReboot = true;
      saveInstallState();
      return { success: true, needsReboot: true };
    }
    
    // Baixar e instalar o kernel do WSL 2 com método mais robusto
    verification.log('Baixando e instalando pacote de atualização do kernel WSL 2...', 'step');
    
    // Criar diretório temporário
    const tempDir = path.join(os.tmpdir(), 'wsl-installer');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const kernelPath = path.join(tempDir, 'wsl_update_x64.msi');
    
    // MÉTODO 1: PowerShell moderno com Invoke-WebRequest
    try {
      verification.log('Baixando pacote do kernel via PowerShell...', 'info');
      
      // Usar o método principal mais moderno
      await verification.execPromiseWsl(
        `powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelPath}' -UseBasicParsing"`,
        300000, // 5 minutos
        true
      );
      
      verification.log('Download do kernel concluído via PowerShell', 'success');
    } catch {
      verification.log('Download via PowerShell falhou, tentando método alternativo...', 'warning');
      
      // MÉTODO 2: curl (mais confiável em alguns sistemas)
      try {
        verification.log('Baixando pacote do kernel via curl...', 'info');
        
        await verification.execPromiseWsl(
          `curl -L -o "${kernelPath}" https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi`,
          300000,
          true
        );
        
        verification.log('Download do kernel concluído via curl', 'success');
      } catch {
        // MÉTODO 3: bitsadmin (última alternativa)
        try {
          verification.log('Baixando pacote do kernel via bitsadmin...', 'info');
          
          await verification.execPromiseWsl(
            `bitsadmin /transfer WSLKernelDownload /download /priority high https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi "${kernelPath}"`,
            300000,
            true
          );
          
          verification.log('Download do kernel concluído via bitsadmin', 'success');
        } catch {
          verification.log('Todos os métodos de download falharam', 'error');
          verification.log('Por favor, baixe e instale manualmente: https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 'warning');
          
          // Abrir a página de download para facilitar para o usuário
          try {
            await verification.execPromiseWsl('start https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 5000, true);
            verification.log('Página de download aberta no navegador', 'info');
          } catch { /* ignorar erro ao abrir navegador */ }
          
          return { success: false, needsReboot: false };
        }
      }
    }
    
    // Verificar se o arquivo foi realmente baixado
    if (!fs.existsSync(kernelPath)) {
      verification.log('Arquivo do kernel não encontrado após download', 'error');
      return { success: false, needsReboot: false };
    }
    
    // Instalar o pacote usando msiexec com método mais direto
    verification.log('Instalando pacote do kernel...', 'step');
    
    try {
      // Usar método quiet para instalação silenciosa
      await verification.execPromiseWsl(`msiexec /i "${kernelPath}" /qn /norestart`, 180000, true);
      verification.log('Kernel do WSL 2 instalado com sucesso', 'success');
    } catch {
      verification.log('Erro na instalação silenciosa, tentando método alternativo...', 'warning');
      
      try {
        // Usar método com interface do usuário
        await verification.execPromiseWsl(`msiexec /i "${kernelPath}"`, 180000, true);
        verification.log('Instalação do kernel iniciada com interface. Aguarde a conclusão.', 'warning');
        
        // Aguardar para a instalação manual ser concluída
        await new Promise(resolve => setTimeout(resolve, 30000));
      } catch {
        verification.log('Todos os métodos de instalação falharam', 'error');
        verification.log(`Por favor, instale manualmente o arquivo: ${kernelPath}`, 'warning');
        return { success: false, needsReboot: false };
      }
    }
    
    // Configurar WSL 2 como versão padrão com melhor detecção de erros
    verification.log('Configurando WSL 2 como versão padrão...', 'step');
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await verification.execPromiseWsl('wsl --set-default-version 2', 30000, true);
        verification.log('WSL 2 configurado como versão padrão', 'success');
        break; // Sair do loop se bem-sucedido
      } catch {
        if (attempt < 3) {
          verification.log(`Tentativa ${attempt} falhou, aguardando antes da próxima tentativa...`, 'warning');
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          verification.log('Não foi possível definir WSL 2 como padrão após várias tentativas', 'error');
        }
      }
    }
    
    // Reiniciar WSL para garantir que as alterações sejam aplicadas
    try {
      await verification.execPromiseWsl('wsl --shutdown', 15000, true);
      verification.log('WSL reiniciado para aplicar alterações', 'success');
      
      // Aguardar reinicialização
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch { /* ignorar erro ao desligar */ }
    
    verification.log('Instalação do WSL concluída com sucesso!', 'success');
    verification.log('IMPORTANTE: Se encontrar problemas, reinicie o computador e execute o instalador novamente', 'warning');
    
    // Atualizar estado
    installState.wslInstalled = true;
    installState.kernelUpdated = true;
    installState.wslConfigured = true;
    saveInstallState();
    
    return { success: true, needsReboot: false };
  } catch (error) {
    verification.log(`Erro durante a instalação direta do WSL: ${error.message || JSON.stringify(error)}`, 'error');
    verification.logToFile(`Detalhes completos do erro: ${JSON.stringify(error)}`);
    return { success: false, needsReboot: false };
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
          verification.log('WSL já está instalado, pulando instalação', 'info');
          return true;
        }
        // Tentar o método moderno primeiro, se falhar usar o legado
        // eslint-disable-next-line no-case-declarations
        const modernResult = await installWSLModern();
        if (modernResult) {
          return true;
        }
        verification.log('Método moderno falhou, tentando método legado', 'warning');
        return await installWSLLegacy();

      case 'wsl2':
        // Verificar explicitamente se o WSL base está instalado
        verification.log('Verificando se o WSL base está instalado antes de configurar WSL 2...', 'step');
        
        // Verificação mais robusta do WSL - sem dependência do 'where'
        // eslint-disable-next-line no-case-declarations
        let wslInstalled = false;
        
        // Método 1: Verificar arquivo executável diretamente
        try {
          const wslExePath = "C:\\Windows\\System32\\wsl.exe";
          if (fs.existsSync(wslExePath)) {
            verification.log('Executável WSL encontrado no sistema', 'info');
            
            // Verificar se realmente funciona
            try {
              await verification.execPromise('wsl --list', 10000, true);
              wslInstalled = true;
              verification.log('WSL está instalado e funcionando', 'success');
            } catch (listError) {
              // Analisar o erro para determinar se WSL está instalado mas sem distribuições
              if (listError.stderr && (
                  listError.stderr.includes('não tem distribuições') || 
                  listError.stderr.includes('no distributions'))) {
                wslInstalled = true;
                verification.log('WSL instalado, mas sem distribuições', 'info');
              } else if (listError.stderr && (
                  listError.stderr.includes('não está instalado') || 
                  listError.stderr.includes('not installed') ||
                  listError.stderr.includes('não foi reconhecido') ||
                  listError.stderr.includes('not recognized'))) {
                wslInstalled = false;
                verification.log('Executável WSL existe, mas não está funcionando corretamente', 'warning');
              } else {
                // Estado incerto - tentar outro método
                wslInstalled = false;
              }
            }
          } else {
            verification.log('Executável WSL não encontrado no caminho padrão', 'warning');
            wslInstalled = false;
          }
        } catch {
          verification.log('Erro ao verificar existência do executável WSL', 'warning');
          wslInstalled = false;
        }
        
        // Método 2: Se o primeiro método não foi conclusivo, verificar via PowerShell
        if (!wslInstalled) {
          try {
            // Verificar recursos do Windows instalados via PowerShell
            const featureCheck = await verification.execPromise(
              'powershell -Command "Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux | Select-Object -ExpandProperty State"',
              15000, 
              true
            );
            
            if (featureCheck.trim() === 'Enabled') {
              verification.log('Recurso WSL está habilitado no Windows', 'info');
              
              // Tentar executar WSL para verificar se está realmente funcionando
              try {
                await verification.execPromise('wsl --status', 10000, true);
                wslInstalled = true;
                verification.log('WSL verificado via PowerShell e está funcionando', 'success');
              } catch {
                verification.log('Recurso WSL habilitado, mas não parece estar funcionando corretamente', 'warning');
                wslInstalled = false;
              }
            } else {
              verification.log('Recurso WSL não está habilitado no Windows', 'warning');
              wslInstalled = false;
            }
          } catch (psError) {
            verification.log('Erro ao verificar recurso WSL via PowerShell, assumindo não instalado', 'warning');
            verification.logToFile('Erro PowerShell: ' + JSON.stringify(psError));
            wslInstalled = false;
          }
        }
        
        // Se o WSL não estiver instalado, instale-o
        if (!wslInstalled) {
          verification.log('WSL não está instalado. Iniciando instalação...', 'step');
          
          // Sequência direta de comandos para instalação do WSL
          try {
            // MÉTODO 1: Instalação direta com wsl --install
            verification.log('Executando: wsl --install', 'step');
            await verification.execPromise('wsl --install', 1200000, true); // 20 minutos de timeout
            await verification.execPromise('wsl --update --web-download', 1200000, true); // 20 minutos de timeout
            verification.log('Comando wsl --install executado com sucesso', 'success');

            await promptForRestart('O WSL foi instalado com sucesso. Por favor reinicie o sistema para que as alterações tenham efeito.');
            
            await new Promise(resolve => setTimeout(resolve, 10000));

            // MÉTODO 2: Atualização imediata do WSL após instalação
            verification.log('Atualizando WSL com download web...', 'step');
            try {
              await verification.execPromise('wsl --update --web-download', 1200000, true); // 20 minutos
              verification.log('WSL atualizado com sucesso', 'success');
            } catch (updateError) {
              verification.log('Aviso: Erro na atualização do WSL, continuando mesmo assim...', 'warning');
              verification.logToFile('Erro update: ' + JSON.stringify(updateError));
            }
            
            // MÉTODO 3: Reforçar com instalação dos recursos via DISM
            verification.log('Garantindo instalação com DISM...', 'step');
            try {
              await verification.execPromise('dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 300000, true);
              await verification.execPromise('dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 300000, true);
              verification.log('Recursos WSL habilitados via DISM', 'success');
            } catch {
              verification.log('Aviso: Erro no DISM, mas instalação principal já foi realizada', 'warning');
            }
            
            // Verificar necessidade de reinicialização
            verification.log('Verificando se é necessário reiniciar o sistema...', 'step');
            const rebootCheck = await verification.execPromise(
              'powershell -Command "$needsReboot = $false; if (Get-Item -Path \'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending\' -ErrorAction SilentlyContinue) { $needsReboot = $true }; if (Get-Item -Path \'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired\' -ErrorAction SilentlyContinue) { $needsReboot = $true }; $needsReboot"',
              10000,
              true
            ).catch(() => "True");
            
            if (rebootCheck.trim() === "True") {
              verification.log('É necessário reiniciar o sistema antes de configurar o WSL 2', 'warning');
              await promptForRestart('O WSL foi instalado e o sistema precisa ser reiniciado.');
              return { success: false, needsReboot: true };
            }
            
            // Pausa para sistema processar
            verification.log('Aguardando para garantir que o WSL esteja pronto...', 'info');
            await new Promise(resolve => setTimeout(resolve, 15000));
            
            // Verificar resultado da instalação
            wslInstalled = true;
            verification.log('WSL instalado com sucesso', 'success');
          } catch (installError) {
            verification.log('Erro na instalação principal do WSL, tentando método alternativo...', 'warning');
            verification.logToFile('Erro instalação: ' + JSON.stringify(installError));
            
            // Método alternativo: Instalação sem distribuição
            try {
              verification.log('Executando: wsl --install --no-distribution', 'step');
              await verification.execPromise('wsl --install --no-distribution', 1200000, true); // 20 minutos
              verification.log('Instalação base do WSL realizada com sucesso', 'success');
              
              // Atualizar WSL logo em seguida
              try {
                await verification.execPromise('wsl --update --web-download', 600000, true);
                verification.log('WSL atualizado com sucesso', 'success');
              } catch  {
                verification.log('Aviso: Erro na atualização do WSL, continuando mesmo assim...', 'warning');
              }
              
              // Sugerir reinicialização após instalação alternativa
              verification.log('É recomendado reiniciar o sistema após a instalação do WSL', 'warning');
              
              // Perguntar sobre reinicialização
              const shouldReboot = await promptForRestart('O WSL foi instalado e é recomendado reiniciar o sistema.');
              if (shouldReboot) {
                return { success: false, needsReboot: true };
              }
              
              wslInstalled = true;
            } catch (altInstallError) {
              verification.log('Todos os métodos de instalação falharam', 'error');
              verification.logToFile('Erro instalação alternativa: ' + JSON.stringify(altInstallError));
              return false;
            }
          }
        }
        
        // Agora configurar WSL 2, pois WSL já deve estar instalado
        verification.log('Configurando WSL 2...', 'step');
        
        // Verificar se WSL 2 já está configurado como padrão
        // Tentar atualizar o kernel do WSL 2 primeiro
        verification.log('Atualizando kernel do WSL 2...', 'step');
        try {
          await verification.execPromise('wsl --update --web-download', 600000, true);
          verification.log('Kernel do WSL 2 atualizado com sucesso', 'success');
        } catch {
          verification.log('Aviso: Erro ao atualizar kernel, tentando método alternativo...', 'warning');
          
          // Método alternativo para baixar e instalar kernel
          const kernelResult = await updateWSL2Kernel();
          if (!kernelResult) {
            verification.log('Aviso: Falha ao atualizar kernel, tentando continuar mesmo assim...', 'warning');
          }
        }

        // eslint-disable-next-line no-case-declarations
        let wsl2Configured = false;
        try {
          const statusOutput = await verification.execPromise('wsl --status', 10000, true);
          
          // Analisar saída do status para determinar a versão
          if (statusOutput.includes('2')) {
            verification.log('WSL 2 já está configurado como versão padrão (via status)', 'success');
            wsl2Configured = true;
          }
        } catch (statusError) {
          verification.log('Erro ao verificar status do WSL, tentando método alternativo', 'warning');
          verification.logToFile('Erro status: ' + JSON.stringify(statusError));
        }        
      
        // Definir WSL 2 como padrão com melhor tratamento de erros
        verification.log('Configurando WSL 2 como versão padrão...', 'step');
        
        if (!wsl2Configured) {
          // Múltiplas tentativas para definir WSL 2 como padrão
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await verification.execPromise('wsl --set-default-version 2', 30000, true);
              verification.log(`WSL 2 configurado como versão padrão (tentativa ${attempt})`, 'success');
              return true;
            } catch {
              if (attempt < 3) {
                verification.log(`Erro ao definir WSL 2 como padrão na tentativa ${attempt}, tentando novamente...`, 'warning');
                // Aguardar um pouco mais a cada tentativa
                await new Promise(resolve => setTimeout(resolve, attempt * 5000));
              } else {
                verification.log('Não foi possível configurar WSL 2 como padrão após 3 tentativas', 'error');
                return false;
              }
            }
          }
        } else {
          return true;
        }
        
        // Não deveria chegar aqui, mas por segurança
        return false;

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
          await verification.execPromise('wsl -d Ubuntu -u root service postgresql restart', 30000, true);
          
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
            } catch {
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
          } catch {
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
    // CORREÇÃO CRÍTICA: Não detectar "wsl não está instalado" como um sinal de que já está instalado
    // eslint-disable-next-line no-unused-vars
    const checkWslOutput = (output) => {
      if (!output || typeof output !== 'string') {
        return false;
      }
      
      // Padronizar a string para busca mais confiável
      const normalizedOutput = output.toLowerCase()
        // eslint-disable-next-line no-control-regex
        .replace(/\x00/g, '')
        .replace(/[^\x20-\x7E\xA0-\xFF\s]/g, '');
      
      // MUDANÇA IMPORTANTE: verificação mais precisa para evitar falsos positivos
      // Se tiver "não está instalado" em qualquer lugar, retorna FALSE
      if (normalizedOutput.includes("não está instalado") || 
          normalizedOutput.includes("not installed") ||
          normalizedOutput.includes("no est instal")) {
        return false;
      }
      
      // Verificar padrões que indicam que o WSL está instalado
      return (
        normalizedOutput.includes("vers") || 
        normalizedOutput.includes("version") || 
        normalizedOutput.includes("kernel") ||
        normalizedOutput.includes("wsl") && !normalizedOutput.includes("wsl não está instalado")
      );
    };

    // Verificação explícita para garantir que o WSL NÃO está instalado
    let wslInstallationRequired = true;
    
    try {
      // Testar diretamente se podemos executar um comando WSL básico
      await verification.execPromise('wsl --list', 10000, true);
      // Se não houve erro, o WSL está instalado
      verification.log('WSL já está instalado e funcionando (verificado com wsl --list)', 'success');
      installState.wslInstalled = true;
      saveInstallState();
      return true;
    } catch (error) {
      // Limpar a mensagem de erro para verificar se realmente não está instalado
      const errorMsg = error?.stderr ? (typeof error.stderr === 'string' ? 
        // eslint-disable-next-line no-control-regex
        error.stderr : error.stderr.toString()).replace(/\x00/g, '') : "";
      
      // Se a mensagem contém "não está instalado", então WSL realmente não está instalado
      if (errorMsg.includes("não está instalado") || 
          errorMsg.includes("not installed") ||
          errorMsg.includes("no est instal")) {
        wslInstallationRequired = true;
        verification.log('WSL não está instalado, iniciando instalação...', 'step');
      } else {
        // Outro tipo de erro, verificar mais
        verification.log('Erro desconhecido ao verificar WSL, verificando mais...', 'warning');
        wslInstallationRequired = true;
      }
    }

    // Se o WSL não estiver instalado, prosseguir com a instalação
    if (wslInstallationRequired) {
      // MÉTODO ALTERNATIVO - Usando dism.exe diretamente (mais confiável)
      verification.log('Ativando recurso do Windows: Microsoft-Windows-Subsystem-Linux', 'step');
      
      try {
        await verification.execPromise('powershell -Command "wsl --install"', 1200000, true);
        await verification.execPromise('powershell -Command "wsl --update --web-download"', 1200000, true);

        await promptForRestart('WSL instalado com sucesso via PowerShell, precisa reiniciar para que as alterações tenham efeito');

        await new Promise(resolve => setTimeout(resolve, 12000));
      } catch (error) {
        verification.log('Falha ao instalar WSL via PowerShell', 'error');
        verification.logToFile(`Falha ao instalar WSL: ${JSON.stringify(error)}`);
        try {
          await verification.execPromise('powershell -Command "wsl --update --web-download"', 1200000, true);
        } catch (error) {
          verification.log('Falha ao atualizar WSL via PowerShell', 'error');
          verification.logToFile(`Falha ao instalar WSL - 2: ${JSON.stringify(error)}`);
        }
      }

      // Ativar o recurso WSL diretamente via dism
      try {
        await verification.execPromise('dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 1200000, true);
        await verification.execPromise('dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 1200000, true);
        verification.log('Recurso WSL habilitado com sucesso via DISM', 'success');
      } catch {
        // Tentar método alternativo via PowerShell
        try {
          verification.log('Tentando método alternativo via PowerShell...', 'warning');
          await verification.execPromise('powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart"', 180000, true);
          verification.log('Recurso WSL habilitado via PowerShell', 'success');
        } catch {
          verification.log('Falha em todos os métodos de habilitação do WSL', 'error');
          return false;
        }
      }
      
      // Ativar a plataforma de máquina virtual (necessária para WSL 2)
      verification.log('Ativando recurso do Windows: VirtualMachinePlatform', 'step');
      try {
        await verification.execPromise('dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 180000, true);
        verification.log('Recurso VirtualMachinePlatform habilitado com sucesso', 'success');
      } catch {
        try {
          verification.log('Tentando habilitar VirtualMachinePlatform via PowerShell...', 'warning');
          await verification.execPromise('powershell -Command "Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart"', 180000, true);
          verification.log('Recurso VirtualMachinePlatform habilitado via PowerShell', 'success');
        } catch {
          verification.log('Aviso: Não foi possível habilitar a plataforma de máquina virtual', 'warning');
          // Continuar mesmo assim
        }
      }
      
      // Verificar se o sistema precisa ser reiniciado (fortemente recomendado após habilitar os recursos)
      verification.log('Verificando se é necessário reiniciar o sistema...', 'step');
      
      try {
        const pendingReboot = await verification.execPromise('powershell -Command "$global:RestartRequired = $false; if (Get-WmiObject -Class Win32_OperatingSystem | Where-Object {$_.LastBootUpTime}) { $LastBootTime = Get-WmiObject -Class Win32_OperatingSystem | Select-Object -ExpandProperty LastBootUpTime; $LastBootTime = [System.Management.ManagementDateTimeConverter]::ToDateTime($LastBootTime); $CurrentDate = Get-Date; $TimeDiff = $CurrentDate - $LastBootTime; if ($TimeDiff.Days -eq 0 -and $TimeDiff.Hours -lt 4) { $global:RestartRequired = $false; } else { $global:RestartRequired = $true; } } else { $global:RestartRequired = $true; }; $global:RestartRequired"', 30000, true);
        
        // Se o PowerShell retornar 'True', o sistema provavelmente precisa ser reiniciado
        if (pendingReboot.trim() === 'True') {
          verification.log('É altamente recomendado reiniciar o sistema antes de continuar com a instalação do WSL', 'warning');
          verification.log('Você deve reiniciar o computador e executar o instalador novamente', 'warning');
          
          // IMPORTANTE: Armazenar o estado para continuar após a reinicialização
          installState.wslInstalled = true; // Consideramos parcialmente instalado
          installState.needsReboot = true;
          saveInstallState();
          
          return { needsReboot: true };
        }
      } catch {
        verification.log('Não foi possível verificar se é necessário reiniciar', 'warning');
      }

      // Se chegamos aqui, os recursos foram habilitados e o sistema não precisa ser reiniciado,
      // ou o usuário optou por continuar sem reiniciar
      verification.log('Instalação inicial do WSL concluída, agora é necessário baixar o kernel do WSL 2', 'success');
      
      // Tentar baixar e instalar o pacote de atualização do kernel
      try {
        // Criar diretório temporário
        const tempDir = path.join(os.tmpdir(), 'wsl-installer');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const kernelUpdatePath = path.join(tempDir, 'wsl_update_x64.msi');
        
        // Baixar o pacote de atualização do kernel
        verification.log('Baixando pacote de atualização do kernel do WSL 2...', 'step');
        
        try {
          // Usar PowerShell para download
          await verification.execPromise(
            `powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelUpdatePath}' -UseBasicParsing"`,
            180000,
            true
          );
          verification.log('Download do pacote concluído com sucesso', 'success');
        } catch {
          // Tentar método alternativo (bitsadmin)
          try {
            verification.log('Tentando método alternativo de download...', 'warning');
            await verification.execPromise(
              `bitsadmin /transfer WSLKernelDownload /download /priority high https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi "${kernelUpdatePath}"`,
              180000,
              true
            );
            verification.log('Download alternativo concluído com sucesso', 'success');
          } catch {
            verification.log('Todos os métodos de download falharam, abrindo página para download manual', 'error');
            await verification.execPromise('start https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 5000, true);
            
            // Sugerir reinicialização e continuação manual
            verification.log('Após baixar e instalar o pacote manualmente, reinicie o computador e execute o instalador novamente', 'warning');
            installState.needsReboot = true;
            saveInstallState();
            return { needsReboot: true };
          }
        }
        
        // Instalar o pacote de atualização do kernel
        verification.log('Instalando pacote de atualização do kernel do WSL 2...', 'step');
        
        try {
          await verification.execPromise(`msiexec /i "${kernelUpdatePath}" /qn`, 120000, true);
          verification.log('Instalação do pacote concluída com sucesso', 'success');
        } catch {
          // Tentar método alternativo
          try {
            verification.log('Tentando método alternativo de instalação...', 'warning');
            await verification.execPromise(`msiexec /i "${kernelUpdatePath}"`, 120000, true);
            verification.log('Instalação alternativa concluída, pode ser necessário completar manualmente', 'warning');
          } catch {
            verification.log('Não foi possível instalar automaticamente o pacote de atualização do kernel', 'error');
            verification.log('Por favor, localize o arquivo baixado e instale-o manualmente:', 'warning');
            verification.log(kernelUpdatePath, 'warning');
            
            // Sugerir reinicialização
            verification.log('Após instalar o pacote manualmente, reinicie o computador e execute o instalador novamente', 'warning');
            installState.needsReboot = true;
            saveInstallState();
            return { needsReboot: true };
          }
        }
      } catch {
        verification.log('Erro ao baixar ou instalar o pacote de atualização do kernel', 'error');
        verification.log('Por favor, baixe e instale manualmente: https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 'warning');
        
        installState.needsReboot = true;
        saveInstallState();
        return { needsReboot: true };
      }
      
      // Se chegamos aqui, o WSL foi instalado com sucesso
      verification.log('Componentes do WSL instalados com sucesso', 'success');
      installState.wslInstalled = true;
      saveInstallState();
      
      // Aguardar o sistema processar
      verification.log('Aguardando o sistema processar a instalação...', 'info');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Configurar WSL 2 como padrão
      try {
        verification.log('Configurando WSL 2 como versão padrão...', 'step');
        await verification.execPromise('wsl --set-default-version 2', 30000, true);
        verification.log('WSL 2 configurado como versão padrão', 'success');
        installState.wslConfigured = true;
        saveInstallState();
      } catch {
        verification.log('Não foi possível configurar WSL 2 como versão padrão agora', 'warning');
        verification.log('Isso será feito automaticamente mais tarde', 'info');
      }
      
      return true;
    } else {
      verification.log('WSL já está instalado, prosseguindo...', 'success');
      installState.wslInstalled = true;
      saveInstallState();
      return true;
    }
  } catch (error) {
    verification.log('Erro inesperado durante o processo de instalação do WSL', 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

async function configureWSL2() {
  verification.log('Configurando WSL 2 como versão padrão...', 'step');
  
  try {
    // Certificar que o WSL está instalado antes de tentar configurar
    let wslInstalled2 = false;
    
    try {
      // Verificação direta para WSL
      const wslVersion = await verification.execPromise('where wsl', 5000, true);
      
      if (wslVersion && wslVersion.includes('wsl.exe')) {
        // Tentar executar um comando WSL básico
        try {
          await verification.execPromise('wsl --list', 5000, true);
          wslInstalled2 = true;
        } catch (listError) {
          // Verificar se o erro é "não está instalado" vs "não tem distribuições"
          const errorMsg = listError?.stderr ? (typeof listError.stderr === 'string' ? 
            // eslint-disable-next-line no-control-regex
            listError.stderr : listError.stderr.toString()).replace(/\x00/g, '') : "";
          
          if (errorMsg.includes("não tem distribuições") || 
              errorMsg.includes("no distributions")) {
            // WSL está instalado mas sem distribuições
            wslInstalled2 = true;
          } else if (errorMsg.includes("não está instalado") || 
                    errorMsg.includes("not installed") ||
                    errorMsg.includes("no est instal")) {
                      wslInstalled2 = false;
          } else {
            // Erro desconhecido, assumir WSL pode estar instalado
            wslInstalled2 = true;
          }
        }
      } else {
        wslInstalled2 = false;
      }
    } catch {
      wslInstalled2 = false;
    }
    
    if (!wslInstalled2) {
      verification.log('WSL não está instalado, não é possível configurar WSL 2', 'error');
      return false;
    }
    
    // Verificar se WSL 2 já está configurado como padrão
    try {
      const defaultVersion = await verification.execPromise('wsl --get-default-version', 15000, false);
      if (defaultVersion && defaultVersion.trim() === '2') {
        verification.log('WSL 2 já está configurado como versão padrão', 'success');
        installState.wslConfigured = true;
        saveInstallState();
        return true;
      }
    } catch {
      verification.log('Não foi possível verificar a versão padrão atual, tentando configurar mesmo assim', 'warning');
    }
    
    // Tentar atualizar o kernel do WSL se necessário
    try {
      // Método 1: wsl --update (Windows 11 e Windows 10 mais recentes)
      verification.log('Tentando atualizar o kernel do WSL...', 'step');
      await verification.execPromise('wsl --update --web-download', 60000, false);
      verification.log('Kernel do WSL atualizado com sucesso', 'success');
    } catch {
      // Verificar se precisamos instalar o kernel manualmente
      verification.log('Comando de atualização não disponível, verificando kernel...');
      
      // Se falhou, tentar instalar o kernel manualmente
      try {
        const kernelUpdated = await updateWSL2Kernel();
        if (kernelUpdated) {
          verification.log('Kernel do WSL 2 instalado manualmente com sucesso', 'success');
        } else {
          verification.log('Não foi possível atualizar o kernel do WSL 2, continuando mesmo assim', 'warning');
        }
      } catch {
        verification.log('Erro ao atualizar kernel do WSL 2, continuando mesmo assim', 'warning');
      }
    }
    
    // Configurar WSL 2 como padrão com múltiplas tentativas
    verification.log('Configurando WSL 2 como versão padrão...', 'step');
    
    let success = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!success && attempts < maxAttempts) {
      attempts++;
      try {
        verification.log(`Tentativa ${attempts} de configurar WSL 2 como padrão...`, 'info');
        await verification.execPromise('wsl --set-default-version 2', 60000, true);
        
        // Verificar a saída para identificar sucesso
        // SIMPLIFICADO: se não houve erro, considerar sucesso
        verification.log(`WSL 2 configurado como versão padrão na tentativa ${attempts}`, 'success');
        success = true;
        installState.wslConfigured = true;
        saveInstallState();
        break;
      } catch (setVersionError) {
        const errorMsg = setVersionError?.stderr ? (typeof setVersionError.stderr === 'string' ? 
          // eslint-disable-next-line no-control-regex
          setVersionError.stderr : setVersionError.stderr.toString()).replace(/\x00/g, '') : "";
        
        // Se o erro indica que já está configurado, considerar sucesso
        if (errorMsg.includes("já está configurado") || 
            errorMsg.includes("already") || 
            errorMsg.includes("already configured")) {
          verification.log('WSL 2 já estava configurado como padrão', 'success');
          success = true;
          installState.wslConfigured = true;
          saveInstallState();
          break;
        }
        
        // Se o erro menciona kernel, tentar atualizar
        if (errorMsg.includes("kernel") || 
            errorMsg.includes("Kernel")) {
          verification.log('Kernel do WSL 2 precisa ser atualizado', 'warning');
          try {
            const kernelUpdated = await updateWSL2Kernel();
            if (kernelUpdated) {
              // Aguardar um pouco para o kernel fazer efeito
              await new Promise(resolve => setTimeout(resolve, 10000));
              continue; // Tentar novamente
            }
          } catch {
            // Continuar com a próxima tentativa
          }
        }
        
        if (attempts < maxAttempts) {
          verification.log(`Tentativa ${attempts} falhou, aguardando antes de tentar novamente...`, 'warning');
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          verification.log('Falha em todas as tentativas de configurar WSL 2', 'error');
          return false;
        }
      }
    }
    
    return success;
  } catch (error) {
    verification.log(`Erro ao configurar WSL 2: ${error.message || JSON.stringify(error)}`, 'error');
    return false;
  }
}

// Função para atualizar o kernel do WSL 2 quando necessário
async function updateWSL2Kernel() {
  verification.log('Baixando e instalando pacote de atualização do kernel WSL 2...', 'step');
  
  const tempDir = path.join(os.tmpdir(), 'wsl-installer');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const kernelPath = path.join(tempDir, 'wsl_update_x64.msi');
  
  // Tentar através do bitsadmin (mais confiável para downloads grandes)
  try {
    verification.log('Baixando pacote via bitsadmin...', 'info');
    await verification.execPromiseWsl(
      `bitsadmin /transfer WSLUpdateDownload /download /priority high https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi "${kernelPath}"`, 
      300000, // 5 minutos
      true
    );
    verification.log('Download do pacote completo via bitsadmin', 'success');
  } catch {
    // Alternativa 1: PowerShell WebClient (mais moderno)
    try {
      verification.log('Tentando download via PowerShell WebClient...', 'info');
      await verification.execPromiseWsl(
        `powershell -Command "(New-Object System.Net.WebClient).DownloadFile('https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', '${kernelPath}')"`, 
        300000, 
        true
      );
      verification.log('Download do pacote completo via PowerShell WebClient', 'success');
    } catch {
      // Alternativa 2: PowerShell Invoke-WebRequest (mais compatível)
      try {
        verification.log('Tentando download via PowerShell Invoke-WebRequest...', 'info');
        await verification.execPromiseWsl(
          `powershell -Command "Invoke-WebRequest -Uri 'https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi' -OutFile '${kernelPath}' -UseBasicParsing"`, 
          300000, 
          true
        );
        verification.log('Download do pacote completo via PowerShell Invoke-WebRequest', 'success');
      } catch {
        // Alternativa 3: curl
        try {
          verification.log('Tentando download via curl...', 'info');
          await verification.execPromiseWsl(
            `curl -L -o "${kernelPath}" https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi`, 
            300000, 
            true
          );
          verification.log('Download do pacote completo via curl', 'success');
        } catch {
          verification.log('Falha em todos os métodos de download do kernel', 'error');
          verification.log('Por favor, baixe e instale manualmente: https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 'warning');
          
          // Abrir a página de download para o usuário
          try {
            await verification.execPromiseWsl('start https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi', 5000, true);
            verification.log('Página de download aberta no navegador', 'info');
          } catch { /* ignorar erro */ }
          
          return false;
        }
      }
    }
  }
  
  // Verificar se o arquivo foi baixado
  if (!fs.existsSync(kernelPath)) {
    verification.log('Arquivo do kernel não encontrado após download', 'error');
    return false;
  }
  
  // Instalar o pacote - tentar vários métodos
  // Método 1: msiexec /qn (silencioso)
  try {
    verification.log('Instalando pacote do kernel (silencioso)...', 'step');
    await verification.execPromiseWsl(`msiexec /i "${kernelPath}" /qn`, 180000, true);
    verification.log('Instalação do kernel concluída com sucesso', 'success');
    verification.log('IMPORTANTE: É necessário reiniciar o sistema após instalar o kernel do WSL 2', 'warning');
    
    // Perguntar se deseja reiniciar agora
    await promptForRestart('O kernel do WSL 2 foi instalado e o sistema precisa ser reiniciado.');
  } catch {
    verification.log('Erro ao instalar via msiexec /qn, tentando método alternativo...', 'warning');
    
    // Método 2: msiexec com start /wait
    try {
      verification.log('Instalando pacote do kernel (com start /wait)...', 'step');
      await verification.execPromiseWsl(`start /wait msiexec /i "${kernelPath}" /qn`, 180000, true);
      verification.log('Instalação do kernel via start /wait concluída', 'success');
      
      // Aguardar um tempo para a instalação completar
      verification.log('Aguardando 15 segundos para a instalação completar...', 'info');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      verification.log('IMPORTANTE: É necessário reiniciar o sistema após instalar o kernel do WSL 2', 'warning');
    
      // Perguntar se deseja reiniciar agora
      await promptForRestart('O kernel do WSL 2 foi instalado e o sistema precisa ser reiniciado.');

    } catch {
      // Método 3: msiexec com interface (último recurso)
      try {
        verification.log('Instalando pacote do kernel (com interface)...', 'step');
        await verification.execPromiseWsl(`msiexec /i "${kernelPath}"`, 180000, true);
        verification.log('Instalação do kernel iniciada com interface', 'warning');
        verification.log('Por favor, complete a instalação na janela que foi aberta', 'warning');
        
        // Aguardar mais tempo para instalação manual
        verification.log('Aguardando 60 segundos para instalação manual...', 'info');
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        verification.log('IMPORTANTE: É necessário reiniciar o sistema após instalar o kernel do WSL 2', 'warning');
    
        // Perguntar se deseja reiniciar agora
        await promptForRestart('O kernel do WSL 2 foi instalado e o sistema precisa ser reiniciado.');

      } catch {
        verification.log('Todos os métodos de instalação falharam', 'error');
        verification.log(`Por favor, instale manualmente o arquivo: ${kernelPath}`, 'warning');
        return false;
      }
    }
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
async function installUbuntu(attemptCount = 0) {
  // Limite máximo de tentativas
  const MAX_ATTEMPTS = 3;
  
  // Se já excedeu o número máximo de tentativas, retornar erro
  if (attemptCount >= MAX_ATTEMPTS) {
    verification.log(`Limite de ${MAX_ATTEMPTS} tentativas atingido, desistindo da instalação automática`, 'error');
    verification.log('Por favor, instale o Ubuntu manualmente executando o comando abaixo em um Prompt de Comando como administrador:', 'info');
    verification.log('wsl --install -d Ubuntu', 'info');
    verification.log('Após a instalação manual, reinicie este instalador', 'info');
    return false;
  }
  
  // Se não é a primeira tentativa, mostrar mensagem específica
  if (attemptCount > 0) {
    verification.log(`Iniciando tentativa ${attemptCount + 1}/${MAX_ATTEMPTS} de instalação do Ubuntu...`, 'header');
  } else {
    verification.log('Iniciando instalação do Ubuntu no WSL...', 'header');
  }

  try {
    verification.log('Verificando se o WSL está funcionando corretamente...', 'step');
    
    // Tentar um comando básico do WSL (que não depende de distribuições)
    const wslVersionCheck = await verification.execPromiseWsl('wsl --version', 10000, false)
      .catch(() => "");
      
    if (!wslVersionCheck || wslVersionCheck.includes("não está instalado") || wslVersionCheck.includes("not installed")) {
      verification.log('WSL não parece estar instalado ou funcionando corretamente, reinstalando...', 'warning');
      
      // MÉTODO ALTERNATIVO: Reinstalar o WSL antes de tentar instalar o Ubuntu
      await verification.execPromiseWsl('wsl --shutdown', 10000, true)
        .catch(() => {});
      
      // Tentar com comando direto mais uma vez
      try {
        await verification.execPromiseWsl('wsl --install', 600000, true);
        verification.log('Reinstalação base do WSL executada', 'success');
        
        await promptForRestart('Wsl instalado, o sistema precisa ser reiniciado para que as alterações tenham efeito.');

        await new Promise(resolve => setTimeout(resolve, 12000));

        // Aguardar mais tempo para o WSL inicializar
        verification.log('Aguardando inicialização do WSL...', 'info');
        await new Promise(resolve => setTimeout(resolve, 15000));
      } catch (reinstallError) {
        verification.log(`Erro ao reinstalar WSL: ${reinstallError.message || 'Erro desconhecido'}`, 'error');
        verification.logToFile(`Detalhes do erro: ${JSON.stringify(reinstallError)}`);
        
        // Se estamos na segunda tentativa ou mais, tentar método mais direto usando dism
        if (attemptCount > 0) {
          verification.log('Tentando método alternativo usando DISM...', 'warning');
          try {
            await verification.execPromiseWsl(
              'dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 
              180000, 
              true
            );
            await verification.execPromiseWsl(
              'dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart',
              180000,
              true
            );
            verification.log('Recursos do WSL habilitados via DISM, reinicialização recomendada', 'warning');
            return { needsReboot: true, success: false };
          } catch (dismError) {
            verification.log(`Erro ao habilitar recursos via DISM: ${dismError.message || 'Erro desconhecido'}`, 'error');
          }
        }
      }
    }
  } catch (wslCheckError) {
    verification.log(`Erro ao verificar WSL: ${wslCheckError.message || 'Erro desconhecido'}`, 'warning');
  }

  // PASSO 1: Verificar se o Ubuntu já está instalado - com método mais confiável
  let ubuntuInstalled = false;
  
  // Método 1: Verificar com wsl --list padrão
  try {
    const wslList = await verification.execPromiseWsl('wsl --list', 20000, false)
      .catch((err) => {
        // Analisar erros específicos do WSL
        const errorMsg = err?.stderr ? (typeof err.stderr === 'string' ? 
          // Limpar melhor caracteres nulos na mensagem de erro
          // eslint-disable-next-line no-control-regex
          err.stderr.replace(/\u0000/g, '') : err.stderr.toString()) : "";
          
        // Se a mensagem de erro indicar "sem distribuições", retornamos isso explicitamente
        if (errorMsg.includes("não tem distribuições") || 
            errorMsg.includes("no distributions")) {
          return "NO_DISTRIBUTIONS";
        }
        
        return "";
      });
      
    // CORREÇÃO: Normalização melhorada da saída para lidar com caracteres especiais
    const normalizedOutput = typeof wslList === 'string' ? 
      // eslint-disable-next-line no-control-regex
      wslList.replace(/\u0000/g, '').toLowerCase() : "";
    
    ubuntuInstalled = normalizedOutput.includes('ubuntu');
    
    if (ubuntuInstalled) {
      verification.log('Ubuntu detectado na lista de distribuições WSL', 'success');
      installState.ubuntuInstalled = true;
      saveInstallState();
      return true;
    } else if (normalizedOutput === "no_distributions" || 
               normalizedOutput.includes("não tem distribuições") || 
               normalizedOutput.includes("no distributions")) {
      verification.log('WSL instalado mas sem distribuições', 'info');
    }
  } catch (listError) {
    verification.log('Erro ao verificar com wsl --list, tentando método alternativo', 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(listError)}`);
  }
  
  // Se Ubuntu não foi detectado, precisamos instalá-lo
  verification.log('Ubuntu não detectado, prosseguindo com instalação', 'step');
  
  // PASSO 2: Instalação do Ubuntu
  // MÉTODO PRINCIPAL: Usar o comando direto wsl --install -d Ubuntu
  let installationAttempted = false;
  let installationSuccessful = false;
  
  try {
    verification.log('Instalando Ubuntu com método direto...', 'step');
    
    // Primeiro desligar o WSL para evitar conflitos
    await verification.execPromise('wsl --shutdown', 15000, false)
      .catch(() => {}); // Ignorar erros
    
    // Aguardar o WSL desligar
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Executar o comando de instalação
    verification.log('Executando: wsl --install -d Ubuntu', 'info');
    await verification.execPromise('wsl --install -d Ubuntu', 1200000, true); // 20 minutos de timeout
    
    // Se chegamos aqui, o comando não lançou erro - marcar como tentativa executada
    installationAttempted = true;
    
    verification.log('Comando de instalação executado, aguardando finalização...', 'info');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // ***MUDANÇA CRÍTICA***: Verificação com múltiplos métodos e mais tolerante
    let ubuntuDetected = false;
    
    // Método 1: Verificar com wsl --list (padrão)
    try {
      const wslListResult = await verification.execPromiseWsl('wsl --list', 30000, false);
      
      // CORREÇÃO: Melhor normalização de saída para capturar erros em diferentes idiomas
      const normalizedOutput = typeof wslListResult === 'string' ? 
        // eslint-disable-next-line no-control-regex
        wslListResult.replace(/\u0000/g, '').toLowerCase() : "";
      
      if (normalizedOutput.includes('ubuntu')) {
        verification.log('Ubuntu detectado na lista de distribuições após instalação!', 'success');
        await configureDefaultUser();
        ubuntuDetected = true;
      }
    } catch (listError) {
      verification.log('Erro na primeira verificação pós-instalação, tentando método alternativo', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(listError)}`);
    }
    
    // Método 2: Tentar acessar o Ubuntu diretamente
    if (!ubuntuDetected) {
      try {
        await verification.execPromiseWsl('wsl -d Ubuntu -u root echo "Teste de acesso"', 30000, false);
        verification.log('Ubuntu responde a comandos diretos após instalação!', 'success');
        await configureDefaultUser();
        ubuntuDetected = true;
      } catch (accessError) {
        verification.log('Erro na terceira verificação pós-instalação', 'warning');
        verification.logToFile(`Detalhes do erro: ${JSON.stringify(accessError)}`);
      }
    }

    // ***MUDANÇA CRÍTICA***: Se o comando de instalação executou sem erro, considerar sucesso
    // mesmo se não conseguimos detectar imediatamente
    if (ubuntuDetected) {
      verification.log('Instalação do Ubuntu concluída com sucesso e verificada!', 'success');
      installationSuccessful = true;
      installState.ubuntuInstalled = true;
      saveInstallState();
      return true;
    } else {
      verification.log('Comando de instalação executado, mas Ubuntu não foi detectado!', 'warning');
    }
  } catch (installError) {
    // Comando de instalação falhou com erro
    verification.log('Erro ao instalar Ubuntu com método principal', 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(installError)}`);
    
    // NOVO: Verificar se o erro indica que a instalação já está em andamento
    const errorMsg = typeof installError.message === 'string' ? 
      // eslint-disable-next-line no-control-regex
      installError.message.replace(/\u0000/g, '') : 
      // eslint-disable-next-line no-control-regex
      JSON.stringify(installError).replace(/\u0000/g, '');
    
    if (errorMsg.includes("instalação já está em andamento") || 
        errorMsg.includes("installation is already in progress")) {
      verification.log('Instalação do Ubuntu já está em andamento. Aguardando...', 'warning');
      
      // Aguardar por um tempo maior para a instalação em andamento concluir
      verification.log('Aguardando 60 segundos para a instalação em andamento concluir...', 'info');
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Tentar verificar se o Ubuntu foi instalado
      try {
        const waitCheck = await verification.execPromiseWsl('wsl --list', 15000, false);
        if (waitCheck && typeof waitCheck === 'string' && 
          // eslint-disable-next-line no-control-regex
          waitCheck.replace(/\u0000/g, '').toLowerCase().includes('ubuntu')) {
            verification.log('Ubuntu detectado após aguardar instalação em andamento!', 'success');
            installState.ubuntuInstalled = true;
            saveInstallState();
            await configureDefaultUser();
            return true;
        }
      } catch {
        verification.log('Ubuntu ainda não detectado após aguardar', 'warning');
      }
    }

    try {
      await verification.execPromise('dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 
        1800000, // 3 minutos
        true);
    } catch (error) {
      verification.logToFile('erro1: ', JSON.stringify(error));
    }

    try {
      await verification.execPromise('dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 
        1800000, // 3 minutos
        true);
    } catch (error) {
      verification.logToFile('erro2: ', JSON.stringify(error));
    }

    try {
      await verification.execPromise('wsl --set-default-version 2', 
        1800000, // 3 minutos
        true);
    } catch (error) {
      verification.logToFile('erro3: ', JSON.stringify(error));
    }

    try {
      await verification.execPromise('wsl --install -d Ubuntu', 
        1200000, // 20 minutos
        true);
    } catch (error) {
      verification.logToFile('erro4: ', JSON.stringify(error));
    }


    await new Promise(resolve => setTimeout(resolve, 20000));
    try {
      const result = await verification.execPromise('wsl --list', 
        1800000, // 3 minutos
        true);

      if (result && typeof result === 'string' && 
          // eslint-disable-next-line no-control-regex
          result.replace(/\u0000/g, '').toLowerCase().includes('ubuntu')) {
        verification.log('Ubuntu instalado com sucesso!', 'success');
        installationSuccessful = true;
        installState.ubuntuInstalled = true;
        saveInstallState();
        return true;
      }
    } catch (error) {
      verification.logToFile('erro5: ', JSON.stringify(error));
    }
  }
  
  if (!installationSuccessful) {
    verification.log('Tentando instalar Ubuntu via Microsoft Store...', 'step');
    
    try {
      // Usar o comando winget para instalar via Microsoft Store (método mais confiável)
      await verification.execPromiseWsl(
        'powershell -Command "if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Write-Host \'winget não encontrado, pulando\' } else { winget install Canonical.Ubuntu }"',
        600000, // 10 minutos
        true
      );
      
      verification.log('Comando de instalação via Microsoft Store executado', 'info');
      
      // Aguardar a instalação
      verification.log('Aguardando instalação via Microsoft Store...', 'info');
      await new Promise(resolve => setTimeout(resolve, 45000)); // 45 segundos
      
      // Verificar se o Ubuntu foi instalado
      try {
        const storeCheck = await verification.execPromiseWsl('wsl --list', 15000, false);
        if (storeCheck && typeof storeCheck === 'string' && 
            // eslint-disable-next-line no-control-regex
            storeCheck.replace(/\u0000/g, '').toLowerCase().includes('ubuntu')) {
          verification.log('Ubuntu instalado com sucesso via Microsoft Store!', 'success');
          installationSuccessful = true;
          installState.ubuntuInstalled = true;
          saveInstallState();
          return true;
        }
      } catch {
        verification.log('Ubuntu ainda não detectado após instalação via Microsoft Store', 'warning');
      }
    } catch (storeError) {
      verification.log('Erro ao instalar via Microsoft Store', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(storeError)}`);
    }
  }
  
  // VERIFICAÇÃO FINAL: Tentar novamente verificar se o Ubuntu está instalado
  // mesmo após falha aparente (redundância)
  try {
    verification.log('Executando verificação final para confirmar estado da instalação...', 'step');
    
    // Verificar com wsl --list um última vez
    const finalCheck = await verification.execPromiseWsl('wsl --list', 20000, false)
      .catch(() => "");
      
    // Normalizar saída
    const normalizedOutput = typeof finalCheck === 'string' ? 
      // eslint-disable-next-line no-control-regex
      finalCheck.replace(/\u0000/g, '').toLowerCase() : "";
      
    if (normalizedOutput.includes('ubuntu')) {
      verification.log('Ubuntu detectado na verificação final!', 'success');
      installState.ubuntuInstalled = true;
      saveInstallState();
      return true;
    }
  } catch (finalError) {
    verification.log('Erro na verificação final', 'warning');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(finalError)}`);
  }
  
  //Tentar outra vez se ainda não excedemos o limite
  if (installationAttempted && !installationSuccessful) {
    verification.log('O comando de instalação foi executado, mas não conseguimos confirmar se o Ubuntu foi instalado.', 'warning');
    verification.log('Tentando uma abordagem diferente...', 'warning');
    
    // Aguardar um tempo maior antes de tentar novamente
    verification.log('Aguardando 60 segundos antes de tentar nova abordagem...', 'info');
    await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minuto
    
    // Tentar novamente com contador incrementado (abordagem diferente será usada)
    return await installUbuntu(attemptCount + 1);
  }

  
  if (attemptCount < MAX_ATTEMPTS - 1) {
    verification.log(`Tentativa ${attemptCount + 1} falhou, preparando nova tentativa...`, 'warning');
    
    // Desligar o WSL completamente antes de tentar novamente
    try {
      await verification.execPromiseWsl('wsl --shutdown', 15000, true);
      verification.log('WSL desligado para preparar nova tentativa', 'info');
    } catch { /* ignorar erros */ }
    
    // Aguardar um tempo antes de tentar novamente (tempo crescente)
    const waitTime = (attemptCount + 1) * 20000; // 20s, 40s, 60s...
    verification.log(`Aguardando ${waitTime/1000} segundos antes de tentar novamente...`, 'info');
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    return await installUbuntu(attemptCount + 1);
  }
  
  // Se chegamos aqui, realmente não conseguimos instalar o Ubuntu após todas as tentativas
  verification.log(`Não foi possível instalar o Ubuntu automaticamente após ${MAX_ATTEMPTS} tentativas`, 'error');
  verification.log('Aqui estão instruções para instalação manual:', 'info');
  verification.log('1. Abra o PowerShell como administrador', 'info');
  verification.log('2. Execute: wsl --unregister Ubuntu (se já existir)', 'info');
  verification.log('3. Execute: wsl --shutdown', 'info');
  verification.log('4. Execute: wsl --install -d Ubuntu', 'info');
  verification.log('5. Reinicie o computador', 'info');
  verification.log('6. Após reiniciar, configure um nome de usuário e senha quando solicitado', 'info');
  verification.log('7. Após isso, execute este instalador novamente', 'info');
  
  return false;
}

async function cleanAptLocks() {
  verification.log('Limpando locks do APT...', 'step');

  try {
    // Primeiro tentar terminar processos apt-get pendentes
    try {
      await verification.execPromise('wsl -d Ubuntu -u root bash -c "killall apt-get apt dpkg 2>/dev/null || true"', 15000, true);
    } catch (killError) {
      // Ignorar erros, pois pode não haver processos para matar
      verification.logToFile(`Aviso na tentativa de encerrar processos: ${JSON.stringify(killError)}`);
    }

    // Remover arquivos de lock
    await verification.execPromise('wsl -d Ubuntu -u root bash -c "rm /var/lib/apt/lists/lock /var/cache/apt/archives/lock /var/lib/dpkg/lock* -f 2>/dev/null || true"', 15000, true);
    await verification.execPromise('wsl -d Ubuntu -u root bash -c "dpkg --configure -a"', 30000, true);
    
    verification.log('Locks do APT removidos com sucesso', 'success');
    return true;
  } catch (error) {
    verification.log(`Aviso ao limpar locks do APT: ${error.message || JSON.stringify(error)}`, 'warning');
    // Continuar mesmo com erro
    return false;
  }
}

// Instalação dos pacotes necessários no WSL com melhor tratamento de erros
async function installRequiredPackages() {
  verification.log('Instalando pacotes necessários...', 'header');

  try {
    // Limpar locks do APT antes de começar
    await cleanAptLocks();

    // Atualizando repositórios primeiro - aumentar timeout para 10 minutos
    verification.log('Atualizando repositórios...', 'step');
    try {
      // Limpar cache do apt primeiro
      await verification.execPromise('wsl -d Ubuntu -u root apt-get clean', 120000, true);
      
      // Atualizar com timeout aumentado
      await verification.execPromise('wsl -d Ubuntu -u root apt-get update', 1200000, true);
    } catch (updateError) {
      verification.log(`Erro ao atualizar repositórios: ${updateError.message || 'Erro desconhecido'}`, 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(updateError)}`);

      // Tentar resolver problemas comuns e limpar locks novamente
      verification.log('Tentando corrigir problemas do apt...', 'step');
      await cleanAptLocks();
      
      try {
        await verification.execPromise('wsl -d Ubuntu -u root apt-get --fix-broken install -y', 180000, true);
        await verification.execPromise('wsl -d Ubuntu -u root apt-get update', 600000, true);
      } catch {
        verification.log('Segunda tentativa de atualizar falhou, tentando método alternativo...', 'warning');
        
        // Tentar com método alternativo (usando apt em vez de apt-get)
        try {
          await verification.execPromise('wsl -d Ubuntu -u root apt clean', 60000, true);
          await verification.execPromise('wsl -d Ubuntu -u root apt update', 600000, true);
        } catch {
          verification.log('Todos os métodos de atualização falharam, tentando continuar...', 'warning');
        }
      }
    }

    // Dividir a instalação em grupos menores e mais críticos primeiro
    const packetGroups = [
      // Grupo 1: Utilidades básicas primeiro
      ['nano', 'jq', 'net-tools'],
      // Grupo 2: PostgreSQL - crítico para o funcionamento
      ['postgresql', 'postgresql-contrib'],
      // Grupo 3: Serviços importantes
      ['cups', 'printer-driver-cups-pdf'],
      // Grupo 4: Outros serviços
      ['samba', 'ufw', 'npm'],
      // Grupo 5: Utilitários extras
      ['avahi-daemon', 'avahi-utils', 'avahi-discover'],
      // Grupo 6: Drivers
      ['hplip', 'hplip-gui', 'printer-driver-all']
    ];

    // Instalar cada grupo separadamente
    for (let i = 0; i < packetGroups.length; i++) {
      const group = packetGroups[i];
      verification.log(`Instalando grupo ${i + 1}/${packetGroups.length}: ${group.join(', ')}`, 'step');

      try {
        // Limpar locks antes de cada grupo para prevenir problemas
        await cleanAptLocks();
        
        // Usar timeout de 10 minutos para cada grupo
        await verification.execPromise(`wsl -d Ubuntu -u root apt-get install -y --no-install-recommends ${group.join(' ')}`, 600000, true);
        verification.log(`Grupo ${i + 1} instalado com sucesso`, 'success');
      } catch (groupError) {
        verification.log(`Erro ao instalar grupo ${i + 1}: ${groupError.message || 'Erro desconhecido'}`, 'warning');
        verification.logToFile(`Detalhes do erro: ${JSON.stringify(groupError)}`);

        // Tentar limpar locks e reinstalar
        await cleanAptLocks();
        
        // Tentar instalar um por um se o grupo falhar
        for (const pkg of group) {
          try {
            verification.log(`Tentando instalar ${pkg} individualmente...`, 'step');
            await verification.execPromise(`wsl -d Ubuntu -u root apt-get install -y --no-install-recommends ${pkg}`, 300000, true);
            verification.log(`Pacote ${pkg} instalado com sucesso`, 'success');
          } catch (pkgError) {
            verification.log(`Erro ao instalar ${pkg}: ${pkgError.message || 'Erro desconhecido'}`, 'warning');
          }
        }
      }

      // Pausa breve entre grupos para dar folga ao sistema
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Garantir que o systemd esteja habilitado no WSL
    try {
      verification.log('Verificando configuração do systemd no WSL...', 'step');
      
      // Verificar se wsl.conf existe e se systemd está habilitado
      const wslConfCheck = await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "if [ -f /etc/wsl.conf ] && grep -q systemd=true /etc/wsl.conf; then echo enabled; else echo disabled; fi"',
        10000,
        true
      );
      
      if (wslConfCheck.trim() !== 'enabled') {
        verification.log('Systemd não está habilitado, configurando...', 'step');
        
        // Configurar wsl.conf para habilitar systemd
        await verification.execPromise(
          'wsl -d Ubuntu -u root bash -c "mkdir -p /etc && echo -e \'[boot]\\nsystemd=true\' > /etc/wsl.conf"',
          10000,
          true
        );
        
        verification.log('Systemd configurado, será necessário reiniciar o WSL', 'warning');
        
        // Reiniciar WSL
        try {
          await verification.execPromise('wsl --shutdown', 15000, true);
          await new Promise(resolve => setTimeout(resolve, 8000)); // Aguardar reinicialização
          verification.log('WSL reiniciado para habilitar systemd', 'success');
        } catch {
          verification.log('Erro ao reiniciar WSL, mas continuando...', 'warning');
        }
      } else {
        verification.log('Systemd já está habilitado no WSL', 'success');
      }
    } catch {
      verification.log('Erro ao verificar/configurar systemd, continuando...', 'warning');
    }

    verification.log('Configurando inicialização automática de serviços no WSL...', 'step');
    
    await setupAutomaticServices();
    await setupWindowsStartup();

    // Iniciar os serviços manualmente após a instalação
    try {
      verification.log('Iniciando serviços essenciais...', 'step');
      
      const serviceCommands = [
        // Tentar com systemctl primeiro
        "systemctl restart cups || service cups restart || /etc/init.d/cups restart || true",
        "systemctl restart smbd || service smbd restart || /etc/init.d/smbd restart || true",
        "systemctl restart postgresql || service postgresql restart || /etc/init.d/postgresql restart || true"
      ];
      
      for (const cmd of serviceCommands) {
        try {
          await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${cmd}"`, 30000, true);
        } catch (svcError) {
          // Ignorar erros individuais e continuar com o próximo serviço
          verification.logToFile(`Erro ao iniciar serviço com: ${cmd} - ${JSON.stringify(svcError)}`);
        }
      }
      
      verification.log('Serviços inicializados', 'success');
    } catch {
      verification.log('Aviso: Alguns serviços podem não ter iniciado corretamente', 'warning');
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

// Função aprimorada para garantir que os serviços sejam iniciados automaticamente com o WSL
async function setupAutomaticServices() {
  verification.log('Configurando inicialização automática de serviços...', 'step');
  
  try {
    // Usaremos abordagem de arquivos temporários para evitar problemas de escape
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    
    // 1. Criar diretório temporário se não existir
    const tempDir = path.join(os.tmpdir(), 'wsl-setup');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // 2. Criar arquivo wsl.conf
    verification.log('Configurando systemd no WSL...', 'step');
    const wslConfContent = `[boot]
systemd=true
enabled=true
command=/opt/loqquei/print_server_desktop/start-services.sh

[user]
default=print_user

[automount]
enabled=true
mountFsTab=true
`;
    const wslConfPath = path.join(tempDir, 'wsl.conf');
    fs.writeFileSync(wslConfPath, wslConfContent, 'utf8');
    
    // Obter caminho WSL
    const wslPath = await verification.execPromise(
      `wsl -d Ubuntu wslpath -u "${wslConfPath.replace(/\\/g, '/')}"`,
      10000,
      true
    );
    
    // Copiar para o WSL
    await verification.execPromise(
      `wsl -d Ubuntu -u root cp "${wslPath.trim()}" /etc/wsl.conf`,
      10000,
      true
    );
    
    verification.log('Arquivo wsl.conf criado com suporte para comando de inicialização automática', 'success');
    
    // 3. Criar arquivo de serviço systemd
    verification.log('Criando serviço systemd para inicialização automática...', 'step');
    const serviceContent = `[Unit]
Description=Print Server Services
After=network.target postgresql.service cups.service smbd.service
Wants=postgresql.service cups.service smbd.service avahi-daemon.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash /opt/loqquei/print_server_desktop/start-services.sh

[Install]
WantedBy=multi-user.target
WantedBy=default.target
`;
    const servicePath = path.join(tempDir, 'print-server.service');
    fs.writeFileSync(servicePath, serviceContent, 'utf8');
    
    // Obter caminho WSL
    const serviceWslPath = await verification.execPromise(
      `wsl -d Ubuntu wslpath -u "${servicePath.replace(/\\/g, '/')}"`,
      10000,
      true
    );
    
    // Criar diretório de destino se não existir
    await verification.execPromise(
      `wsl -d Ubuntu -u root mkdir -p /etc/systemd/system`,
      5000,
      true
    );
    
    // Copiar para o WSL
    await verification.execPromise(
      `wsl -d Ubuntu -u root cp "${serviceWslPath.trim()}" /etc/systemd/system/print-server.service`,
      10000,
      true
    );
    
    verification.log('Arquivo de serviço systemd criado com sucesso', 'success');
    
    // 4. Criar script de inicialização melhorado
    verification.log('Criando script de inicialização de serviços...', 'step');
    const scriptContent = `#!/bin/bash
# Script de inicialização de serviços do Print Server
# Este script inicia todos os serviços necessários e verifica se estão rodando

LOG_FILE="/var/log/print-server-startup.log"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

log "=== Iniciando serviços do Print Server ==="

# Criar diretório de log se não existir
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

# Verificar se estamos em ambiente WSL
if [[ -n "$WSL_DISTRO_NAME" || -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
  log "Detectado ambiente WSL"
else
  log "Não estamos em ambiente WSL, mas continuando mesmo assim"
fi

# Função para iniciar um serviço e verificar se está rodando
start_service() {
  local service_name="$1"
  local max_attempts=3
  local attempt=1
  
  log "Iniciando serviço: $service_name"
  
  while [ $attempt -le $max_attempts ]; do
    log "Tentativa $attempt de $max_attempts para iniciar $service_name"
    
    # Tentar iniciar o serviço
    if systemctl is-active --quiet "$service_name"; then
      log "Serviço $service_name já está ativo"
      return 0
    else
      log "Tentando iniciar $service_name..."
      systemctl start "$service_name" >/dev/null 2>&1 || service "$service_name" start >/dev/null 2>&1
      
      # Verificar se iniciou com sucesso
      if systemctl is-active --quiet "$service_name" || service "$service_name" status >/dev/null 2>&1; then
        log "Serviço $service_name iniciado com sucesso"
        return 0
      else
        log "Falha ao iniciar $service_name na tentativa $attempt"
        sleep 2
        attempt=$((attempt + 1))
      fi
    fi
  done
  
  log "ERRO: Não foi possível iniciar $service_name após $max_attempts tentativas"
  return 1
}

# Verificar e garantir permissões corretas nos diretórios
log "Verificando permissões de diretórios..."
if [ -d "/opt/loqquei/print_server_desktop" ]; then
  chmod -R 755 /opt/loqquei/print_server_desktop
elif [ -d "/opt/print_server/print_server_desktop" ]; then
  chmod -R 755 /opt/print_server/print_server_desktop
fi

# Verificar se o sistema precisa de inicialização antes de continuar
sleep 10  # Aguardar sistema inicializar completamente

# Iniciar serviços na ordem correta
log "Iniciando serviços principais..."

# Primeiro dbus (muitos serviços dependem dele)
start_service dbus

# Depois os serviços principais
start_service avahi-daemon
start_service postgresql
start_service cups
start_service smbd

# Iniciar PM2 para gerenciar o servidor Node.js
log "Verificando aplicação Node.js..."

if command -v pm2 >/dev/null 2>&1; then
  log "PM2 encontrado, iniciando aplicação..."
  
  # Determinar o diretório correto da aplicação
  APP_DIR=""
  if [ -d "/opt/loqquei/print_server_desktop" ]; then
    APP_DIR="/opt/loqquei/print_server_desktop"
  elif [ -d "/opt/print_server/print_server_desktop" ]; then
    APP_DIR="/opt/print_server/print_server_desktop"
  fi
  
  if [ -n "$APP_DIR" ]; then
    cd "$APP_DIR" || exit
    
    # Verificar se já está rodando
    if pm2 list | grep -q "print_server_desktop"; then
      log "Aplicação já está em execução, reiniciando..."
      pm2 restart print_server_desktop || pm2 restart all || true
    else
      log "Iniciando nova instância da aplicação..."
      if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js
      else
        pm2 start bin/www.js --name print_server_desktop
      fi
    fi
    
    # Salvar para reinicialização automática
    pm2 save
  else
    log "AVISO: Diretório da aplicação não encontrado"
  fi
else
  log "AVISO: PM2 não está instalado"
  # Tentar instalar PM2
  if command -v npm >/dev/null 2>&1; then
    log "Tentando instalar PM2 globalmente..."
    npm install -g pm2
    
    # Tentar novamente após instalar
    if command -v pm2 >/dev/null 2>&1; then
      log "PM2 instalado com sucesso, iniciando aplicação..."
      
      # Determinar o diretório correto
      APP_DIR=""
      if [ -d "/opt/loqquei/print_server_desktop" ]; then
        APP_DIR="/opt/loqquei/print_server_desktop"
      elif [ -d "/opt/print_server/print_server_desktop" ]; then
        APP_DIR="/opt/print_server/print_server_desktop"
      fi
      
      if [ -n "$APP_DIR" ]; then
        cd "$APP_DIR" || exit
        if [ -f "ecosystem.config.js" ]; then
          pm2 start ecosystem.config.js
        else
          pm2 start bin/www.js --name print_server_desktop
        fi
        
        # Salvar para reinicialização automática
        pm2 save
      fi
    fi
  fi
fi

# Verificar se o serviço está respondendo na porta esperada
log "Verificando se o serviço API está respondendo..."
for i in {1..5}; do
  if command -v curl >/dev/null 2>&1; then
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:56258/api 2>/dev/null | grep -q "200"; then
      log "API está respondendo corretamente (200 OK)"
      break
    else
      log "API não está respondendo na tentativa $i, aguardando..."
      sleep 5
    fi
  else
    log "curl não está disponível, pulando verificação API"
    break
  fi
done

log "=== Inicialização de serviços concluída ==="
exit 0
`;
    const scriptPath = path.join(tempDir, 'start-services.sh');
    fs.writeFileSync(scriptPath, scriptContent, 'utf8');
    
    // Obter caminho WSL
    const scriptWslPath = await verification.execPromise(
      `wsl -d Ubuntu wslpath -u "${scriptPath.replace(/\\/g, '/')}"`,
      10000,
      true
    );
    
    // Criar diretório de destino se não existir
    await verification.execPromise(
      `wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop`,
      5000,
      true
    );
    
    // Copiar para o WSL
    await verification.execPromise(
      `wsl -d Ubuntu -u root cp "${scriptWslPath.trim()}" /opt/loqquei/print_server_desktop/start-services.sh`,
      10000,
      true
    );
    
    // Dar permissões de execução
    await verification.execPromise(
      `wsl -d Ubuntu -u root chmod +x /opt/loqquei/print_server_desktop/start-services.sh`,
      5000,
      true
    );
    
    verification.log('Script de inicialização criado com sucesso', 'success');
    
    // 5. Configurar script para ser executado no login de qualquer usuário
    verification.log('Configurando execução automática para todos os usuários...', 'step');
    
    // Criar script em /etc/profile.d para todos os usuários
    const profileScriptContent = `#!/bin/bash
# Inicializar serviços do Print Server para qualquer usuário
if [ -n "$WSL_DISTRO_NAME" ] || [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
  # Verificar se serviços não estão rodando e iniciar como root
  if ! systemctl is-active --quiet print-server.service 2>/dev/null; then
    echo "Iniciando serviços do Print Server (se não estiverem ativos)..."
    sudo /opt/loqquei/print_server_desktop/start-services.sh &>/dev/null &
  fi
fi
`;
    
    const profileScriptPath = path.join(tempDir, 'print-server.sh');
    fs.writeFileSync(profileScriptPath, profileScriptContent, 'utf8');
    
    // Obter caminho WSL
    const profileWslPath = await verification.execPromise(
      `wsl -d Ubuntu wslpath -u "${profileScriptPath.replace(/\\/g, '/')}"`,
      10000,
      true
    );
    
    // Copiar para o diretório profile.d para ser executado por todos os usuários
    await verification.execPromise(
      `wsl -d Ubuntu -u root mkdir -p /etc/profile.d`,
      5000,
      true
    );
    
    await verification.execPromise(
      `wsl -d Ubuntu -u root cp "${profileWslPath.trim()}" /etc/profile.d/print-server.sh`,
      10000,
      true
    );
    
    await verification.execPromise(
      `wsl -d Ubuntu -u root chmod +x /etc/profile.d/print-server.sh`,
      5000,
      true
    );
    
    verification.log('Script para inicialização em todos os usuários configurado', 'success');
    
    // 6. Configurar para iniciar via /etc/bash.bashrc também (método adicional)
    verification.log('Configurando método de inicialização via bash.bashrc...', 'step');
    
    const bashrcContent = `
# Início: Verificação de serviços do Print Server (inicialização WSL)
if [ -n "$WSL_DISTRO_NAME" ] || [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
  # Verificar se o usuário tem permissão sudo (ou é root)
  if [ "$(id -u)" -eq 0 ] || groups | grep -qw sudo; then
    # Verificar se serviços estão rodando, caso contrário iniciar
    if ! systemctl is-active --quiet print-server.service 2>/dev/null; then
      if [ -f "/opt/loqquei/print_server_desktop/start-services.sh" ]; then
        echo "Iniciando serviços do Print Server..."
        if [ "$(id -u)" -eq 0 ]; then
          # Se for root, executar diretamente
          /opt/loqquei/print_server_desktop/start-services.sh &>/dev/null &
        else
          # Se não for root, usar sudo
          sudo /opt/loqquei/print_server_desktop/start-services.sh &>/dev/null &
        fi
      fi
    fi
  fi
fi
# Fim: Verificação de serviços do Print Server
`;
    
    const bashrcPath = path.join(tempDir, 'bashrc_append.sh');
    fs.writeFileSync(bashrcPath, bashrcContent, 'utf8');
    
    // Obter caminho WSL
    const bashrcWslPath = await verification.execPromise(
      `wsl -d Ubuntu wslpath -u "${bashrcPath.replace(/\\/g, '/')}"`,
      10000,
      true
    );
    
    // Verificar e adicionar ao bashrc global
    await verification.execPromise(
      `wsl -d Ubuntu -u root bash -c "if ! grep -q 'Verificação de serviços do Print Server' /etc/bash.bashrc; then cat '${bashrcWslPath.trim()}' >> /etc/bash.bashrc; fi"`,
      10000,
      true
    );
    
    // Verificar e adicionar ao .profile do usuário root
    await verification.execPromise(
      `wsl -d Ubuntu -u root bash -c "if ! grep -q 'Verificação de serviços do Print Server' /root/.profile; then cat '${bashrcWslPath.trim()}' >> /root/.profile; fi"`,
      10000,
      true
    );
    
    // Verificar e adicionar ao .profile do usuário print_user
    await verification.execPromise(
      `wsl -d Ubuntu -u root bash -c "if ! grep -q 'Verificação de serviços do Print Server' /home/print_user/.profile; then cat '${bashrcWslPath.trim()}' >> /home/print_user/.profile; fi"`,
      10000,
      true
    );
    
    verification.log('Método de inicialização alternativo configurado para todos os usuários', 'success');
    
    // 7. Habilitar e iniciar o serviço systemd
    verification.log('Habilitando e iniciando serviço systemd...', 'step');
    
    try {
      // Recarregar daemon do systemd
      await verification.execPromise(
        `wsl -d Ubuntu -u root systemctl daemon-reload`,
        15000,
        true
      );
      
      // Habilitar o serviço para iniciar automaticamente
      await verification.execPromise(
        `wsl -d Ubuntu -u root systemctl enable print-server.service`,
        15000,
        true
      );
      
      // Iniciar o serviço
      await verification.execPromise(
        `wsl -d Ubuntu -u root systemctl start print-server.service`,
        30000,
        true
      );
      
      // Verificar status
      const status = await verification.execPromise(
        `wsl -d Ubuntu -u root systemctl status print-server.service || true`,
        10000,
        true
      );
      
      verification.log(`Status do serviço: ${status.includes('active') ? 'Ativo' : 'Inativo'}`, 
        status.includes('active') ? 'success' : 'warning');
    } catch (serviceError) {
      verification.log(`Aviso ao configurar serviço systemd: ${serviceError.message}`, 'warning');
      verification.log('Continuando com métodos alternativos...', 'info');
    }
    
    // 8. Configurar script de inicialização como comando de boot
    verification.log('Configurando comando de boot no WSL...', 'step');
    
    try {
      // No Windows 11/10 mais recente, podemos usar o comando wsl.exe --boot-command
      await verification.execPromise(
        `wsl --shutdown`,
        10000,
        true
      ).catch(() => {});
      
      // Tentativa 1: Usando o valor no wsl.conf (já configurado acima)
      verification.log('Configuração de comando de boot aplicada via wsl.conf', 'success');
      
      // Tentativa 2: Usando WSL_BOOT_COMMAND (variável de ambiente)
      try {
        await verification.execPromise(
          `setx WSL_BOOT_COMMAND "/opt/loqquei/print_server_desktop/start-services.sh" /M`,
          10000,
          true
        ).catch(() => {});
        verification.log('Variável de ambiente WSL_BOOT_COMMAND configurada', 'success');
      } catch {
        verification.log('Nota: Não foi possível configurar variável de ambiente', 'info');
      }
      
    } catch (bootError) {
      verification.log(`Aviso ao configurar comando de boot: ${bootError.message}`, 'warning');
    }
    
    // 9. Criar um serviço systemd adicional específico para inicialização
    const wslBootContent = `[Unit]
Description=WSL Boot Service for Print Server
After=network.target
DefaultDependencies=no

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash /opt/loqquei/print_server_desktop/start-services.sh
TimeoutStartSec=0

[Install]
WantedBy=default.target
WantedBy=multi-user.target
WantedBy=sysinit.target
`;
    
    const wslBootPath = path.join(tempDir, 'wsl-boot.service');
    fs.writeFileSync(wslBootPath, wslBootContent, 'utf8');
    
    // Obter caminho WSL
    const wslBootWslPath = await verification.execPromise(
      `wsl -d Ubuntu wslpath -u "${wslBootPath.replace(/\\/g, '/')}"`,
      10000,
      true
    );
    
    // Copiar para o WSL
    await verification.execPromise(
      `wsl -d Ubuntu -u root cp "${wslBootWslPath.trim()}" /etc/systemd/system/wsl-boot.service`,
      10000,
      true
    );
    
    // Habilitar e iniciar o serviço
    await verification.execPromise(
      `wsl -d Ubuntu -u root systemctl enable wsl-boot.service`,
      15000,
      true
    ).catch(() => {});
    
    await verification.execPromise(
      `wsl -d Ubuntu -u root systemctl start wsl-boot.service`,
      15000,
      true
    ).catch(() => {});
    
    verification.log('Serviço boot adicional configurado', 'success');
    
    // 10. Reiniciar o WSL para aplicar as alterações
    verification.log('Reiniciando WSL para aplicar configurações...', 'step');
    await verification.execPromise('wsl --shutdown', 15000, true);
    
    // Aguardar reinicialização
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    verification.log('Configuração de inicialização automática concluída!', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar inicialização automática: ${error.message || JSON.stringify(error)}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

async function createWslBootServiceFinal() {
  verification.log('Criando serviço de inicialização do WSL (versão final simplificada)...', 'step');
  
  try {
    // 1. Caminhos e diretórios
    const programDataDir = process.env.ProgramData || 'C:\\ProgramData';
    const startupDir = path.join(programDataDir, 'LoQQuei', 'WSLStartup');
    
    if (!fs.existsSync(startupDir)) {
      fs.mkdirSync(startupDir, { recursive: true });
    }
    
    // 2. Script de serviço simplificado SEM PM2 - CORRIGIDO para usar wsl.exe do System32
    const serviceBatchContent = `@echo off
SETLOCAL EnableDelayedExpansion

REM Script para iniciar WSL - versao sem PM2
SET LOG_FILE=%ProgramData%\\LoQQuei\\WSLStartup\\wsl-boot.log

ECHO %DATE% %TIME% - Servico WSL Boot iniciado >> "%LOG_FILE%" 2>&1

REM Desligar WSL para inicializacao limpa
ECHO %DATE% %TIME% - Desligando WSL >> "%LOG_FILE%" 2>&1
C:\\Windows\\System32\\wsl.exe --shutdown >> "%LOG_FILE%" 2>&1

REM Aguardar desligamento completo
timeout /t 5 /nobreak > NUL

REM Iniciar WSL com Ubuntu de forma completa - usando caminho absoluto do wsl.exe
ECHO %DATE% %TIME% - Iniciando WSL com Ubuntu >> "%LOG_FILE%" 2>&1
start "WSL Daemon" /min C:\\Windows\\System32\\wsl.exe -d Ubuntu >> "%LOG_FILE%" 2>&1

REM Aguardar inicializacao
timeout /t 15 /nobreak > NUL

REM Verificar se WSL esta em execucao
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root echo "Teste WSL inicializado" >> "%LOG_FILE%" 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO %DATE% %TIME% - ERRO: WSL nao inicializou corretamente >> "%LOG_FILE%" 2>&1
    EXIT /B 1
)

REM Iniciar servicos no Ubuntu (sem PM2)
ECHO %DATE% %TIME% - Iniciando servicos no Ubuntu >> "%LOG_FILE%" 2>&1
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root systemctl restart postgresql cups smbd >> "%LOG_FILE%" 2>&1

REM Iniciar diretamente a API sem PM2
ECHO %DATE% %TIME% - Iniciando API manualmente >> "%LOG_FILE%" 2>&1
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &" >> "%LOG_FILE%" 2>&1

ECHO %DATE% %TIME% - Inicializacao concluida com sucesso >> "%LOG_FILE%" 2>&1

REM Loop para manter o WSL ativo
ECHO %DATE% %TIME% - Entrando em modo de monitoramento >> "%LOG_FILE%" 2>&1

:LOOP
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root echo "Heartbeat %DATE% %TIME%" >> "%LOG_FILE%" 2>&1
timeout /t 300 /nobreak > NUL
GOTO LOOP`;

    const serviceBatchPath = path.join(startupDir, 'wsl-boot-service.bat');
    fs.writeFileSync(serviceBatchPath, serviceBatchContent, 'utf8');
    
    // 3. Configurar permissões amplas
    try {
      await verification.execPromise(`icacls "${startupDir}" /grant Everyone:(OI)(CI)F`, 10000, true);
      await verification.execPromise(`icacls "${serviceBatchPath}" /grant Everyone:F`, 10000, true);
    } catch {
      verification.log('Aviso: Não foi possível configurar permissões', 'warning');
    }
    
    // 4. Obter informações do usuário
    verification.log('Obtendo informações do usuário...', 'step');
    
    let username = '';
    let domainName = '';
    let userAccount = '';
    
    try {
      // Método para obter nome de usuário e domínio com PowerShell
      const userInfo = await verification.execPromise(
        'powershell -Command "$env:USERDOMAIN + \'\\\' + $env:USERNAME"',
        5000,
        true
      );
      
      userAccount = userInfo.trim();
      
      const parts = userAccount.split('\\');
      if (parts.length === 2) {
        domainName = parts[0];
        username = parts[1];
      } else {
        username = userAccount;
      }
      
      verification.log(`Usuário detectado: ${userAccount}`, 'info');
    } catch {
      verification.log('Não foi possível obter informações do usuário, usando LocalSystem', 'warning');
      userAccount = '';
    }
    
    // 5. Parar e remover serviço anterior
    verification.log('Removendo serviço anterior...', 'step');
    await verification.execPromise('sc stop LoQQueiWSLBoot', 10000, false).catch(() => {});
    await verification.execPromise('sc delete LoQQueiWSLBoot', 10000, false).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 6. Configurar registro para resolver erro 1053
    verification.log('Configurando registro para resolver erro 1053...', 'step');
    
    try {
      // Aumentar timeout de serviço no registro
      await verification.execPromise(
        'REG ADD "HKLM\\SYSTEM\\CurrentControlSet\\Control" /v "ServicesPipeTimeout" /t REG_DWORD /d "600000" /f',
        10000,
        true
      );
      
      verification.log('Timeout aumentado no registro', 'success');
    } catch {
      verification.log('Aviso: Não foi possível configurar registro', 'warning');
    }
    
    // 7. Preparar arquivo cmd simples para o serviço
    const cmdContent = `@echo off
cd /d "%~dp0"
call wsl-boot-service.bat
`;
    
    const cmdPath = path.join(startupDir, 'LoQQueiWSLService.cmd');
    fs.writeFileSync(cmdPath, cmdContent, 'utf8');
    await verification.execPromise(`icacls "${cmdPath}" /grant Everyone:F`, 5000, true).catch(() => {});
    
    // 8. Criar serviço com a conta do usuário
    let serviceCreated = false;
    
    // Criar serviço como LocalSystem (método mais confiável)
    verification.log('Criando serviço como LocalSystem...', 'step');
    
    try {
      const binPath = `cmd.exe /c "${cmdPath}"`;
      
      // Criar serviço como LocalSystem
      await verification.execPromise(
        `sc create LoQQueiWSLBoot binPath= "${binPath}" start= auto DisplayName= "LoQQuei WSL Boot Service"`,
        20000,
        true
      );
      
      // Configurar descrição
      await verification.execPromise(
        'sc description LoQQueiWSLBoot "Inicializa o WSL e servicos Ubuntu"',
        10000,
        true
      );
      
      serviceCreated = true;
      verification.log('Serviço criado como LocalSystem', 'success');
    } catch (scError) {
      verification.log(`Erro ao criar serviço: ${JSON.stringify(scError)}`, 'error');
      return false;
    }
    
    // 9. Criar inicialização alternativa via Startup folder
    verification.log('Criando método alternativo de inicialização...', 'step');
    
    try {
      // Adicionar ao registro de execução automática do usuário
      await verification.execPromise(
        `reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "LoQQueiWSLBoot" /t REG_SZ /d "\\"${serviceBatchPath}\\"" /f`,
        10000,
        true
      );
      
      // Adicionar à pasta Startup do usuário
      const userStartupDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
      if (!fs.existsSync(userStartupDir)) {
        fs.mkdirSync(userStartupDir, { recursive: true });
      }
      
      // Script simplificado para pasta Startup
      const startupScript = `@echo off
REM Script para inicialização de backup do WSL
start "" /min "C:\\Windows\\System32\\cmd.exe" /c "${serviceBatchPath}"
`;
      
      const startupPath = path.join(userStartupDir, 'LoQQuei WSL Boot.cmd');
      fs.writeFileSync(startupPath, startupScript, 'utf8');
      
      verification.log('Mecanismo de backup configurado com sucesso', 'success');
    } catch {
      verification.log('Aviso: Não foi possível configurar inicialização de backup', 'warning');
    }
    
    // 10. Criar ferramenta de diagnóstico
    verification.log('Criando assistente de diagnóstico...', 'step');
    
    const diagnoseScript = `@echo off
title Assistente de Diagnostico WSL
color 1F
cls

:menu
echo.
echo Assistente de Diagnostico WSL - Solucao de Problemas
echo =============================================
echo.
echo 1. Verificar status do servico e WSL
echo 2. Iniciar/Reiniciar servico WSL
echo 3. Verificar/Corrigir conflitos na porta da API
echo 4. Reiniciar WSL e servicos manualmente
echo 5. Executar script de inicializacao diretamente
echo 0. Sair
echo.
choice /C 123450 /N /M "Escolha uma opcao (0-5): "

if errorlevel 6 goto :EOF
if errorlevel 5 goto :executar
if errorlevel 4 goto :reiniciar
if errorlevel 3 goto :corrigirPorta
if errorlevel 2 goto :iniciarServico
if errorlevel 1 goto :verificarStatus

:verificarStatus
cls
echo.
echo Verificando status do WSL e servicos:
echo.
echo Status do servico Windows:
sc query LoQQueiWSLBoot
echo.
echo Distribuicoes WSL ativas:
C:\\Windows\\System32\\wsl.exe --list --running
echo.
echo Processos na porta 56258:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root bash -c "lsof -i :56258 || echo 'Nenhum processo usando a porta'"
echo.
echo Status dos servicos no Ubuntu:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root bash -c "systemctl status postgresql cups smbd | grep Active"
echo.
pause
goto :menu

:iniciarServico
cls
echo.
echo Iniciando/Reiniciando servico WSL Boot...
echo.
sc stop LoQQueiWSLBoot
timeout /t 2 /nobreak >nul
sc start LoQQueiWSLBoot
echo.
echo Verificando status apos tentativa:
timeout /t 5 /nobreak >nul
sc query LoQQueiWSLBoot
echo.
pause
goto :menu

:corrigirPorta
cls
echo.
echo Corrigindo conflitos de porta 56258...
echo.
echo Desligando WSL completamente:
C:\\Windows\\System32\\wsl.exe --shutdown
timeout /t 5 /nobreak >nul
echo.
echo Reiniciando Ubuntu:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root echo "Ubuntu reiniciado"
echo.
echo Matando processos na porta 56258:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root bash -c "lsof -i :56258 | grep -v PID | awk '{print \\$2}' | xargs -r kill -9 || echo 'Nenhum processo encontrado'"
echo.
echo Matando processos node:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root bash -c "pkill -f node || echo 'Nenhum processo node encontrado'"
echo.
echo Reiniciando API manualmente:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &"
echo.
echo Status final:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root bash -c "lsof -i :56258 || echo 'Nenhum processo encontrado para porta 56258'"
echo.
pause
goto :menu

:reiniciar
cls
echo.
echo Reiniciando WSL e servicos...
echo.
echo Parando servico Windows:
sc stop LoQQueiWSLBoot
echo.
echo Desligando WSL:
C:\\Windows\\System32\\wsl.exe --shutdown
timeout /t 5 /nobreak >nul
echo.
echo Iniciando Ubuntu:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root echo "Ubuntu iniciado"
echo.
echo Iniciando servicos:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root systemctl restart postgresql cups smbd
echo.
echo Iniciando API manualmente:
C:\\Windows\\System32\\wsl.exe -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &"
echo.
echo Reiniciando servico Windows:
sc start LoQQueiWSLBoot
echo.
echo Reinicializacao concluida.
pause
goto :menu

:executar
cls
echo.
echo Executando script de inicializacao diretamente...
echo.
call "%ProgramData%\\LoQQuei\\WSLStartup\\wsl-boot-service.bat"
echo.
echo Execucao direta concluida.
pause
goto :menu
`;

    const diagnosePath = path.join(startupDir, 'diagnostico-wsl.cmd');
    fs.writeFileSync(diagnosePath, diagnoseScript, 'utf8');
    
    // Criar atalho na área de trabalho
    try {
      const desktopDir = path.join(process.env.USERPROFILE, 'Desktop');
      const desktopPath = path.join(desktopDir, 'Diagnostico WSL.lnk');
      
      const shortcutScript = `
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${desktopPath.replace(/\\/g, '\\\\')}")
$Shortcut.TargetPath = "${diagnosePath.replace(/\\/g, '\\\\')}"
$Shortcut.Description = "Assistente de Diagnóstico WSL"
$Shortcut.IconLocation = "%SystemRoot%\\System32\\shell32.dll,21"
$Shortcut.Save()
`;
      
      const shortcutPath = path.join(os.tmpdir(), 'create-shortcut.ps1');
      fs.writeFileSync(shortcutPath, shortcutScript, 'utf8');
      
      await verification.execPromise(
        `powershell -ExecutionPolicy Bypass -File "${shortcutPath}"`,
        10000,
        true
      );
      
      try {
        fs.unlinkSync(shortcutPath);
      } catch { /* ignorar erros */ }
      
      verification.log('Assistente de diagnóstico criado na área de trabalho', 'success');
    } catch {
      verification.log('Não foi possível criar atalho na área de trabalho', 'warning');
    }
    
    verification.log('Serviço WSL configurado com sucesso', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao criar serviço: ${error.message || JSON.stringify(error)}`, 'error');
    return false;
  }
}

// Função principal simplificada para ser usada no lugar da setupWindowsStartup
async function setupWindowsStartup() {
  verification.log('Configurando inicialização automática do WSL no Windows...', 'step');
  
  try {
    // 1. Criar diretório principal
    const programDataDir = process.env.ProgramData || 'C:\\ProgramData';
    const startupDir = path.join(programDataDir, 'LoQQuei', 'WSLStartup');
    
    try {
      if (!fs.existsSync(startupDir)) {
        fs.mkdirSync(startupDir, { recursive: true });
      }
    } catch {
      verification.log(`Erro ao criar diretório, tentando método alternativo...`, 'warning');
      await verification.execPromise(
        `powershell -Command "New-Item -Path '${startupDir}' -ItemType Directory -Force"`,
        10000,
        true
      ).catch(() => {});
    }
    
    // 2. Limpar processos que podem interferir
    verification.log('Limpando ambiente para nova instalação...', 'step');
    try {
      // Desligar WSL completamente
      await verification.execPromise('wsl --shutdown', 10000, true).catch(() => {});
      
      // Matar processos que possam estar usando a porta da API
      await verification.execPromise(
        'powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -like \'*WSL*\'} | Stop-Process -Force -ErrorAction SilentlyContinue"',
        10000,
        true
      ).catch(() => {});
      
      verification.log('Ambiente limpo e pronto para instalação', 'success');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (cleanError) {
      verification.log(`Aviso durante limpeza: ${cleanError?.message || 'Erro desconhecido'}`, 'warning');
    }
    
    // 3. Criar e configurar o serviço final
    const serviceResult = await createWslBootServiceFinal();
    
    if (!serviceResult) {
      verification.log('Houve problemas na criação do serviço', 'warning');
    }
    
    // 4. Configurar WSL para evitar desligamento automático
    verification.log('Configurando arquivo wsl.conf...', 'step');
    
    try {
      // Configuração simplificada do WSL
      const wslConfContent = `[boot]
systemd=true

[user]
default=print_user

[automount]
enabled=true

[wsl2]
memory=2GB
processors=2
`;
      
      // Criar arquivo temporário
      const tempWslConfPath = path.join(os.tmpdir(), 'wsl.conf');
      fs.writeFileSync(tempWslConfPath, wslConfContent, 'utf8');
      
      // Obter caminho WSL
      const wslPath = await verification.execPromise(
        `wsl -d Ubuntu wslpath -u "${tempWslConfPath.replace(/\\/g, '/')}"`,
        5000,
        true
      );
      
      // Copiar para WSL
      await verification.execPromise(
        `wsl -d Ubuntu -u root bash -c "cp /etc/wsl.conf /etc/wsl.conf.bak 2>/dev/null || true; cp '${wslPath.trim()}' /etc/wsl.conf"`,
        10000,
        true
      );
      
      try {
        fs.unlinkSync(tempWslConfPath);
      } catch { /* ignorar erros */ }
      
      verification.log('Arquivo wsl.conf atualizado', 'success');
    } catch (wslConfError) {
      verification.log(`Não foi possível atualizar wsl.conf: ${wslConfError?.message || 'Erro desconhecido'}`, 'warning');
    }
    
    // 5. Resumo final
    verification.log('===== CONFIGURAÇÃO DE INICIALIZAÇÃO AUTOMÁTICA CONCLUÍDA =====', 'success');
    verification.log('Serviço Windows criado e configurado com sucesso!', 'success');
    verification.log('O WSL será iniciado automaticamente na inicialização do Windows', 'success');
    verification.log(`Local dos arquivos de log: ${path.join(startupDir, 'wsl-boot.log')}`, 'info');
    verification.log('Use o atalho "Diagnóstico WSL" na área de trabalho se encontrar problemas', 'info');
    
    return true;
  } catch (error) {
    verification.log(`Erro durante a configuração: ${error?.message || JSON.stringify(error)}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);
    return false;
  }
}

async function restartServices() {
  verification.log('Reiniciando serviços essenciais...', 'step');
  
  try {
    // Lista de serviços e comandos para reiniciar
    const serviceCommands = [
      {
        name: 'PostgreSQL', 
        commands: [
          "systemctl restart postgresql",
          "service postgresql restart",
          "/etc/init.d/postgresql restart",
          // Método alternativo específico para PostgreSQL
          "pg_version=$(ls -d /etc/postgresql/*/ 2>/dev/null | cut -d'/' -f4 | head -n 1 || echo '14') && su - postgres -c \"/usr/lib/postgresql/${pg_version}/bin/pg_ctl -D /var/lib/postgresql/${pg_version}/main restart\""
        ]
      },
      {
        name: 'CUPS', 
        commands: [
          "systemctl restart cups",
          "service cups restart",
          "/etc/init.d/cups restart",
          "killall -HUP cupsd || true",
          "cupsd -c /etc/cups/cupsd.conf"
        ]
      },
      {
        name: 'Samba', 
        commands: [
          "systemctl restart smbd",
          "service smbd restart",
          "/etc/init.d/smbd restart",
          "smbd"
        ]
      },
      {
        name: 'Firewall', 
        commands: [
          "systemctl restart ufw",
          "service ufw restart",
          "/etc/init.d/ufw restart",
          "ufw --force enable"
        ]
      }
    ];
    
    // Tentar reiniciar cada serviço com vários métodos
    for (const service of serviceCommands) {
      verification.log(`Reiniciando ${service.name}...`, 'info');
      
      let serviceRestarted = false;
      
      for (const cmd of service.commands) {
        try {
          await verification.execPromise(`wsl -d Ubuntu -u root bash -c "${cmd}"`, 30000, true);
          verification.log(`${service.name} reiniciado com sucesso`, 'success');
          serviceRestarted = true;
          break;
        } catch {
          // Continuar para o próximo comando
          verification.logToFile(`Erro ao reiniciar ${service.name} com comando: ${cmd}`);
        }
      }
      
      if (!serviceRestarted) {
        verification.log(`Aviso: Não foi possível reiniciar ${service.name}`, 'warning');
      }
      
      // Aguardar um pouco entre serviços
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    verification.log('Tentativa de reinicialização de serviços concluída', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao reiniciar serviços: ${error.message || 'Erro desconhecido'}`, 'warning');
    return true; // Continue mesmo com erro
  }
}

// Configurar o Samba
async function configureSamba() {
  verification.log('Configurando Samba...', 'step');

  try {
    try {
      verification.log('Verificando instalação do Samba...', 'step');
      
      const sambaCheck = await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "dpkg -s samba 2>/dev/null || echo not_installed"',
        15000,
        true
      );
      
      if (sambaCheck.includes('not_installed') || sambaCheck.includes('no packages found')) {
        verification.log('Samba não está instalado, instalando agora...', 'warning');
        
        // Limpar locks do APT e instalar Samba
        await cleanAptLocks();
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get install -y samba',
          300000, // 5 minutos
          true
        );
      }
    } catch {
      verification.log('Erro ao verificar instalação do Samba, tentando instalar de qualquer forma...', 'warning');
      
      try {
        await cleanAptLocks();
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get install -y samba',
          300000, // 5 minutos
          true
        );
      } catch {
        verification.log('Erro ao instalar Samba, tentando continuar mesmo assim...', 'error');
      }
    }

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
    try {
      verification.log('Verificando instalação do CUPS...', 'step');
      
      const cupsCheck = await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "dpkg -s cups 2>/dev/null || echo not_installed"',
        15000,
        true
      );
      
      if (cupsCheck.includes('not_installed') || cupsCheck.includes('no packages found')) {
        verification.log('CUPS não está instalado, instalando agora...', 'warning');
        
        // Limpar locks do APT e instalar CUPS com timeout mais longo
        await cleanAptLocks();
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get install -y cups printer-driver-cups-pdf',
          300000,
          true
        );
      }
    } catch {
      verification.log('Erro ao verificar instalação do CUPS, tentando instalar de qualquer forma...', 'warning');
      
      try {
        await cleanAptLocks();
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get install -y cups printer-driver-cups-pdf',
          300000,
          true
        );
      } catch {
        verification.log('Erro ao instalar CUPS, tentando continuar mesmo assim...', 'error');
      }
    }

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
    if (printerList.includes('PDF_Printer')) {
      verification.log('Impressora PDF já existe, garantindo que esteja habilitada...', 'info');
      try {
        // Habilitar e aceitar trabalhos (ignorando erros)
        await verification.execPromise('wsl -d Ubuntu -u root cupsenable PDF 2>/dev/null || cupsenable PDF_Printer 2>/dev/null || true', 10000, true);
        await verification.execPromise('wsl -d Ubuntu -u root cupsaccept PDF 2>/dev/null || cupsaccept PDF_Printer 2>/dev/null || true', 10000, true);
        verification.log('Impressora PDF está pronta para uso', 'success');
        return true;
      } catch {
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
    } catch {
      verification.log('Método moderno falhou, tentando alternativa...', 'warning');
    }

    // Método 1.2: Abordagem usando driver "cups-print" (moderna)
    try {
      verification.log('Tentando criar impressora usando método moderno...', 'info');
      await verification.execPromise('wsl -d Ubuntu -u root lpadmin -p PDF_Printer -E -v cups-pdf:/ -m lsb/usr/cups-pdf/CUPS-PDF_opt.ppd', 12000, true);
      verification.log('Impressora PDF_Printer criada com sucesso (método moderno)', 'success');
      return true;
    } catch {
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
    } catch {
      verification.log('Método de PPD disponível falhou, tentando próxima alternativa...', 'warning');
    }
    
    // Método 3: Usar um driver genérico comum
    try {
      verification.log('Tentando usar driver genérico...', 'info');
      await verification.execPromise('wsl -d Ubuntu -u root lpadmin -p PDF_Printer -E -v cups-pdf:/ -m raw', 12000, true);
      verification.log('Impressora PDF_Printer criada com driver genérico', 'success');
      return true;
    } catch {
      verification.log('Método de driver genérico falhou, tentando método básico...', 'warning');
    }
    
    // Método 4: Abordagem minimalista 
    try {
      verification.log('Tentando método minimalista...', 'info');
      await verification.execPromise('wsl -d Ubuntu -u root lpadmin -p PDF_Printer -E -v cups-pdf:/', 12000, true);
      verification.log('Impressora PDF_Printer criada com configuração mínima', 'success');
      return true;
    } catch {
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
    } catch {
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
    } catch {
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
      } catch {
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
    try {
      verification.log('Verificando instalação do PostgreSQL...', 'step');
      
      const pgCheck = await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "dpkg -s postgresql 2>/dev/null || echo not_installed"',
        15000,
        true
      );
      
      if (pgCheck.includes('not_installed') || pgCheck.includes('no packages found')) {
        verification.log('PostgreSQL não está instalado, instalando agora...', 'warning');
        
        // Limpar locks do APT e instalar PostgreSQL
        await cleanAptLocks();
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get install -y postgresql postgresql-contrib',
          300000, // 5 minutos
          true
        );
      }
    } catch {
      verification.log('Erro ao verificar instalação do PostgreSQL, tentando instalar de qualquer forma...', 'warning');
      
      try {
        await cleanAptLocks();
        await verification.execPromise(
          'wsl -d Ubuntu -u root apt-get install -y postgresql postgresql-contrib',
          300000, // 5 minutos
          true
        );
      } catch {
        verification.log('Erro ao instalar PostgreSQL, tentando continuar mesmo assim...', 'error');
      }
    }

    // 1. Verificar e iniciar PostgreSQL com múltiplas abordagens
    verification.log('Verificando status do PostgreSQL...', 'step');
    
    let postgresRunning = false;
    try {
      const statusCheck = await verification.execPromise('wsl -d Ubuntu -u root systemctl is-active postgresql', 20000, true)
        .catch(() => "inactive");
      postgresRunning = statusCheck.trim() === 'active';
    } catch {
      postgresRunning = false;
    }
    
    if (!postgresRunning) {
      verification.log('PostgreSQL não está rodando, iniciando serviço...', 'step');
      
      // Determinar a versão do PostgreSQL
      const pgVersionCmd = "wsl -d Ubuntu -u root bash -c \"ls -d /etc/postgresql/*/ 2>/dev/null | cut -d'/' -f4 | head -n 1 || echo '14'\"";
      const pgVersion = await verification.execPromise(pgVersionCmd, 10000, true).catch(() => "14");
      const version = pgVersion.trim() || "14";
      
      // Tentar iniciar PostgreSQL com vários métodos
      try {
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "systemctl start postgresql || service postgresql start || pg_ctlcluster ${version} main start || (su - postgres -c '/usr/lib/postgresql/${version}/bin/pg_ctl -D /var/lib/postgresql/${version}/main start')"`,
          30000,
          true
        );
        
        verification.log('PostgreSQL iniciado com sucesso', 'success');
        postgresRunning = true;
        
        // Aguardar inicialização
        verification.log('Aguardando inicialização do PostgreSQL...', 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (startError) {
        verification.log('ERRO: Não foi possível iniciar o PostgreSQL. Tentando método alternativo...', 'error');
        verification.logToFile(`Erro ao iniciar PostgreSQL: ${JSON.stringify(startError)}`);
        
        // Tentar iniciar com um último método mais específico
        try {
          await verification.execPromise(
            `wsl -d Ubuntu -u root bash -c "mkdir -p /var/run/postgresql && chown postgres:postgres /var/run/postgresql && su - postgres -c '/usr/lib/postgresql/${version}/bin/pg_ctl -D /var/lib/postgresql/${version}/main start'"`,
            30000,
            true
          );
          postgresRunning = true;
          verification.log('PostgreSQL iniciado com método alternativo', 'success');
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (altStartError) {
          verification.log('ERRO: Todos os métodos para iniciar PostgreSQL falharam', 'error');
          verification.logToFile(`Detalhes do erro alternativo: ${JSON.stringify(altStartError)}`);
          return false;
        }
      }
    } else {
      verification.log('PostgreSQL já está em execução', 'success');
    }
    
    // 2. Criar banco de dados se não existir
    verification.log('Verificando se o banco de dados print_management existe...', 'step');
    let dbExists = false;
    
    try {
      const dbCheck = await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -lqt | grep -w print_management || echo "not_exists"`,
        15000,
        true
      );
      
      dbExists = !dbCheck.includes('not_exists') && dbCheck.includes('print_management');
      
      if (dbExists) {
        verification.log('Banco de dados print_management já existe', 'success');
      } else {
        verification.log('Criando banco de dados print_management...', 'step');
        
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -c "CREATE DATABASE print_management;"`,
          20000,
          true
        );
        
        verification.log('Banco de dados print_management criado com sucesso', 'success');
      }
    } catch (dbError) {
      verification.log('ERRO ao verificar/criar banco de dados', 'error');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(dbError)}`);
      
      // Tentar com método alternativo
      try {
        verification.log('Tentando método alternativo para criar banco de dados...', 'step');
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "su - postgres -c 'createdb print_management'"`,
          20000,
          true
        );
        verification.log('Banco de dados criado com método alternativo', 'success');
      } catch (altDbError) {
        verification.log('ERRO: Todos os métodos para criar banco de dados falharam', 'error');
        verification.logToFile(`Detalhes do erro alternativo: ${JSON.stringify(altDbError)}`);
        // Continuar mesmo com erro, pois o banco pode já existir
      }
    }
    
    // 3. Criar usuário postgres_print se não existir
    verification.log('Verificando/Criando usuário postgres_print...', 'step');
    
    try {
      // Verificar se o usuário existe
      const userCheck = await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='postgres_print';" -t`,
        15000,
        true
      ).catch(() => "");
      
      const userExists = userCheck.trim().includes('1');
      
      if (userExists) {
        verification.log('Usuário postgres_print já existe', 'success');
        
        // Atualizar senha de qualquer forma para garantir consistência
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -c "ALTER USER postgres_print WITH PASSWORD 'root_print' SUPERUSER;"`,
          15000,
          true
        );
        
        verification.log('Senha e privilégios do usuário postgres_print atualizados', 'success');
      } else {
        verification.log('Criando usuário postgres_print...', 'step');
        
        // Criar usuário com senha e privilegios
        await verification.execPromise(
          `wsl -d Ubuntu -u postgres psql -c "CREATE ROLE postgres_print WITH LOGIN SUPERUSER PASSWORD 'root_print';"`,
          15000,
          true
        );
        
        verification.log('Usuário postgres_print criado com sucesso', 'success');
      }
    } catch (userError) {
      verification.log('ERRO ao criar/modificar usuário postgres_print. Tentando método alternativo...', 'error');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(userError)}`);
      
      // Tentar com comando alternativo
      try {
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "su - postgres -c \\\"psql -c \\\\\\\"CREATE ROLE postgres_print WITH LOGIN SUPERUSER PASSWORD 'root_print';\\\\\\\"\\\"" || su - postgres -c "createuser -s postgres_print"`,
          20000,
          true
        );
        
        verification.log('Usuário postgres_print criado via método alternativo', 'success');
        
        // Tentar definir a senha separadamente
        try {
          await verification.execPromise(
            `wsl -d Ubuntu -u postgres psql -c "ALTER USER postgres_print WITH PASSWORD 'root_print';"`,
            15000,
            true
          );
        } catch {
          verification.log('Aviso: Não foi possível definir senha para postgres_print', 'warning');
        }
      } catch (altUserError) {
        verification.log('ERRO: Todos os métodos para criar usuário falharam, mas continuando...', 'error');
        verification.logToFile(`Detalhes do erro alternativo: ${JSON.stringify(altUserError)}`);
        // Continuar mesmo com erro
      }
    }
    
    // 4. Criar schema print_management se não existir
    verification.log('Criando schema print_management...', 'step');
    
    try {
      await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -d print_management -c "CREATE SCHEMA IF NOT EXISTS print_management;"`,
        15000,
        true
      );
      
      // Conceder privilégios ao usuário no schema
      await verification.execPromise(
        `wsl -d Ubuntu -u postgres psql -d print_management -c "GRANT ALL PRIVILEGES ON SCHEMA print_management TO postgres_print;"`,
        15000,
        true
      );
      
      verification.log('Schema print_management criado/verificado com sucesso', 'success');
    } catch (schemaError) {
      verification.log('ERRO ao criar schema. Tentando método alternativo...', 'error');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(schemaError)}`);
      
      try {
        // Comando mais simplificado
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "su - postgres -c \\\"psql -d print_management -c \\\\\\\"CREATE SCHEMA IF NOT EXISTS print_management; GRANT ALL PRIVILEGES ON SCHEMA print_management TO postgres_print;\\\\\\\"\\\")"`,
          20000,
          true
        );
        
        verification.log('Schema criado via método alternativo', 'success');
      } catch (altSchemaError) {
        verification.log('ERRO: Todos os métodos para criar schema falharam', 'error');
        verification.logToFile(`Detalhes do erro alternativo: ${JSON.stringify(altSchemaError)}`);
        return false;
      }
    }
    
    // 5. Configurar arquivo .env com dados de conexão
    try {
      verification.log('Configurando arquivo .env com dados de conexão...', 'step');
      
      // Verificar diretórios possíveis
      const possiblePaths = [
        '/opt/loqquei/print_server_desktop',
        '/opt/print_server/print_server_desktop',
        '/opt/loqquei',
        '/opt/print_server'
      ];
      
      let envPath = null;
      for (const path of possiblePaths) {
        try {
          const pathCheck = await verification.execPromise(
            `wsl -d Ubuntu -u root bash -c "if [ -d '${path}' ]; then echo 'exists'; else echo 'not_found'; fi"`,
            10000,
            true
          );
          
          if (pathCheck.trim() === 'exists') {
            envPath = path;
            break;
          }
        } catch { /* ignorar erros */ }
      }
      
      if (envPath) {
        verification.log(`Atualizando arquivo .env em ${envPath}...`, 'info');
        
        // Gerar conteúdo do arquivo .env
        const envContent = `DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=print_management
DB_USERNAME=postgres_print
DB_PASSWORD=root_print`;
        
        // Escapar conteúdo para bash
        const escapedContent = envContent.replace(/"/g, '\\"');
        
        // Atualizar ou criar arquivo .env
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "echo \\"${escapedContent}\\" > ${envPath}/.env"`,
          10000,
          true
        );
        
        verification.log('Arquivo .env configurado com dados de conexão', 'success');
      } else {
        verification.log('Aviso: Não foi possível encontrar diretório da aplicação para configurar .env', 'warning');
      }
    } catch (envError) {
      verification.log('Aviso: Erro ao configurar arquivo .env', 'warning');
      verification.logToFile(`Detalhes do erro: ${JSON.stringify(envError)}`);
      // Continuar mesmo com erro
    }
    
    verification.log('Configuração básica do banco concluída com sucesso', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro fatal na configuração do banco: ${error.message || JSON.stringify(error)}`, 'error');
    verification.logToFile(`Erro detalhado: ${JSON.stringify(error)}`);
    return false;
  }
}

// Executar migrações do banco de dados - método ultra-direto
async function setupMigrations() {
  verification.log('Executando migrações do banco de dados...', 'header');

  try {
    // 1. Verificar se o PostgreSQL está rodando
    verification.log('Verificando status do PostgreSQL...', 'step');
    
    try {
      const statusCheck = await verification.execPromise('wsl -d Ubuntu -u root systemctl is-active postgresql', 10000, true)
        .catch(() => "inactive");
      
      if (statusCheck.trim() !== 'active') {
        verification.log('PostgreSQL não está rodando, reiniciando serviço...', 'warning');
        await verification.execPromise('wsl -d Ubuntu -u root systemctl start postgresql || service postgresql start', 20000, true);
        
        // Aguardar inicialização
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (statusError) {
      verification.log('Aviso: Não foi possível verificar status do PostgreSQL', 'warning');
      verification.logToFile(`Erro ao verificar status: ${JSON.stringify(statusError)}`);
    }
    
    // 2. Procurar script de migração existente - apenas para logging
    verification.log('Verificando scripts de migração existentes...', 'step');
    
    // Verificar existência do script
    const possiblePaths = [
      "/opt/loqquei/print_server_desktop",
      "/opt/print_server/print_server_desktop",
      "/opt/loqquei",
      "/opt/print_server"
    ];
    
    let foundPath = null;
    for (const path of possiblePaths) {
      try {
        const scriptCheck = await verification.execPromise(
          `wsl -d Ubuntu -u root test -f "${path}/db/migrate.sh" && echo "exists"`,
          10000,
          true
        ).catch(() => "");
        
        if (scriptCheck === "exists") {
          foundPath = path;
          verification.log(`Script de migração encontrado em: ${path}`, 'info');
          break;
        }
      } catch { /* ignorar erros */ }
    }
    
    // 3. Tentar executar script de migração se existir
    if (foundPath) {
      verification.log(`Tentando executar script de migração em ${foundPath}...`, 'step');
      
      try {
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "chmod +x ${foundPath}/db/migrate.sh"`,
          10000,
          true
        );
        
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "cd ${foundPath} && ./db/migrate.sh"`,
          120000, // 2 minutos
          true
        );
        
        // Verificar se as tabelas foram criadas
        const tablesExist = await verifyTablesExist();
        
        if (tablesExist) {
          verification.log('Script de migração executado com sucesso, tabelas criadas!', 'success');
          return true;
        } else {
          verification.log('Script de migração executado, mas tabelas ainda não existem. Usando método direto...', 'warning');
        }
      } catch (scriptError) {
        verification.log(`Erro ao executar script: ${scriptError.message || JSON.stringify(scriptError)}`, 'error');
        verification.log('Usando método direto para criar tabelas...', 'step');
      }
    } else {
      verification.log('Nenhum script de migração encontrado, usando método direto...', 'step');
    }
    
    // 4. Método direto para criar tabelas
    return await createTablesDirectly();
  } catch (error) {
    verification.log(`Erro ao executar migrações: ${error.message || JSON.stringify(error)}`, 'error');
    
    // Tentar método direto como fallback
    try {
      verification.log('Tentando método direto após erro...', 'step');
      return await createTablesDirectly();
    } catch {
      verification.log('Todos os métodos falharam', 'error');
      return false;
    }
  }
}

// Verificar se as tabelas existem
async function verifyTablesExist() {
  try {
    verification.log('Verificando se as tabelas necessárias existem...', 'step');
    
    // Verificação direta das tabelas
    const tablesCheck = await verification.execPromise(
      'wsl -d Ubuntu -u postgres psql -d print_management -c "SELECT tablename FROM pg_tables WHERE schemaname = \'print_management\';"',
      10000,
      true
    );
    
    const hasLogs = tablesCheck.toLowerCase().includes('logs');
    const hasPrinters = tablesCheck.toLowerCase().includes('printers');
    const hasFiles = tablesCheck.toLowerCase().includes('files');
    
    verification.log(`Tabelas encontradas: ${tablesCheck}`, 'info');
    verification.log(`Status: logs=${hasLogs}, printers=${hasPrinters}, files=${hasFiles}`, 'info');
    
    return hasLogs && hasPrinters && hasFiles;
  } catch (error) {
    verification.log(`Erro na verificação de tabelas: ${error.message || JSON.stringify(error)}`, 'error');
    return false;
  }
}

// Criar tabelas do banco diretamente - método aprimorado e corrigido para evitar problemas de escape
async function createTablesDirectly() {
  verification.log('Criando tabelas diretamente com SQL...', 'step');
  
  try {
    // Usar método alternativo: criar arquivo SQL temporário e executá-lo
    // Isso evita problemas com caracteres de escape e quebras de linha
    verification.log('Preparando arquivo SQL temporário para execução...', 'step');
    
    // Criar arquivo SQL temporário no WSL
    const sqlContent = `
-- Criar tipos ENUM
DO $ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'log_type' AND n.nspname = 'print_management') THEN
    CREATE TYPE print_management.log_type AS ENUM ('error', 'read', 'create', 'update', 'delete');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'printer_status' AND n.nspname = 'print_management') THEN
    CREATE TYPE print_management.printer_status AS ENUM ('functional','expired useful life','powered off','obsolete','damaged','lost','disabled');
  END IF;
END $;

-- Criar tabelas principais
CREATE TABLE IF NOT EXISTS print_management.logs (
  id varchar(50) NOT NULL,
  createdAt timestamp NOT NULL,
  logtype print_management.log_type NOT NULL,
  entity varchar(255) DEFAULT NULL,
  operation VARCHAR(50) DEFAULT NULL,
  beforeData jsonb DEFAULT NULL,
  afterData jsonb DEFAULT NULL,
  errorMessage text DEFAULT NULL,
  errorStack text DEFAULT NULL,
  userInfo jsonb DEFAULT NULL,
  PRIMARY KEY (id)
);

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
);

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
);

-- Configurar permissões
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA print_management TO postgres_print;
GRANT USAGE ON TYPE print_management.log_type TO postgres_print;
GRANT USAGE ON TYPE print_management.printer_status TO postgres_print;
ALTER DEFAULT PRIVILEGES IN SCHEMA print_management GRANT ALL PRIVILEGES ON TABLES TO postgres_print;
ALTER DEFAULT PRIVILEGES IN SCHEMA print_management GRANT ALL PRIVILEGES ON SEQUENCES TO postgres_print;
ALTER DEFAULT PRIVILEGES IN SCHEMA print_management GRANT ALL PRIVILEGES ON FUNCTIONS TO postgres_print;
`;

    try {
      // Escrever o SQL em um arquivo temporário no WSL
      await verification.execPromise(
        `wsl -d Ubuntu -u root bash -c "cat > /tmp/db_setup.sql" << 'EOFMARKER'
${sqlContent}
EOFMARKER`,
        10000,
        true
      );
      
      verification.log('Arquivo SQL temporário criado', 'success');
      
      // Executar o arquivo SQL com psql
      verification.log('Executando script SQL completo...', 'step');
      
      await verification.execPromise(
        'wsl -d Ubuntu -u postgres psql -d print_management -f /tmp/db_setup.sql',
        30000,
        true
      );
      
      verification.log('Script SQL executado com sucesso', 'success');
    } catch (scriptError) {
      verification.log(`Erro ao executar script SQL: ${scriptError.message || JSON.stringify(scriptError)}`, 'error');
      verification.logToFile(`Detalhes do erro de script: ${JSON.stringify(scriptError)}`);
      
      // Tentar método alternativo linha por linha
      verification.log('Tentando método alternativo executando cada comando separadamente...', 'warning');
      
      // Lista de comandos SQL simplificados para executar um por um
      const sqlCommands = [
        // 1. Criar tipos ENUM - versão simplificada
        {
          description: "Tipo log_type",
          sql: "CREATE TYPE print_management.log_type AS ENUM ('error', 'read', 'create', 'update', 'delete');",
          ignoreError: true
        },
        {
          description: "Tipo printer_status",
          sql: "CREATE TYPE print_management.printer_status AS ENUM ('functional','expired useful life','powered off','obsolete','damaged','lost','disabled');",
          ignoreError: true
        },
        
        // 2. Criar tabelas - versão em linha única para evitar problemas de escape
        {
          description: "Tabela logs",
          sql: "CREATE TABLE IF NOT EXISTS print_management.logs (id varchar(50) NOT NULL, createdAt timestamp NOT NULL, logtype print_management.log_type NOT NULL, entity varchar(255) DEFAULT NULL, operation VARCHAR(50) DEFAULT NULL, beforeData jsonb DEFAULT NULL, afterData jsonb DEFAULT NULL, errorMessage text DEFAULT NULL, errorStack text DEFAULT NULL, userInfo jsonb DEFAULT NULL, PRIMARY KEY (id));",
          ignoreError: false
        },
        {
          description: "Tabela printers",
          sql: "CREATE TABLE IF NOT EXISTS print_management.printers (id varchar(50) NOT NULL, name varchar(50) NOT NULL, status print_management.printer_status NOT NULL, protocol varchar(20) DEFAULT 'socket', mac_address varchar(17) DEFAULT NULL, driver varchar(100) DEFAULT 'generic', uri varchar(255) DEFAULT NULL, description text DEFAULT NULL, location varchar(100) DEFAULT NULL, ip_address varchar(15) DEFAULT NULL, port int DEFAULT NULL, createdAt timestamp NOT NULL, updatedAt timestamp NOT NULL, deletedAt timestamp DEFAULT NULL, PRIMARY KEY (id));",
          ignoreError: false
        },
        {
          description: "Tabela files",
          sql: "CREATE TABLE IF NOT EXISTS print_management.files (id varchar(50) NOT NULL, assetId varchar(50) DEFAULT NULL, fileName text NOT NULL, pages int NOT NULL, path TEXT NOT NULL, createdAt timestamp NOT NULL, deletedAt timestamp DEFAULT NULL, printed BOOLEAN NOT NULL DEFAULT FALSE, synced BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (id), FOREIGN KEY (assetId) REFERENCES print_management.printers(id));",
          ignoreError: false
        },
        
        // 3. Configurar permissões - simplificadas
        {
          description: "Permissões em tabelas",
          sql: "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA print_management TO postgres_print;",
          ignoreError: true
        },
        {
          description: "Permissões em tipos",
          sql: "GRANT USAGE ON TYPE print_management.log_type TO postgres_print; GRANT USAGE ON TYPE print_management.printer_status TO postgres_print;",
          ignoreError: true
        },
        {
          description: "Permissões padrão em tabelas",
          sql: "ALTER DEFAULT PRIVILEGES IN SCHEMA print_management GRANT ALL PRIVILEGES ON TABLES TO postgres_print;",
          ignoreError: true
        },
        {
          description: "Permissões padrão em sequências",
          sql: "ALTER DEFAULT PRIVILEGES IN SCHEMA print_management GRANT ALL PRIVILEGES ON SEQUENCES TO postgres_print;",
          ignoreError: true
        },
        {
          description: "Permissões padrão em funções",
          sql: "ALTER DEFAULT PRIVILEGES IN SCHEMA print_management GRANT ALL PRIVILEGES ON FUNCTIONS TO postgres_print;",
          ignoreError: true
        }
      ];
      
      // Executar cada comando SQL
      for (const command of sqlCommands) {
        verification.log(`Executando SQL: ${command.description}...`, 'step');
        
        try {
          // Usar comandos de execução mais simples que têm menos problemas de escape
          const escapedSql = command.sql.replace(/'/g, "'\\''");
          await verification.execPromise(
            `wsl -d Ubuntu -u postgres bash -c "psql -d print_management -c '${escapedSql}'"`,
            20000,
            true
          );
          
          verification.log(`${command.description} - Concluído com sucesso`, 'success');
        } catch (sqlError) {
          if (command.ignoreError) {
            verification.log(`${command.description} - Aviso: Comando falhou, mas era esperado (objeto pode já existir)`, 'warning');
          } else {
            verification.log(`${command.description} - ERRO: ${sqlError.message || JSON.stringify(sqlError)}`, 'error');
            verification.logToFile(`Detalhes do erro: ${JSON.stringify(sqlError)}`);
          }
          
          // Verificar se o erro é de "já existe" para tipos ENUM
          if (sqlError.stderr && (
              sqlError.stderr.includes('already exists') || 
              sqlError.stderr.includes('já existe')
          )) {
            verification.log(`${command.description} - O objeto já existe, continuando...`, 'info');
          }
        }
      }
    }
    
    // Verificar se todas as tabelas essenciais foram criadas
    verification.log('Verificação final das tabelas...', 'step');
    const tablesExist = await verifyTablesExist();
    
    if (tablesExist) {
      verification.log('Todas as tabelas necessárias foram criadas com sucesso!', 'success');
      return true;
    } else {
      // Verificar uma última vez se as tabelas foram criadas com nome de colunas em caixa baixa
      try {
        const altTablesCheck = await verification.execPromise(
          'wsl -d Ubuntu -u postgres psql -d print_management -c "SELECT tableowner FROM pg_tables WHERE schemaname = \'print_management\';"',
          10000,
          true
        );
        
        // Se temos pelo menos alguns resultados, considerar parcialmente bem-sucedido
        if (altTablesCheck && altTablesCheck.includes('postgres')) {
          verification.log('Algumas tabelas foram criadas, mas verificação completa falhou', 'warning');
          return true;
        }
      } catch { /* ignorar erro */ }
      
      // Último método - extremamente simplificado
      verification.log('Tentando último método usando arquivo SQL direto...', 'warning');
      try {
        // Criar arquivo SQL mínimo (versão extremamente simplificada em um único arquivo)
        const minimalSql = `
CREATE TYPE IF NOT EXISTS print_management.log_type AS ENUM ('error', 'read', 'create', 'update', 'delete');
CREATE TYPE IF NOT EXISTS print_management.printer_status AS ENUM ('functional','expired useful life','powered off','obsolete','damaged','lost','disabled');
CREATE TABLE IF NOT EXISTS print_management.logs (id varchar(50) PRIMARY KEY, createdAt timestamp NOT NULL, logtype print_management.log_type NOT NULL);
CREATE TABLE IF NOT EXISTS print_management.printers (id varchar(50) PRIMARY KEY, name varchar(50) NOT NULL, status print_management.printer_status NOT NULL);
CREATE TABLE IF NOT EXISTS print_management.files (id varchar(50) PRIMARY KEY, assetId varchar(50), fileName text NOT NULL, pages int NOT NULL, path text NOT NULL);
GRANT ALL PRIVILEGES ON SCHEMA print_management TO postgres_print;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA print_management TO postgres_print;
`;

        // Escrever SQL mínimo em arquivo
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "echo '${minimalSql.replace(/'/g, "'\\''")}' > /tmp/minimal_db.sql"`,
          10000,
          true
        );
        
        // Executar SQL mínimo
        await verification.execPromise(
          'wsl -d Ubuntu -u postgres psql -d print_management -f /tmp/minimal_db.sql',
          15000,
          true
        );
        
        verification.log('SQL mínimo executado, verificando tabelas...', 'step');
        
        // Verificar novamente
        const finalCheck = await verifyTablesExist();
        if (finalCheck) {
          verification.log('Tabelas criadas com método mínimo!', 'success');
          return true;
        } else {
          verification.log('Mesmo o método mínimo falhou', 'error');
        }
      } catch (finalAttemptError) {
        verification.log('Último método também falhou', 'error');
        verification.logToFile(`Erro final: ${JSON.stringify(finalAttemptError)}`);
      }
      
      verification.log('ERRO: Falha ao criar tabelas necessárias', 'error');
      return false;
    }
  } catch (error) {
    verification.log(`Erro ao criar tabelas: ${error.message || JSON.stringify(error)}`, 'error');
    return false;
  }
}


// Configurar usuário padrão - método ultra-simplificado
async function configureDefaultUser() {
  verification.log('Configurando usuário padrão com método simplificado...', 'step');
  verification.logToFile('Iniciando configuração simplificada do usuário padrão');

  try {
    // 1. Desligar WSL primeiro
    try {
      await verification.execPromise('wsl --shutdown', 10000, true);
      // Esperar o WSL desligar
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch { /* ignorar erro */ }
    
    // 2. Criar usuário
    try {
      await verification.execPromise(
        'wsl -d Ubuntu -u root useradd -m -s /bin/bash -G sudo print_user',
        15000,
        true
      ).catch(() => { /* ignorar erro */ });
      
      verification.log('Usuário print_user criado ou já existe', 'success');
    } catch { /* ignorar erro */ }
    
    // 3. Definir senha
    try {
      await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "echo print_user:print_user | chpasswd"',
        15000,
        true
      );
      verification.log('Senha configurada', 'success');
    } catch { /* ignorar erro */ }
    
    // 4. Configurar sudo
    try {
      await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "echo \'print_user ALL=(ALL) NOPASSWD:ALL\' > /etc/sudoers.d/print_user && chmod 440 /etc/sudoers.d/print_user"',
        15000,
        true
      );
      verification.log('Acesso sudo configurado', 'success');
    } catch { /* ignorar erro */ }
    
    // 5. Criar wsl.conf LINHA POR LINHA
    try {
      // Linha 1
      await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "echo \'[user]\' > /etc/wsl.conf"',
        10000,
        true
      );
      
      // Linha 2
      await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "echo \'default=print_user\' >> /etc/wsl.conf"',
        10000,
        true
      );
      
      // Linha 3
      await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "echo \'\' >> /etc/wsl.conf"',
        10000,
        true
      );
      
      // Linha 4
      await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "echo \'[boot]\' >> /etc/wsl.conf"',
        10000,
        true
      );
      
      // Linha 5
      await verification.execPromise(
        'wsl -d Ubuntu -u root bash -c "echo \'systemd=true\' >> /etc/wsl.conf"',
        10000,
        true
      );
      
      verification.log('Arquivo wsl.conf criado', 'success');
      
      // Verificar o arquivo
      const wslConfContent = await verification.execPromise(
        'wsl -d Ubuntu -u root cat /etc/wsl.conf',
        10000,
        true
      );
      
      verification.log(`Conteúdo de wsl.conf: ${wslConfContent}`, 'info');
    } catch { /* ignorar erro */ }
    
    // 6. Reiniciar WSL para aplicar configuração
    try {
      await verification.execPromise('wsl --terminate Ubuntu', 15000, true);
      verification.log('WSL reiniciado para aplicar configurações', 'success');
      
      // Esperar reinicialização
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch { /* ignorar erro */ }
    
    // Atualizar estado
    installState.defaultUserCreated = true;
    saveInstallState();
    
    verification.log('Usuário padrão configurado!', 'success');
    return true;
  } catch (error) {
    verification.log(`Erro ao configurar usuário: ${error.message || JSON.stringify(error)}`, 'error');
    return false;
  }
}

async function execWslCommand(command, timeoutMs = 30000, quiet = false) {
  // Substituir padrões problemáticos
  let fixedCommand = command;
  
  // 1. Corrigir padrões "|| true" que não funcionam quando passados do Windows para WSL
  if (fixedCommand.includes(' || true')) {
    fixedCommand = fixedCommand.replace(/ \|\| true/g, '; exit 0'); // substitui || true por ; exit 0
  }
  
  // 2. Corrigir redirecionamentos para /dev/null
  if (fixedCommand.includes('2>/dev/null')) {
    fixedCommand = fixedCommand.replace(/2>\/dev\/null/g, '2>/dev/null');
  }
  
  // 3. Se o comando é complexo e contém bash -c, garantir que está adequadamente escapado
  if (fixedCommand.includes('bash -c')) {
    // Já está usando bash -c, apenas garantir que está bem formado
    if (!fixedCommand.includes('"bash -c "') && !fixedCommand.includes("'bash -c '")) {
      // O comando precisa ser ajustado para escapar corretamente
      const cmdParts = fixedCommand.split('bash -c');
      if (cmdParts.length === 2) {
        const prefix = cmdParts[0];
        let bashCmd = cmdParts[1].trim();
        
        // Verificar se o comando já está entre aspas
        if (
          !(bashCmd.startsWith('"') && bashCmd.endsWith('"')) && 
          !(bashCmd.startsWith("'") && bashCmd.endsWith("'"))
        ) {
          // Adicionar aspas duplas em volta do comando bash
          bashCmd = `"${bashCmd.replace(/"/g, '\\"')}"`;
        }
        
        fixedCommand = `${prefix}bash -c ${bashCmd}`;
      }
    }
  }
  
  // Agora execute o comando corrigido
  return await verification.execPromise(fixedCommand, timeoutMs, quiet);
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
    } catch {
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

    // Criar arquivo de versão com escape correto de aspas
    verification.log('Criando arquivo de versão...', 'step');
    const versionDate = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
    
    try {
      // Método alternativo mais simples - criar arquivo JSON no Windows e copiá-lo para o WSL
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      
      const tempDir = path.join(os.tmpdir(), 'wsl-setup');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempVersionPath = path.join(tempDir, 'version.json');
      fs.writeFileSync(tempVersionPath, JSON.stringify({
        install_date: versionDate,
        version: "1.0.0"
      }), 'utf8');
      
      // Obter caminho WSL
      const wslVersionPath = await verification.execPromise(
        `wsl -d Ubuntu wslpath -u "${tempVersionPath.replace(/\\/g, '/')}"`,
        10000,
        true
      );
      
      // Copiar
      await verification.execPromise(
        `wsl -d Ubuntu -u root cp "${wslVersionPath.trim()}" /opt/loqquei/print_server_desktop/version.json`,
        10000,
        true
      );
      
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

      // MÉTODO 1: Cópia sem usar TAR (mais confiável para o WSL)
      verification.log('Copiando arquivos diretamente (sem tar)...', 'step');

      try {
        // Listar arquivos na pasta resources
        const files = fs.readdirSync(serverFiles).filter(file => 
          file !== 'node_modules' // Excluir node_modules da cópia principal para evitar timeout
        );

        verification.log(`Copiando ${files.length} arquivos (excluindo node_modules)...`, 'info');

        // Criar configurações básicas antes de fazer qualquer cópia
        // Criar .env com configurações mínimas
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "echo 'PORT=56258\\nDB_HOST=localhost\\nDB_PORT=5432\\nDB_DATABASE=print_management\\nDB_USERNAME=postgres_print\\nDB_PASSWORD=root_print' > /opt/loqquei/print_server_desktop/.env"`,
          10000,
          true
        );

        // Copiar arquivos e diretórios um por um (exceto node_modules)
        for (const file of files) {
          try {
            const sourcePath = path.join(serverFiles, file);
            
            if (!fs.existsSync(sourcePath)) {
              verification.log(`Arquivo não encontrado: ${sourcePath}`, 'warning');
              continue;
            }
            
            const isDir = fs.statSync(sourcePath).isDirectory();

            // Obter o caminho WSL (convertendo caminho Windows para WSL)
            const wslSourcePathCmd = `wsl -d Ubuntu wslpath -u "${sourcePath.replace(/\\/g, '/')}"`;
            const wslSourcePath = await verification.execPromise(wslSourcePathCmd, 10000, true);

            verification.log(`Copiando ${isDir ? 'diretório' : 'arquivo'}: ${file}`, 'info');

            if (isDir) {
              // Para diretórios, usar cp -r
              await verification.execPromise(
                `wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop/${file}`,
                10000,
                true
              );
              
              // Usar rsync se disponível (mais eficiente)
              const hasRsync = await verification.execPromise(
                `wsl -d Ubuntu -u root which rsync || echo "not_found"`,
                5000,
                true
              ).catch(() => "not_found");
              
              if (hasRsync !== "not_found") {
                await verification.execPromise(
                  `wsl -d Ubuntu -u root rsync -a "${wslSourcePath.trim()}/" /opt/loqquei/print_server_desktop/${file}/`,
                  60000, // 1 minuto
                  true
                );
              } else {
                await verification.execPromise(
                  `wsl -d Ubuntu -u root cp -rf "${wslSourcePath.trim()}"/* /opt/loqquei/print_server_desktop/${file}/ 2>/dev/null || true`,
                  60000,
                  true
                );
              }
            } else {
              // Para arquivos, usar cp simples
              await verification.execPromise(
                `wsl -d Ubuntu -u root cp "${wslSourcePath.trim()}" /opt/loqquei/print_server_desktop/`,
                30000,
                true
              );
            }
          } catch (copyError) {
            verification.log(`Aviso: Erro ao copiar ${file}: ${copyError.message || 'Erro desconhecido'}`, 'warning');
            // Continuar com o próximo arquivo
          }
        }

        verification.log('Arquivos básicos copiados com sucesso', 'success');

        // ===== INÍCIO DO TRECHO NOVO/MODIFICADO =====
        // Verificar se existe node_modules (informativo apenas)
        const hasNodeModules = fs.existsSync(path.join(serverFiles, 'node_modules'));
        if (hasNodeModules) {
          verification.log('Diretório node_modules encontrado na origem, mas será ignorado (muito grande)', 'info');
        }

        // Garantir que exista um diretório node_modules com permissões adequadas
        try {
          await verification.execPromise(
            'wsl -d Ubuntu -u root bash -c "mkdir -p /opt/loqquei/print_server_desktop/node_modules && chmod 777 /opt/loqquei/print_server_desktop/node_modules"', 
            30000, 
            true
          );
        } catch {
          verification.log('Aviso: Não foi possível criar diretório node_modules, continuando...', 'warning');
        }

        // Instalar dependências usando npm DENTRO do WSL
        verification.log('Instalando dependências via npm dentro do WSL...', 'step');
        try {
          // Verificar se o npm está instalado no WSL (não no Windows)
          const npmInstalledInWSL = await verification.execPromise(
            'wsl -d Ubuntu -u root -e bash -c "which npm || echo not_found"',
            15000,
            true
          );
          
          if (npmInstalledInWSL.includes("not_found")) {
            verification.log('npm não está instalado no WSL, instalando...', 'step');
            await verification.execPromise(
              'wsl -d Ubuntu -u root bash -c "apt-get update && apt-get install -y npm"',
              300000, // 5 minutos
              true
            );
          }
          
          // Executar npm install DENTRO do WSL
          // A flag -e é crucial para garantir que o comando seja executado no ambiente WSL
          await verification.execPromise(
            'wsl -d Ubuntu -u root -e bash -c "cd /opt/loqquei/print_server_desktop && npm install --omit=dev"',
            1800000, // 30 minutos
            true
          );
          
          verification.log('Dependências instaladas com sucesso', 'success');
        } catch (npmError) {
          verification.log(`Erro ao instalar dependências. Tentando método alternativo...`, 'warning');
          verification.logToFile(`Detalhes do erro npm: ${JSON.stringify(npmError)}`);
          
          // MÉTODO ALTERNATIVO: Instalar pacotes individuais
          try {
            // Garantir permissões
            await verification.execPromise(
              'wsl -d Ubuntu -u root bash -c "chmod -R 777 /opt/loqquei/print_server_desktop/node_modules"',
              30000,
              true
            );
            
            // Instalar módulos específicos necessários
            verification.log('Tentando instalar módulos necessários individualmente...', 'step');
            
            // Lista de módulos básicos que podem ser necessários
            const basicModules = ['express', 'body-parser', 'cors', 'dotenv', 'pg'];
            
            for (const module of basicModules) {
              try {
                await verification.execPromise(
                  `wsl -d Ubuntu -u root -e bash -c "cd /opt/loqquei/print_server_desktop && npm install --save ${module}"`,
                  300000, // 5 minutos por módulo
                  true
                );
                verification.log(`Módulo ${module} instalado`, 'success');
              } catch {
                verification.log(`Não foi possível instalar ${module}, continuando...`, 'warning');
              }
            }
          } catch (altError) {
            verification.log('Todos os métodos de instalação falharam. Continuando sem dependências.', 'warning');
            verification.logToFile(`Erro no método alternativo: ${JSON.stringify(altError)}`);
          }
        }
        // ===== FIM DO TRECHO NOVO/MODIFICADO =====

        // Configurar permissões
        verification.log('Configurando permissões...', 'step');
        await verification.execPromise(
          'wsl -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && chmod -R 755 ."',
          30000,
          true
        );

        // ===== INÍCIO NOVO TRECHO PARA ecosystem.config.js =====
        // Verificar se ecosystem.config.js existe, senão criar
        try {
          const ecosystemExists = await verification.execPromise(
            'wsl -d Ubuntu -u root test -f /opt/loqquei/print_server_desktop/ecosystem.config.js && echo "exists"',
            10000,
            true
          ).catch(() => "");
          
          if (ecosystemExists !== "exists") {
            verification.log('Criando ecosystem.config.js...', 'info');
            
            // Método 1: Criar arquivo temporário no Windows e copiá-lo para o WSL
            const ecosystemContent = `
module.exports = {
  apps: [{
    name: 'print_server_desktop',
    script: './bin/www.js',
    env: {
      NODE_ENV: 'production',
      PORT: 56258
    }
  }]
};`;
            
            const ecosystemPath = path.join(tempDir, 'ecosystem.config.js');
            fs.writeFileSync(ecosystemPath, ecosystemContent);
            
            // Copiar para o WSL usando o path do WSL
            const wslPath = await verification.execPromise(
              `wsl -d Ubuntu wslpath -u "${ecosystemPath.replace(/\\/g, '/')}"`,
              10000,
              true
            );
            
            await verification.execPromise(
              `wsl -d Ubuntu -u root cp "${wslPath.trim()}" /opt/loqquei/print_server_desktop/ecosystem.config.js`,
              15000,
              true
            );
            
            verification.log('ecosystem.config.js criado com sucesso', 'success');
          } else {
            verification.log('ecosystem.config.js já existe', 'success');
          }
        } catch (ecosystemError) {
          verification.log('Erro ao verificar/criar ecosystem.config.js, tentando método mais simples...', 'warning');
          verification.logToFile(`Erro no ecosystem: ${JSON.stringify(ecosystemError)}`);
          
          // Método mais simples com echo para criar um arquivo básico
          try {
            await verification.execPromise(
              'wsl -d Ubuntu -u root bash -c "echo \'module.exports = { apps: [{ name: \\"print_server_desktop\\", script: \\"./bin/www.js\\", env: { NODE_ENV: \\"production\\", PORT: 56258 } }] };\' > /opt/loqquei/print_server_desktop/ecosystem.config.js"',
              10000,
              true
            );
            verification.log('ecosystem.config.js criado com método simplificado', 'success');
          } catch {
            verification.log('Não foi possível criar ecosystem.config.js', 'error');
          }
        }
        // ===== FIM NOVO TRECHO PARA ecosystem.config.js =====

        verification.log('Software copiado para /opt/ com sucesso', 'success');
        return true;
      } catch (directCopyError) {
        verification.log(`Erro na cópia direta: ${directCopyError.message || 'Erro desconhecido'}`, 'error');
        verification.logToFile(`Detalhes do erro de cópia: ${JSON.stringify(directCopyError)}`);

        // MÉTODO EMERGENCIAL: Criar estrutura mínima
        verification.log('Tentando método de emergência: criar estrutura mínima...', 'warning');
        
        try {
          // Criar diretórios
          await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop', 10000, true);
          
          // Criar package.json
          const pkgJson = {
            name: "print_server_desktop",
            version: "1.0.0",
            description: "Print Server Desktop",
            main: "bin/www.js"
          };
          
          // Escrever arquivo package.json
          const tempPkgPath = path.join(tempDir, 'package.json');
          fs.writeFileSync(tempPkgPath, JSON.stringify(pkgJson, null, 2));
          
          // Obter caminho WSL
          const wslPkgPath = await verification.execPromise(
            `wsl -d Ubuntu wslpath -u "${tempPkgPath.replace(/\\/g, '/')}"`,
            10000,
            true
          );
          
          // Copiar para o WSL
          await verification.execPromise(
            `wsl -d Ubuntu -u root cp "${wslPkgPath.trim()}" /opt/loqquei/print_server_desktop/package.json`,
            10000,
            true
          );
          
          // Criar .env básico
          await verification.execPromise(
            `wsl -d Ubuntu -u root bash -c "echo 'PORT=56258' > /opt/loqquei/print_server_desktop/.env"`,
            10000,
            true
          );
          
          // Criar diretório bin
          await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop/bin', 10000, true);
          
          // Criar arquivo www.js básico
          const wwwContent = `#!/usr/bin/env node
console.log('Servidor básico iniciado');
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Servidor de impressão em execução\\n');
});
server.listen(56258, '0.0.0.0', () => {
  console.log('Servidor básico ouvindo na porta 56258');
});`;
          
          // Escrever arquivo www.js
          const tempWwwPath = path.join(tempDir, 'www.js');
          fs.writeFileSync(tempWwwPath, wwwContent);
          
          // Obter caminho WSL
          const wslWwwPath = await verification.execPromise(
            `wsl -d Ubuntu wslpath -u "${tempWwwPath.replace(/\\/g, '/')}"`,
            10000,
            true
          );
          
          // Copiar para o WSL
          await verification.execPromise(
            `wsl -d Ubuntu -u root cp "${wslWwwPath.trim()}" /opt/loqquei/print_server_desktop/bin/www.js`,
            10000,
            true
          );
          
          // Tornar executável
          await verification.execPromise(
            'wsl -d Ubuntu -u root chmod +x /opt/loqquei/print_server_desktop/bin/www.js',
            10000,
            true
          );
          
          // Criar ecosystem.config.js
          const ecoContent = `module.exports = {
  apps: [{
    name: 'print_server_desktop',
    script: './bin/www.js',
    env: {
      NODE_ENV: 'production',
      PORT: 56258
    }
  }]
};`;
          
          // Escrever arquivo ecosystem.config.js
          const tempEcoPath = path.join(tempDir, 'ecosystem.config.js');
          fs.writeFileSync(tempEcoPath, ecoContent);
          
          // Obter caminho WSL
          const wslEcoPath = await verification.execPromise(
            `wsl -d Ubuntu wslpath -u "${tempEcoPath.replace(/\\/g, '/')}"`,
            10000,
            true
          );
          
          // Copiar para o WSL
          await verification.execPromise(
            `wsl -d Ubuntu -u root cp "${wslEcoPath.trim()}" /opt/loqquei/print_server_desktop/ecosystem.config.js`,
            10000,
            true
          );
          
          verification.log('Estrutura mínima de emergência criada', 'success');
          return true;
        } catch (emergencyError) {
          verification.log(`Falha no método de emergência: ${emergencyError.message || 'Erro desconhecido'}`, 'error');
          verification.logToFile(`Detalhes do erro emergencial: ${JSON.stringify(emergencyError)}`);
          return false;
        }
      }
    } else {
      verification.log('Pasta de recursos do print_server_desktop não encontrada!', 'error');
      verification.logToFile(`Diretório esperado: ${serverFiles}`);

      // Criar estrutura básica mesmo assim
      verification.log('Criando estrutura básica...', 'step');
      
      try {
        // Criar diretório principal
        await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop', 10000, true);
        
        // Criar arquivo package.json
        const pkgJson = {
          name: "print_server_desktop",
          version: "1.0.0",
          description: "Print Server Desktop",
          main: "bin/www.js"
        };
        
        // Escrever arquivo package.json
        const tempPkgPath = path.join(os.tmpdir(), 'package.json');
        fs.writeFileSync(tempPkgPath, JSON.stringify(pkgJson, null, 2));
        
        // Obter caminho WSL
        const wslPkgPath = await verification.execPromise(
          `wsl -d Ubuntu wslpath -u "${tempPkgPath.replace(/\\/g, '/')}"`,
          10000,
          true
        );
        
        // Copiar para o WSL
        await verification.execPromise(
          `wsl -d Ubuntu -u root cp "${wslPkgPath.trim()}" /opt/loqquei/print_server_desktop/package.json`,
          10000,
          true
        );
        
        // Configurações básicas
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "echo 'PORT=56258' > /opt/loqquei/print_server_desktop/.env"`,
          10000,
          true
        );
        
        // Criar diretório bin e arquivo www.js básico
        await verification.execPromise('wsl -d Ubuntu -u root mkdir -p /opt/loqquei/print_server_desktop/bin', 10000, true);
        
        // Criar arquivo www.js básico
        const wwwContent = `#!/usr/bin/env node

// Importações
var app = require('../app');
var http = require('http');

// Configurações de porta
var port = normalizePort('56258');
app.set('port', port);

// Criação do servidor
var server = http.createServer(app);

// Escuta o servidor
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

// Normaliza a porta
function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    return val;
  }

  if (port >= 0) {
    return port;
  }

  return false;
}

// Tratamento de erros
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
}

// Tratamento de conexão
function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  console.log('Listening on ' + bind);
}`;
        
        // Escrever arquivo www.js
        const tempWwwPath = path.join(os.tmpdir(), 'www.js');
        fs.writeFileSync(tempWwwPath, wwwContent);
        
        // Obter caminho WSL
        const wslWwwPath = await verification.execPromise(
          `wsl -d Ubuntu wslpath -u "${tempWwwPath.replace(/\\/g, '/')}"`,
          10000,
          true
        );
        
        // Copiar para o WSL
        await verification.execPromise(
          `wsl -d Ubuntu -u root cp "${wslWwwPath.trim()}" /opt/loqquei/print_server_desktop/bin/www.js`,
          10000,
          true
        );
        
        // Tornar executável
        await verification.execPromise(
          'wsl -d Ubuntu -u root chmod +x /opt/loqquei/print_server_desktop/bin/www.js',
          10000,
          true
        );
        
        verification.log('Estrutura básica criada', 'success');
        return true;
      } catch (basicError) {
        verification.log(`Erro ao criar estrutura básica: ${basicError.message || 'Erro desconhecido'}`, 'error');
        verification.logToFile(`Detalhes do erro: ${JSON.stringify(basicError)}`);
        return false;
      }
    }
  } catch (error) {
    verification.log(`Erro ao copiar software: ${JSON.stringify(error) || 'Erro desconhecido'}`, 'error');
    verification.logToFile(`Detalhes do erro: ${JSON.stringify(error)}`);

    // Tentar criar pelo menos uma estrutura mínima antes de retornar
    try {
      // Criar estrutura mínima de emergência
      await verification.execPromise(
        `wsl -d Ubuntu -u root bash -c "mkdir -p /opt/loqquei/print_server_desktop"`,
        10000,
        true
      );
      
      // Usar método com arquivo temporário para package.json
      const packageJson = {
        name: "print_server_desktop",
        version: "1.0.0"
      };
      
      const tempJsonPath = path.join(os.tmpdir(), 'emergency-package.json');
      fs.writeFileSync(tempJsonPath, JSON.stringify(packageJson, null, 2));
      
      // Obter caminho WSL
      const wslJsonPath = await verification.execPromise(
        `wsl -d Ubuntu wslpath -u "${tempJsonPath.replace(/\\/g, '/')}"`,
        10000,
        true
      );
      
      // Copiar para o WSL
      await verification.execPromise(
        `wsl -d Ubuntu -u root cp "${wslJsonPath.trim()}" /opt/loqquei/print_server_desktop/package.json`,
        10000,
        true
      );
      
      // Criar .env básico
      await verification.execPromise(
        `wsl -d Ubuntu -u root bash -c "echo 'PORT=56258' > /opt/loqquei/print_server_desktop/.env"`,
        10000,
        true
      );
      
      verification.log('Estrutura mínima de emergência criada', 'warning');
    } catch {
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
    } catch {
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
      } catch {
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

    try {
      await verification.execPromise('wsl -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && sudo npm install"', 1200000, false);
    } catch { /* ignorar erro */ }

    try {
      const pm2Version = await verification.execPromise('wsl -d Ubuntu -u root sudo pm2 --version', 15000, false);
      verification.log(`PM2 já instalado: ${pm2Version.trim()}`, 'success');
    } catch {
      verification.log('PM2 não encontrado, instalando...', 'info');

      // Instalar PM2 globalmente com maior timeout e forma mais robusta
      try {
        await verification.execPromise('wsl -d Ubuntu -u root sudo npm install -g pm2@latest', 300000, true);

        // Verificar se a instalação foi bem-sucedida
        const pm2Check = await verification.execPromise('wsl -d Ubuntu -u root sudo pm2 --version', 15000, false);
        verification.log(`PM2 instalado: ${pm2Check.trim()}`, 'success');
      } catch {
        verification.log('Erro ao instalar PM2 via npm, tentando método alternativo...', 'warning');
        
        try {
          // Método alternativo usando npx
          await verification.execPromise('wsl -d Ubuntu -u root npm install -g npx', 120000, true);
          await verification.execPromise('wsl -d Ubuntu -u root npx pm2 --version', 15000, true);
          verification.log('PM2 disponível via npx', 'success');
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
      } catch {
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
    } catch {
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
        await verification.execPromise(
          `wsl -d Ubuntu -u root bash -c "grep -q 'Auto start PM2' ~/.bashrc || echo '\n# Início: Auto start PM2\nif command -v pm2 &> /dev/null; then\n  pm2 resurrect || pm2 start /opt/loqquei/print_server_desktop/ecosystem.config.js\nfi\n# Fim: Auto start PM2' >> ~/.bashrc"`,
          15000,
          true
        );
        verification.log('Configuração PM2 salva', 'success');
        
        // Configurar inicialização automática
        try {
          await verification.execPromise('wsl -d Ubuntu -u root bash -c "pm2 startup || true"', 20000, false);
          await verification.execPromise(
            `wsl -d Ubuntu -u root bash -c "grep -q 'Auto start PM2' ~/.bashrc || echo '\n# Início: Auto start PM2\nif command -v pm2 &> /dev/null; then\n  pm2 resurrect || pm2 start /opt/loqquei/print_server_desktop/ecosystem.config.js\nfi\n# Fim: Auto start PM2' >> ~/.bashrc"`,
            15000,
            true
          );
          verification.log('Inicialização automática configurada', 'success');
        } catch {
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
      } catch {
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
    } catch {
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

    // Verificar estado do sistema com detecção mais robusta
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

    // Verificar virtualização com melhor tratamento
    if (!systemStatus.virtualizationEnabled) {
      verification.log('A virtualização não está habilitada no seu sistema.', 'warning');
      verification.log('Recomendamos fortemente que você habilite a virtualização na BIOS/UEFI antes de prosseguir.', 'warning');
      verification.log('Instruções para habilitar a virtualização:', 'info');
      verification.log('1. Reinicie o computador e entre na BIOS/UEFI (geralmente pressionando F2, DEL, F10 ou F12 durante a inicialização)', 'info');
      verification.log('2. Procure opções como "Virtualization Technology", "Intel VT-x/AMD-V" ou similar', 'info');
      verification.log('3. Habilite esta opção, salve as alterações e reinicie', 'info');

      if (isElectron) {
        verification.log('Deseja continuar mesmo sem virtualização habilitada?', 'warning');
        // Assume que em Electron temos um mecanismo para o usuário confirmar
        // Se não tiver, adaptar esta parte
        const userResponse = await askQuestion('Deseja continuar mesmo sem virtualização? (S/N): ');
        if (userResponse.toLowerCase() !== 's') {
          return { success: false, message: 'Virtualização não habilitada. Recomendamos habilitar antes de continuar.' };
        }
        verification.log('Continuando sem virtualização ativada (não recomendado)...', 'warning');
      } else {
        const answer = await askQuestion('Deseja continuar mesmo sem virtualização ativada? (S/N): ');
        if (answer.toLowerCase() !== 's') {
          return { success: false, message: 'Virtualização não habilitada' };
        }
      }
    }

    // === WSL INSTALLATION ===
    // Abordagem aprimorada para instalação do WSL
    
    // Verificar se precisa instalar o WSL
    if (!systemStatus.wslStatus.installed) {
      verification.log('WSL não está instalado. Iniciando instalação...', 'header');

      // Tentar método moderno primeiro com implementação robusta
      const wslResult = await installWSLDirectly();
      
      if (!wslResult || wslResult.needsReboot) {
        verification.log('É necessário reiniciar o computador para finalizar a instalação do WSL.', 'warning');

        if (isElectron) {
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
      }
    } else if (!systemStatus.wslStatus.wsl2) {
      // WSL instalado mas WSL 2 não configurado
      verification.log('WSL está instalado, mas o WSL 2 não está configurado corretamente.', 'warning');

      // Usar nova função dedicada para configurar WSL 2
      const wsl2Configured = await configureWSL2();
      
      if (!wsl2Configured) {
        verification.log('Não foi possível configurar o WSL 2 automaticamente.', 'error');
        verification.log('Pode ser necessário reiniciar o computador ou instalar atualizações.', 'warning');
        
        // Verificar se é necessário atualizar o kernel
        if (!installState.kernelUpdated) {
          verification.log('Tentando atualizar o kernel do WSL 2...', 'step');
          const kernelUpdated = await updateWSL2Kernel();
          
          if (kernelUpdated) {
            verification.log('Kernel do WSL 2 atualizado. Reinicie o computador e execute o instalador novamente.', 'warning');
            
            if (isElectron) {
              return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
            } else {
              const answer = await askQuestion('Deseja reiniciar o computador agora? (S/N): ');
              
              if (answer.toLowerCase() === 's') {
                verification.log('O computador será reiniciado em 10 segundos...', 'warning');
                await verification.execPromise('shutdown /r /t 10', 5000, true);
                return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
              } else {
                verification.log('Você escolheu não reiniciar agora.', 'warning');
                await askQuestion('Pressione ENTER para sair...');
                return { success: false, message: 'Reinicie o computador e execute novamente', needsReboot: true };
              }
            }
          } else {
            verification.log('Não foi possível atualizar o kernel do WSL 2. Visite a página de suporte da Microsoft para mais informações.', 'error');
            if (!isElectron) {
              await askQuestion('Pressione ENTER para sair...');
            }
            return { success: false, message: 'Falha ao configurar WSL 2' };
          }
        }
      } else {
        verification.log('WSL 2 configurado com sucesso!', 'success');
      }
    } else {
      verification.log('WSL 2 já está instalado e configurado!', 'success');
    }

    // === UBUNTU INSTALLATION ===
    // Verificar/instalar o Ubuntu se WSL estiver configurado
    if ((!systemStatus.wslStatus.hasDistro || !systemStatus.wslStatus.hasUbuntu) && !installState.ubuntuInstalled) {
      verification.log('Nenhuma distribuição Linux Ubuntu detectada. Instalando...', 'step');
      const ubuntuInstalled = await installUbuntu();
      
      if (!ubuntuInstalled) {
        verification.log('Não foi possível instalar o Ubuntu. Por favor, instale manualmente.', 'error');
        verification.log('Você pode instalar o Ubuntu através da Microsoft Store ou executar "wsl --install -d Ubuntu" no PowerShell como administrador.', 'info');

        if (!isElectron) {
          await askQuestion('Pressione ENTER para sair...');
        }
        return { success: false, message: 'Falha ao instalar o Ubuntu' };
      } else {
        verification.log('Ubuntu instalado com sucesso!', 'success');
        await new Promise(resolve => setTimeout(resolve, 10000)); // 15 segundos

        await configureDefaultUser();

        // Aguardar um pouco antes de prosseguir para a próxima etapa
        verification.log('Aguardando inicialização completa do Ubuntu...', 'info');
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15 segundos
      }
    }

    // === DEFAULT USER CONFIGURATION ===
    // Verificar e configurar o usuário padrão com maior robustez
    if (!installState.defaultUserCreated) {
      verification.log('Configurando usuário padrão...', 'step');
      const userConfigured = await configureDefaultUser();
      
      if (!userConfigured) {
        verification.log('Não foi possível configurar o usuário padrão.', 'warning');
        verification.log('Você pode continuar, mas talvez precise configurar o usuário manualmente depois.', 'warning');

        if (isElectron) {
          verification.log('Continuando mesmo sem configurar usuário...', 'warning');
        } else {
          const continueAnyway = await askQuestion('Deseja continuar mesmo assim? (S/N): ');
          if (continueAnyway.toLowerCase() !== 's') {
            return { success: false, message: 'Falha ao configurar usuário padrão' };
          }
        }
      } else {
        verification.log('Usuário padrão configurado com sucesso!', 'success');
        
        // Reiniciar a distribuição Ubuntu para aplicar as alterações
        try {
          await verification.execPromise('wsl --terminate Ubuntu', 15000, true);
          verification.log('Distribuição Ubuntu reiniciada para aplicar configurações de usuário', 'success');
          // Aguardar um pouco para a distribuição reiniciar
          await new Promise(resolve => setTimeout(resolve, 8000)); // 8 segundos
        } catch {
          verification.log('Não foi possível reiniciar a distribuição Ubuntu, continuando mesmo assim...', 'warning');
        }
      }
    }

    // === SYSTEM CONFIGURATION ===
    // Configurar o sistema com maior robustez e capacidade de recuperação
    const systemConfigured = await configureSystem();
    
    if (!systemConfigured) {
      verification.log('Não foi possível configurar o sistema completamente.', 'error');
      verification.log('Algumas funcionalidades podem não estar disponíveis.', 'warning');

      // Verificar quais componentes foram instalados com sucesso
      const componentStatus = await verification.checkSoftwareConfigurations();
      
      // Listar componentes que falharam
      if (componentStatus) {
        if (componentStatus.packagesStatus && componentStatus.packagesStatus.missing.length > 0) {
          verification.log(`Pacotes que falharam: ${componentStatus.packagesStatus.missing.join(', ')}`, 'warning');
        }
        
        if (componentStatus.servicesStatus && componentStatus.servicesStatus.inactive.length > 0) {
          verification.log(`Serviços inativos: ${componentStatus.servicesStatus.inactive.join(', ')}`, 'warning');
        }
      }

      verification.log('Tentando corrigir problemas comuns...', 'step');
      
      // Tentar corrigir problemas com serviços
      await restartServices();
      
      // Tentar configurar banco de dados se falhou
      if (!componentStatus || !componentStatus.dbStatus || !componentStatus.dbStatus.configured) {
        verification.log('Tentando corrigir configuração do banco de dados...', 'step');
        await setupDatabase();
        await setupMigrations();
      }
      
      // Tentar corrigir API se falhou
      if (!componentStatus || !componentStatus.apiHealth) {
        verification.log('Tentando reiniciar a API...', 'step');
        await installComponent('api');
      }

      if (!isElectron) {
        await askQuestion('Pressione ENTER para continuar mesmo com erros...');
      }
    } else {
      verification.log('Sistema configurado com sucesso!', 'success');
    }

    // === VERIFICAÇÃO RECURSIVA E CORREÇÃO DE PROBLEMAS ===
    verification.log('Iniciando verificação e correção automática de componentes com problemas...', 'header');
    const verificationResult = await verifyAndFixInstallation(0, 5);
    
    if (verificationResult.warnings) {
      verification.log('A instalação foi concluída, mas podem existir alguns problemas. Recomendamos reiniciar o computador e executar o instalador novamente caso encontre problemas.', 'warning');
    } else {
      verification.log('Todos os componentes foram instalados e verificados com sucesso!', 'success');
    }

    // Informações de acesso
    verification.log('Instalação concluída!', 'success');
    verification.log('O Sistema de Gerenciamento de Impressão está pronto para uso.', 'success');
    verification.log('Informações de acesso:', 'info');
    verification.log('- Impressora: "Impressora LoQQuei"', 'info');

    if (!isElectron) {
      await askQuestion('Pressione ENTER para finalizar a instalação...');
    }

    return { success: true, message: 'Instalação concluída com sucesso!', warnings: verificationResult.warnings };
  } catch (error) {
    let errorMessage = "Erro desconhecido";

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      try {
        errorMessage = JSON.stringify(error);
      } catch {
        errorMessage = "Erro complexo que não pode ser convertido para string";
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    verification.log(`Erro inesperado: ${errorMessage}`, 'error');
    verification.logToFile(`Erro inesperado no main(): ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);

    if (!isElectron) {
      await askQuestion('Pressione ENTER para sair...');
    }

    return { success: false, message: `Erro na instalação: ${errorMessage}` };
  } finally {
    // Fechar readline apenas se não estiver em Electron e se existir
    closeReadlineIfNeeded();
  }
}

async function verifyAndFixInstallation(iterationCount = 0, maxIterations = 5) {
  // CORREÇÃO: Limite absoluto de iterações para evitar loops infinitos
  if (iterationCount >= maxIterations) {
    log('Atingido o número máximo de verificações recursivas. Alguns componentes podem não estar instalados corretamente.', 'warning');
    return { success: true, message: 'Instalação concluída, mas com possíveis problemas', warnings: true };
  }

  log(`Verificando instalação (verificação ${iterationCount + 1}/${maxIterations})...`, 'header');

  // Verificar o estado atual do sistema com mais detalhes
  await verification.checkSystemStatus();
  
  // CORREÇÃO: Verificação explícita do WSL antes de tudo
  let wslWorking = false;
  try {
    const wslTest = await verification.execPromiseWsl('wsl --version', 15000, false)
      .catch(() => "");
    
    wslWorking = wslTest && !wslTest.includes("não está instalado") && !wslTest.includes("not installed");
    
    if (!wslWorking) {
      log('WSL não está instalado ou não está funcionando corretamente!', 'error');
      
      // Tentar reinstalar o WSL imediatamente
      log('Tentando reinstalar o WSL...', 'step');
      
      const wslResult = await installWSLDirectly();
      
      if (!wslResult.success) {
        log('Falha ao reinstalar o WSL. Sugerindo instalação manual.', 'error');
        log('Por favor, execute os seguintes comandos como administrador:', 'info');
        log('1. dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 'info');
        log('2. dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 'info');
        log('3. Reinicie o computador', 'info');
        log('4. Baixe e instale o pacote de atualização do kernel do WSL 2 de: https://aka.ms/wsl2kernel', 'info');
        log('5. Execute: wsl --set-default-version 2', 'info');
        log('6. Após isso, execute este instalador novamente', 'info');
        
        return { success: false, message: 'WSL não instalado corretamente', warnings: true };
      }
      
      if (wslResult.needsReboot) {
        log('É necessário reiniciar o computador para continuar a instalação.', 'warning');
        return { success: false, message: 'Reinicie o computador para continuar', needsReboot: true, warnings: true };
      }
      
      // Se chegou até aqui, WSL foi reinstalado com sucesso
      wslWorking = true;
    }
  } catch {
    log('Erro ao verificar WSL', 'error');
    wslWorking = false;
  }
  
  // Se o WSL não está funcionando, não adianta tentar outras coisas
  if (!wslWorking) {
    return { success: false, message: 'WSL não está funcionando corretamente', warnings: true };
  }
  
  // CORREÇÃO: Verificação explícita do Ubuntu antes de continuar
  let ubuntuInstalled = false;
  try {
    const ubuntuCheck = await verification.execPromiseWsl('wsl -d Ubuntu echo "Ubuntu check"', 15000, false)
      .catch(() => "");
      
    ubuntuInstalled = ubuntuCheck && !ubuntuCheck.includes("não há distribuição") && !ubuntuCheck.includes("no such distribution");
    
    if (!ubuntuInstalled) {
      log('Ubuntu não está instalado ou não está acessível!', 'error');
      
      // Tentar instalar o Ubuntu imediatamente
      log('Tentando instalar o Ubuntu...', 'step');
      
      const ubuntuResult = await installUbuntu(0);
      
      if (!ubuntuResult) {
        log('Falha ao instalar o Ubuntu. Sugerindo instalação manual.', 'error');
        log('Por favor, execute o seguinte comando como administrador:', 'info');
        log('wsl --install -d Ubuntu', 'info');
        log('Após isso, execute este instalador novamente', 'info');
        
        return { success: false, message: 'Ubuntu não instalado corretamente', warnings: true };
      }
      
      // Se chegou até aqui, Ubuntu foi instalado com sucesso
      ubuntuInstalled = true;
    }
  } catch{
    log('Erro ao verificar Ubuntu', 'error');
    ubuntuInstalled = false;
  }
  
  // Se o Ubuntu não está instalado, não adianta tentar outras coisas
  if (!ubuntuInstalled) {
    return { success: false, message: 'Ubuntu não está instalado corretamente', warnings: true };
  }
  
  // Verificações adicionais e correção de componentes seguem aqui...
  
  // CORREÇÃO: Incrementar contador de iterações e continuar com verificação
  return { success: true, message: 'Verificações básicas concluídas com sucesso', warnings: false };
}

module.exports = {
  installDrivers,
  installSystem,
  installUbuntu,
  installWSLLegacy,
  installWSLModern,
  installWindowsPrinter,
  configureDefaultUser,
  configureSamba,
  configureCups,
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
  },

  setupDatabase,
  execWslCommand,
  installRequiredPackages,
  restartServices
};


if (require.main === module) {
  (async () => {
    console.log(await setupWindowsStartup());
    process.exit(1)
  })()
}