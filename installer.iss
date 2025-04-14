#define MyAppName "Gerenciamento de Impressão - LoQQuei"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "LoQQuei Ltda"
#define MyAppURL "https://github.com/LoQQuei-Ltda/print-management"
#define MyAppExeName "Gerenciamento de Impressão - LoQQuei.exe"

[Setup]
AppId={{8A8AA8A8-8888-4444-AAAA-444444444444}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\LoQQuei\PrintManagement
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir=Output
OutputBaseFilename=Installer_Gerenciamento_LoQQuei
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checked
Name: "viewreadme"; Description: "Visualizar o arquivo README"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
; Removido a opção de escolha para WSL - agora será obrigatório

[Files]
; Arquivos principais
Source: ".\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs
Source: ".\README.txt"; DestDir: "{app}"; Flags: isreadme
; Adicionar o instalador do Node.js
Source: ".\node_installer.msi"; DestDir: "{app}"; Flags: ignoreversion
; Adicionar script para instalação do WSL e Ubuntu
Source: ".\scripts\install_wsl_ubuntu.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
; Corrigindo o nome do executável no atalho
Name: "{group}\{#MyAppName}"; Filename: "{app}\Gerenciamento de Impressão - LoQQuei.exe"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\Gerenciamento de Impressão - LoQQuei.exe"; Tasks: desktopicon; WorkingDir: "{app}"

[Run]
; Visualizar o README se a opção for selecionada
Filename: "{app}\README.txt"; Description: "Visualizar o arquivo README"; Flags: shellexec postinstall skipifsilent; Tasks: viewreadme
; Executar o aplicativo principal após a instalação - agora obrigatório
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Flags: nowait postinstall runascurrentuser; Description: "Executar {#MyAppName}";
; Executar o script de instalação do WSL e Ubuntu automaticamente após a instalação principal
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install_wsl_ubuntu.ps1"""; Flags: runhidden postinstall; StatusMsg: "Configurando o WSL e Ubuntu (isso pode demorar alguns minutos)..."

[Code]
// Removi a declaração de constantes duplicadas
// As constantes MB_OK, MB_YESNO e IDNO já são definidas pelo Inno Setup

// Variáveis globais para status do WSL
var
  WSLInstalled: Boolean;
  WSL2Configured: Boolean;
  UbuntuInstalled: Boolean;
  NeedsWSLInstall: Boolean;
  VirtualizationEnabled: Boolean;

// Registrar mensagem no log de instalação
procedure LogMessage(Message: String);
begin
  Log(Message);
end;

// Função para verificar se o Node.js está instalado
function IsNodeJsInstalled(): Boolean;
var
  NodePath: String;
  ResultCode: Integer;
begin
  Result := False; // Inicializa como False
  
  // Tentar encontrar node.exe no PATH
  if RegQueryStringValue(HKLM, 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment', 'Path', NodePath) then
  begin
    // Verificar se node.exe pode ser encontrado e executado
    if Exec('cmd.exe', '/c where node > nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      Result := (ResultCode = 0);
      if Result then
        Log('Node.js encontrado no sistema');
    end;
  end;
    
  // Método alternativo: tentar executar node --version
  if not Result then
  begin
    if Exec('cmd.exe', '/c node --version > nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      Result := (ResultCode = 0);
      if Result then
        Log('Node.js encontrado no sistema (método alternativo)');
    end;
  end;
  
  // Se não encontrado, verificar se existe no diretório de instalação padrão
  if not Result then
  begin
    if FileExists(ExpandConstant('{pf}\nodejs\node.exe')) then
    begin
      Result := True;
      Log('Node.js encontrado no diretório padrão');
    end;
  end;
  
  if not Result then
    Log('Node.js não encontrado no sistema');
end;

// Função para verificar se o WSL está instalado
function IsWSLInstalled(): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  
  // Verificar se wsl.exe existe
  if FileExists(ExpandConstant('{sys}\wsl.exe')) then
  begin
    Log('WSL.exe encontrado no sistema');
    
    // Verificar se o comando WSL pode ser executado com sucesso
    if Exec('cmd.exe', '/c wsl --status > nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      Result := (ResultCode = 0);
      Log('Comando WSL executado com resultado: ' + IntToStr(ResultCode));
    end;
  end else
    Log('WSL.exe não encontrado no sistema');
end;

// Função para verificar se o WSL2 está configurado
function IsWSL2Configured(): Boolean;
var
  ResultCode: Integer;
  OutputFile: String;
  CmdLine: String;
  Output: TArrayOfString;
begin
  Result := False;
  
  // Se o WSL não está instalado, não precisamos verificar
  if not WSLInstalled then
    Exit;
  
  // Criar arquivo temporário para capturar saída
  OutputFile := ExpandConstant('{tmp}\wsl_version.txt');
  CmdLine := '/c wsl --set-default-version 2 > "' + OutputFile + '" 2>&1';
  
  if Exec('cmd.exe', CmdLine, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if LoadStringsFromFile(OutputFile, Output) then
    begin
      // Se não houver erro ou se a mensagem indicar que já está configurado
      if (ResultCode = 0) or (Pos('já', Output[0]) > 0) or (Pos('already', Output[0]) > 0) then
      begin
        Result := True;
        Log('WSL2 está configurado');
      end else
        Log('WSL2 não está configurado: ' + Output[0]);
    end;
  end;
  
  // Limpar arquivo temporário
  DeleteFile(OutputFile);
end;

// Função para verificar se o Ubuntu está instalado no WSL
function IsUbuntuInstalled(): Boolean;
var
  ResultCode: Integer;
  OutputFile: String;
  CmdLine: String;
  Output: TArrayOfString;
begin
  Result := False;
  
  // Se o WSL não está instalado, não precisamos verificar
  if not WSLInstalled then
    Exit;
  
  // Criar arquivo temporário para capturar saída
  OutputFile := ExpandConstant('{tmp}\wsl_list.txt');
  CmdLine := '/c wsl --list > "' + OutputFile + '" 2>&1';
  
  if Exec('cmd.exe', CmdLine, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if LoadStringsFromFile(OutputFile, Output) then
    begin
      // Verificar se 'Ubuntu' aparece na lista
      // Nota: este é um método simples, pode precisar de melhorias
      if (ResultCode = 0) and (Pos('Ubuntu', Output[0]) > 0) then
      begin
        Result := True;
        Log('Ubuntu está instalado no WSL');
      end else
        Log('Ubuntu não está instalado no WSL ou não foi encontrado');
    end;
  end;
  
  // Limpar arquivo temporário
  DeleteFile(OutputFile);
end;

// Função para verificar se a virtualização está habilitada
function IsVirtualizationEnabled(): Boolean;
var
  ResultCode: Integer;
  OutputFile: String;
  CmdLine: String;
  Output: TArrayOfString;
begin
  Result := False;
  
  // Usar PowerShell para verificar a virtualização
  OutputFile := ExpandConstant('{tmp}\virtualization.txt');
  CmdLine := '-ExecutionPolicy Bypass -Command "Get-ComputerInfo -Property HyperVRequirementVirtualizationFirmwareEnabled | Out-File -FilePath ''' + OutputFile + '''' + '"';
  
  if Exec('powershell.exe', CmdLine, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if LoadStringsFromFile(OutputFile, Output) then
    begin
      // Verificar resultado (procura por "True" na saída)
      if (ResultCode = 0) and (Pos('True', Output[2]) > 0) then
      begin
        Result := True;
        Log('Virtualização está habilitada no firmware');
      end else
        Log('Virtualização não está habilitada ou não foi possível determinar');
    end;
  end;
  
  // Limpar arquivo temporário
  DeleteFile(OutputFile);
end;

// Função modificada para sempre retornar True, já que agora WSL é obrigatório
function NeedsWSLConfigurationOrInstallation(): Boolean;
begin
  // Agora WSL é obrigatório, então vamos sempre retornar True
  Result := True;
end;

// Função de inicialização da instalação
function InitializeSetup(): Boolean;
var
  NodeInstalled: Boolean;
  NodeMsg: String;
  WSLMsg: String;
  VirtualizationMsg: String;
  MsgBoxResult: Integer;
begin
  Result := True;
  
  // Verificar se o Node.js está instalado
  NodeInstalled := IsNodeJsInstalled();
  if not NodeInstalled then
  begin
    Log('Node.js não está instalado no sistema');
    NodeMsg := 'Node.js não foi detectado no sistema. Esta aplicação requer Node.js para funcionar corretamente.'#13#10#13#10 +
               'O instalador pode instalar o Node.js automaticamente. Deseja continuar?';
               
    MsgBoxResult := SuppressibleMsgBox(NodeMsg, mbConfirmation, MB_YESNO, IDNO);
    if MsgBoxResult = IDNO then
    begin
      Result := False;
      Exit;
    end;
  end;
  
  // Verificar status do WSL
  WSLInstalled := IsWSLInstalled();
  if WSLInstalled then
  begin
    WSL2Configured := IsWSL2Configured();
    UbuntuInstalled := IsUbuntuInstalled();
  end else
  begin
    WSL2Configured := False;
    UbuntuInstalled := False;
  end;
  
  // Verificar virtualização
  VirtualizationEnabled := IsVirtualizationEnabled();
  
  // Determinar se precisamos instalar o WSL
  NeedsWSLInstall := not (WSLInstalled and WSL2Configured and UbuntuInstalled);
  
  // Exibir informações sobre status do WSL - agora sempre mostrar por ser obrigatório
  WSLMsg := 'Este aplicativo requer o Windows Subsystem for Linux (WSL) com Ubuntu para funcionar corretamente.' + #13#10#13#10;
  if not WSLInstalled then
    WSLMsg := WSLMsg + '- WSL não está instalado no sistema.' + #13#10
  else if not WSL2Configured then
    WSLMsg := WSLMsg + '- WSL está instalado, mas o WSL2 não está configurado.' + #13#10;
    
  if not UbuntuInstalled then
    WSLMsg := WSLMsg + '- Ubuntu não está instalado no WSL.' + #13#10;
    
  WSLMsg := WSLMsg + #13#10 + 'O instalador instalará automaticamente esses componentes após a conclusão da instalação principal.';
  
  SuppressibleMsgBox(WSLMsg, mbInformation, MB_OK, IDNO);
  
  // Verificar e alertar sobre a virtualização
  if not VirtualizationEnabled then
  begin
    VirtualizationMsg := 'ATENÇÃO: A virtualização parece não estar habilitada em seu sistema.' + #13#10#13#10 +
                         'O WSL2 requer que a virtualização esteja habilitada na BIOS/UEFI do seu computador.' + #13#10#13#10 +
                         'Recomendamos que você habilite a virtualização na BIOS/UEFI antes de prosseguir com a instalação.' + #13#10#13#10 +
                         'Deseja continuar mesmo assim?';
                         
    MsgBoxResult := SuppressibleMsgBox(VirtualizationMsg, mbConfirmation, MB_YESNO, IDNO);
    if MsgBoxResult = IDNO then
    begin
      Result := False;
      Exit;
    end;
  end;
  
  // Verificar requisitos de sistema
  if Result then
  begin
    SuppressibleMsgBox('Requisitos do sistema:' + #13#10#13#10 +
       '- Windows 10 ou superior' + #13#10 +
       '- Pelo menos 2GB de RAM' + #13#10 + 
       '- Pelo menos 20GB de espaço livre em disco' + #13#10 +
       '- Virtualização habilitada na BIOS/UEFI' + #13#10#13#10 +
       'Se o seu sistema não atende a estes requisitos, a instalação pode falhar.',
       mbInformation, MB_OK, IDNO);
  end;
end;

// Evento chamado após a instalação
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  NodeInstallerPath: String;
begin
  // Se estamos no passo pós-instalação e o Node.js não está instalado
  if (CurStep = ssPostInstall) and not IsNodeJsInstalled() then
  begin
    NodeInstallerPath := ExpandConstant('{app}\node_installer.msi');
    
    // Verificar se o instalador do Node.js existe
    if FileExists(NodeInstallerPath) then
    begin
      Log('Iniciando instalação do Node.js: ' + NodeInstallerPath);
      // Mostrar mensagem
      WizardForm.StatusLabel.Caption := CustomMessage('InstallingNode');
      WizardForm.ProgressGauge.Style := npbstMarquee;
      
      // Executar o instalador do Node.js
      if not Exec('msiexec.exe', '/i "' + NodeInstallerPath + '" /qn', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
      begin
        Log('Erro ao executar o instalador do Node.js: ' + SysErrorMessage(ResultCode));
        SuppressibleMsgBox('Erro ao instalar o Node.js. Por favor, instale manualmente após a conclusão.', mbError, MB_OK, IDNO);
      end
      else
      begin
        // Verificar se a instalação foi bem-sucedida
        if ResultCode = 0 then
          Log('Node.js instalado com sucesso')
        else
          Log('Instalação do Node.js concluída com código: ' + IntToStr(ResultCode));
      end;
      
      WizardForm.ProgressGauge.Style := npbstNormal;
    end
    else
    begin
      Log('Instalador do Node.js não encontrado: ' + NodeInstallerPath);
      SuppressibleMsgBox('O instalador do Node.js não foi encontrado. Por favor, instale o Node.js manualmente após a conclusão.', mbError, MB_OK, IDNO);
    end;
  end;
end;

[InstallDelete]
Type: files; Name: "{app}\install_log.txt"
Type: files; Name: "{app}\node_install.log"

[UninstallDelete]
Type: files; Name: "{app}\install_log.txt"
Type: files; Name: "{app}\node_install.log"
Type: files; Name: "{app}\installer.log"
Type: files; Name: "{app}\detail_installer.log"
Type: files; Name: "{app}\install_state.json"

[Messages]
BeveledLabel=LoQQuei-Ltda
WelcomeLabel2=Este assistente o guiará na instalação do {#MyAppName} em seu computador.%n%nEste programa irá instalar o aplicativo de gerenciamento que permitirá configurar o sistema de gerenciamento de impressão.%n%nRecomendamos fechar todos os outros aplicativos antes de continuar.
FinishedHeadingLabel=Instalação Concluída
FinishedLabel=O instalador concluiu a instalação do {#MyAppName}.%n%nPara configurar o sistema, execute o aplicativo a partir do ícone criado na área de trabalho ou no menu iniciar.

[CustomMessages]
brazilianportuguese.InstallationError=Ocorreu um erro durante a instalação. Consulte o arquivo de log para mais detalhes.
brazilianportuguese.InstallingNode=Instalando Node.js, por favor aguarde...
brazilianportuguese.InstallingWSL=Verificando e instalando WSL, por favor aguarde...