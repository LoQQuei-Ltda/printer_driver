@echo off
echo ===================================
echo Limpando ambiente de desenvolvimento
echo ===================================
echo.

echo Verificando e encerrando processos relacionados...
taskkill /f /im electron.exe >nul 2>&1
taskkill /f /im app-builder.exe >nul 2>&1
taskkill /f /im "Instalador de Gerenciamento de Impressão.exe" >nul 2>&1
taskkill /f /im node.exe >nul 2>&1

echo.
echo Limpando diretórios temporários...

if exist "dist" (
  echo - Removendo pasta dist...
  rmdir /s /q dist
  if %ERRORLEVEL% NEQ 0 (
    echo Erro ao remover pasta dist. Tentando método alternativo...
    robocopy /MIR "empty_dir" "dist" >nul 2>&1
    rmdir /s /q dist >nul 2>&1
  )
)

if exist "node_modules" (
  echo - Removendo node_modules...
  rmdir /s /q node_modules
  if %ERRORLEVEL% NEQ 0 (
    echo Erro ao remover pasta node_modules. Tentando método alternativo...
    robocopy /MIR "empty_dir" "node_modules" >nul 2>&1
    rmdir /s /q node_modules >nul 2>&1
  )
)

if exist "Output" (
  echo - Removendo pasta Output...
  rmdir /s /q Output
  if %ERRORLEVEL% NEQ 0 (
    echo Erro ao remover pasta Output. Tentando método alternativo...
    robocopy /MIR "empty_dir" "Output" >nul 2>&1
    rmdir /s /q Output >nul 2>&1
  )
)

echo.
echo Limpando cache do npm...
call npm cache clean --force
call npm cache verify

echo.
echo Criando diretório temporário vazio para robocopy...
if not exist "empty_dir" mkdir empty_dir

echo.
echo Limpeza concluída com sucesso!
echo Execute 'builder.bat' para reconstruir a aplicação.
echo.
pause