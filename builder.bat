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

@REM echo Limpando diretórios de build anteriores...
@REM if exist "dist" (
@REM   echo - Removendo pasta dist...
@REM   rmdir /s /q dist
@REM )

@REM if exist "node_modules" (
@REM   echo - Removendo node_modules...
@REM   rmdir /s /q node_modules
@REM )

if exist "Output" (
  echo - Removendo pasta Output...
  rmdir /s /q Output
)

echo.
echo Limpando diretórios de build anteriores...
echo - Fechando processos relacionados...
taskkill /f /im electron.exe >nul 2>&1
taskkill /f /im app-builder.exe >nul 2>&1
taskkill /f /im "Instalador de Gerenciamento de Impressão.exe" >nul 2>&1

REM Pausa para garantir que todos os processos foram encerrados
timeout /t 2 /nobreak >nul

if exist "dist" (
  echo - Removendo pasta dist...
  rmdir /s /q dist 2>nul
  if exist "dist" (
    rd /s /q dist 2>nul
  )
)

echo - Limpando cache do NPM...
call npm cache clean --force

echo - Instalando dependências com limpeza forçada...
call npm install --force

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