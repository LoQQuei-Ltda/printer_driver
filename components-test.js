/**
 * Utilitário para testar componentes individuais da instalação
 * Permite selecionar e executar uma função específica para diagnóstico
 */

const installer = require('./installer');
const verification = require('./verification');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Configurar interface de readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configurar arquivo de log
const COMPONENT_LOG_FILE = path.join(process.cwd(), 'teste_componentes.log');
verification.initLogFile(COMPONENT_LOG_FILE);

// Função para fazer perguntas
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Função para testar componentes específicos
async function testComponent(name, func, ...args) {
  console.log(`\n\x1b[1m\x1b[36mTestando: ${name}\x1b[0m`);
  console.time(name);
  
  try {
    const result = await func(...args);
    console.timeEnd(name);
    console.log(`\x1b[32mTeste concluído com sucesso!\x1b[0m`);
    
    // Exibir resultado se não for muito grande
    if (result !== undefined) {
      if (typeof result === 'object') {
        console.log('\nResultado:');
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nResultado: ${result}`);
      }
    }
    
    return result;
  } catch (error) {
    console.timeEnd(name);
    console.log(`\x1b[31mErro durante o teste: ${error.message}\x1b[0m`);
    if (error.stdout) console.log(`\nStdout: ${error.stdout}`);
    if (error.stderr) console.log(`\nStderr: ${error.stderr}`);
    console.log(`\nConsulte ${COMPONENT_LOG_FILE} para mais detalhes.`);
    return null;
  }
}

// Lista de componentes testáveis
const testableComponents = [
  { name: "1. Verificar privilégios de administrador", func: verification.checkAdminPrivileges },
  { name: "2. Verificar versão do Windows", func: verification.checkWindowsVersion },
  { name: "3. Verificar virtualização", func: verification.checkVirtualization },
  { name: "4. Verificar status do WSL", func: verification.checkWSLStatusDetailed },
  { name: "5. Verificar instalação do Ubuntu", func: verification.checkUbuntuInstalled },
  { name: "6. Verificar API", func: verification.checkApiHealth },
  { name: "7. Verificar regras de firewall", func: verification.checkFirewallRules },
  { name: "8. Verificar configuração do banco de dados", func: verification.checkDatabaseConfiguration },
  { name: "9. Verificação completa do software", func: verification.checkSoftwareConfigurations },
  { name: "10. Instalar pacotes", func: installer.installRequiredPackages },
  { name: "11. Configurar Samba", func: installer.configureSamba },
  { name: "12. Configurar CUPS", func: installer.configureCups },
  { name: "13. Configurar firewall", func: installer.configureFirewall },
  { name: "14. Configurar banco de dados", func: installer.setupDatabase },
  { name: "15. Copiar software para /opt", func: installer.copySoftwareToOpt },
  { name: "16. Configurar script de atualização", func: installer.setupUpdateScript },
  { name: "17. Configurar PM2", func: installer.setupPM2 },
  { name: "18. Executar comandos WSL personalizados", func: executeCustomCommand }
];

// Função para executar comandos WSL personalizados
async function executeCustomCommand() {
  const command = await question("\nDigite o comando WSL a ser executado (ex: wsl -d Ubuntu ls -la): ");
  if (!command) return null;
  
  console.log(`\nExecutando: ${command}`);
  
  try {
    const result = await verification.execPromise(command, 30000, false);
    console.log("\nResultado:");
    console.log(result);
    return result;
  } catch (error) {
    console.log(`\n\x1b[31mErro ao executar comando: ${error.message}\x1b[0m`);
    if (error.stdout) console.log(`\nStdout: ${error.stdout}`);
    if (error.stderr) console.log(`\nStderr: ${error.stderr}`);
    return null;
  }
}

// Menu principal
async function mainMenu() {
  console.log("\n\x1b[1m\x1b[44m\x1b[37m==============================================\x1b[0m");
  console.log("\x1b[1m\x1b[44m\x1b[37m TESTADOR DE COMPONENTES DA INSTALAÇÃO        \x1b[0m");
  console.log("\x1b[1m\x1b[44m\x1b[37m==============================================\x1b[0m\n");
  
  console.log("Selecione um componente para testar:\n");
  
  testableComponents.forEach(component => {
    console.log(component.name);
  });
  
  console.log("\n0. Sair");
  
  const choice = await question("\nEscolha uma opção: ");
  
  if (choice === '0') {
    console.log("\nSaindo...");
    rl.close();
    return;
  }
  
  const choiceNum = parseInt(choice, 10);
  if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > testableComponents.length) {
    console.log("\n\x1b[31mOpção inválida. Por favor, tente novamente.\x1b[0m");
    return mainMenu();
  }
  
  const selected = testableComponents[choiceNum - 1];
  await testComponent(selected.name, selected.func);
  
  const again = await question("\nDeseja testar outro componente? (S/n): ");
  if (again.toLowerCase() !== 'n') {
    return mainMenu();
  }
  
  console.log("\nSaindo...");
  rl.close();
}

// Executar o menu principal
mainMenu()
  .catch(error => {
    console.error(`\n\x1b[31mErro inesperado: ${error.message}\x1b[0m`);
    rl.close();
  });