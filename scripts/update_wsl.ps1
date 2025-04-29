# Script para atualização dos componentes WSL
# Este script é executado durante atualizações do aplicativo
# Atualiza os componentes do servidor no ambiente WSL
param(
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$LOG_FILE = Join-Path $PSScriptRoot "..\wsl_update.log"
$JOB_LOG_FILE = "$env:TEMP\wsl_update_job.log"

# Função para log
function Write-Log {
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

# Iniciar um job para executar a atualização em segundo plano
$backgroundJob = Start-Job -ScriptBlock {
    param($ScriptPath, $JobLogFile)
    
    # Função para log do job
    function Job-Log {
        param (
            [string]$Message,
            [string]$Level = "INFO"
        )
        
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $logMessage = "[$timestamp] [$Level] $Message"
        
        # Saída para arquivo de log do job
        Add-Content -Path $JobLogFile -Value $logMessage -ErrorAction SilentlyContinue
    }
    
    # Garantir que o diretório de log existe
    $logDir = Split-Path -Parent $JobLogFile
    if (-not (Test-Path $logDir)) {
        New-Item -Path $logDir -ItemType Directory -Force | Out-Null
    }
    
    Job-Log "Iniciando job de atualização dos componentes WSL..."
    
    # Verificar se o WSL está instalado e disponível
    try {
        $wslCommand = Get-Command wsl.exe -ErrorAction SilentlyContinue
        if (-not $wslCommand) {
            throw "WSL não está disponível. Comando não encontrado."
        }
        
        # Tentar obter a versão do WSL
        try {
            $wslVersion = wsl --version 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "WSL não disponível. Erro ao obter versão."
            }
            Job-Log "WSL encontrado: $wslVersion"
        } catch {
            # Método alternativo para versões antigas do WSL
            try {
                $wslStatus = wsl --status 2>&1
                if ($LASTEXITCODE -ne 0) {
                    throw "WSL não disponível. Erro ao obter status."
                }
                Job-Log "WSL encontrado (método alternativo)"
            } catch {
                throw "WSL não disponível após tentativas alternativas."
            }
        }
    } catch {
        $errorMsg = $_.Exception.Message
        Job-Log "Erro crítico: WSL não encontrado ou não funcional: $errorMsg" "ERROR"
        Job-Log "A atualização do componente WSL não pode continuar." "ERROR"
        return
    }
    
    # Verificar se o Ubuntu está instalado no WSL
    try {
        $distributions = wsl --list 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Não foi possível listar distribuições WSL"
        }
        
        if ($distributions -notmatch "Ubuntu") {
            Job-Log "Ubuntu não encontrado nas distribuições WSL. Distribuições disponíveis:" "ERROR"
            $distributions | ForEach-Object { Job-Log "- $_" "ERROR" }
            return
        }
        
        Job-Log "Ubuntu encontrado no WSL"
    } catch {
        $errorMsg = $_.Exception.Message
        Job-Log "Erro ao verificar distribuições WSL: $errorMsg" "ERROR"
        return
    }
    
    # Verificar se o Ubuntu está acessível
    try {
        $wslTest = wsl -d Ubuntu echo "Ubuntu está acessível" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Ubuntu não está acessível. Código de erro: $LASTEXITCODE"
        }
        Job-Log "Ubuntu está acessível e respondendo"
    } catch {
        $errorMsg = $_.Exception.Message
        Job-Log "Erro ao acessar Ubuntu no WSL: $errorMsg" "ERROR"
        
        # Tentar reiniciar a distribuição
        Job-Log "Tentando reiniciar a distribuição Ubuntu..." "WARN"
        try {
            wsl --terminate Ubuntu 2>&1 | Out-Null
            Start-Sleep -Seconds 2
            $wslRestart = wsl -d Ubuntu echo "Ubuntu reiniciado com sucesso" 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Job-Log "Ubuntu reiniciado com sucesso"
            } else {
                throw "Não foi possível reiniciar o Ubuntu"
            }
        } catch {
            $restartError = $_.Exception.Message
            Job-Log "Falha ao reiniciar Ubuntu: $restartError" "ERROR"
            return
        }
    }
    
    # Verificar/criar a estrutura de diretórios
    Job-Log "Verificando estrutura de diretórios no WSL..."
    try {
        # Verificar/criar diretório principal
        $checkMainDir = wsl -d Ubuntu -u root bash -c "if [ -d /opt/print_server ]; then echo 'exists'; else mkdir -p /opt/print_server && echo 'created'; fi" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao verificar/criar diretório principal: $checkMainDir"
        }
        Job-Log "Diretório principal: $checkMainDir"
        
        # Verificar/criar diretório print_server_desktop
        $checkServerDir = wsl -d Ubuntu -u root bash -c "if [ -d /opt/print_server/print_server_desktop ]; then echo 'exists'; else mkdir -p /opt/print_server/print_server_desktop && echo 'created'; fi" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao verificar/criar diretório do servidor: $checkServerDir"
        }
        Job-Log "Diretório do servidor: $checkServerDir"
        
        # Verificar/criar diretório de atualizações
        $checkUpdatesDir = wsl -d Ubuntu -u root bash -c "if [ -d /opt/print_server/updates ]; then echo 'exists'; else mkdir -p /opt/print_server/updates && echo 'created'; fi" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao verificar/criar diretório de atualizações: $checkUpdatesDir"
        }
        Job-Log "Diretório de atualizações: $checkUpdatesDir"
        
        # Verificar/criar arquivo de registro de atualizações
        $checkUpdateLog = wsl -d Ubuntu -u root bash -c "touch /opt/print_server/executed_updates.txt && echo 'ok'" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao verificar/criar arquivo de registro de atualizações: $checkUpdateLog"
        }
    } catch {
        $errorMsg = $_.Exception.Message
        Job-Log "Erro ao configurar estrutura de diretórios: $errorMsg" "ERROR"
        Job-Log "Tentando continuar mesmo assim..." "WARN"
    }
    
    # Verificar script de atualização principal
    Job-Log "Verificando script de atualização principal..."
    $updateScriptExists = wsl -d Ubuntu -u root bash -c "if [ -f /opt/print_server/update.sh ]; then echo 'exists'; else echo 'not-found'; fi" 2>&1
    if ($updateScriptExists -ne "exists") {
        Job-Log "Script de atualização principal não encontrado. Criando script padrão..." "WARN"
        
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
        
        try {
            $wslTempPath = wsl -d Ubuntu wslpath -u "$tempFilePath" 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                # Copiar para o WSL e configurar permissões
                $copyResult = wsl -d Ubuntu -u root bash -c "cp '$wslTempPath' /opt/print_server/update.sh && chmod +x /opt/print_server/update.sh && echo 'ok'" 2>&1
                
                if ($LASTEXITCODE -eq 0 -and $copyResult -eq "ok") {
                    Job-Log "Script de atualização principal criado com sucesso"
                } else {
                    Job-Log "Erro ao criar script de atualização: $copyResult" "ERROR"
                }
            } else {
                Job-Log "Erro ao converter caminho para WSL: $wslTempPath" "ERROR"
            }
        } catch {
            Job-Log "Erro ao processar caminhos WSL: $_" "ERROR"
        } finally {
            # Limpar arquivo temporário
            Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Diretório com os scripts de atualização no Windows
    $resourcesDir = Split-Path -Parent $ScriptPath
    $wslUpdatesDir = Join-Path (Split-Path -Parent $resourcesDir) "resources\print_server_desktop\updates"
    
    # Verificar se o diretório existe
    if (Test-Path $wslUpdatesDir) {
        Job-Log "Verificando scripts de atualização em: $wslUpdatesDir"
        $updateScripts = Get-ChildItem -Path $wslUpdatesDir -Filter "*.sh" -ErrorAction SilentlyContinue
        
        if ($updateScripts -and $updateScripts.Count -gt 0) {
            Job-Log "Encontrados $($updateScripts.Count) scripts de atualização"
            
            # Copiar cada script para o WSL
            foreach ($script in $updateScripts) {
                Job-Log "Processando script: $($script.Name)"
                
                # Obter caminho WSL para o script
                $scriptWinPath = $script.FullName.Replace('\', '/')
                
                try {
                    $scriptWslPath = wsl -d Ubuntu wslpath -u "$scriptWinPath" 2>&1
                    
                    if ($LASTEXITCODE -eq 0) {
                        # Copiar para o WSL e configurar permissões
                        $copyResult = wsl -d Ubuntu -u root bash -c "cp '$scriptWslPath' /opt/print_server/updates/ && chmod +x /opt/print_server/updates/$($script.Name) && echo 'ok'" 2>&1
                        
                        if ($LASTEXITCODE -eq 0 -and $copyResult -eq "ok") {
                            Job-Log "Script $($script.Name) copiado com sucesso"
                        } else {
                            Job-Log "Erro ao copiar script $($script.Name): $copyResult" "ERROR"
                        }
                    } else {
                        Job-Log "Erro ao converter caminho para WSL: $scriptWslPath" "ERROR"
                    }
                } catch {
                    Job-Log "Erro ao processar script $($script.Name): $_" "ERROR"
                }
            }
        } else {
            Job-Log "Nenhum script de atualização encontrado"
        }
    } else {
        Job-Log "Diretório de scripts de atualização não encontrado: $wslUpdatesDir" "WARN"
    }
    
    # Verificar diretório de recursos do servidor
    $serverResourcesDir = Join-Path (Split-Path -Parent $resourcesDir) "resources\print_server_desktop"
    
    # Atualizar os arquivos do servidor se existirem
    if (Test-Path $serverResourcesDir) {
        Job-Log "Verificando arquivos do servidor em: $serverResourcesDir"
        
        # Lista de diretórios e arquivos principais a serem atualizados
        $keyComponents = @("api", "bin", "db", "helper", "middleware", "src", "app.js", "ecosystem.config.js", "package.json")
        
        foreach ($component in $keyComponents) {
            $componentPath = Join-Path $serverResourcesDir $component
            
            if (Test-Path $componentPath) {
                Job-Log "Atualizando componente: $component"
                
                # Determinar se é diretório ou arquivo
                $isDirectory = (Get-Item $componentPath) -is [System.IO.DirectoryInfo]
                
                # Obter caminho WSL
                $componentWinPath = $componentPath.Replace('\', '/')
                
                try {
                    $componentWslPath = wsl -d Ubuntu wslpath -u "$componentWinPath" 2>&1
                    
                    if ($LASTEXITCODE -eq 0) {
                        $targetPath = "/opt/print_server/print_server_desktop/$component"
                        
                        if ($isDirectory) {
                            # Criar diretório de destino se não existir
                            $createDirResult = wsl -d Ubuntu -u root bash -c "mkdir -p '$targetPath'" 2>&1
                            
                            if ($LASTEXITCODE -eq 0) {
                                # Copiar diretório usando método mais simples e confiável
                                $copyResult = wsl -d Ubuntu -u root bash -c "cp -rf '$componentWslPath'/* '$targetPath/' 2>/dev/null || echo 'copy-error'" 2>&1
                                
                                if ($LASTEXITCODE -eq 0 -and $copyResult -ne "copy-error") {
                                    Job-Log "Diretório $component atualizado com sucesso"
                                } else {
                                    Job-Log "Erro ao atualizar diretório $component: $copyResult" "ERROR"
                                }
                            } else {
                                Job-Log "Erro ao criar diretório de destino $targetPath: $createDirResult" "ERROR"
                            }
                        } else {
                            # Copiar arquivo
                            $copyResult = wsl -d Ubuntu -u root bash -c "cp '$componentWslPath' '$targetPath' && echo 'ok'" 2>&1
                            
                            if ($LASTEXITCODE -eq 0 -and $copyResult -eq "ok") {
                                Job-Log "Arquivo $component atualizado com sucesso"
                            } else {
                                Job-Log "Erro ao atualizar arquivo $component: $copyResult" "ERROR"
                            }
                        }
                    } else {
                        Job-Log "Erro ao converter caminho para WSL: $componentWslPath" "ERROR"
                    }
                } catch {
                    Job-Log "Erro ao processar componente $component: $_" "ERROR"
                }
            } else {
                Job-Log "Componente não encontrado: $component" "WARN"
            }
        }
        
        # Verificar se é necessário instalar dependências
        Job-Log "Verificando se é necessário atualizar dependências..."
        
        try {
            $npmInstallResult = wsl -d Ubuntu -u root bash -c "cd /opt/print_server/print_server_desktop && if [ -f package.json ]; then npm install --only=production || echo 'npm-error'; else echo 'No package.json'; fi" 2>&1
            
            if ($LASTEXITCODE -eq 0 -and $npmInstallResult -ne "npm-error") {
                Job-Log "Dependências atualizadas: $npmInstallResult"
            } else {
                Job-Log "Aviso: Erro ao atualizar dependências: $npmInstallResult" "WARN"
            }
        } catch {
            Job-Log "Erro ao atualizar dependências: $_" "ERROR"
        }
    } else {
        Job-Log "Diretório de recursos do servidor não encontrado: $serverResourcesDir" "WARN"
    }
    
    # Executar o script de atualização principal
    Job-Log "Executando script de atualização principal..."
    
    try {
        $updateOutput = wsl -d Ubuntu -u root bash -c "cd /opt/print_server && bash update.sh" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            # Processar cada linha da saída para o log
            $updateOutput -split "`n" | ForEach-Object {
                if ($_.Trim()) {
                    Job-Log "WSL: $_"
                }
            }
            
            Job-Log "Script de atualização executado com sucesso!"
        } else {
            Job-Log "Erro ao executar script de atualização: Código $LASTEXITCODE" "ERROR"
            $updateOutput -split "`n" | ForEach-Object {
                if ($_.Trim()) {
                    Job-Log "WSL Error: $_" "ERROR"
                }
            }
        }
    } catch {
        Job-Log "Exceção ao executar script de atualização: $_" "ERROR"
    }
    
    Job-Log "Processo de atualização WSL concluído!"
} -ArgumentList $PSCommandPath, $JOB_LOG_FILE

Write-Log "Iniciando atualização do WSL em segundo plano..."
Write-Log "A atualização continuará mesmo depois que o instalador concluir."
Write-Log "Registros detalhados estão sendo salvos em: $JOB_LOG_FILE"

# Aguardar um curto período para garantir que o job iniciou
Start-Sleep -Seconds 2

# Verificar estado do job
if ($backgroundJob.State -eq "Running") {
    Write-Log "Job de atualização iniciado com sucesso."
} else {
    Write-Log "AVISO: Job pode não ter iniciado corretamente. Estado: $($backgroundJob.State)"
}

# Sair sem aguardar a conclusão do job - isso permite que o instalador continue
Write-Log "Processo de atualização WSL iniciado em segundo plano."
exit 0