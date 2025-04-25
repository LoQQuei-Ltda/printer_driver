# Script para atualização dos componentes WSL
# Este script é executado durante atualizações do aplicativo
# Atualiza os componentes do servidor no ambiente WSL

$ErrorActionPreference = "Stop"
$LOG_FILE = Join-Path $PSScriptRoot "..\wsl_update.log"

# Função para log
function Log-Message {
    param (
        [string]$Message,
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    
    # Saída para console e arquivo
    Write-Host $logMessage
    Add-Content -Path $LOG_FILE -Value $logMessage -ErrorAction SilentlyContinue
}

# Criar arquivo de log
try {
    $logDir = Split-Path -Parent $LOG_FILE
    if (-not (Test-Path $logDir)) {
        New-Item -Path $logDir -ItemType Directory -Force | Out-Null
    }
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [INFO] ===== Iniciando processo de atualização WSL =====" | Out-File -FilePath $LOG_FILE -Append
} catch {
    Write-Host "ALERTA: Não foi possível criar arquivo de log em $LOG_FILE. Continuando sem log em arquivo."
}

Log-Message "Iniciando atualização dos componentes WSL..."

# Verificar se o WSL está instalado e disponível
try {
    $wslVersion = wsl --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "WSL não está disponível ou não está instalado corretamente"
    }
    Log-Message "WSL encontrado: $wslVersion"
} catch {
    try {
        # Método alternativo para versões antigas do WSL
        $wslStatus = wsl --status 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "WSL não está disponível ou não está instalado corretamente"
        }
        Log-Message "WSL encontrado (método alternativo)"
    } catch {
        $errorMsg = $_.Exception.Message
        Log-Message "Erro crítico: WSL não encontrado ou não funcional: $errorMsg" "ERROR"
        Log-Message "A atualização do componente WSL não pode continuar. Verifique se o WSL está instalado corretamente." "ERROR"
        exit 1
    }
}

# Verificar se o Ubuntu está instalado no WSL
try {
    $distributions = wsl --list --verbose 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Não foi possível listar distribuições WSL"
    }
    
    if ($distributions -notmatch "Ubuntu") {
        Log-Message "Ubuntu não encontrado nas distribuições WSL. Distribuições disponíveis:" "ERROR"
        $distributions | ForEach-Object { Log-Message "- $_" "ERROR" }
        exit 1
    }
    
    Log-Message "Ubuntu encontrado no WSL"
} catch {
    $errorMsg = $_.Exception.Message
    Log-Message "Erro ao verificar distribuições WSL: $errorMsg" "ERROR"
    exit 1
}

# Verificar se o Ubuntu está acessível
try {
    $wslTest = wsl -d Ubuntu echo "Ubuntu está acessível" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Ubuntu não está acessível. Código de erro: $LASTEXITCODE"
    }
    Log-Message "Ubuntu está acessível e respondendo: $wslTest"
} catch {
    $errorMsg = $_.Exception.Message
    Log-Message "Erro ao acessar Ubuntu no WSL: $errorMsg" "ERROR"
    
    # Tentar reiniciar a distribuição
    Log-Message "Tentando reiniciar a distribuição Ubuntu..." "WARN"
    try {
        wsl --terminate Ubuntu 2>&1 | Out-Null
        Start-Sleep -Seconds 2
        $wslRestart = wsl -d Ubuntu echo "Ubuntu reiniciado com sucesso" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Log-Message "Ubuntu reiniciado com sucesso: $wslRestart"
        } else {
            throw "Não foi possível reiniciar o Ubuntu"
        }
    } catch {
        $restartError = $_.Exception.Message
        Log-Message "Falha ao reiniciar Ubuntu: $restartError" "ERROR"
        Log-Message "A atualização do WSL não pode continuar. Tente reiniciar o computador e tentar novamente." "ERROR"
        exit 1
    }
}

# Verificar/criar a estrutura de diretórios
Log-Message "Verificando estrutura de diretórios no WSL..."
try {
    # Verificar/criar diretório principal
    $checkMainDir = wsl -d Ubuntu -u root bash -c "if [ -d /opt/print_server ]; then echo 'exists'; else mkdir -p /opt/print_server && echo 'created'; fi" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao verificar/criar diretório principal: $checkMainDir"
    }
    Log-Message "Diretório principal: $checkMainDir"
    
    # Verificar/criar diretório print_server_desktop
    $checkServerDir = wsl -d Ubuntu -u root bash -c "if [ -d /opt/print_server/print_server_desktop ]; then echo 'exists'; else mkdir -p /opt/print_server/print_server_desktop && echo 'created'; fi" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao verificar/criar diretório do servidor: $checkServerDir"
    }
    Log-Message "Diretório do servidor: $checkServerDir"
    
    # Verificar/criar diretório de atualizações
    $checkUpdatesDir = wsl -d Ubuntu -u root bash -c "if [ -d /opt/print_server/updates ]; then echo 'exists'; else mkdir -p /opt/print_server/updates && echo 'created'; fi" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao verificar/criar diretório de atualizações: $checkUpdatesDir"
    }
    Log-Message "Diretório de atualizações: $checkUpdatesDir"
    
    # Verificar/criar arquivo de registro de atualizações
    $checkUpdateLog = wsl -d Ubuntu -u root bash -c "touch /opt/print_server/executed_updates.txt && echo 'ok'" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao verificar/criar arquivo de registro de atualizações: $checkUpdateLog"
    }
} catch {
    $errorMsg = $_.Exception.Message
    Log-Message "Erro ao configurar estrutura de diretórios: $errorMsg" "ERROR"
    Log-Message "Tentando continuar mesmo assim..." "WARN"
}

# Verificar script de atualização principal
Log-Message "Verificando script de atualização principal..."
$updateScriptExists = wsl -d Ubuntu -u root bash -c "if [ -f /opt/print_server/update.sh ]; then echo 'exists'; else echo 'not-found'; fi" 2>&1
if ($updateScriptExists -ne "exists") {
    Log-Message "Script de atualização principal não encontrado. Criando script padrão..." "WARN"
    
    # Criar o script de atualização padrão
    $updateScriptContent = @'
#!/bin/bash
# Script principal de atualização para print_server
# Executa os scripts de atualização na sequência

LOG_FILE="/opt/print_server/update_log.txt"

# Função para log
log() {
  local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
  echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

# Iniciar log
echo "===== Processo de atualização iniciado em $(date) =====" >> "$LOG_FILE"

log "Iniciando processo de atualização..."

# Executar scripts de atualização
UPDATE_DIR="/opt/print_server/updates"
EXECUTED_FILE="/opt/print_server/executed_updates.txt"

# Garantir que os diretórios existam
mkdir -p "$UPDATE_DIR"
touch "$EXECUTED_FILE"

# Verificar scripts de atualização e executá-los em ordem
log "Verificando scripts de atualização..."

for i in $(seq -f "%02g" 1 99); do
  SCRIPT_FILE="$UPDATE_DIR/$i.sh"
  
  if [ -f "$SCRIPT_FILE" ]; then
    if ! grep -q "^$i$" "$EXECUTED_FILE"; then
      log "Executando atualização $i..."
      
      # Garantir que o script tem permissão de execução
      chmod +x "$SCRIPT_FILE"
      
      # Executar o script e capturar saída
      OUTPUT=$("$SCRIPT_FILE" 2>&1)
      EXIT_CODE=$?
      
      # Registrar saída do script
      echo "=== Saída do script $i ===" >> "$LOG_FILE"
      echo "$OUTPUT" >> "$LOG_FILE"
      echo "=========================" >> "$LOG_FILE"
      
      if [ $EXIT_CODE -eq 0 ]; then
        echo "$i" >> "$EXECUTED_FILE"
        log "Atualização $i executada com sucesso!"
      else
        log "ERRO: A atualização $i falhou com código $EXIT_CODE!"
        log "Verifique o log para mais detalhes. Continuando com próximas atualizações..."
      fi
    else
      log "Atualização $i já foi executada anteriormente. Pulando..."
    fi
  fi
done

# Reiniciar o serviço
log "Tentando reiniciar o serviço..."

# 1. Tentar com PM2
if command -v pm2 &> /dev/null; then
  log "PM2 encontrado. Usando para reiniciar o serviço..."
  cd /opt/print_server/print_server_desktop && 
    pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
  if [ $? -eq 0 ]; then
    log "Serviço reiniciado com sucesso via PM2"
  else
    log "Erro ao reiniciar serviço via PM2. Tentando método alternativo..."
  fi
else
  log "PM2 não encontrado. Tentando método alternativo..."
fi

# 2. Método alternativo se PM2 falhar ou não estiver disponível
if [ ! -f /opt/print_server/server.pid ] || ! ps -p $(cat /opt/print_server/server.pid 2>/dev/null) > /dev/null 2>&1; then
  log "Iniciando servidor via Node.js..."
  
  # Matar processos antigos se existirem
  if [ -f /opt/print_server/server.pid ]; then
    OLD_PID=$(cat /opt/print_server/server.pid 2>/dev/null)
    if [ -n "$OLD_PID" ]; then
      kill $OLD_PID >/dev/null 2>&1 || true
    fi
  fi
  
  # Iniciar novo processo
  cd /opt/print_server/print_server_desktop
  node bin/www.js > /opt/print_server/server.log 2>&1 &
  
  # Salvar novo PID
  NEW_PID=$!
  echo $NEW_PID > /opt/print_server/server.pid
  
  log "Servidor iniciado com PID: $NEW_PID"
fi

log "Processo de atualização concluído com sucesso!"
'@

    # Salvar em arquivo temporário
    $tempFile = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tempFile -Value $updateScriptContent
    
    # Obter caminho WSL para o arquivo temporário
    $tempFilePath = $tempFile.Replace('\', '/')
    $wslTempPath = wsl -d Ubuntu wslpath -u "$tempFilePath" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        # Copiar para o WSL e configurar permissões
        $copyResult = wsl -d Ubuntu -u root bash -c "cp '$wslTempPath' /opt/print_server/update.sh && chmod +x /opt/print_server/update.sh && echo 'ok'" 2>&1
        
        if ($LASTEXITCODE -eq 0 -and $copyResult -eq "ok") {
            Log-Message "Script de atualização principal criado com sucesso"
        } else {
            Log-Message "Erro ao criar script de atualização: $copyResult" "ERROR"
        }
    } else {
        Log-Message "Erro ao converter caminho para WSL: $wslTempPath" "ERROR"
    }
    
    # Limpar arquivo temporário
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
}

# Diretório com os scripts de atualização no Windows
$wslUpdatesDir = Join-Path $PSScriptRoot "..\resources\print_server_desktop\updates"

# Verificar se o diretório existe
if (Test-Path $wslUpdatesDir) {
    Log-Message "Verificando scripts de atualização em: $wslUpdatesDir"
    $updateScripts = Get-ChildItem -Path $wslUpdatesDir -Filter "*.sh"
    
    if ($updateScripts.Count -gt 0) {
        Log-Message "Encontrados $($updateScripts.Count) scripts de atualização"
        
        # Copiar cada script para o WSL
        foreach ($script in $updateScripts) {
            Log-Message "Processando script: $($script.Name)"
            
            # Obter caminho WSL para o script
            $scriptWinPath = $script.FullName.Replace('\', '/')
            $scriptWslPath = wsl -d Ubuntu wslpath -u "$scriptWinPath" 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                # Copiar para o WSL e configurar permissões
                $copyResult = wsl -d Ubuntu -u root bash -c "cp '$scriptWslPath' /opt/print_server/updates/ && chmod +x /opt/print_server/updates/$($script.Name) && echo 'ok'" 2>&1
                
                if ($LASTEXITCODE -eq 0 -and $copyResult -eq "ok") {
                    Log-Message "Script $($script.Name) copiado com sucesso"
                } else {
                    Log-Message "Erro ao copiar script $($script.Name): $copyResult" "ERROR"
                }
            } else {
                Log-Message "Erro ao converter caminho para WSL: $scriptWslPath" "ERROR"
            }
        }
    } else {
        Log-Message "Nenhum script de atualização encontrado"
    }
} else {
    Log-Message "Diretório de scripts de atualização não encontrado: $wslUpdatesDir" "WARN"
}

# Verificar diretório de recursos do servidor
$serverResourcesDir = Join-Path $PSScriptRoot "..\resources\print_server_desktop"

# Atualizar os arquivos do servidor se existirem
if (Test-Path $serverResourcesDir) {
    Log-Message "Verificando arquivos do servidor em: $serverResourcesDir"
    
    # Lista de diretórios e arquivos principais a serem atualizados
    $keyComponents = @("api", "bin", "db", "helper", "middleware", "src", "app.js", "ecosystem.config.js", "package.json")
    
    foreach ($component in $keyComponents) {
        $componentPath = Join-Path $serverResourcesDir $component
        
        if (Test-Path $componentPath) {
            Log-Message "Atualizando componente: $component"
            
            # Determinar se é diretório ou arquivo
            $isDirectory = (Get-Item $componentPath) -is [System.IO.DirectoryInfo]
            
            # Obter caminho WSL
            $componentWinPath = $componentPath.Replace('\', '/')
            $componentWslPath = wsl -d Ubuntu wslpath -u "$componentWinPath" 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                $targetPath = "/opt/print_server/print_server_desktop/$component"
                
                if ($isDirectory) {
                    # Criar diretório de destino se não existir
                    $createDirResult = wsl -d Ubuntu -u root bash -c "mkdir -p '$targetPath'" 2>&1
                    
                    if ($LASTEXITCODE -eq 0) {
                        # Copiar diretório usando rsync se disponível, ou cp como alternativa
                        $copyResult = wsl -d Ubuntu -u root bash -c "if command -v rsync > /dev/null; then rsync -a --delete --exclude='node_modules' --exclude='.git' --exclude='*.log' '$componentWslPath/' '$targetPath/'; else cp -rf '$componentWslPath'/* '$targetPath/'; fi" 2>&1
                        
                        if ($LASTEXITCODE -eq 0) {
                            Log-Message "Diretório $component atualizado com sucesso"
                        } else {
                            Log-Message "Erro ao atualizar diretório $component: $copyResult" "ERROR"
                        }
                    } else {
                        Log-Message "Erro ao criar diretório de destino $targetPath: $createDirResult" "ERROR"
                    }
                } else {
                    # Copiar arquivo
                    $copyResult = wsl -d Ubuntu -u root bash -c "cp '$componentWslPath' '$targetPath' && echo 'ok'" 2>&1
                    
                    if ($LASTEXITCODE -eq 0 -and $copyResult -eq "ok") {
                        Log-Message "Arquivo $component atualizado com sucesso"
                    } else {
                        Log-Message "Erro ao atualizar arquivo $component: $copyResult" "ERROR"
                    }
                }
            } else {
                Log-Message "Erro ao converter caminho para WSL: $componentWslPath" "ERROR"
            }
        } else {
            Log-Message "Componente não encontrado: $component" "WARN"
        }
    }
    
    # Verificar se é necessário instalar dependências
    Log-Message "Verificando se é necessário atualizar dependências..."
    
    $npmInstallResult = wsl -d Ubuntu -u root bash -c "cd /opt/print_server/print_server_desktop && if [ -f package.json ]; then npm install --only=production; else echo 'No package.json'; fi" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Log-Message "Dependências atualizadas: $npmInstallResult"
    } else {
        Log-Message "Aviso: Erro ao atualizar dependências: $npmInstallResult" "WARN"
    }
} else {
    Log-Message "Diretório de recursos do servidor não encontrado: $serverResourcesDir" "WARN"
}

# Executar o script de atualização principal
Log-Message "Executando script de atualização principal..."

$updateOutput = wsl -d Ubuntu -u root bash -c "cd /opt/print_server && bash update.sh" 2>&1

if ($LASTEXITCODE -eq 0) {
    # Processar cada linha da saída para o log
    $updateOutput -split "`n" | ForEach-Object {
        if ($_.Trim()) {
            Log-Message "WSL: $_"
        }
    }
    
    Log-Message "Script de atualização executado com sucesso!"
} else {
    Log-Message "Erro ao executar script de atualização: Código $LASTEXITCODE" "ERROR"
    $updateOutput -split "`n" | ForEach-Object {
        if ($_.Trim()) {
            Log-Message "WSL Error: $_" "ERROR"
        }
    }
}

Log-Message "Processo de atualização WSL concluído!"
exit 0