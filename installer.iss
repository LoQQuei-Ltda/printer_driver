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
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Arquivos principais
Source: ".\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs
Source: ".\README.txt"; DestDir: "{app}"; Flags: isreadme
; Adicionar o instalador do Node.js
Source: ".\node_installer.msi"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Corrigindo o nome do executável no atalho
Name: "{group}\{#MyAppName}"; Filename: "{app}\Gerenciamento de Impressão - LoQQuei.exe"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\Gerenciamento de Impressão - LoQQuei.exe"; Tasks: desktopicon; WorkingDir: "{app}"

[Code]
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

// Função de inicialização da instalação
function InitializeSetup(): Boolean;
var
  NodeInstalled: Boolean;
  WSLInstalled: Boolean;
  NodeMsg: String;
  ResultCode: Integer;
begin
  Result := True;
  
  // Verificar se o Node.js está instalado
  NodeInstalled := IsNodeJsInstalled();
  if not NodeInstalled then
  begin
    Log('Node.js não está instalado no sistema');
    NodeMsg := 'Node.js não foi detectado no sistema. Esta aplicação requer Node.js para funcionar corretamente.'#13#10#13#10 +
               'O instalador pode instalar o Node.js automaticamente. Deseja continuar?';
               
    if MsgBox(NodeMsg, mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
      Exit;
    end;
  end;
  
  // Verificar requisitos de sistema
  if Result then
  begin
    MsgBox('Requisitos do sistema:' + #13#10#13#10 +
           '- Windows 10 ou superior' + #13#10 +
           '- Pelo menos 2GB de RAM' + #13#10 + 
           '- Pelo menos 20GB de espaço livre em disco' + #13#10 +
           '- Virtualização habilitada na BIOS/UEFI' + #13#10#13#10 +
           'Se o seu sistema não atende a estes requisitos, a instalação pode falhar.',
           mbInformation, MB_OK);
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
        MsgBox('Erro ao instalar o Node.js. Por favor, instale manualmente após a conclusão.', mbError, MB_OK);
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
      MsgBox('O instalador do Node.js não foi encontrado. Por favor, instale o Node.js manualmente após a conclusão.', mbError, MB_OK);
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