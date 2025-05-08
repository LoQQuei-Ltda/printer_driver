/**
 * Script para execução passo a passo da instalação do Sistema de Gerenciamento de Impressão
 * Este script permite testar cada etapa individualmente, com opção de continuar ou parar
 */

const installer = require('./installer');
const verification = require('./verification');
const path = require('path');
const readline = require('readline');

// Configurar interface de leitura para entrada do usuário
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configurar arquivo de log
const STEP_LOG_FILE = path.join(process.cwd(), 'instalacao_passo_a_passo.log');
verification.initLogFile(STEP_LOG_FILE);

// Função para perguntar ao usuário
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(`\x1b[33m${question}\x1b[0m`, (answer) => {
      resolve(answer);
    });
  });
}

// Função para executar uma etapa com confirmação do usuário
async function runStepWithConfirmation(stepName, stepFunction, ...args) {
  console.log(`\n\x1b[1m\x1b[36m=== PASSO: ${stepName} ===\x1b[0m\n`);
  
  const answer = await askQuestion(`Deseja executar o passo "${stepName}"? (S/n): `);
  if (answer.toLowerCase() === 'n') {
    console.log(`\x1b[33mPasso "${stepName}" pulado pelo usuário\x1b[0m`);
    return null;
  }
  
  console.log(`\x1b[34mExecutando: ${stepName}...\x1b[0m`);
  console.time(stepName);
  
  try {
    const result = await stepFunction(...args);
    console.timeEnd(stepName);
    console.log(`\x1b[32mPasso "${stepName}" concluído com sucesso\x1b[0m`);
    
    // Aguardar confirmação para continuar
    await askQuestion('Pressione ENTER para continuar...');
    
    return result;
  } catch (error) {
    console.timeEnd(stepName);
    console.log(`\x1b[31mErro no passo "${stepName}": ${error.message}\x1b[0m`);
    
    const continueAnswer = await askQuestion('Ocorreu um erro. Deseja continuar mesmo assim? (s/N): ');
    if (continueAnswer.toLowerCase() !== 's') {
      throw new Error(`Instalação interrompida no passo "${stepName}"`);
    }
    
    return null;
  }
}

// Função principal para instalação passo a passo
async function runStepByStepInstallation() {
  console.log("\n\x1b[1m\x1b[44m\x1b[37m=============================================\x1b[0m");
  console.log("\x1b[1m\x1b[44m\x1b[37m INSTALAÇÃO PASSO A PASSO DO SISTEMA         \x1b[0m");
  console.log("\x1b[1m\x1b[44m\x1b[37m=============================================\x1b[0m\n");
  
  try {
    // 1. Verificação do sistema
    console.log("\n\x1b[1m\x1b[35m>>> FASE 1: VERIFICAÇÃO DO SISTEMA\x1b[0m\n");
    
    const systemStatus = await runStepWithConfirmation(
      "Verificação completa do sistema",
      verification.checkSystemStatus,
      {}
    );
    
    if (systemStatus) {
      console.log("\nResultados da verificação:");
      console.log(`- Admin: ${systemStatus.adminPrivileges ? '✅' : '❌'}`);
      console.log(`- Windows compatível: ${systemStatus.windowsCompatible ? '✅' : '❌'}`);
      console.log(`- Virtualização: ${systemStatus.virtualizationEnabled ? '✅' : '⚠️'}`);
      console.log(`- WSL instalado: ${systemStatus.wslStatus.installed ? '✅' : '❌'}`);
      console.log(`- WSL2 configurado: ${systemStatus.wslStatus.wsl2 ? '✅' : '❌'}`);
      console.log(`- Distro instalada: ${systemStatus.wslStatus.hasDistro ? '✅' : '❌'}`);
      console.log(`- Ubuntu instalado: ${systemStatus.ubuntuInstalled ? '✅' : '❌'}`);
      console.log(`- Sistema configurado: ${systemStatus.systemConfigured ? '✅' : '❌'}`);
    }
    
    // 2. Instalação do WSL (se necessário)
    if (!systemStatus || !systemStatus.wslStatus.installed) {
      console.log("\n\x1b[1m\x1b[35m>>> FASE 2: INSTALAÇÃO DO WSL\x1b[0m\n");
      
      // Tentar primeiro o método moderno
      await runStepWithConfirmation(
        "Instalação do WSL (método moderno)",
        installer.installWSLModern
      );
      
      // Se quiser tentar o método legado mesmo que o moderno funcione
      await runStepWithConfirmation(
        "Instalação do WSL (método legado)",
        installer.installWSLLegacy
      );
      
      console.log("\n\x1b[33mPode ser necessário reiniciar o computador para continuar.\x1b[0m");
      const rebootAnswer = await askQuestion("Deseja continuar mesmo assim? (S/n): ");
      if (rebootAnswer.toLowerCase() === 'n') {
        console.log("Reinicie o computador e execute este script novamente.");
        return;
      }
    }
    
    // 3. Instalação do Ubuntu (se necessário)
    if (!systemStatus || !systemStatus.wslStatus.hasDistro || !systemStatus.ubuntuInstalled) {
      console.log("\n\x1b[1m\x1b[35m>>> FASE 3: INSTALAÇÃO DO UBUNTU\x1b[0m\n");
      
      await runStepWithConfirmation(
        "Instalação do Ubuntu",
        installer.installUbuntu
      );
    }
    
    // 4. Configuração do usuário
    console.log("\n\x1b[1m\x1b[35m>>> FASE 4: CONFIGURAÇÃO DO USUÁRIO\x1b[0m\n");
    
    await runStepWithConfirmation(
      "Configuração do usuário padrão",
      installer.configureDefaultUser
    );
    
    // 5. Instalação de pacotes
    console.log("\n\x1b[1m\x1b[35m>>> FASE 5: INSTALAÇÃO DE PACOTES\x1b[0m\n");
    
    await runStepWithConfirmation(
      "Instalação de pacotes",
      installer.installRequiredPackages
    );
    
    // 6. Configuração de serviços
    console.log("\n\x1b[1m\x1b[35m>>> FASE 6: CONFIGURAÇÃO DE SERVIÇOS\x1b[0m\n");
    
    await runStepWithConfirmation(
      "Configuração do Samba",
      installer.configureSamba
    );
    
    await runStepWithConfirmation(
      "Configuração do CUPS",
      installer.configureCups
    );
    
    // 7. Configuração do banco de dados
    console.log("\n\x1b[1m\x1b[35m>>> FASE 7: CONFIGURAÇÃO DO BANCO DE DADOS\x1b[0m\n");
    
    await runStepWithConfirmation(
      "Configuração do banco de dados",
      installer.setupDatabase
    );
    
    // 8. Configuração do firewall
    console.log("\n\x1b[1m\x1b[35m>>> FASE 8: CONFIGURAÇÃO DO FIREWALL\x1b[0m\n");
    
    await runStepWithConfirmation(
      "Configuração do firewall",
      installer.configureFirewall
    );
    
    // 9. Cópia e configuração do software
    console.log("\n\x1b[1m\x1b[35m>>> FASE 9: CÓPIA E CONFIGURAÇÃO DO SOFTWARE\x1b[0m\n");
    
    await runStepWithConfirmation(
      "Cópia do software para /opt",
      installer.copySoftwareToOpt
    );
    
    await runStepWithConfirmation(
      "Configuração do script de atualização",
      installer.setupUpdateScript
    );
    
    await runStepWithConfirmation(
      "Instalação dos drivers",
      installer.installDrivers
    );
    
    await runStepWithConfirmation(
      "Execução das migrações de banco de dados",
      installer.setupMigrations
    );
    
    await runStepWithConfirmation(
      "Configuração do PM2",
      installer.setupPM2
    );
    
    await runStepWithConfirmation(
      "Limpeza do sistema",
      installer.systemCleanup
    );
    
    // 10. Verificação final
    console.log("\n\x1b[1m\x1b[35m>>> FASE 10: VERIFICAÇÃO FINAL\x1b[0m\n");
    
    const apiHealth = await runStepWithConfirmation(
      "Verificação da API",
      verification.checkApiHealth
    );
    
    if (apiHealth === false) {
      console.log("\n\x1b[33mAPI não está respondendo. Tentando reiniciar...\x1b[0m");
      
      await runStepWithConfirmation(
        "Reinício do serviço",
        verification.execPromise,
        'wsl -d Ubuntu -u root bash -c "cd /opt/print_server/print_server_desktop && pm2 restart all"',
        30000,
        true
      );
      
      console.log("\x1b[33mAguardando inicialização do serviço (15 segundos)...\x1b[0m");
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      await runStepWithConfirmation(
        "Verificação da API após reinício",
        verification.checkApiHealth
      );
    }
    
    const fullConfig = await runStepWithConfirmation(
      "Verificação completa da configuração",
      verification.checkSoftwareConfigurations
    );
    
    // Resumo final
    console.log("\n\x1b[1m\x1b[42m\x1b[30m===========================================\x1b[0m");
    console.log("\x1b[1m\x1b[42m\x1b[30m INSTALAÇÃO PASSO A PASSO CONCLUÍDA         \x1b[0m");
    console.log("\x1b[1m\x1b[42m\x1b[30m===========================================\x1b[0m\n");
    
    if (fullConfig && fullConfig.fullyConfigured) {
      console.log("\x1b[32mO sistema está completamente configurado e operacional!\x1b[0m");
    } else {
      console.log("\x1b[33mA instalação foi concluída, mas alguns componentes podem não estar configurados corretamente.\x1b[0m");
      console.log("Verifique o arquivo de log para mais detalhes.");
    }
    
    try {
      // Obter IP local
      const localIp = (await verification.execPromise('wsl -d Ubuntu hostname -I', 10000, true)).trim().split(' ')[0];
      console.log(`\nAcesse http://${localIp}:56257 em um navegador para utilizar o sistema.\n`);
    } catch {
      console.log("\nNão foi possível determinar o endereço IP. Verifique a rede e as configurações.\n");
    }
    
  } catch (error) {
    console.error(`\n\x1b[31mErro durante a instalação: ${error.message}\x1b[0m`);
    console.error(`Detalhes disponíveis no arquivo de log: ${STEP_LOG_FILE}`);
  } finally {
    // Fechar a interface readline
    rl.close();
  }
}

// Executar a instalação passo a passo
runStepByStepInstallation()
  .catch(error => {
    console.error(`Erro não tratado: ${error}`);
    rl.close();
    process.exit(1);
  });