/**
 * Script de Ofuscação Avançada para Proteção de Código
 * Este script ofusca arquivos JS e SQL com proteções avançadas
 * 
 * Recursos:
 * - Ofuscação forte de JavaScript com transformações múltiplas
 * - Proteção de arquivos SQL via criptografia e ofuscação
 * - Anti-tampering com verificações de integridade
 * - Processamento recursivo de todos os arquivos em diretórios
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JavaScriptObfuscator = require('javascript-obfuscator');
const glob = require('glob');
const uglifyJS = require('uglify-js');

// Chave de criptografia (ALTERE ESTA CHAVE para um valor único e mantenha-a segura)
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

// Função para ofuscar arquivo JavaScript
function obfuscateJSFile(filePath) {
  console.log(`Ofuscando JS: ${filePath}`);
  
  try {
    let code = fs.readFileSync(filePath, 'utf8');
    
    // Primeiro passo: minificar com UglifyJS
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
    
    if (minified.error) {
      console.error(`Erro ao minificar ${filePath}:`, minified.error);
      // Continue com o código original se a minificação falhar
    } else {
      code = minified.code;
    }
    
    // Adicionar função de descriptografia para uso em runtime
    code = getDecryptFunction() + code;
    
    // Segundo passo: ofuscação forte
    const obfuscationResult = JavaScriptObfuscator.obfuscate(
      code,
      obfuscationOptions
    );
    
    // Terceiro passo: adicionar anti-tampering
    const obfuscatedCode = obfuscationResult.getObfuscatedCode();
    const checksum = crypto.createHash('sha256').update(obfuscatedCode).digest('hex');
    
    // Adicionar verificação de integridade que falha se o código for modificado
    const finalCode = `
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
    
    // Salvar o arquivo ofuscado
    fs.writeFileSync(filePath, finalCode, 'utf8');
    console.log(`✅ Ofuscação completa: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao ofuscar ${filePath}:`, error);
    return false;
  }
}

// Função para processar arquivos SQL
function processSQLFile(filePath) {
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
    const jsFilePath = filePath.replace(/\.sql$/i, '.js');
    fs.writeFileSync(jsFilePath, obfuscatedWrapper, 'utf8');
    
    // Opcional: remover o arquivo SQL original
    if (filePath !== jsFilePath) {
      fs.unlinkSync(filePath);
    }
    
    console.log(`✅ SQL processado e convertido para JS: ${jsFilePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao processar SQL ${filePath}:`, error);
    return false;
  }
}

// Função para processar todos os arquivos em um diretório
function processDirectory(directory, outputDir) {
  console.log(`Processando diretório: ${directory}`);
  console.log(`Diretório de saída: ${outputDir}`);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Encontrar todos os arquivos JS
  const jsFiles = glob.sync(`${directory}/**/*.js`, { nodir: true });
  console.log(`Encontrados ${jsFiles.length} arquivos JS`);
  
  // Encontrar todos os arquivos SQL
  const sqlFiles = glob.sync(`${directory}/**/*.sql`, { nodir: true });
  console.log(`Encontrados ${sqlFiles.length} arquivos SQL`);
  
  // Processar arquivos JS
  let jsSuccess = 0;
  jsFiles.forEach(file => {
    if (obfuscateJSFile(file)) jsSuccess++;
  });
  
  // Processar arquivos SQL
  let sqlSuccess = 0;
  sqlFiles.forEach(file => {
    if (processSQLFile(file)) sqlSuccess++;
  });
  
  console.log(`\n========== RESUMO ==========`);
  console.log(`✅ JS: ${jsSuccess}/${jsFiles.length} arquivos ofuscados com sucesso`);
  console.log(`✅ SQL: ${sqlSuccess}/${sqlFiles.length} arquivos processados com sucesso`);
  console.log(`============================\n`);
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
  
  // Obter diretório para processamento (atual por padrão)
  const targetDir = process.argv[2] || '.';
  const outputDir = process.argv[3] || targetDir + '-obfuscated';
  
  // Processar o diretório
  processDirectory(targetDir, outputDir);
}

// Executar o script
main();