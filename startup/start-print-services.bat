@echo off
:: Script para iniciar serviços WSL ao iniciar o Windows
:: Criado pelo instalador do Sistema de Gerenciamento de Impressão

echo Iniciando serviços do Sistema de Gerenciamento de Impressão...
echo %date% %time% - Iniciando serviços >> "%USERPROFILE%\AppData\Local\print-server-startup.log"

:: Primeiro garantir que o WSL esteja em execução
wsl --list --running > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo %date% %time% - WSL não está em execução, iniciando WSL >> "%USERPROFILE%\AppData\Local\print-server-startup.log"
  :: Tentar iniciar alguma distribuição para ativar o WSL
  wsl -d Ubuntu -u root echo "Iniciando WSL" > nul 2>&1
  
  :: Aguardar um pouco para o WSL inicializar
  timeout /t 15 /nobreak > nul
)

:: Executar o script de verificação e inicialização de serviços no WSL
echo %date% %time% - Executando script de inicialização >> "%USERPROFILE%\AppData\Local\print-server-startup.log"
wsl -d Ubuntu -u root /opt/loqquei/print_server_desktop/start-services.sh

echo %date% %time% - Serviços iniciados >> "%USERPROFILE%\AppData\Local\print-server-startup.log"
echo Serviços do Sistema de Gerenciamento de Impressão iniciados com sucesso!

:: Verificar se o serviço de impressão PDF está respondendo
echo Verificando API do serviço de impressão...
wsl -d Ubuntu -u root curl -s -o nul -w "%%{http_code}" http://localhost:56258/api > "%TEMP%\api_status.txt" 2>nul

set /p API_STATUS=<"%TEMP%\api_status.txt"
if "%API_STATUS%"=="200" (
  echo %date% %time% - API respondendo normalmente (200 OK) >> "%USERPROFILE%\AppData\Local\print-server-startup.log"
  echo API do serviço está respondendo normalmente!
) else (
  echo %date% %time% - API não está respondendo corretamente >> "%USERPROFILE%\AppData\Local\print-server-startup.log"
  echo AVISO: API do serviço pode não estar funcionando corretamente.
  
  :: Tentar reiniciar o serviço PM2
  echo Tentando reiniciar serviço da API...
  wsl -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && pm2 restart all" > nul 2>&1
)

exit 0