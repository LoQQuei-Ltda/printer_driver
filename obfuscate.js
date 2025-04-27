/**
 * Script de Ofuscação Avançada para Proteção de Código
 * Este script ofusca arquivos JS e SQL com proteções avançadas
 * Versão melhorada para processar arquivos em resources/
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JavaScriptObfuscator = require('javascript-obfuscator');
const glob = require('glob');
const uglifyJS = require('uglify-js');

// Chave de criptografia (gerada aleatoriamente a cada execução)
const ENCRYPTION_KEY = crypto.randomBytes(32);
const IV_LENGTH = 16;

// Configurações de ofuscação extrema para JavaScript
const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.5,
  debugProtection: true,
  debugProtectionInterval: 3000,
  disableConsoleOutput: true,
  domainLock: [], // Adicione domínios se necessário
  identifierNamesGenerator: 'hexadecimal',
  identifiersPrefix: '',
  log: false,
  numbersToExpressions: true,
  optionsPreset: 'high-obfuscation',
  renameGlobals: false,
  renameProperties: true,
  reservedNames: [],
  seed: Math.random() * 10000000, // Seed aleatório para dificultar a reversão
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 3,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 1,
  stringArrayEncoding: ['rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 5,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 5,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 1,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

// Configurações menos agressivas para scripts em resources
const resourcesJsOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false, // Desativado para scripts que podem ser executados no WSL
  disableConsoleOutput: false, // Manter console.log para recursos
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false, // Evitar renomear propriedades em scripts de servidor
  selfDefending: false, // Desativado para scripts no WSL
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: false // Desativado para scripts em resources
};

// Configurações específicas para SQL
const sqlObfuscationOptions = {
  compact: true,
  controlFlowFlattening: false, // Evita quebrar SQL queries
  identifierNamesGenerator: 'hexadecimal',
  renameProperties: false, // Evita quebrar nomes de tabelas/colunas
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 1
};

// Lista de arquivos/diretórios que nunca devem ser ofuscados
const globalExclusions = [
  'node_modules',
  '.git',
  '.github',
  'package-lock.json',
  'yarn.lock',
  'LICENSE',
  'README.md',
  '.gitignore',
  '.DS_Store',
  'Thumbs.db'
];

// Extensões de arquivos que não devem ser ofuscados
const nonObfuscatableExtensions = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.wav', '.ogg', '.pdf', '.zip', '.tar', '.gz', '.7z',
  '.css', '.scss', '.less', '.json', '.md', '.csv', '.tsv'
];

// Arquivos específicos que não devem ser ofuscados
const specificExclusions = [
  'ecosystem.config.js', // Pode ser necessário para PM2
  'update.sh',
  'install_wsl_ubuntu.ps1',
  'update_wsl.ps1'
];

// Função para criptografar strings
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Função para descriptografar strings em runtime (será incluída no código ofuscado)
function getDecryptFunction() {
  return `
    function __decrypt(text) {
      const crypto = require('crypto');
      const ENCRYPTION_KEY = Buffer.from("${ENCRYPTION_KEY.toString('hex')}", 'hex');
      const textParts = text.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encryptedText = Buffer.from(textParts.join(':'), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    }
  `;
}

// Verifica se um arquivo deve ser excluído da ofuscação
function shouldExclude(filePath) {
  const filename = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();
  
  // Verificar exclusões globais
  if (globalExclusions.includes(filename)) return true;
  
  // Verificar extensões não ofuscáveis
  if (nonObfuscatableExtensions.includes(extension)) return true;
  
  // Verificar exclusões específicas
  if (specificExclusions.includes(filename)) return true;
  
  return false;
}

// Determina se um arquivo está na pasta resources e deve usar configurações menos agressivas
function isResourcesFile(filePath) {
  return filePath.includes('resources') || 
         filePath.includes('print_server_desktop') || 
         filePath.includes('scripts');
}

// Função para ofuscar arquivo JavaScript
function obfuscateJSFile(filePath, outputPath) {
  console.log(`Ofuscando JS: ${filePath}`);
  
  try {
    // Verificar se o arquivo deve ser excluído da ofuscação
    if (shouldExclude(filePath)) {
      console.log(`⚠️ Pulando arquivo excluído: ${filePath}`);
      
      // Apenas copiar o arquivo para o destino
      const targetDir = path.dirname(outputPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.copyFileSync(filePath, outputPath);
      return true;
    }
    
    let code = fs.readFileSync(filePath, 'utf8');
    
    // Decidir quais opções de ofuscação usar com base no caminho do arquivo
    const options = isResourcesFile(filePath) ? resourcesJsOptions : obfuscationOptions;
    
    // Primeiro passo: minificar com UglifyJS (pular para arquivos em resources)
    if (!isResourcesFile(filePath)) {
      try {
        const minified = uglifyJS.minify(code, {
          compress: {
            dead_code: true,
            global_defs: {
              "@console.log": "function(){}",
              DEBUG: false
            },
            passes: 3
          },
          mangle: {
            properties: {
              keep_quoted: true,
              reserved: []
            }
          }
        });
        
        if (!minified.error) {
          code = minified.code;
        }
      } catch (minifyError) {
        console.log(`⚠️ Erro ao minificar ${filePath}, continuando com código original: ${minifyError.message}`);
      }
    }
    
    // Adicionar função de descriptografia para uso em runtime (somente para arquivos não em resources)
    if (!isResourcesFile(filePath)) {
      code = getDecryptFunction() + code;
    }
    
    // Segundo passo: ofuscação
    try {
      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, options);
      const obfuscatedCode = obfuscationResult.getObfuscatedCode();
      
      // Terceiro passo: adicionar anti-tampering (somente para arquivos não em resources)
      let finalCode = obfuscatedCode;
      
      if (!isResourcesFile(filePath) && options.selfDefending) {
        const checksum = crypto.createHash('sha256').update(obfuscatedCode).digest('hex');
        
        finalCode = `
          (function() {
            const originalCode = ${JSON.stringify(obfuscatedCode)};
            const expectedChecksum = "${checksum}";
            
            function verifyIntegrity() {
              try {
                const actualChecksum = require('crypto')
                  .createHash('sha256')
                  .update(originalCode)
                  .digest('hex');
                  
                if (actualChecksum !== expectedChecksum) {
                  throw new Error("Integrity check failed");
                }
              } catch(e) {
                // Se a verificação falhar, executar ações de proteção
                process.exit(1);
              }
            }
            
            // Verificar integridade regularmente
            setInterval(verifyIntegrity, Math.random() * 30000 + 5000);
            
            // Executar o código ofuscado
            eval(originalCode);
          })();
        `;
      }
      
      // Garantir que o diretório de destino exista
      const targetDir = path.dirname(outputPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // Salvar o arquivo ofuscado
      fs.writeFileSync(outputPath, finalCode, 'utf8');
      console.log(`✅ Ofuscação completa: ${outputPath}`);
      return true;
    } catch (obfuscateError) {
      console.error(`❌ Erro ao ofuscar ${filePath}:`, obfuscateError);
      
      // Em caso de erro, copiar o arquivo original para não interromper o processo
      try {
        const targetDir = path.dirname(outputPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.copyFileSync(filePath, outputPath);
        console.log(`⚠️ Copiado arquivo original devido a erro na ofuscação: ${outputPath}`);
        return true;
      } catch (copyError) {
        console.error(`❌ Erro ao copiar arquivo original: ${copyError}`);
        return false;
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao processar ${filePath}:`, error);
    return false;
  }
}

// Função para processar arquivos SQL
function processSQLFile(filePath, outputPath) {
  console.log(`Processando SQL: ${filePath}`);
  
  try {
    // Ler o arquivo SQL
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    // Criptografar o conteúdo SQL
    const encryptedSQL = encrypt(sqlContent);
    
    // Criar um wrapper JavaScript que carrega e descriptografa o SQL em runtime
    const wrapperCode = `
      // Arquivo SQL criptografado: ${path.basename(filePath)}
      // NÃO MODIFIQUE ESTE ARQUIVO
      
      ${getDecryptFunction()}
      
      module.exports = {
        getSQL: function() {
          return __decrypt("${encryptedSQL}");
        },
        
        // Função para executar a query SQL (exemplo para adaptação)
        executeQuery: function(connection, params) {
          const sql = this.getSQL();
          return connection.query(sql, params);
        }
      };
    `;
    
    // Obfuscar o wrapper JavaScript
    const obfuscatedWrapper = JavaScriptObfuscator.obfuscate(
      wrapperCode,
      sqlObfuscationOptions
    ).getObfuscatedCode();
    
    // Salvar o novo arquivo JS no lugar do SQL
    const jsOutputPath = outputPath.replace(/\.sql$/i, '.js');
    
    // Garantir que o diretório de destino exista
    const targetDir = path.dirname(jsOutputPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    fs.writeFileSync(jsOutputPath, obfuscatedWrapper, 'utf8');
    
    console.log(`✅ SQL processado e convertido para JS: ${jsOutputPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao processar SQL ${filePath}:`, error);
    
    // Em caso de erro, copiar o arquivo original para não interromper o processo
    try {
      const targetDir = path.dirname(outputPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.copyFileSync(filePath, outputPath);
      console.log(`⚠️ Copiado arquivo SQL original devido a erro: ${outputPath}`);
      return true;
    } catch (copyError) {
      console.error(`❌ Erro ao copiar arquivo original: ${copyError}`);
      return false;
    }
  }
}

// Função para copiar arquivos não-JS/SQL
function copyNonProcessableFile(filePath, outputPath) {
  try {
    // Garantir que o diretório de destino exista
    const targetDir = path.dirname(outputPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    fs.copyFileSync(filePath, outputPath);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao copiar ${filePath}:`, error);
    return false;
  }
}

// Função para processar todos os arquivos em um diretório
function processDirectory(inputDir, outputDir) {
  console.log(`Processando diretório: ${inputDir}`);
  console.log(`Diretório de saída: ${outputDir}`);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Encontrar todos os arquivos de forma recursiva
  const allFiles = glob.sync(`${inputDir}/**/*`, { nodir: true, dot: true });
  console.log(`Encontrados ${allFiles.length} arquivos para processamento`);
  
  let jsFiles = [];
  let sqlFiles = [];
  let otherFiles = [];
  
  // Classificar os arquivos
  allFiles.forEach(file => {
    const extension = path.extname(file).toLowerCase();
    
    if (extension === '.js') {
      jsFiles.push(file);
    } else if (extension === '.sql') {
      sqlFiles.push(file);
    } else {
      otherFiles.push(file);
    }
  });
  
  console.log(`Classificação: ${jsFiles.length} arquivos JS, ${sqlFiles.length} arquivos SQL, ${otherFiles.length} outros arquivos`);
  
  // Processar arquivos JS
  let jsSuccess = 0;
  jsFiles.forEach(file => {
    const relativePath = path.relative(inputDir, file);
    const outputPath = path.join(outputDir, relativePath);
    
    if (obfuscateJSFile(file, outputPath)) {
      jsSuccess++;
    }
  });
  
  // Processar arquivos SQL
  let sqlSuccess = 0;
  sqlFiles.forEach(file => {
    const relativePath = path.relative(inputDir, file);
    const outputPath = path.join(outputDir, relativePath);
    
    if (processSQLFile(file, outputPath)) {
      sqlSuccess++;
    }
  });
  
  // Copiar outros arquivos
  let otherSuccess = 0;
  otherFiles.forEach(file => {
    const relativePath = path.relative(inputDir, file);
    const outputPath = path.join(outputDir, relativePath);
    
    if (copyNonProcessableFile(file, outputPath)) {
      otherSuccess++;
    }
  });
  
  console.log(`\n========== RESUMO ==========`);
  console.log(`✅ JS: ${jsSuccess}/${jsFiles.length} arquivos ofuscados com sucesso`);
  console.log(`✅ SQL: ${sqlSuccess}/${sqlFiles.length} arquivos processados com sucesso`);
  console.log(`✅ Outros: ${otherSuccess}/${otherFiles.length} arquivos copiados com sucesso`);
  console.log(`============================\n`);
  
  return {
    jsSuccess,
    jsTotal: jsFiles.length,
    sqlSuccess,
    sqlTotal: sqlFiles.length,
    otherSuccess,
    otherTotal: otherFiles.length
  };
}

// Função para processar a pasta resources de forma específica
function processResourcesDirectory(baseInputDir, baseOutputDir) {
  const resourcesInputDir = path.join(baseInputDir, 'resources');
  const resourcesOutputDir = path.join(baseOutputDir, 'resources');
  
  if (!fs.existsSync(resourcesInputDir)) {
    console.log(`⚠️ Diretório de recursos não encontrado: ${resourcesInputDir}`);
    return false;
  }
  
  console.log(`\n========== PROCESSANDO RECURSOS ==========`);
  console.log(`Processando diretório de recursos: ${resourcesInputDir}`);
  
  return processDirectory(resourcesInputDir, resourcesOutputDir);
}

// Função principal
function main() {
  console.log('Iniciando processo de ofuscação avançada...');
  
  // Verificar pacotes necessários
  try {
    require('javascript-obfuscator');
    require('glob');
    require('uglify-js');
  } catch (e) {
    console.error('Pacotes necessários não encontrados. Instalando...');
    require('child_process').execSync('npm install --save-dev javascript-obfuscator glob uglify-js');
    console.log('Dependências instaladas.');
  }
  
  // Obter diretório para processamento
  const sourceDir = process.argv[2];
  const outputDir = process.argv[3];
  
  if (!sourceDir || !outputDir) {
    console.error('Uso: node obfuscate.js <diretório_fonte> <diretório_saída>');
    process.exit(1);
  }
  
  // Processar o diretório principal
  const mainResult = processDirectory(sourceDir, outputDir);
  
  // Verificar resultado
  const totalProcessed = mainResult.jsSuccess + mainResult.sqlSuccess + mainResult.otherSuccess;
  const totalFiles = mainResult.jsTotal + mainResult.sqlTotal + mainResult.otherTotal;
  
  if (totalProcessed < totalFiles) {
    console.log(`⚠️ Aviso: ${totalProcessed} de ${totalFiles} arquivos processados com sucesso.`);
    process.exitCode = 1;
  } else {
    console.log(`✅ Todos os ${totalFiles} arquivos processados com sucesso!`);
  }
}

// Executar o script
main();