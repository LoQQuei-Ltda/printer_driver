@echo off
setlocal enabledelayedexpansion
cls
echo ===================================
echo Sistema de Gerenciamento de Impressão
echo Menu de Construção Multiplataforma
echo ===================================
echo.

REM Verificar se as ferramentas necessárias estão instaladas
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Erro: Node.js não foi encontrado no PATH
  echo Por favor, instale o Node.js antes de continuar
  pause
  exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Erro: NPM não foi encontrado no PATH
  echo Por favor, instale o Node.js antes de continuar
  pause
  exit /b 1
)

:menu
cls
echo ===================================
echo Sistema de Gerenciamento de Impressão
echo Menu de Construção Multiplataforma
echo ===================================
echo.
echo Selecione a plataforma de destino:
echo 1. Windows (x64/x86)
echo 2. Linux
echo 3. macOS
echo 4. Todas as plataformas
echo 5. Limpar diretórios de build
echo 6. Sair
echo.
set /p plataforma="Digite a opção desejada: "

if "%plataforma%"=="1" goto :build_windows
if "%plataforma%"=="2" goto :build_linux
if "%plataforma%"=="3" goto :build_macos
if "%plataforma%"=="4" goto :build_all
if "%plataforma%"=="5" goto :clean
if "%plataforma%"=="6" goto :exit
echo Opção inválida. Por favor, tente novamente.
timeout /t 2 >nul
goto :menu

:clean
echo.
echo Limpando diretórios de build anteriores...

echo - Fechando processos relacionados...
taskkill /f /im electron.exe >nul 2>&1
taskkill /f /im app-builder.exe >nul 2>&1
taskkill /f /im "Instalador de Gerenciamento de Impressão.exe" >nul 2>&1

if exist "dist" (
  echo - Removendo pasta dist...
  rmdir /s /q dist
)

if exist "Output" (
  echo - Removendo pasta Output...
  rmdir /s /q Output
)

echo - Limpando cache do NPM...
call npm cache clean --force

echo.
echo Limpeza concluída.
pause
goto :menu

:build_windows
echo.
echo Construindo para Windows (x64/x86)...

REM Verificar se o Inno Setup está instalado para Windows
set "inno_setup_found=0"
if exist "%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe" (
  set "inno_setup_found=1"
  set "inno_setup_path=%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe"
) else if exist "%PROGRAMFILES%\Inno Setup 6\ISCC.exe" (
  set "inno_setup_found=1"
  set "inno_setup_path=%PROGRAMFILES%\Inno Setup 6\ISCC.exe"
)

if %inno_setup_found%==0 (
  echo Aviso: Inno Setup 6 não foi encontrado.
  echo O instalador Windows não será criado.
  echo Download: https://jrsoftware.org/isdl.php
  echo.
  choice /c YN /m "Deseja continuar sem o Inno Setup?"
  if !ERRORLEVEL!==2 goto :menu
)

echo.
echo Limpando diretório dist...
if exist "dist" rmdir /s /q dist

echo.
echo Construindo aplicação Electron para Windows...
call npm run build:win
if %ERRORLEVEL% NEQ 0 (
  echo Erro: Não foi possível construir a aplicação Electron para Windows
  pause
  goto :menu
)

REM Criar instalador Windows se o Inno Setup estiver disponível
if %inno_setup_found%==1 (
  echo.
  echo Compilando o instalador com Inno Setup...
  "%inno_setup_path%" installer.iss
  
  if %ERRORLEVEL% NEQ 0 (
    echo Erro: Não foi possível compilar o instalador
    pause
    goto :menu
  )
)

echo.
echo Construção para Windows concluída com sucesso!
if %inno_setup_found%==1 (
  echo O instalador está disponível na pasta "Output"
) else (
  echo Os arquivos executáveis estão disponíveis na pasta "dist"
)
echo.
pause
goto :menu

:build_linux
echo.
echo Construindo para Linux...

echo.
echo Limpando diretório dist...
if exist "dist" rmdir /s /q dist

echo.
echo Construindo aplicação Electron para Linux...
call npm run build:linux
if %ERRORLEVEL% NEQ 0 (
  echo Erro: Não foi possível construir a aplicação Electron para Linux
  pause
  goto :menu
)

echo.
echo Construção para Linux concluída com sucesso!
echo Os pacotes estão disponíveis na pasta "dist"
echo.
pause
goto :menu

:build_macos
echo.
echo Construindo para macOS...

echo.
echo AVISO: A construção para macOS a partir do Windows não é oficialmente suportada.
echo Esta operação provavelmente falhará.
echo.
echo Para construir para macOS, você precisa:
echo 1. Usar um sistema macOS
echo 2. Ou configurar um ambiente Docker específico para cross-building
echo.
choice /c YN /m "Deseja tentar mesmo assim?"
if !ERRORLEVEL!==2 goto :menu

echo.
echo Limpando diretório dist...
if exist "dist" rmdir /s /q dist

echo.
echo Tentando construir aplicação Electron para macOS...
call npm run build:mac
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Erro: Não foi possível construir a aplicação Electron para macOS
  echo Isso é esperado quando construindo para macOS a partir do Windows.
  echo Por favor, use um sistema macOS para esta operação.
  pause
  goto :menu
)

echo.
echo Construção para macOS concluída!
echo Os pacotes estão disponíveis na pasta "dist"
echo.
echo Nota: A construção para macOS a partir do Windows pode não ser funcional.
echo Para resultados garantidos, construa em um sistema macOS.
echo.
pause
goto :menu

:build_all
echo.
echo Construindo para todas as plataformas suportadas...

echo.
echo Limpando diretório dist...
if exist "dist" rmdir /s /q dist

echo.
echo Nota: A construção para macOS a partir do Windows não é suportada oficialmente.
echo Construindo apenas para Windows e Linux...

echo.
echo Construindo aplicação Electron para Windows e Linux...
call npm run build:win
if %ERRORLEVEL% NEQ 0 (
  echo Erro: Não foi possível construir a aplicação Electron para Windows
  pause
  goto :menu
)

call npm run build:linux
if %ERRORLEVEL% NEQ 0 (
  echo Erro: Não foi possível construir a aplicação Electron para Linux
  pause
  goto :menu
)

REM Criar instalador Windows se o Inno Setup estiver disponível
set "inno_setup_found=0"
if exist "%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe" (
  set "inno_setup_found=1"
  set "inno_setup_path=%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe"
) else if exist "%PROGRAMFILES%\Inno Setup 6\ISCC.exe" (
  set "inno_setup_found=1"
  set "inno_setup_path=%PROGRAMFILES%\Inno Setup 6\ISCC.exe"
)

if %inno_setup_found%==1 (
  echo.
  echo Compilando o instalador Windows com Inno Setup...
  "%inno_setup_path%" installer.iss
  
  if %ERRORLEVEL% NEQ 0 (
    echo Erro: Não foi possível compilar o instalador Windows
  )
)

echo.
echo Construção para todas as plataformas concluída!
echo Os pacotes estão disponíveis na pasta "dist"
if %inno_setup_found%==1 (
  echo O instalador Windows está disponível na pasta "Output"
)
echo.
echo Nota: A construção para macOS a partir do Windows pode não ser completa.
echo Para melhores resultados, construa em um sistema macOS.
echo.
pause
goto :menu

:exit
echo.
echo Saindo do script de construção.
echo.
endlocal
exit /b 0