@echo off
echo ===================================
echo Construindo o Sistema de Gerenciamento de Impressão
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

REM Verificar se o Inno Setup está instalado
if not exist "%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe" (
  if not exist "%PROGRAMFILES%\Inno Setup 6\ISCC.exe" (
    echo Erro: Inno Setup 6 não foi encontrado
    echo Por favor, instale o Inno Setup 6 antes de continuar
    echo Download: https://jrsoftware.org/isdl.php
    pause
    exit /b 1
  )
)

echo Limpando diretórios de build anteriores...
if exist "dist" (
  echo - Removendo pasta dist...
  rmdir /s /q dist
)

if exist "node_modules" (
  echo - Removendo node_modules...
  rmdir /s /q node_modules
)

if exist "Output" (
  echo - Removendo pasta Output...
  rmdir /s /q Output
)

echo.
echo Matando processos relacionados ao Electron...
taskkill /f /im electron.exe >nul 2>&1
taskkill /f /im app-builder.exe >nul 2>&1
taskkill /f /im "Instalador de Gerenciamento de Impressão.exe" >nul 2>&1

echo.
echo Instalando dependências...
call npm install
if %ERRORLEVEL% NEQ 0 (
  echo Erro: Não foi possível instalar as dependências
  pause
  exit /b 1
)

echo.
echo Construindo aplicação Electron...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo Erro: Não foi possível construir a aplicação Electron
  pause
  exit /b 1
)

echo.
echo Compilando o instalador com Inno Setup...
if exist "%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe" (
  "%PROGRAMFILES(X86)%\Inno Setup 6\ISCC.exe" installer.iss
) else (
  "%PROGRAMFILES%\Inno Setup 6\ISCC.exe" installer.iss
)

if %ERRORLEVEL% NEQ 0 (
  echo Erro: Não foi possível compilar o instalador
  pause
  exit /b 1
)

echo.
echo Construção concluída com sucesso!
echo O instalador está disponível na pasta "Output"
echo.
pause