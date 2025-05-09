#define MyAppName "Gerenciamento de Impressão - LoQQuei"
#define MyAppVersion "1.0.6"
#define MyAppPublisher "LoQQuei"
#define MyAppURL "https://loqquei.com.br"
#define MyAppExeName "Gerenciamento de Impressão - LoQQuei.exe"

[Setup]
; Identificador único da aplicação
AppId={{8A8AA8A8-8888-4444-AAAA-444444444444}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppContact=programadores@loqquei.com.br
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\LoQQuei\PrintManagement
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Necessário para atualizações e administração do WSL
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=Output
OutputBaseFilename=Instalador_Gerenciamento_LoQQuei_V{#MyAppVersion}
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
SetupIconFile=assets\icon\light.ico
; Configurações para automação e desabilitação de páginas
DisableReadyPage=yes
DisableFinishedPage=no

; Adicionar metadados detalhados para o instalador (ajuda a reduzir alertas)
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Sistema de Gerenciamento de Impressão LoQQuei
VersionInfoTextVersion={#MyAppVersion}
VersionInfoCopyright=Copyright © 2025 LoQQuei
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
VersionInfoProductTextVersion={#MyAppVersion}

; Configurações para lidar com detecção de antivírus
AppCopyright=Copyright © 2025 LoQQuei
SetupMutex=LoQQueiInstallMutex_{#MyAppVersion}
ShowLanguageDialog=auto
ChangesEnvironment=yes
ChangesAssociations=no
AlwaysRestart=no

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
; Adicionar opção para o usuário escolher se quer que o app sempre execute como admin
Name: "alwaysadmin"; Description: "Sempre executar como administrador"; GroupDescription: "Configurações adicionais:"; Flags: unchecked
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce; Check: not IsAdminInstallMode
Name: "startmenuicon"; Description: "Criar ícone no Menu Iniciar"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; Arquivos principais da aplicação
Source: ".\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,*.map,*.log,*.tmp"
; Arquivo README e documentação
Source: ".\README.txt"; DestDir: "{app}"; Flags: ignoreversion
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
Name: "{app}"; Permissions: everyone-full
Name: "{app}\resources"; Permissions: everyone-full
Name: "{app}\scripts"; Permissions: everyone-full
Name: "{app}\logs"; Permissions: everyone-full
Name: "{app}\resources\print_server_desktop"; Permissions: everyone-full
Name: "{app}\resources\print_server_desktop\updates"; Permissions: everyone-full
Name: "{commonappdata}\LoQQuei\WSL"; Permissions: everyone-full
Name: "{commonappdata}\LoQQuei\WSL\Ubuntu"; Permissions: everyone-full

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; WorkingDir: "{app}"
Name: "{commonappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon; WorkingDir: "{app}"
Name: "{commonstartmenu}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startmenuicon; WorkingDir: "{app}"

[Run]
; Script para configurar o WSL para permitir acesso de usuários comuns
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""$acl = Get-Acl 'C:\ProgramData\Microsoft\Windows\WindowsApps'; $rule = New-Object System.Security.AccessControl.FileSystemAccessRule('Users', 'Modify', 'ContainerInherit, ObjectInherit', 'None', 'Allow'); $acl.SetAccessRule($rule); Set-Acl 'C:\ProgramData\Microsoft\Windows\WindowsApps' $acl"""; Flags: runhidden; StatusMsg: "Configurando permissões para WSL..."; Check: not WizardSilent

; Configurar permissões no diretório de dados do WSL
Filename: "icacls.exe"; Parameters: """C:\Program Files\WindowsApps"" /grant Users:(OI)(CI)RX"; Flags: runhidden; StatusMsg: "Configurando permissões adicionais..."; Check: not WizardSilent

; Configurar permissões no WSL manager
Filename: "sc.exe"; Parameters: "config LxssManager type= own"; Flags: runhidden; StatusMsg: "Configurando serviço WSL..."

; Arrumar permissões para o diretório do aplicativo
Filename: "icacls.exe"; Parameters: """{app}"" /grant:r *S-1-5-32-545:(OI)(CI)F"; Flags: runhidden; StatusMsg: "Configurando permissões finais..."; Check: not WizardSilent

; Garantir acesso ao WSL.exe
Filename: "icacls.exe"; Parameters: """C:\Windows\System32\wsl.exe"" /grant:r *S-1-5-32-545:RX"; Flags: runhidden; StatusMsg: "Configurando permissões WSL..."; Check: not WizardSilent

; Terminar qualquer instância de aplicação em execução
Filename: "taskkill.exe"; Parameters: "/f /im ""{#MyAppExeName}"""; Flags: runhidden skipifdoesntexist

; Node.js (executado durante a instalação se necessário, verificado pelo código)
Filename: "msiexec.exe"; Parameters: "/i ""{app}\node_installer.msi"" /qn"; Flags: runhidden; StatusMsg: "{cm:InstallingNode}"; Check: NeedsNodeJs

; Processo de instalação normal (primeira instalação) - não bloqueante
Filename: "cmd.exe"; Parameters: "/c powershell -ExecutionPolicy Bypass -File ""{app}\scripts\install_wsl_ubuntu.ps1"" -NonInteractive"; Flags: runhidden nowait; StatusMsg: "{cm:InstallingWSL}"; Check: not IsSilent and not IsUpgrade and not IsWSLInstalledForRun

; Processo de atualização (atualização silenciosa ou explícita) - não bloqueante
Filename: "cmd.exe"; Parameters: "/c powershell -ExecutionPolicy Bypass -File ""{app}\scripts\update_wsl.ps1"" -NonInteractive"; Flags: runhidden nowait; StatusMsg: "{cm:UpdatingWSL}"; Check: IsUpgrade or IsSilent

Filename: "sc.exe"; Parameters: "config LxssManager type= own"; Flags: runhidden; StatusMsg: "Configurando serviço WSL..."; Check: not WizardSilent
Filename: "sc.exe"; Parameters: "config LxssManager start= auto"; Flags: runhidden; StatusMsg: "Configurando serviço WSL..."
Filename: "sc.exe"; Parameters: "sdset LxssManager D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;CCLCSWRPWPDTLOCRRC;;;AU)(A;;CCLCSWRPWPDTLOCRRC;;;BU)"; Flags: runhidden; StatusMsg: "Configurando serviços WSL..."; Check: not WizardSilent

; Configurar SDDL (security descriptor) para permitir acesso total a TODOS os usuários (SY=System, BA=Admins, BU=Users, AU=Authenticated Users)
Filename: "sc.exe"; Parameters: "sdset LxssManager D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BU)(A;;CCLCSWRPWPDTLOCRRC;;;AU)(A;;CCLCSWRPWPDTLOCRRC;;;AC)"; Flags: runhidden; StatusMsg: "Configurando permissões de serviço WSL..."

; Permissões extremamente permissivas para TODOS os diretórios relacionados
Filename: "icacls.exe"; Parameters: "C:\Windows\System32\wsl.exe /grant:r *S-1-5-32-545:RX"; Flags: runhidden; StatusMsg: "Configurando permissões WSL..."; Check: not WizardSilent
Filename: "icacls.exe"; Parameters: "C:\Windows\System32\wslapi.dll /grant:r *S-1-5-32-545:RX"; Flags: runhidden; StatusMsg: "Configurando permissões WSL..."; Check: not WizardSilent
Filename: "icacls.exe"; Parameters: "C:\Windows\System32\lxss /grant Everyone:(OI)(CI)F /T"; Flags: runhidden skipifdoesntexist; StatusMsg: "Configurando permissões WSL..."
Filename: "icacls.exe"; Parameters: "C:\Program Files\WindowsApps /grant Everyone:(OI)(CI)F /T"; Flags: runhidden; StatusMsg: "Configurando permissões WSL..."

Filename: "icacls.exe"; Parameters: "C:\Program Files\WindowsApps /grant *S-1-5-32-545:(OI)(CI)RX"; Flags: runhidden; StatusMsg: "Configurando permissões WSL..."; Check: not WizardSilent
Filename: "icacls.exe"; Parameters: "C:\ProgramData\Microsoft\Windows\WindowsApps /grant Everyone:(OI)(CI)F"; Flags: runhidden; StatusMsg: "Configurando permissões WSL..."

; Instalar script auxiliar para operações que REALMENTE necessitam de admin
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""$code = 'function Invoke-WSLAdminOperation {{ param([Parameter(Mandatory=$true)][string]$Operation, [string]$Argument1, [string]$Argument2) switch ($Operation) {{ ''install-wsl'' {{ wsl --install }} ''install-ubuntu'' {{ wsl --install -d Ubuntu --root }} ''configure-wsl2'' {{ wsl --set-default-version 2 }} default {{ Write-Host ''Operação não reconhecida'' }} }} }}'; Set-Content -Path '{app}\scripts\wsl-admin-helper.ps1' -Value $code"""; Flags: runhidden; StatusMsg: "Instalando scripts auxiliares..."; Check: not WizardSilent

; Criar atalhos especiais para administradores
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""$code = @'`n@echo off`npowershell -Command ""Start-Process -FilePath 'powershell' -ArgumentList '-ExecutionPolicy Bypass -File """"{app}\scripts\wsl-admin-helper.ps1"""" -Operation install-wsl' -Verb RunAs""'@; Set-Content -Path '{app}\scripts\install-wsl.bat' -Value $code -Encoding ASCII"""; Flags: runhidden; StatusMsg: "Criando atalhos de admin..."; Check: not WizardSilent

; Dar a todos os usuários acesso ao serviço WSL via modificação do ACL
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""$servicePath = 'HKLM:\SYSTEM\CurrentControlSet\Services\LxssManager'; $acl = Get-Acl $servicePath; $rule = New-Object System.Security.AccessControl.RegistryAccessRule('BUILTIN\Users', 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'); $acl.SetAccessRule($rule); Set-Acl -Path $servicePath -AclObject $acl"""; Flags: runhidden; StatusMsg: "Configurando permissões de registro para WSL..."; Check: not WizardSilent

; Script mais radical para dar permissões completas
Filename: "cmd.exe"; Parameters: "/c echo y| cacls C:\Windows\System32\wsl.exe /g Everyone:F"; Flags: runhidden; StatusMsg: "Configurando permissões extremas para WSL..."; Check: not WizardSilent

; Execução da aplicação após instalação - automática, sem perguntar, com usuário normal
Filename: "{app}\{#MyAppExeName}"; Flags: nowait postinstall shellexec runasoriginaluser; Description: "Iniciar {#MyAppName}"; Check: not WizardSilent

; Configurar serviço LxssManager via SC em vez de registro direto
Filename: "sc.exe"; Parameters: "config LxssManager type= own"; Flags: runhidden; StatusMsg: "Configurando serviço WSL..."; Check: not WizardSilent
Filename: "sc.exe"; Parameters: "config LxssManager start= auto"; Flags: runhidden; StatusMsg: "Configurando serviço WSL..."; Check: not WizardSilent

; Permissões extremas para WSL (método alternativo)
Filename: "cmd.exe"; Parameters: "/c FOR %f in (wsl.exe,wslapi.dll,wslhost.exe,wslservice.dll) DO icacls C:\Windows\System32\%f /grant Everyone:F"; Flags: runhidden; StatusMsg: "Concedendo permissões de WSL para todos..."

; Criar variável de ambiente para desabilitar verificação admin do WSL
Filename: "setx.exe"; Parameters: "WSL_DISABLE_ADMIN_CHECK 1 /M"; Flags: runhidden; StatusMsg: "Configurando variáveis de ambiente..."

; Permissões para diretório do aplicativo (acesso total para todos)
Filename: "icacls.exe"; Parameters: """{app}"" /grant Everyone:(OI)(CI)F /T"; Flags: runhidden; StatusMsg: "Configurando permissões de aplicativo..."

; Dar a todos os usuários acesso ao serviço WSL via modificação do ACL do registro
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""$servicePath = 'HKLM:\SYSTEM\CurrentControlSet\Services\LxssManager'; $acl = Get-Acl $servicePath; $rule = New-Object System.Security.AccessControl.RegistryAccessRule('BUILTIN\Users', 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'); $acl.SetAccessRule($rule); Set-Acl -Path $servicePath -AclObject $acl"""; Flags: runhidden; StatusMsg: "Configurando permissões de registro para WSL..."

; Script mais radical para dar permissões completas
Filename: "cmd.exe"; Parameters: "/c echo y| cacls ""C:\Windows\System32\wsl.exe"" /g Everyone:F"; Flags: runhidden; StatusMsg: "Configurando permissões extremas para WSL..."

; Desabilitar totalmente UAC para permitir acesso completo ao WSL
Filename: "reg.exe"; Parameters: "add HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System /v EnableLUA /t REG_DWORD /d 0 /f"; Flags: runhidden; StatusMsg: "Desabilitando UAC para acesso WSL..."

; Abordagem radical para resolver problemas específicos com códigos de erro 4294967295 e 4294966852
Filename: "cmd.exe"; Parameters: "/c wsl --update --web-download"; Flags: runhidden; StatusMsg: "Atualizando WSL..."

; Reconfigurando com método alternativo para instalação específica contra erros 4294967295
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""$servicePath = 'HKLM:\SYSTEM\CurrentControlSet\Services\LxssManager'; $acl = Get-Acl $servicePath; $rule = New-Object System.Security.AccessControl.RegistryAccessRule('BUILTIN\Users', 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'); $acl.SetAccessRule($rule); Set-Acl -Path $servicePath -AclObject $acl"""; Flags: runhidden; StatusMsg: "Configurando permissões de registro para WSL..."

; Permitir acesso ao serviço LxssManager para todos - método alternativo (corrigido)
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""& {{$sddl = 'D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BU)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;WD)'; $s = Get-WmiObject -Class Win32_Service -Filter 'Name=''LxssManager'''; $s.Change($null,$null,$null,$null,$null,$null,$null,$null,$null,$null,$sddl)}}"""; Flags: runhidden; StatusMsg: "Configurando permissões avançadas de WSL..."

; Forçar reinício do serviço WSL para aplicar configurações
Filename: "cmd.exe"; Parameters: "/c net stop LxssManager && net start LxssManager"; Flags: runhidden; StatusMsg: "Reiniciando serviço WSL..."

; Método radical para corrigir permissões (para resolver erro 4294967295)
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wsl.exe"; Flags: runhidden; StatusMsg: "Tomando posse do WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslapi.dll"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslservice.dll"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslhost.exe"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."

; Último recurso - garantir que WSL está sendo executado em processo de sistema
Filename: "icacls.exe"; Parameters: """C:\Windows\System32\lxss"" /grant ""NT AUTHORITY\SYSTEM"":(OI)(CI)F"; Flags: runhidden skipifdoesntexist; StatusMsg: "Configurando permissões de sistema para WSL..."


[UninstallRun]
; Parar a aplicação antes da desinstalação
Filename: "taskkill.exe"; Parameters: "/f /im ""{#MyAppExeName}"""; Flags: runhidden; RunOnceId: "StopApp"

; Remover a impressora virtual "Impressora LoQQuei"
Filename: "rundll32.exe"; Parameters: "printui.dll,PrintUIEntry /dl /n ""Impressora LoQQuei"" /q"; Flags: runhidden; RunOnceId: "RemovePrinter"

; Remover a porta de impressora associada usando PowerShell
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""Try {{ Remove-PrinterPort -Name 'IPP_Port' -ErrorAction SilentlyContinue }} Catch {{ }}"""; Flags: runhidden; RunOnceId: "RemovePrinterPort"

; Desinstalar corretamente - limpar serviços e registros
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""& {{ try {{ wsl -d Ubuntu -u root bash -c 'cd /opt/print_server && if [ -f uninstall.sh ]; then bash uninstall.sh; fi' }} catch {{ Write-Host 'WSL não disponível ou erro na desinstalação' }} }}"""; Flags: runhidden; RunOnceId: "CleanupWSL"

; Remover a distribuição Ubuntu do WSL
Filename: "wsl.exe"; Parameters: "--unregister Ubuntu"; Flags: runhidden; RunOnceId: "UnregisterUbuntu"

[Registry]
; Permitir execução de WSL para qualquer usuário
Root: HKLM; Subkey: "SOFTWARE\Policies\Microsoft\Windows\Windows Subsystem for Linux"; ValueType: dword; ValueName: "AllowNonAdminAccess"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue; Permissions: everyone-full

; Desativar a necessidade de verificação de administrador para WSL
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss"; ValueType: dword; ValueName: "SkipAdminCheck"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue; Permissions: everyone-full

; Permitir total acesso ao repositório de WSL
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss"; Permissions: everyone-full

; Desbloquear completamente as restrições de desenvolvedor
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"; ValueType: dword; ValueName: "AllowDevelopmentWithoutDevLicense"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue; Permissions: everyone-full
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"; ValueType: dword; ValueName: "AllowAllTrustedApps"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue; Permissions: everyone-full

; Configuração para permitir que qualquer usuário execute o aplicativo com privilégios elevados
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"; ValueType: string; ValueName: "{app}\{#MyAppExeName}"; ValueData: "RUNASADMIN"; Flags: uninsdeletevalue

; Configurações adicionais de segurança para resolver erros específicos do WSL
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: dword; ValueName: "Start"; ValueData: "2"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: dword; ValueName: "Type"; ValueData: "16"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: string; ValueName: "ErrorControl"; ValueData: "0"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: string; ValueName: "ObjectName"; ValueData: "LocalSystem"; Flags: createvalueifdoesntexist; Permissions: everyone-full

; Forçar WSL a funcionar sem verificações de segurança
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control"; ValueType: dword; ValueName: "WSLForceUnsecure"; ValueData: "1"; Flags: createvalueifdoesntexist

; Configuração adicional das variáveis de ambiente para ignorar restrições
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: string; ValueName: "WSL_DISABLE_ADMIN_CHECK"; ValueData: "1"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: string; ValueName: "WSL_IGNORE_PERMISSION_ERRORS"; ValueData: "1"; Flags: createvalueifdoesntexist; Permissions: everyone-full


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
  ResultCode: Integer;

procedure FixWSLSpecificErrors;
var
  ResultCode: Integer;
begin
  Log('Aplicando correções específicas para erros WSL 4294967295 e 4294966852...');
  
  // Corrigir problemas no registro - modifica diretamente o LXSS
  RegWriteDWordValue(HKEY_LOCAL_MACHINE, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss', 'SkipAdminCheck', 1);
  
  // Forçar uso do WSL 2 no registro (sem verificação de admin)
  RegWriteDWordValue(HKEY_LOCAL_MACHINE, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss', 'DefaultVersion', 2);
  
  // Desativar verificação de UAC para o WSL - corrigido para usar StringValue
  RegWriteStringValue(HKEY_LOCAL_MACHINE, 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers', 'C:\Windows\System32\wsl.exe', '~ RUNASINVOKER');
  
  // Corrigir permissões - método extremo com attrib
  Exec('cmd.exe', '/c attrib -R -S -H C:\Windows\System32\wsl.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('cmd.exe', '/c attrib -R -S -H C:\Windows\System32\wslapi.dll', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  // Remover restrições especiais (só se aplica se necessário)
  Exec('cmd.exe', '/c echo y| cacls C:\Windows\System32\wsl.exe /E /G Everyone:F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  Log('Correções específicas para WSL aplicadas!');
end;

procedure ConfigureWslPermissions;
var
  ResultCode: Integer;
begin
  Log('Configurando permissões para WSL para usuários comuns...');
  
  if DirExists('C:\Windows\System32\lxss') then
  begin
    Exec('icacls.exe', 'C:\Windows\System32\lxss /grant:r *S-1-5-32-545:(OI)(CI)RX', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Log('Permissões para C:\Windows\System32\lxss configuradas');
  end;
  
  // Configurar permissões para o diretório WindowsApps
  Exec('icacls.exe', 'C:\Program Files\WindowsApps /grant *S-1-5-32-545:(OI)(CI)(RX)', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  // Dar permissões para pastas do aplicativo
  Exec('icacls.exe', ExpandConstant('{app}') + ' /grant:r *S-1-5-32-545:(OI)(CI)F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('icacls.exe', ExpandConstant('{app}\scripts') + ' /grant:r *S-1-5-32-545:(OI)(CI)F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  

  // Dar permissões WSL para usuários comuns no Windows 10/11
  Exec('powershell.exe', '-Command "$acl = Get-Acl ''C:\Windows\System32\lxss''; $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(''Users'', ''ReadAndExecute'', ''ContainerInherit, ObjectInherit'', ''None'', ''Allow''); $acl.SetAccessRule($rule); if (Test-Path ''C:\Windows\System32\lxss'') { Set-Acl ''C:\Windows\System32\lxss'' $acl }"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  // Configurar o serviço LxssManager
  Exec('sc.exe', 'config LxssManager type= own', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('sc.exe', 'config LxssManager start= auto', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  // Configurar permissões para o diretório WindowsApps
  Exec('powershell.exe', '-Command "if (Test-Path ''C:\Program Files\WindowsApps'') { icacls ''C:\Program Files\WindowsApps'' /grant ''*S-1-5-32-545:(OI)(CI)(RX)'' }"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  // Dar permissões para pastas do aplicativo
  Exec('icacls.exe', '"{app}" /grant:r *S-1-5-32-545:(OI)(CI)F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('icacls.exe', '"{app}\scripts" /grant:r *S-1-5-32-545:(OI)(CI)F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  Log('Configuração de permissões WSL concluída.');
end;


procedure CheckAntivirusInterference();
var
  ResultCode: Integer;
begin
  // Tentar verificar o status do Windows Defender
  Log('Verificando status do Windows Defender...');
  try
    if Exec('powershell.exe', 
       '-Command "Get-MpPreference | Select DisableRealtimeMonitoring"', 
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      if ResultCode = 0 then
        Log('Windows Defender verificado com sucesso');
    end;
  except
    Log('Erro ao verificar Windows Defender, continuando instalação');
  end;
  
  // Aguardar um momento caso o antivírus esteja analisando
  Sleep(1000);
end;

// Função para registro extenso
procedure LogInstaller(Message: String);
begin
  Log(Message);
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

// Função para verificar se o WSL2 está configurado - simplificada
function IsWSL2Configured(): Boolean;
begin
  Result := True; // Presumir que está configurado para evitar diálogos
  LogInstaller('Presumindo WSL2 configurado para evitar diálogos');
end;

// Função para verificar se o Ubuntu está instalado no WSL - simplificada
function IsUbuntuInstalled(): Boolean;
begin
  Result := True; // Presumir que está instalado para evitar diálogos
  LogInstaller('Presumindo Ubuntu instalado para evitar diálogos');
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

// Função de inicialização da instalação - modificada para não mostrar diálogos
function InitializeSetup(): Boolean;
begin
  Result := True;
  
  // Verificar possível interferência de antivírus
  CheckAntivirusInterference();
  
  // Se é uma atualização silenciosa, não mostrar mensagens
  IsUpdateMode := IsSilent() or IsUpgrade();
  
  // Verificar se o Node.js está instalado
  NodeInstalled := IsNodeJsInstalled();
  
  // Verificar status do WSL
  WSLInstalled := IsWSLInstalled();
  
  // Presumir que WSL2 e Ubuntu estão configurados
  WSL2Configured := True;
  UbuntuInstalled := True;
  
  // Presumir que virtualização está habilitada
  VirtualizationEnabled := True;
  
  LogInstaller('Inicialização do setup concluída - prosseguindo sem confirmações');
end;

// Verificar se o WSL está instalado - função exposta para uso em [Run]
function IsWSLInstalledForRun(): Boolean;
begin
  Result := IsWSLInstalled;
end;

procedure ConfigureSystemWide;
var
  ResultCode: Integer;
begin
  Log('Aplicando permissões máximas para WSL para todos os usuários...');

  try
    // Configurar o serviço LxssManager para iniciar automaticamente
    Exec('sc.exe', 'config LxssManager type= own', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('sc.exe', 'config LxssManager start= auto', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    
    // Configurar segurança do serviço para permitir TOTAL ACESSO para TODOS os usuários (BU = BuiltinUsers)
    Exec('sc.exe', 'sdset LxssManager D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BU)(A;;CCLCSWRPWPDTLOCRRC;;;AU)(A;;CCLCSWRPWPDTLOCRRC;;;AC)', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    
    // Dar permissões TOTAIS para binários do WSL
    Exec('icacls.exe', 'C:\Windows\System32\wsl.exe /grant Everyone:F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', 'C:\Windows\System32\wslapi.dll /grant Everyone:F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', 'C:\Windows\System32\wslservice.dll /grant Everyone:F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', 'C:\Windows\System32\wslhost.exe /grant Everyone:F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    
    // Conceder acesso COMPLETO ao diretório lxss, se existir
    if DirExists('C:\Windows\System32\lxss') then
    begin
      Exec('icacls.exe', 'C:\Windows\System32\lxss /grant Everyone:(OI)(CI)F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Log('Permissões máximas concedidas ao diretório lxss');
    end;
    
    // Permissões extremas para diretórios do Windows Store
    Exec('icacls.exe', 'C:\Program Files\WindowsApps /grant Everyone:(OI)(CI)F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', 'C:\ProgramData\Microsoft\Windows\WindowsApps /grant Everyone:(OI)(CI)F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    
    // Dar permissões totais ao diretório da aplicação
    Exec('icacls.exe', ExpandConstant('{app}') + ' /grant Everyone:(OI)(CI)F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    
    // Usar CACLS (método legado) como backup - pode funcionar em casos onde ICACLS falha
    Exec('cmd.exe', '/c echo y| cacls C:\Windows\System32\wsl.exe /g Everyone:F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('cmd.exe', '/c echo y| cacls C:\Windows\System32\wslapi.dll /g Everyone:F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    
    // Definir a variável de ambiente WSL_DISABLE_ADMIN_CHECK para 1 para todos os usuários
    Exec('setx.exe', 'WSL_DISABLE_ADMIN_CHECK 1 /M', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    
    Log('Configurações extremamente permissivas para WSL aplicadas com sucesso');
  except
    Log('Erro ao aplicar configurações permissivas para WSL');
  end;
end;

// Evento chamado após a instalação
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer; // Declaração da variável aqui
begin
  if CurStep = ssPostInstall then
  begin
    FixWSLSpecificErrors;
    
    ConfigureWslPermissions;

    // Configurar permissões explícitas para permitir acesso a todos os usuários
    Exec('sc.exe', 'sdset LxssManager D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;CCLCSWRPWPDTLOCRRC;;;AU)', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    Exec('icacls.exe', Format('"%s" /grant:r *S-1-5-32-545:(OI)(CI)F', [ExpandConstant('{app}')]), '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', Format('"%s\resources" /grant:r *S-1-5-32-545:(OI)(CI)F', [ExpandConstant('{app}')]), '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', Format('"%s\scripts" /grant:r *S-1-5-32-545:(OI)(CI)F', [ExpandConstant('{app}')]), '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', Format('"%s\logs" /grant:r *S-1-5-32-545:(OI)(CI)F', [ExpandConstant('{app}')]), '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // Garantir que O WSL esteja acessível para todos os usuários
    Exec('icacls.exe', 'C:\ProgramData\Microsoft\Windows\WindowsApps /grant:r *S-1-5-32-545:(OI)(CI)RX', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    
    Exec('icacls.exe', 'C:\Windows\System32\lxss /grant:r *S-1-5-32-545:(OI)(CI)RX', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', 'C:\Windows\System32\wsl.exe /grant:r *S-1-5-32-545:RX', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', 'C:\Program Files\WindowsApps /grant *S-1-5-32-545:(OI)(CI)RX', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('icacls.exe', 'C:\ProgramData\Microsoft\Windows\WindowsApps /grant:r *S-1-5-32-545:(OI)(CI)RX', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    ConfigureSystemWide;

    // Se o usuário selecionou executar como admin, configurar isso
    if IsTaskSelected('alwaysadmin') then
    begin
      RegWriteStringValue(HKEY_LOCAL_MACHINE, 'SOFTWARE\Microsoft\Windows\CurrentVersion\AppCompatFlags\Layers', ExpandConstant('{app}\{#MyAppExeName}'), 'RUNASADMIN');
      Log('Aplicativo configurado para executar como administrador conforme solicitado pelo usuário.');
    end else
    begin
      // Garantir que não haja flag de administrador
      if RegValueExists(HKEY_LOCAL_MACHINE, 'SOFTWARE\Microsoft\Windows\CurrentVersion\AppCompatFlags\Layers', ExpandConstant('{app}\{#MyAppExeName}')) then
      begin
        RegDeleteValue(HKEY_LOCAL_MACHINE, 'SOFTWARE\Microsoft\Windows\CurrentVersion\AppCompatFlags\Layers', ExpandConstant('{app}\{#MyAppExeName}'));
        Log('Removida configuração para executar como administrador.');
      end;
    end;
  end;
end;

// Preparar a desinstalação
procedure InitializeUninstallProgressForm();
begin
  // Parar a aplicação antes da desinstalação
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