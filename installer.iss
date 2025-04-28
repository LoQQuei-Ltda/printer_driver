#define MyAppName "Gerenciamento de Impressão - LoQQuei"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "LoQQuei Ltda"
#define MyAppURL "https://loqquei.com.br"
#define MyAppExeName "Gerenciamento de Impressão - LoQQuei.exe"

[Setup]
; Identificador único da aplicação
AppId={{8A8AA8A8-8888-4444-AAAA-444444444444}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\LoQQuei\PrintManagement
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Necessário para atualizações e administração do WSL
PrivilegesRequired=admin
OutputDir=Output
OutputBaseFilename=Installer_Gerenciamento_LoQQuei
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMADictionarySize=1048576
LZMANumFastBytes=273
WizardStyle=modern
; Habilitar log detalhado para diagnóstico
SetupLogging=yes
; Permitir atualização silenciosa
CloseApplications=force
RestartApplications=no
; Suporte para atualização da aplicação
AppMutex=LoQQueiPrintManagementMutex
AppendDefaultDirName=no
UpdateUninstallLogAppName=yes
; Permitir o desinstalador, mas ocultá-lo para usuários comuns
Uninstallable=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
; Definir ícone próprio para o instalador
SetupIconFile=assets\icon\dark.ico
WizardSmallImageFile=assets\icon\dark.ico
WizardImageFile=assets\icon\dark.ico

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
; Personalizar mensagens para o idioma padrão
brazilianportuguese.SetupWindowTitle=Instalador do {#MyAppName}
brazilianportuguese.SetupAppTitle={#MyAppName}
brazilianportuguese.WelcomeLabel1=Bem-vindo ao Assistente de Instalação do {#MyAppName}
brazilianportuguese.WelcomeLabel2=Este assistente irá guiá-lo através da instalação do {#MyAppName} versão {#MyAppVersion}.%n%nRecomendamos que você feche todos os outros aplicativos antes de continuar.
brazilianportuguese.InstallingLabel=Instalando {#MyAppName}, por favor aguarde...
brazilianportuguese.FinishedHeadingLabel=Instalação Concluída
brazilianportuguese.FinishedLabel=O {#MyAppName} foi instalado com sucesso em seu computador.
brazilianportuguese.RunEntryShellExec=Executar {#MyAppName}

[CustomMessages]
brazilianportuguese.InstallingNode=Instalando Node.js, por favor aguarde...
brazilianportuguese.InstallingWSL=Verificando e configurando WSL, por favor aguarde...
brazilianportuguese.ConfiguringWSL=Configurando ambiente WSL, por favor aguarde...
brazilianportuguese.UpdatingWSL=Atualizando componentes WSL, por favor aguarde...
brazilianportuguese.CreatingShortcut=Criando atalhos...
brazilianportuguese.WSLUpdateFailed=Atualização do WSL falhou. Consulte os logs para mais detalhes.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode
Name: "startmenuicon"; Description: "Criar ícone no Menu Iniciar"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; Arquivos principais da aplicação
Source: ".\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,*.map,*.log,*.tmp"
; Arquivo README e documentação
Source: ".\README.txt"; DestDir: "{app}"; Flags: isreadme
; Instalador do Node.js
Source: ".\node_installer.msi"; DestDir: "{app}"; Flags: ignoreversion
; Scripts de instalação e atualização
Source: ".\scripts\install_wsl_ubuntu.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: ".\scripts\update_wsl.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
; Recursos do print_server_desktop
Source: ".\resources\print_server_desktop\*"; DestDir: "{app}\resources\print_server_desktop"; Flags: ignoreversion recursesubdirs createallsubdirs
; Scripts de atualização para o WSL
Source: ".\resources\print_server_desktop\updates\*"; DestDir: "{app}\resources\print_server_desktop\updates"; Flags: ignoreversion

[Dirs]
; Garantir que diretórios cruciais existam e tenham permissões corretas
Name: "{app}\resources"; Permissions: users-modify
Name: "{app}\scripts"; Permissions: users-modify
Name: "{app}\logs"; Permissions: users-modify
Name: "{app}\resources\print_server_desktop"; Permissions: users-modify
Name: "{app}\resources\print_server_desktop\updates"; Permissions: users-modify

[Icons]
; Ícones para acesso à aplicação
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; WorkingDir: "{app}"
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon; WorkingDir: "{app}"
Name: "{commonstartmenu}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startmenuicon; WorkingDir: "{app}"

[Run]
; Terminar qualquer instância de aplicação em execução
Filename: "taskkill.exe"; Parameters: "/f /im ""{#MyAppExeName}"""; Flags: runhidden skipifdoesntexist

; Node.js (executado durante a instalação se necessário, verificado pelo código)
Filename: "msiexec.exe"; Parameters: "/i ""{app}\node_installer.msi"" /qn"; Flags: runhidden; StatusMsg: "{cm:InstallingNode}"; Check: NeedsNodeJs

; Processo de instalação normal (primeira instalação)
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install_wsl_ubuntu.ps1"""; Flags: runhidden waituntilterminated; StatusMsg: "{cm:InstallingWSL}"; Check: not IsSilent and not IsUpgrade and not IsWSLInstalledForRun
; Processo de atualização (atualização silenciosa ou explícita)
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\update_wsl.ps1"""; Flags: runhidden waituntilterminated; StatusMsg: "{cm:UpdatingWSL}"; Check: IsUpgrade or IsSilent

; Execução da aplicação após instalação (não executar no modo silencioso)
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent; Check: not IsSilent

[UninstallRun]
; Parar a aplicação antes da desinstalação
Filename: "taskkill.exe"; Parameters: "/f /im ""{#MyAppExeName}"""; Flags: runhidden

; Desinstalar corretamente - limpar serviços e registros
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""& {{ try {{ wsl -d Ubuntu -u root bash -c 'cd /opt/print_server && if [ -f uninstall.sh ]; then bash uninstall.sh; fi' }} catch {{ Write-Host 'WSL não disponível ou erro na desinstalação' }} }}"""; Flags: runhidden

; Remover a distribuição Ubuntu do WSL
Filename: "wsl.exe"; Parameters: "--unregister Ubuntu"; Flags: runhidden

[Registry]
; Registrar versão e informações da instalação para facilitar atualizações futuras
Root: HKLM; Subkey: "SOFTWARE\LoQQuei\PrintManagement"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "SOFTWARE\LoQQuei\PrintManagement"; ValueType: string; ValueName: "Version"; ValueData: "{#MyAppVersion}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "SOFTWARE\LoQQuei\PrintManagement"; ValueType: dword; ValueName: "InstallDate"; ValueData: {code:GetCurrentUnixTime}; Flags: uninsdeletekey

[Code]
// Variáveis globais para status
var
  WSLInstalled: Boolean;
  WSL2Configured: Boolean;
  UbuntuInstalled: Boolean;
  NodeInstalled: Boolean;
  VirtualizationEnabled: Boolean;
  IsInstalledVersion: String;
  IsUpdateMode: Boolean;

// Função para registro extenso
procedure LogInstaller(Message: String);
begin
  Log(Message);
end;

// Função para obter o timestamp atual (versão simplificada)
function GetCurrentUnixTime(Param: String): String;
begin
  // Apenas retornar a data atual em formato numérico AAAAMMDD
  // Isso não é um verdadeiro timestamp Unix, mas serve como ID de versão
  Result := GetDateTimeString('yyyymmdd', '', '');
end;

// Comparar versões (compara a.b.c com x.y.z)
function CompareVersions(Version1, Version2: String): Integer;
var
  V1Major, V1Minor, V1Build: Integer;
  V2Major, V2Minor, V2Build: Integer;
  Temp: String;
  DotPos: Integer;
begin
  // Inicializar com igual
  Result := 0;
  
  // Extrair Major.Minor.Build da primeira versão
  Temp := Version1;
  DotPos := Pos('.', Temp);
  if DotPos > 0 then
  begin
    V1Major := StrToIntDef(Copy(Temp, 1, DotPos-1), 0);
    Delete(Temp, 1, DotPos);
    
    DotPos := Pos('.', Temp);
    if DotPos > 0 then
    begin
      V1Minor := StrToIntDef(Copy(Temp, 1, DotPos-1), 0);
      Delete(Temp, 1, DotPos);
      V1Build := StrToIntDef(Temp, 0);
    end else
    begin
      V1Minor := StrToIntDef(Temp, 0);
      V1Build := 0;
    end;
  end else
  begin
    V1Major := StrToIntDef(Temp, 0);
    V1Minor := 0;
    V1Build := 0;
  end;
  
  // Extrair Major.Minor.Build da segunda versão
  Temp := Version2;
  DotPos := Pos('.', Temp);
  if DotPos > 0 then
  begin
    V2Major := StrToIntDef(Copy(Temp, 1, DotPos-1), 0);
    Delete(Temp, 1, DotPos);
    
    DotPos := Pos('.', Temp);
    if DotPos > 0 then
    begin
      V2Minor := StrToIntDef(Copy(Temp, 1, DotPos-1), 0);
      Delete(Temp, 1, DotPos);
      V2Build := StrToIntDef(Temp, 0);
    end else
    begin
      V2Minor := StrToIntDef(Temp, 0);
      V2Build := 0;
    end;
  end else
  begin
    V2Major := StrToIntDef(Temp, 0);
    V2Minor := 0;
    V2Build := 0;
  end;
  
  // Comparar Major
  if V1Major > V2Major then
    Result := 1
  else if V1Major < V2Major then
    Result := -1
  else begin
    // Se Major é igual, comparar Minor
    if V1Minor > V2Minor then
      Result := 1
    else if V1Minor < V2Minor then
      Result := -1
    else begin
      // Se Minor é igual, comparar Build
      if V1Build > V2Build then
        Result := 1
      else if V1Build < V2Build then
        Result := -1;
    end;
  end;
end;

// Verifica se é uma atualização (compara versões)
function IsUpgrade(): Boolean;
var
  PrevVersion: String;
begin
  if RegValueExists(HKLM, 'SOFTWARE\LoQQuei\PrintManagement', 'Version') then
  begin
    RegQueryStringValue(HKLM, 'SOFTWARE\LoQQuei\PrintManagement', 'Version', PrevVersion);
    IsInstalledVersion := PrevVersion;
    Result := (CompareVersions('{#MyAppVersion}', PrevVersion) > 0);
    if Result then
      LogInstaller('Versão anterior encontrada: ' + PrevVersion + ', Nova versão: {#MyAppVersion}, É atualização: Sim')
    else
      LogInstaller('Versão anterior encontrada: ' + PrevVersion + ', Nova versão: {#MyAppVersion}, É atualização: Não');
  end
  else
  begin
    Result := False;
    LogInstaller('Instalação nova (não é atualização)');
  end;
end;

// Verifica se está em modo silencioso
function IsSilent(): Boolean;
begin
  Result := (Pos('/SILENT', UpperCase(GetCmdTail)) > 0) or (Pos('/VERYSILENT', UpperCase(GetCmdTail)) > 0);
  if Result then
    LogInstaller('Modo silencioso: Sim')
  else
    LogInstaller('Modo silencioso: Não');
end;

// Função para verificar se o Node.js está instalado
function IsNodeJsInstalled(): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  
  // Verificar se node.exe pode ser encontrado e executado
  if Exec('cmd.exe', '/c where node > nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := (ResultCode = 0);
    if Result then
      LogInstaller('Node.js encontrado no sistema');
  end;
    
  // Método alternativo: tentar executar node --version
  if not Result then
  begin
    if Exec('cmd.exe', '/c node --version > nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      Result := (ResultCode = 0);
      if Result then
        LogInstaller('Node.js encontrado no sistema (método alternativo)');
    end;
  end;
  
  // Se não encontrado, verificar se existe no diretório de instalação padrão
  if not Result then
  begin
    if FileExists(ExpandConstant('{pf}\nodejs\node.exe')) then
    begin
      Result := True;
      LogInstaller('Node.js encontrado no diretório padrão');
    end;
  end;
  
  if not Result then
    LogInstaller('Node.js não encontrado no sistema');
    
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
    LogInstaller('WSL.exe encontrado no sistema');
    
    // Verificar se o comando WSL pode ser executado com sucesso
    if Exec('cmd.exe', '/c wsl --status > nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      Result := (ResultCode = 0);
      LogInstaller('Comando WSL executado com resultado: ' + IntToStr(ResultCode));
    end;
  end else
    LogInstaller('WSL.exe não encontrado no sistema');
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
        LogInstaller('WSL2 está configurado');
      end else
        LogInstaller('WSL2 não está configurado: ' + Output[0]);
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
      if (ResultCode = 0) and (Pos('Ubuntu', Output[0]) > 0) then
      begin
        Result := True;
        LogInstaller('Ubuntu está instalado no WSL');
      end else
        LogInstaller('Ubuntu não está instalado no WSL ou não foi encontrado');
    end;
  end;
  
  // Limpar arquivo temporário
  DeleteFile(OutputFile);
end;

// Função para verificar se a virtualização está habilitada - versão melhorada
function IsVirtualizationEnabled(): Boolean;
var
  ResultCode: Integer;
  OutputFile: String;
  CmdLine: String;
  Output: TArrayOfString;
begin
  Result := False;
  
  // Método 1: Usar PowerShell para verificar via Hyper-V
  OutputFile := ExpandConstant('{tmp}\virtualization.txt');
  CmdLine := '-ExecutionPolicy Bypass -Command "(Get-ComputerInfo -Property HyperVRequirementVirtualizationFirmwareEnabled).HyperVRequirementVirtualizationFirmwareEnabled" > "' + OutputFile + '"';
  
  if Exec('powershell.exe', CmdLine, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if LoadStringsFromFile(OutputFile, Output) and (Length(Output) > 0) then
    begin
      if (Pos('True', Output[0]) > 0) then
      begin
        Result := True;
        LogInstaller('Virtualização está habilitada via Hyper-V check');
        DeleteFile(OutputFile);
        Exit;
      end;
    end;
  end;
  
  // Método 2: Usar systeminfo para detectar virtualização
  OutputFile := ExpandConstant('{tmp}\virtualization_sysinfo.txt');
  CmdLine := '/c systeminfo | findstr /C:"Virtualização habilitada no firmware" /C:"Virtualization Enabled In Firmware" > "' + OutputFile + '"';
  
  if Exec('cmd.exe', CmdLine, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if LoadStringsFromFile(OutputFile, Output) and (Length(Output) > 0) then
    begin
      if (Pos('Sim', Output[0]) > 0) or (Pos('Yes', Output[0]) > 0) then
      begin
        Result := True;
        LogInstaller('Virtualização está habilitada via systeminfo check');
        DeleteFile(OutputFile);
        Exit;
      end;
    end;
  end;

  // Método 3: Verificar se o WSL2 já está funcionando
  if WSL2Configured then
  begin
    Result := True;
    LogInstaller('Virtualização considerada habilitada pois WSL2 já está configurado');
    Exit;
  end;

  // Método 4: Verificar se Hyper-V ou outra virtualização está em execução
  OutputFile := ExpandConstant('{tmp}\virtualization_service.txt');
  CmdLine := '/c sc query vmcompute | find "RUNNING" > "' + OutputFile + '"';
  
  if Exec('cmd.exe', CmdLine, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if LoadStringsFromFile(OutputFile, Output) and (Length(Output) > 0) then
    begin
      if (Pos('RUNNING', Output[0]) > 0) then
      begin
        Result := True;
        LogInstaller('Virtualização está habilitada pois serviço vmcompute está em execução');
        DeleteFile(OutputFile);
        Exit;
      end;
    end;
  end;
  
  // Limpar arquivos temporários
  DeleteFile(OutputFile);
  
  LogInstaller('Virtualização parece estar desabilitada após múltiplas verificações');
end;

// Verifica se o Node.js precisa ser instalado
function NeedsNodeJs(): Boolean;
begin
  Result := not IsNodeJsInstalled();
  if Result then
    LogInstaller('Precisa instalar Node.js: Sim')
  else
    LogInstaller('Precisa instalar Node.js: Não');
end;

// Função de inicialização da instalação
function InitializeSetup(): Boolean;
var
  MsgBoxResult: Integer;
begin
  Result := True;
  
  // Se é uma atualização silenciosa, não mostrar mensagens
  IsUpdateMode := IsSilent() or IsUpgrade();
  
  if IsUpdateMode then
  begin
    LogInstaller('Iniciando em modo de atualização - verificando ambiente...');
  end else
  begin
    // Verificar se o Node.js está instalado
    NodeInstalled := IsNodeJsInstalled();
    if not NodeInstalled then
    begin
      LogInstaller('Node.js não está instalado no sistema');
      // Não mostrar confirmação, apenas instalar Node.js automaticamente
    end;
    
    // Verificar status do WSL (apenas para instalação normal)
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
    
    // Verificar virtualização - método melhorado que não necessita de confirmação redundante
    VirtualizationEnabled := IsVirtualizationEnabled();
    
    if not IsSilent() then
    begin
      // Mostrar informações do WSL apenas se não estiver instalado
      if not WSLInstalled then
      begin
        LogInstaller('Precisa instalar/configurar WSL');
        
        MsgBoxResult := SuppressibleMsgBox(
          'Este aplicativo requer o Windows Subsystem for Linux (WSL) com Ubuntu para funcionar corretamente.' + #13#10#13#10 +
          'O sistema precisará ser reiniciado após a instalação do WSL para continuar o processo.' + #13#10#13#10 +
          'Deseja continuar com a instalação?', 
          mbInformation, MB_YESNO, IDYES);
        
        if MsgBoxResult = IDNO then
        begin
          Result := False;
          Exit;
        end;
      end;
      
      // Verificar e alertar sobre a virtualização somente se WSL não estiver instalado
      if not WSLInstalled and not VirtualizationEnabled then
      begin
        MsgBoxResult := SuppressibleMsgBox(
          'ATENÇÃO: A virtualização parece não estar habilitada em seu sistema.' + #13#10#13#10 +
          'O WSL2 requer que a virtualização esteja habilitada na BIOS/UEFI do seu computador.' + #13#10#13#10 +
          'Recomendamos que você habilite a virtualização na BIOS/UEFI antes de prosseguir.' + #13#10#13#10 +
          'Deseja continuar mesmo assim?', 
          mbConfirmation, MB_YESNO, IDNO);
          
        if MsgBoxResult = IDNO then
        begin
          Result := False;
          Exit;
        end;
      end;
    end;
  end;
end;

// Verificar se o WSL está instalado - função exposta para uso em [Run]
function IsWSLInstalledForRun(): Boolean;
begin
  Result := IsWSLInstalled;
end;

// Evento chamado após a instalação
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Registrar a conclusão da instalação
    LogInstaller('Instalação concluída com sucesso');
    
    // Se for uma atualização, registrar a versão anterior e a nova
    if IsUpgrade() then
    begin
      LogInstaller('Atualizado com sucesso da versão ' + IsInstalledVersion + ' para ' + '{#MyAppVersion}');
    end;
  end;
end;

// Lidar com erros durante a instalação
function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := '';
  
  // Mostrar informações da instalação
  if MemoDirInfo <> '' then
    Result := Result + MemoDirInfo + NewLine + NewLine;
    
  // Adicionar informações de WSL se estiver instalando pela primeira vez
  if not WSLInstalled or not WSL2Configured or not UbuntuInstalled then
  begin
    Result := Result + 'Configurações adicionais:' + NewLine;
    Result := Result + Space + '- Windows Subsystem for Linux (WSL2)' + NewLine;
    Result := Result + Space + '- Ubuntu para WSL' + NewLine;
    Result := Result + NewLine;
  end;
  
  // Se precisar de Node.js
  if not NodeInstalled then
  begin
    Result := Result + 'Dependências adicionais:' + NewLine;
    Result := Result + Space + '- Node.js' + NewLine;
    Result := Result + NewLine;
  end;
  
  // Adicionar grupos de atalhos
  if MemoGroupInfo <> '' then
    Result := Result + MemoGroupInfo + NewLine + NewLine;
    
  // Adicionar tarefas selecionadas
  if MemoTasksInfo <> '' then
    Result := Result + MemoTasksInfo + NewLine + NewLine;
    
  // Adicionar informações sobre o modo de instalação
  if IsUpgrade() then
    Result := Result + 'Modo: Atualização (da versão ' + IsInstalledVersion + ' para ' + '{#MyAppVersion}' + ')' + NewLine
  else
    Result := Result + 'Modo: Nova instalação' + NewLine;
    
  // Adicionar aviso se estiver em modo silencioso
  if IsSilent() then
    Result := Result + 'Atenção: Operando em modo silencioso' + NewLine;
end;

// Preparar a desinstalação
procedure InitializeUninstallProgressForm();
begin
  // Parar a aplicação antes da desinstalaçsão
end;

// Função chamada durante a desinstalação
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  // Depois que os arquivos são desinstalados
  if CurUninstallStep = usPostUninstall then
  begin
    // Tentar remover a distribuição Ubuntu do WSL se existir
    Exec('cmd.exe', '/c wsl --unregister Ubuntu', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    
    // Limpar quaisquer arquivos temporários que possam ter sido deixados
    DelTree(ExpandConstant('{tmp}\wsl-setup'), True, True, True);
    
    // Verificar e remover possíveis diretórios de dados restantes
    DelTree(ExpandConstant('{localappdata}\LoQQuei'), True, True, True);
  end;
end;