@echo off
echo ===================================
echo Construindo o Sistema de Gerenciamento de Impressao com Ofuscacao
echo ===================================
echo.

REM Verificar se as ferramentas necessárias estão instaladas
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Erro: Node.js nao foi encontrado no PATH
  echo Por favor, instale o Node.js antes de continuar
  pause
  exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Erro: NPM nao foi encontrado no PATH
  echo Por favor, instale o Node.js antes de continuar
  pause
  exit /b 1
)

REM Verificar se o Inno Setup está instalado
if not exist "%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe" (
  if not exist "%PROGRAMFILES%\Inno Setup 6\ISCC.exe" (
    echo Erro: Inno Setup 6 nao foi encontrado
    echo Por favor, instale o Inno Setup 6 antes de continuar
    echo Download: https://jrsoftware.org/isdl.php
    pause
    exit /b 1
  )
)

echo Fechando processos do Electron que possam estar em execucao...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM SystemaDeGerenciamentoDe.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Limpando diretorios de build anteriores...
if exist "dist" (
  echo - Tentando remover pasta dist...
  
  REM Tentativa com várias repetições para garantir que os arquivos sejam liberados
  for /l %%i in (1,1,5) do (
    rmdir /s /q dist 2>nul
    if not exist "dist" goto :dist_removed
    echo - Tentativa %%i falhou, aguardando...
    timeout /t 2 /nobreak >nul
  )
  
  echo - Usando método alternativo para remoção...
  del /f /s /q dist\* >nul 2>&1
  rmdir /s /q dist >nul 2>&1
)

:dist_removed
if exist "dist-obfuscated" (
  echo - Removendo pasta dist-obfuscated...
  rmdir /s /q dist-obfuscated
)

if exist "dist-temp" (
  echo - Removendo pasta dist-temp...
  rmdir /s /q dist-temp
)

if exist "Output" (
  echo - Removendo pasta Output...
  rmdir /s /q Output
)

echo.
echo Limpando cache NPM...
call npm cache clean --force

echo.
echo Instalando dependencias de ofuscacao...
call npm install --save-dev javascript-obfuscator glob uglify-js

echo.
echo Preparando arquivos do servidor para obfuscação...
node prepare-server-files.js
if %ERRORLEVEL% NEQ 0 (
  echo Aviso: Preparação dos arquivos do servidor encontrou alguns problemas.
  echo Continuando com a build mesmo assim...
)

echo.
echo Construindo aplicacao Electron...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo Erro: Nao foi possivel construir a aplicacao Electron
  pause
  exit /b 1
)

echo.
echo Aguardando para garantir que todos os arquivos sejam liberados...
timeout /t 5 /nobreak >nul

echo Aplicando ofuscacao avancada aos arquivos...
echo Criar backup dos arquivos originais? (S/N)
set /p BACKUP_CHOICE="Escolha: "
if /i "%BACKUP_CHOICE%"=="S" (
  echo Criando backup...
  if exist "backup-original" (
    rmdir /s /q backup-original
  )
  mkdir backup-original 2>nul
  xcopy /s /y dist\*.* backup-original\
  
  REM Copiar também os arquivos do resources explicitamente
  if exist "resources" (
    mkdir backup-original\resources 2>nul
    xcopy /s /y resources\*.* backup-original\resources\
  )
  
  echo Backup criado em 'backup-original'
  echo Aguardando finalização da cópia...
  timeout /t 3 /nobreak >nul
)

echo.
echo Executando script de ofuscacao...

REM Criar pasta temporária para conter os arquivos ofuscados
if not exist "dist-temp" (
  mkdir "dist-temp" 2>nul
)

REM Copiar arquivos para pasta temporária antes de ofuscar (evita problemas de lock)
echo Copiando arquivos para processamento...
xcopy /s /y /e /i dist\*.* dist-temp\

REM Copiar o diretório resources para a pasta dist-temp para ofuscação
if exist "resources" (
  echo Copiando diretório resources para ofuscação...
  mkdir "dist-temp\resources" 2>nul
  xcopy /s /y /e resources\*.* dist-temp\resources\
)

echo Ofuscando todos os arquivos...
node obfuscate.js dist-temp dist-obfuscated

if %ERRORLEVEL% NEQ 0 (
  echo Aviso: Ofuscacao pode nao ter sido totalmente aplicada
  echo Continuando com a build...
) else (
  echo Ofuscacao concluida com sucesso!
)

echo.
echo Verificando se há arquivos críticos que possam ter sido perdidos...
if not exist "dist-obfuscated\main.js" (
  echo ERRO: Arquivo main.js não encontrado na saída. A ofuscação falhou?
  
  REM Tentar recuperar do dist-temp
  if exist "dist-temp\main.js" (
    echo Copiando main.js do diretório temporário...
    copy /y "dist-temp\main.js" "dist-obfuscated\main.js"
  ) else (
    echo ERRO CRÍTICO: Não foi possível recuperar main.js.
    pause
    exit /b 1
  )
)

REM Verificar recursos após ofuscação
if not exist "dist-obfuscated\resources" (
  echo Aviso: Diretório resources não encontrado após ofuscação.
  echo Criando diretório e copiando recursos originais...
  mkdir "dist-obfuscated\resources" 2>nul
  
  if exist "dist-temp\resources" (
    xcopy /s /y /e dist-temp\resources\*.* dist-obfuscated\resources\
  )
)

echo.
echo Preparando arquivos ofuscados para o instalador...
if exist "dist-obfuscated" (
  REM Remover dist original se ainda existir
  if exist "dist" (
    rmdir /s /q dist
  )
  
  REM Renomear a pasta com arquivos ofuscados para dist
  move dist-obfuscated dist
  echo Arquivos ofuscados prontos para empacotamento
) else (
  echo ERRO: Diretório de arquivos ofuscados não encontrado.
  echo Usando arquivos originais como fallback...
  
  if exist "dist-temp" (
    move dist-temp dist
  )
)

echo.
echo Compilando o instalador com Inno Setup...
if exist "%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe" (
  "%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe" installer.iss
) else (
  "%PROGRAMFILES%\Inno Setup 6\ISCC.exe" installer.iss
)

if %ERRORLEVEL% NEQ 0 (
  echo Erro: Nao foi possivel compilar o instalador
  pause
  exit /b 1
)

echo.
echo Removendo arquivos intermediarios...
echo Deseja manter os arquivos intermediarios? (S/N)
set /p KEEP_CHOICE="Escolha: "
if /i NOT "%KEEP_CHOICE%"=="S" (
  echo Removendo arquivos intermediarios...
  if exist "dist" (
    rmdir /s /q dist
  )
  if exist "dist-temp" (
    rmdir /s /q dist-temp
  )
  echo Arquivos intermediarios removidos.
)

echo.
echo Construcao concluida com sucesso!
echo O instalador protegido esta disponivel na pasta "Output"
echo Os arquivos ofuscados nao podem ser facilmente revertidos para o codigo original.
echo.
pause