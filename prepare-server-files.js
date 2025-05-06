/**
 * Script para preparar os arquivos do servidor print_server_desktop
 * 
 * Este script simples e robusto copia o print_server_desktop para
 * a pasta resources do printer_driver para instalação e atualizações.
 * 
 * Versão melhorada para compatibilidade com ofuscação
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configurações
const TARGET_DIR = path.resolve(__dirname, './resources/print_server_desktop');
const SOURCE_DIR = process.env.SOURCE_DIR || path.resolve(__dirname, '../print_server_desktop');

// Log com timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Função para criar diretório de forma segura
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      log(`Diretório criado: ${dir}`);
    } catch (error) {
      log(`ERRO: Não foi possível criar o diretório ${dir}: ${error.message}`);
      return false;
    }
  }
  return true;
}

// Função para copiar diretório recursivamente
function copyDir(src, dest, exclude = []) {
  if (!fs.existsSync(src)) {
    log(`AVISO: Diretório de origem não existe: ${src}`);
    return false;
  }
  
  if (!ensureDir(dest)) {
    return false;
  }
  
  try {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      // Pular diretórios/arquivos excluídos
      if (exclude.includes(entry.name)) {
        continue;
      }
      
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath, exclude);
      } else {
        try {
          fs.copyFileSync(srcPath, destPath);
        } catch (error) {
          log(`ERRO: Não foi possível copiar ${srcPath}: ${error.message}`);
        }
      }
    }
    return true;
  } catch (error) {
    log(`ERRO: Falha ao copiar diretório ${src}: ${error.message}`);
    return false;
  }
}

// Marcador para incluir/excluir arquivos específicos da ofuscação
function addPreserveMarkers(dir) {
  const PRESERVE_FILES = [
    'update.sh',
    'ecosystem.config.js',
    '.env',
    '.env.example'
  ];

  const PRESERVE_EXTENSIONS = [
    '.sh',
    '.ps1',
    '.bat'
  ];

  // Adicionar marcador a arquivos que devem ser preservados durante ofuscação
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      
      if (file.isDirectory()) {
        // Processar subdiretórios recursivamente
        addPreserveMarkers(filePath);
      } else {
        // Verificar se este arquivo deve ser preservado
        const ext = path.extname(file.name);
        if (PRESERVE_FILES.includes(file.name) || PRESERVE_EXTENSIONS.includes(ext)) {
          // Adicionar marcador em um arquivo adjacente para sinalizar preservação
          const markerPath = `${filePath}.preserve`;
          fs.writeFileSync(markerPath, 'Este arquivo deve ser mantido sem ofuscação.', 'utf8');
          log(`Marcador de preservação adicionado para: ${filePath}`);
        }
      }
    }
  } catch (error) {
    log(`ERRO ao adicionar marcadores de preservação: ${error.message}`);
  }
}

// Função principal de preparação
function prepareServerFiles() {
  log('Iniciando preparação dos arquivos do servidor...');
  
  // Verificar se o diretório de destino pode ser criado
  if (!ensureDir(TARGET_DIR)) {
    log('ERRO CRÍTICO: Não foi possível criar o diretório de destino. Abortando.');
    process.exit(1);
  }
  
  // Métodos de cópia, por ordem de prioridade
  
  // 1. Verificar se o diretório do print_server_desktop existe
  if (fs.existsSync(SOURCE_DIR)) {
    log(`Encontrado diretório de origem: ${SOURCE_DIR}`);
    
    // Limpar o diretório de destino
    try {
      if (fs.existsSync(TARGET_DIR)) {
        log('Limpando diretório de destino...');
        const files = fs.readdirSync(TARGET_DIR);
        
        for (const file of files) {
          const filePath = path.join(TARGET_DIR, file);
          // Não remover alguns arquivos especiais, se necessário
          if (file !== '.gitkeep') {
            if (fs.lstatSync(filePath).isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
          }
        }
      }
    } catch (error) {
      log(`AVISO: Erro ao limpar diretório de destino: ${error.message}`);
    }
    
    // Copiar todos os arquivos, exceto node_modules e .git
    log('Copiando arquivos...');
    if (copyDir(SOURCE_DIR, TARGET_DIR, ['node_modules', '.git', '.github'])) {
      log('Arquivos copiados com sucesso!');
    } else {
      log('AVISO: Houve problemas durante a cópia dos arquivos.');
    }
    
    // Adicionar marcadores para preservação durante ofuscação
    log('Adicionando marcadores para preservação de scripts...');
    addPreserveMarkers(TARGET_DIR);
    
    // Verificar se o diretório de atualizações existe e, se não, criá-lo
    const updatesDir = path.join(TARGET_DIR, 'updates');
    if (!fs.existsSync(updatesDir)) {
      log('Criando diretório de atualizações...');
      ensureDir(updatesDir);
      
      // Criar um script de atualização de exemplo
      try {
        const exampleUpdateScript = path.join(updatesDir, '01.sh');
        fs.writeFileSync(exampleUpdateScript, `#!/bin/bash
# Script de atualização 01
echo "Instalando ferramentas adicionais..."
apt install net-tools -y

# Exemplo de atualização do sistema
echo "Atualização básica concluída!"
exit 0`, { mode: 0o755 });
        
        // Adicionar marcador de preservação
        fs.writeFileSync(`${exampleUpdateScript}.preserve`, 'Este arquivo deve ser mantido sem ofuscação.', 'utf8');
        
        log('Criado script de atualização de exemplo');
      } catch (error) {
        log(`AVISO: Não foi possível criar script de atualização de exemplo: ${error.message}`);
      }
    }
    
    // Garantir que o script de atualização principal exista
    const updateScriptPath = path.join(TARGET_DIR, 'update.sh');
    if (!fs.existsSync(updateScriptPath)) {
      log('Criando script de atualização principal...');
      try {
        const updateScriptContent = `#!/bin/bash
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
else
  log "PM2 não encontrado, tentando método alternativo..."
  cd /opt/print_server/print_server_desktop && 
  node -e "try { const fs=require('fs'); const path=require('path'); const oldPid = fs.existsSync('/opt/print_server/server.pid') ? fs.readFileSync('/opt/print_server/server.pid', 'utf8') : null; if (oldPid) { try { process.kill(parseInt(oldPid)); } catch(e) {} } const { spawn } = require('child_process'); const proc = spawn('node', ['bin/www.js'], { detached: true, stdio: 'ignore' }); fs.writeFileSync('/opt/print_server/server.pid', proc.pid.toString()); proc.unref(); console.log('Servidor reiniciado via método alternativo, PID:', proc.pid); }" >> "$LOG_FILE" 2>&1
fi

log "=== Processo de atualização concluído com sucesso! ==="`; 
       
        fs.writeFileSync(updateScriptPath, updateScriptContent, { mode: 0o755 });
        
        // Adicionar marcador de preservação
        fs.writeFileSync(`${updateScriptPath}.preserve`, 'Este arquivo deve ser mantido sem ofuscação.', 'utf8');
        
        log('Script de atualização principal criado com sucesso');
      } catch (error) {
        log(`AVISO: Não foi possível criar script de atualização principal: ${error.message}`);
      }
    }
    
    // Verificar se ecosystem.config.js existe
    const ecosystemConfigPath = path.join(TARGET_DIR, 'ecosystem.config.js');
    if (!fs.existsSync(ecosystemConfigPath)) {
      log('Criando arquivo de configuração do PM2...');
      try {
        const ecosystemConfigContent = `module.exports = {
  apps: [{
    name: 'print_server_desktop',
    script: './bin/www.js',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 56258
    },
    max_memory_restart: '500M',
    restart_delay: 3000,
    max_restarts: 10
  }]
};`;
        
        fs.writeFileSync(ecosystemConfigPath, ecosystemConfigContent);
        
        // Adicionar marcador de preservação
        fs.writeFileSync(`${ecosystemConfigPath}.preserve`, 'Este arquivo deve ser mantido sem ofuscação.', 'utf8');
        
        log('Arquivo de configuração do PM2 criado com sucesso');
      } catch (error) {
        log(`AVISO: Não foi possível criar arquivo de configuração do PM2: ${error.message}`);
      }
    }
    
    // Verificar arquivo .env
    const envPath = path.join(TARGET_DIR, '.env');
    if (!fs.existsSync(envPath)) {
      const envExamplePath = path.join(TARGET_DIR, '.env.example');
      
      if (fs.existsSync(envExamplePath)) {
        log('Criando arquivo .env a partir do exemplo...');
        try {
          fs.copyFileSync(envExamplePath, envPath);
          log('Arquivo .env criado com sucesso');
        } catch (error) {
          log(`AVISO: Não foi possível criar arquivo .env: ${error.message}`);
        }
      } else {
        log('Criando arquivo .env básico...');
        try {
          fs.writeFileSync(envPath, 'PORT=56258\nNODE_ENV=production\n');
          log('Arquivo .env básico criado com sucesso');
        } catch (error) {
          log(`AVISO: Não foi possível criar arquivo .env básico: ${error.message}`);
        }
      }
      
      // Adicionar marcador de preservação para .env
      fs.writeFileSync(`${envPath}.preserve`, 'Este arquivo deve ser mantido sem ofuscação.', 'utf8');
    }
    
    log('Preparação finalizada com sucesso!');
    return true;
  } else {
    log(`ERRO: Diretório do print_server_desktop não encontrado em: ${SOURCE_DIR}`);
    log('Verificando se já existe uma estrutura em resources/...');
    
    // Verificar se já existe um diretório resources/print_server_desktop
    if (fs.existsSync(TARGET_DIR)) {
      log('Diretório resources/print_server_desktop já existe. Usando estrutura existente.');
      
      // Adicionar marcadores para preservação durante ofuscação
      log('Adicionando marcadores para preservação de scripts...');
      addPreserveMarkers(TARGET_DIR);
      
      return true;
    }
    
    // Se nenhuma das alternativas funcionar, criar estrutura mínima
    log('Criando estrutura mínima em resources/print_server_desktop...');
    
    try {
      // Garantir que o diretório existe
      ensureDir(TARGET_DIR);
      
      // Criar ecosystem.config.js
      const ecosystemConfigPath = path.join(TARGET_DIR, 'ecosystem.config.js');
      const ecosystemConfigContent = `module.exports = {
  apps: [{
    name: 'print_server_desktop',
    script: './bin/www.js',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 56258
    },
    max_memory_restart: '500M',
    restart_delay: 3000,
    max_restarts: 10
  }]
};`;
      fs.writeFileSync(ecosystemConfigPath, ecosystemConfigContent);
      fs.writeFileSync(`${ecosystemConfigPath}.preserve`, 'Este arquivo deve ser mantido sem ofuscação.', 'utf8');
      
      // Criar package.json mínimo
      const packageJsonPath = path.join(TARGET_DIR, 'package.json');
      const packageJsonContent = `{
  "name": "print_server_desktop",
  "version": "1.0.0",
  "description": "Print Server Desktop Application",
  "main": "bin/www.js",
  "scripts": {
    "start": "node bin/www.js"
  },
  "dependencies": {
    "express": "^4.17.1"
  }
}`;
      fs.writeFileSync(packageJsonPath, packageJsonContent);
      
      // Criar update.sh
      const updateScriptPath = path.join(TARGET_DIR, 'update.sh');
      const updateScriptContent = `#!/bin/bash
echo "Update script executed"
exit 0`;
      fs.writeFileSync(updateScriptPath, updateScriptContent, { mode: 0o755 });
      fs.writeFileSync(`${updateScriptPath}.preserve`, 'Este arquivo deve ser mantido sem ofuscação.', 'utf8');
      
      // Criar diretório bin e arquivo www.js mínimo
      const binDir = path.join(TARGET_DIR, 'bin');
      ensureDir(binDir);
      
      const wwwPath = path.join(binDir, 'www.js');
      const wwwContent = `#!/usr/bin/env node
const express = require('express');
const app = express();
const port = process.env.PORT || 56258;

app.get('/', (req, res) => {
  res.send('Print Server Desktop is running');
});

app.listen(port, () => {
  console.log(\`Print Server Desktop listening at http://localhost:\${port}\`);
});`;
      fs.writeFileSync(wwwPath, wwwContent);
      
      // Criar diretório updates
      const updatesDir = path.join(TARGET_DIR, 'updates');
      ensureDir(updatesDir);
      
      log('Estrutura mínima criada com sucesso.');
      return true;
    } catch (error) {
      log(`ERRO ao criar estrutura mínima: ${error.message}`);
      return false;
    }
  }
}

// Executar a função principal
try {
  const success = prepareServerFiles();
  log(`Processo de preparação ${success ? 'concluído com sucesso' : 'falhou'}`);
  
  // Definir código de saída baseado no sucesso
  if (!success) {
    process.exitCode = 1;
  }
} catch (error) {
  log(`ERRO FATAL: ${error.message}`);
  log(error.stack);
  process.exitCode = 1;
}