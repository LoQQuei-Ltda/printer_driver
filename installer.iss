#define MyAppName "Gerenciamento de Impressão - LoQQuei"
#define MyAppVersion "1.0.10"
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
; Script de serviço WSL para inicialização global
Source: ".\scripts\wsl-service-setup.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
; Recursos do print_server_desktop
Source: ".\resources\print_server_desktop\*"; DestDir: "{app}\resources\print_server_desktop"; Flags: ignoreversion recursesubdirs createallsubdirs
; Scripts de atualização para o WSL
Source: ".\resources\print_server_desktop\updates\*"; DestDir: "{app}\resources\print_server_desktop\updates"; Flags: ignoreversion
; Script para configurar permissões globais do WSL
Source: ".\scripts\configure-wsl-permissions.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

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

; Abordagem radical para resolver problemas específicos com códigos de erro
Filename: "cmd.exe"; Parameters: "/c wsl --update --web-download"; Flags: runhidden; StatusMsg: "Atualizando WSL..."

; Reconfigurando com método alternativo para instalação específica contra erros 4294967295
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""$servicePath = 'HKLM:\SYSTEM\CurrentControlSet\Services\LxssManager'; $acl = Get-Acl $servicePath; $rule = New-Object System.Security.AccessControl.RegistryAccessRule('BUILTIN\Users', 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'); $acl.SetAccessRule($rule); Set-Acl -Path $servicePath -AclObject $acl"""; Flags: runhidden; StatusMsg: "Configurando permissões de registro para WSL..."

; Permitir acesso ao serviço LxssManager para todos - método alternativo (corrigido)
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""& {{$sddl = 'D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BU)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;WD)'; $s = Get-WmiObject -Class Win32_Service -Filter 'Name=''LxssManager'''; $s.Change($null,$null,$null,$null,$null,$null,$null,$null,$null,$null,$sddl)}}"""; Flags: runhidden; StatusMsg: "Configurando permissões avançadas de WSL..."

; Forçar reinício do serviço WSL para aplicar configurações
Filename: "cmd.exe"; Parameters: "/c net stop LxssManager && net start LxssManager"; Flags: runhidden; StatusMsg: "Reiniciando serviço WSL..."

; Método radical para corrigir permissões
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wsl.exe"; Flags: runhidden; StatusMsg: "Tomando posse do WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslapi.dll"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslservice.dll"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslhost.exe"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."

; Último recurso - garantir que WSL está sendo executado em processo de sistema
Filename: "icacls.exe"; Parameters: """C:\Windows\System32\lxss"" /grant ""NT AUTHORITY\SYSTEM"":(OI)(CI)F"; Flags: runhidden skipifdoesntexist; StatusMsg: "Configurando permissões de sistema para WSL..."

; Instalar serviço WSL para inicialização global
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\wsl-service-setup.ps1"""; Flags: runhidden; StatusMsg: "Instalando serviço WSL global..."; Check: not WizardSilent

; Método radical - TAKEOWN para todos os arquivos WSL (necessário no Windows 11)
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wsl.exe"; Flags: runhidden; StatusMsg: "Tomando posse do WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslapi.dll"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslservice.dll"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslhost.exe"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."

; Permissões EXTREMAMENTE radicais - necessárias para Windows 11 com proteções avançadas
Filename: "cmd.exe"; Parameters: "/c FOR %f in (wsl.exe,wslapi.dll,wslhost.exe,wslservice.dll) DO (takeown /f C:\Windows\System32\%f && icacls C:\Windows\System32\%f /reset && icacls C:\Windows\System32\%f /grant Everyone:F)"; Flags: runhidden; StatusMsg: "Aplicando permissões radicais para WSL..."

; Reiniciar totalmente o serviço WSL para garantir aplicação das configurações
Filename: "cmd.exe"; Parameters: "/c net stop LxssManager && net start LxssManager"; Flags: runhidden; StatusMsg: "Reiniciando serviço WSL..."

; Variáveis de ambiente extremamente permissivas para WSL
Filename: "cmd.exe"; Parameters: "/c setx WSL_DISABLE_ADMIN_CHECK 1 /M && setx WSL_IGNORE_PERMISSION_ERRORS 1 /M"; Flags: runhidden; StatusMsg: "Configurando variáveis de ambiente..."

; Aplicar permissões extremas para WSL (script separado)
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\configure-wsl-permissions.ps1"""; Flags: runhidden; StatusMsg: "Configurando permissões globais para WSL..."; Check: not WizardSilent

; Métodos adicionais de permissão
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wsl.exe"; Flags: runhidden; StatusMsg: "Tomando posse do WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslapi.dll"; Flags: runhidden; StatusMsg: "Tomando posse das DLLs de WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslservice.dll"; Flags: runhidden skipifdoesntexist; StatusMsg: "Tomando posse das DLLs de WSL..."
Filename: "takeown.exe"; Parameters: "/f C:\Windows\System32\wslhost.exe"; Flags: runhidden skipifdoesntexist; StatusMsg: "Tomando posse das DLLs de WSL..."

; Permitir acesso total a WSL.exe para todos
Filename: "icacls.exe"; Parameters: "C:\Windows\System32\wsl.exe /grant Everyone:F"; Flags: runhidden; StatusMsg: "Concedendo permissões..."
Filename: "icacls.exe"; Parameters: "C:\Windows\System32\wslapi.dll /grant Everyone:F"; Flags: runhidden; StatusMsg: "Concedendo permissões..."

; Configurar serviço WSL para todos os usuários
Filename: "sc.exe"; Parameters: "config LxssManager start= auto"; Flags: runhidden; StatusMsg: "Configurando serviço WSL..."
Filename: "sc.exe"; Parameters: "sdset LxssManager D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BU)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;WD)"; Flags: runhidden; StatusMsg: "Configurando permissões de serviço WSL..."

; Variáveis de ambiente para ignorar restrições de permissão
Filename: "setx.exe"; Parameters: "WSL_DISABLE_ADMIN_CHECK 1 /M"; Flags: runhidden; StatusMsg: "Configurando variáveis de ambiente..."
Filename: "setx.exe"; Parameters: "WSL_IGNORE_PERMISSION_ERRORS 1 /M"; Flags: runhidden; StatusMsg: "Configurando variáveis de ambiente..."


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

; Configurações radicais para WSL - múltiplos métodos de bypass
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss"; ValueType: dword; ValueName: "SkipAdminCheck"; ValueData: "1"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: dword; ValueName: "Start"; ValueData: "2"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: dword; ValueName: "Type"; ValueData: "16"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: string; ValueName: "ObjectName"; ValueData: "LocalSystem"; Flags: createvalueifdoesntexist; Permissions: everyone-full

; Tornar o WSL realmente disponível para todos os usuários sem restrições
Root: HKLM; Subkey: "SOFTWARE\Policies\Microsoft\Windows\Windows Subsystem for Linux"; ValueType: dword; ValueName: "AllowNonAdminAccess"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue; Permissions: everyone-full
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"; ValueType: dword; ValueName: "WSLAccessForAll"; ValueData: "1"; Flags: createvalueifdoesntexist

; Configurações extremas do ambiente para ignorar restrições de WSL
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: string; ValueName: "WSL_DISABLE_ADMIN_CHECK"; ValueData: "1"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: string; ValueName: "WSL_IGNORE_PERMISSION_ERRORS"; ValueData: "1"; Flags: createvalueifdoesntexist; Permissions: everyone-full

; Configurações radicais para WSL - múltiplos métodos de bypass
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss"; ValueType: dword; ValueName: "SkipAdminCheck"; ValueData: "1"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: dword; ValueName: "Start"; ValueData: "2"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: dword; ValueName: "Type"; ValueData: "16"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Services\LxssManager"; ValueType: string; ValueName: "ObjectName"; ValueData: "LocalSystem"; Flags: createvalueifdoesntexist; Permissions: everyone-full

; Permitir acesso ao WSL para usuários comuns
Root: HKLM; Subkey: "SOFTWARE\Policies\Microsoft\Windows\Windows Subsystem for Linux"; ValueType: dword; ValueName: "AllowNonAdminAccess"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue; Permissions: everyone-full

; Configurações de ambiente para ignorar restrições
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: string; ValueName: "WSL_DISABLE_ADMIN_CHECK"; ValueData: "1"; Flags: createvalueifdoesntexist; Permissions: everyone-full
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: string; ValueName: "WSL_IGNORE_PERMISSION_ERRORS"; ValueData: "1"; Flags: createvalueifdoesntexist; Permissions: everyone-full

Root: HKLM; Subkey: "SOFTWARE\LoQQuei\PrintManagement"; ValueType: string; ValueName: "Version"; ValueData: "{#MyAppVersion}"; Flags: uninsdeletevalue


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
  AdminPasswordPage: TInputQueryWizardPage;
  CreateServiceCheck: TNewCheckBox;
  AdminUsername, AdminPassword: String;

// Função para obter nome de usuário do Windows
function GetWindowsUserName: String;
var
  FileName: String;
  UserNameValue: String;
begin
  // Método alternativo usando variáveis de ambiente
  UserNameValue := GetEnv('USERNAME');
  if UserNameValue = '' then
    UserNameValue := 'Administrator';
    
  // Adicionar domínio se disponível
  if GetEnv('USERDOMAIN') <> '' then
    Result := GetEnv('USERDOMAIN') + '\' + UserNameValue
  else
    Result := '.\' + UserNameValue;
end;

procedure InitializeWizard;
begin
  // Criar página para solicitar senha de administrador
  AdminPasswordPage := CreateInputQueryPage(wpWelcome,
    'Configuração do Serviço WSL',
    'Informações para execução do serviço WSL como usuário administrador',
    'Por favor, forneça suas credenciais de administrador para configurar o serviço WSL. ' +
    'Isso permitirá que o serviço seja executado com privilégios adequados.');
    
  // Adicionar campos para entrada de dados
  AdminPasswordPage.Add('Nome de usuário (ex: DOMINIO\usuario):', False);
  AdminPasswordPage.Add('Senha:', True);
  
  // Preencher automaticamente o nome de usuário atual
  AdminPasswordPage.Values[0] := GetWindowsUserName();
  
  // Adicionar checkbox para optar por criar ou não o serviço
  CreateServiceCheck := TNewCheckBox.Create(AdminPasswordPage);
  CreateServiceCheck.Parent := AdminPasswordPage.Surface;
  CreateServiceCheck.Caption := 'Criar serviço Windows para inicialização automática (recomendado)';
  CreateServiceCheck.Top := 120;
  CreateServiceCheck.Left := 0;
  CreateServiceCheck.Width := AdminPasswordPage.SurfaceWidth;
  CreateServiceCheck.Checked := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  
  if CurPageID = AdminPasswordPage.ID then
  begin
    AdminUsername := AdminPasswordPage.Values[0];
    AdminPassword := AdminPasswordPage.Values[1];
  end;
end;

// Procedimento atualizado para criar scripts e serviço WSL
procedure CreateWslStartupScripts;
var
  UserStartupPath, CommonStartupPath, UserDesktopPath, ServiceBatchPath: String;
  StartupScript, DiagnosticScript, ServiceBatchScript: String;
  ResultCode: Integer;
  ErrorCode: Integer;
begin
  // Obter caminhos de destino
  UserStartupPath := ExpandConstant('{userstartup}\LoQQuei-WSL-Startup.cmd');
  CommonStartupPath := ExpandConstant('{commonstartup}\LoQQuei-WSL-Startup.cmd');
  UserDesktopPath := ExpandConstant('{userdesktop}\Diagnostico WSL.cmd');
  ServiceBatchPath := ExpandConstant('{app}\scripts\WSL-Service-Runner.cmd');

  // Remover serviço antigo se existir
  Exec('sc', 'stop LoQQueiWSLBoot', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('sc', 'delete LoQQueiWSLBoot', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(2000);

  // Criar script de inicialização
  StartupScript := '@echo off' + #13#10 +
    'REM Script para iniciar WSL automaticamente' + #13#10 +
    'SETLOCAL EnableDelayedExpansion' + #13#10 +
    '' + #13#10 +
    'ECHO Iniciando WSL...' + #13#10 +
    '' + #13#10 +
    'REM Aguardar Windows terminar de inicializar' + #13#10 +
    'timeout /t 30 /nobreak > NUL' + #13#10 +
    '' + #13#10 +
    'REM Desligar WSL para inicialização limpa' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" --shutdown' + #13#10 +
    '' + #13#10 +
    'REM Aguardar desligamento completo' + #13#10 +
    'timeout /t 5 /nobreak > NUL' + #13#10 +
    '' + #13#10 +
    'REM Iniciar WSL com Ubuntu de forma completa' + #13#10 +
    'start "WSL Daemon" /min "%SystemRoot%\System32\wsl.exe" -d Ubuntu' + #13#10 +
    '' + #13#10 +
    'REM Aguardar inicialização' + #13#10 +
    'timeout /t 15 /nobreak > NUL' + #13#10 +
    '' + #13#10 +
    'REM Iniciar serviços no Ubuntu' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root systemctl restart postgresql cups smbd' + #13#10 +
    '' + #13#10 +
    // IMPORTANTE: A linha seguinte deve ser modificada ou removida para evitar inicialização direta do node.js
    // '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &"' + #13#10 +
    // Substituir por:
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "/opt/loqquei/print_server_desktop/start-services.sh"' + #13#10 +
    '' + #13#10 +
    'REM Sair sem entrar em loop (mais leve para o sistema)' + #13#10 +
    'EXIT';

  // Script para execução como serviço (sem EXIT no final)
  ServiceBatchScript := '@echo off' + #13#10 +
    'REM Script para iniciar WSL como serviço' + #13#10 +
    'SETLOCAL EnableDelayedExpansion' + #13#10 +
    '' + #13#10 +
    'ECHO %DATE% %TIME% - Iniciando serviço WSL... >> "%ProgramData%\LoQQuei\wsl-service.log"' + #13#10 +
    '' + #13#10 +
    'REM Aguardar Windows terminar de inicializar' + #13#10 +
    'timeout /t 60 /nobreak > NUL' + #13#10 +
    '' + #13#10 +
    'REM Desligar WSL para inicialização limpa' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" --shutdown >> "%ProgramData%\LoQQuei\wsl-service.log" 2>&1' + #13#10 +
    '' + #13#10 +
    'REM Aguardar desligamento completo' + #13#10 +
    'timeout /t 5 /nobreak > NUL' + #13#10 +
    '' + #13#10 +
    'REM Iniciar WSL com Ubuntu de forma completa' + #13#10 +
    'start "WSL Daemon" /min "%SystemRoot%\System32\wsl.exe" -d Ubuntu >> "%ProgramData%\LoQQuei\wsl-service.log" 2>&1' + #13#10 +
    '' + #13#10 +
    'REM Aguardar inicialização' + #13#10 +
    'timeout /t 15 /nobreak > NUL' + #13#10 +
    '' + #13#10 +
    'REM Iniciar serviços no Ubuntu' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root systemctl restart postgresql cups smbd >> "%ProgramData%\LoQQuei\wsl-service.log" 2>&1' + #13#10 +
    '' + #13#10 +
    // IMPORTANTE: A linha seguinte deve ser modificada ou removida para evitar inicialização direta do node.js
    // '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &" >> "%ProgramData%\LoQQuei\wsl-service.log" 2>&1' + #13#10 +
    // Substituir por:
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "/opt/loqquei/print_server_desktop/start-services.sh" >> "%ProgramData%\LoQQuei\wsl-service.log" 2>&1' + #13#10 +
    '' + #13#10 +
    'ECHO %DATE% %TIME% - Serviço WSL iniciado com sucesso >> "%ProgramData%\LoQQuei\wsl-service.log"' + #13#10 +
    '' + #13#10 +
    'REM Aguardar para manter o serviço em execução' + #13#10 +
    ':LOOP' + #13#10 +
    'REM Verificação de heartbeat a cada 5 minutos' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root echo "Heartbeat %DATE% %TIME%" >> "%ProgramData%\LoQQuei\wsl-service.log" 2>&1' + #13#10 +
    'timeout /t 300 /nobreak > NUL' + #13#10 +
    'goto LOOP';

  // Criar script de diagnóstico
  DiagnosticScript := '@echo off' + #13#10 +
    'title Assistente de Diagnostico WSL' + #13#10 +
    'color 1F' + #13#10 +
    'cls' + #13#10 +
    '' + #13#10 +
    ':menu' + #13#10 +
    'echo.' + #13#10 +
    'echo Assistente de Diagnostico WSL - Solucao de Problemas' + #13#10 +
    'echo =============================================' + #13#10 +
    'echo.' + #13#10 +
    'echo 1. Verificar status do WSL' + #13#10 +
    'echo 2. Reiniciar WSL e servicos manualmente' + #13#10 +
    'echo 3. Verificar/Corrigir conflitos na porta da API' + #13#10 +
    'echo 4. Iniciar servico via script de inicializacao' + #13#10 +
    'echo 5. Reiniciar servico Windows do WSL' + #13#10 +
    'echo 0. Sair' + #13#10 +
    'echo.' + #13#10 +
    'choice /C 123450 /N /M "Escolha uma opcao (0-5): "' + #13#10 +
    '' + #13#10 +
    'if errorlevel 6 goto :EOF' + #13#10 +
    'if errorlevel 5 goto :reiniciarServico' + #13#10 +
    'if errorlevel 4 goto :executar' + #13#10 +
    'if errorlevel 3 goto :corrigirPorta' + #13#10 +
    'if errorlevel 2 goto :reiniciar' + #13#10 +
    'if errorlevel 1 goto :verificarStatus' + #13#10 +
    '' + #13#10 +
    ':verificarStatus' + #13#10 +
    'cls' + #13#10 +
    'echo.' + #13#10 +
    'echo Verificando status do WSL e servicos:' + #13#10 +
    'echo.' + #13#10 +
    'echo Status do serviço Windows:' + #13#10 +
    'sc query LoQQueiWSLBoot' + #13#10 +
    'echo.' + #13#10 +
    'echo Distribuicoes WSL ativas:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" --list --running' + #13#10 +
    'echo.' + #13#10 +
    'echo Processos na porta 56258:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "lsof -i :56258 || echo ''Nenhum processo usando a porta''"' + #13#10 +
    'echo.' + #13#10 +
    'echo Status dos servicos no Ubuntu:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "systemctl status postgresql cups smbd | grep Active"' + #13#10 +
    'echo.' + #13#10 +
    'pause' + #13#10 +
    'goto :menu' + #13#10 +
    '' + #13#10 +
    ':corrigirPorta' + #13#10 +
    'cls' + #13#10 +
    'echo.' + #13#10 +
    'echo Corrigindo conflitos de porta 56258...' + #13#10 +
    'echo.' + #13#10 +
    'echo Desligando WSL completamente:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" --shutdown' + #13#10 +
    'timeout /t 5 /nobreak >nul' + #13#10 +
    'echo.' + #13#10 +
    'echo Reiniciando Ubuntu:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root echo "Ubuntu reiniciado"' + #13#10 +
    'echo.' + #13#10 +
    'echo Matando processos na porta 56258:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "lsof -i :56258 | grep -v PID | awk ''{print $2}'' | xargs -r kill -9 || echo ''Nenhum processo encontrado''"' + #13#10 +
    'echo.' + #13#10 +
    'echo Matando processos node:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "pkill -f node || echo ''Nenhum processo node encontrado''"' + #13#10 +
    'echo.' + #13#10 +
    'echo Reiniciando API manualmente:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &"' + #13#10 +
    'echo.' + #13#10 +
    'echo Status final:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "lsof -i :56258 || echo ''Nenhum processo encontrado para porta 56258''"' + #13#10 +
    'echo.' + #13#10 +
    'pause' + #13#10 +
    'goto :menu' + #13#10 +
    '' + #13#10 +
    ':reiniciar' + #13#10 +
    'cls' + #13#10 +
    'echo.' + #13#10 +
    'echo Reiniciando WSL e servicos...' + #13#10 +
    'echo.' + #13#10 +
    'echo Desligando WSL:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" --shutdown' + #13#10 +
    'timeout /t 5 /nobreak >nul' + #13#10 +
    'echo.' + #13#10 +
    'echo Iniciando Ubuntu:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root echo "Ubuntu iniciado"' + #13#10 +
    'echo.' + #13#10 +
    'echo Iniciando servicos:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root systemctl restart postgresql cups smbd' + #13#10 +
    'echo.' + #13#10 +
    'echo Iniciando API manualmente:' + #13#10 +
    '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &"' + #13#10 +
    'echo.' + #13#10 +
    'echo Reinicializacao concluida.' + #13#10 +
    'pause' + #13#10 +
    'goto :menu' + #13#10 +
    '' + #13#10 +
    ':executar' + #13#10 +
    'cls' + #13#10 +
    'echo.' + #13#10 +
    'echo Executando script de inicializacao diretamente...' + #13#10 +
    'echo.' + #13#10 +
    'call "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LoQQuei-WSL-Startup.cmd"' + #13#10 +
    'echo.' + #13#10 +
    'echo Execucao direta concluida.' + #13#10 +
    'pause' + #13#10 +
    'goto :menu' + #13#10 +
    '' + #13#10 +
    ':reiniciarServico' + #13#10 +
    'cls' + #13#10 +
    'echo.' + #13#10 +
    'echo Reiniciando serviço Windows do WSL...' + #13#10 +
    'echo.' + #13#10 +
    'net stop LoQQueiWSLBoot' + #13#10 +
    'timeout /t 5 /nobreak >nul' + #13#10 +
    'net start LoQQueiWSLBoot' + #13#10 +
    'echo.' + #13#10 +
    'echo Status do serviço:' + #13#10 +
    'sc query LoQQueiWSLBoot' + #13#10 +
    'echo.' + #13#10 +
    'pause' + #13#10 +
    'goto :menu';

  // Garantir que o diretório scripts exista
  if not DirExists(ExpandConstant('{app}\scripts')) then
    CreateDir(ExpandConstant('{app}\scripts'));

  // Garantir que o diretório de logs exista
  if not DirExists(ExpandConstant('{commonappdata}\LoQQuei')) then
    CreateDir(ExpandConstant('{commonappdata}\LoQQuei'));

  // Salvar os scripts nos locais apropriados
  if not SaveStringToFile(UserStartupPath, StartupScript, False) then
    Log('Erro ao salvar script de inicialização no diretório do usuário');

  if not SaveStringToFile(CommonStartupPath, StartupScript, False) then
    Log('Erro ao salvar script de inicialização no diretório comum');

  if not SaveStringToFile(UserDesktopPath, DiagnosticScript, False) then
    Log('Erro ao salvar script de diagnóstico na área de trabalho');

  if not SaveStringToFile(ServiceBatchPath, ServiceBatchScript, False) then
    Log('Erro ao salvar script de serviço');

  // Configurar permissões para o script de serviço
  Exec('icacls', '"' + ServiceBatchPath + '" /grant Everyone:F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Configurar registro para inicialização automática
  RegWriteStringValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 
    'LoQQueiWSLStartup', UserStartupPath);

  // Criar serviço Windows se habilitado e se as credenciais foram fornecidas
  if CreateServiceCheck.Checked and (AdminUsername <> '') then
  begin
    Log('Criando serviço Windows com as credenciais do administrador...');
    
    // Criar o serviço - este comando utiliza a conta de administrador e senha fornecidas
    if Exec('sc', 
      'create LoQQueiWSLBoot binPath= "cmd.exe /c \"' + ServiceBatchPath + '\"" start= auto DisplayName= "LoQQuei WSL Boot Service" obj= "' + AdminUsername + '" password= "' + AdminPassword + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      // Configurar descrição para o serviço
      Exec('sc', 'description LoQQueiWSLBoot "Inicializa o WSL e serviços necessários para o sistema LoQQuei"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      
      // Iniciar o serviço
      Exec('sc', 'start LoQQueiWSLBoot', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      
      Log('Serviço Windows criado e iniciado com sucesso');
    end
    else
    begin
      // Se falhar ao criar o serviço, tentar criar com o LocalSystem (menos desejável, mas melhor que nada)
      Log('Erro ao criar serviço com credenciais do administrador, tentando LocalSystem...');
      ErrorCode := ResultCode;
      
      // Cria serviço como LocalSystem
      if Exec('sc', 
        'create LoQQueiWSLBoot binPath= "cmd.exe /c \"' + ServiceBatchPath + '\"" start= auto DisplayName= "LoQQuei WSL Boot Service"', 
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      begin
        Exec('sc', 'description LoQQueiWSLBoot "Inicializa o WSL e serviços necessários para o sistema LoQQuei"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Exec('sc', 'start LoQQueiWSLBoot', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        
        // Mostrar mensagem sobre o problema de criação do serviço
        MsgBox('Não foi possível criar o serviço com a conta de administrador (erro: ' + IntToStr(ErrorCode) + '). ' +
              'O serviço foi criado usando a conta LocalSystem, mas pode ter limitações de funcionamento.' + #13#10 + #13#10 +
              'Você pode tentar reconfigurar o serviço manualmente mais tarde usando o comando:' + #13#10 +
              'sc config LoQQueiWSLBoot obj= "DOMINIO\usuario" password= "senha"', mbInformation, MB_OK);
      end
      else
      begin
        // Se falhar até com LocalSystem, usar apenas o método de inicialização via Startup
        Log('Erro ao criar serviço Windows, usando apenas método de inicialização via Startup');
        MsgBox('Não foi possível criar o serviço Windows para inicialização automática. ' +
              'O sistema usará o método de inicialização via pasta Startup, que funciona apenas quando um usuário faz login.' + #13#10 + #13#10 +
              'Você pode tentar criar o serviço manualmente mais tarde usando o comando:' + #13#10 +
              'sc create LoQQueiWSLBoot binPath= "cmd.exe /c \"' + ServiceBatchPath + '\"" start= auto', mbInformation, MB_OK);
      end;
    end;
  end
  else 
  begin
    Log('Criação de serviço Windows desabilitada pelo usuário. Usando apenas inicialização via Startup');
  end;
end;

procedure CreateWslStartupScript;
var
  FilePath: String;
  Lines: TArrayOfString;
  Index: Integer;
begin
  FilePath := ExpandConstant('{tmp}\LoQQuei-WSL-Startup.cmd');
  Index := 0;
  
  // Definir o número de linhas
  SetArrayLength(Lines, 22);
  
  // Criar o conteúdo do script
  Lines[Index] := '@echo off'; Index := Index + 1;
  Lines[Index] := 'REM Script para iniciar WSL automaticamente'; Index := Index + 1;
  Lines[Index] := 'SETLOCAL EnableDelayedExpansion'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := 'ECHO Iniciando WSL...'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := 'REM Aguardar Windows terminar de inicializar'; Index := Index + 1;
  Lines[Index] := 'timeout /t 30 /nobreak > NUL'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := 'REM Desligar WSL para inicialização limpa'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" --shutdown'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := 'REM Aguardar desligamento completo'; Index := Index + 1;
  Lines[Index] := 'timeout /t 5 /nobreak > NUL'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := 'REM Iniciar WSL com Ubuntu de forma completa'; Index := Index + 1;
  Lines[Index] := 'start "WSL Daemon" /min "%SystemRoot%\System32\wsl.exe" -d Ubuntu'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := 'REM Aguardar inicialização'; Index := Index + 1;
  Lines[Index] := 'timeout /t 15 /nobreak > NUL'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  
  // Salvar a primeira parte do arquivo
  SaveStringsToFile(FilePath, Lines, False);
  
  // Redefinir o array para a segunda parte
  SetArrayLength(Lines, 8);
  Index := 0;
  
  // Segunda parte do script
  Lines[Index] := 'REM Iniciar serviços no Ubuntu'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root systemctl restart postgresql cups smbd'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := 'REM Iniciar a API manualmente'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &"'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := 'REM Sair sem entrar em loop (mais leve para o sistema)'; Index := Index + 1;
  Lines[Index] := 'EXIT'; Index := Index + 1;
  
  // Adicionar a segunda parte ao arquivo
  SaveStringsToFile(FilePath, Lines, True);
  
  // Configurar registro para inicialização automática (usando o mesmo script)
  RegWriteStringValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 
    'LoQQueiWSLStartup', ExpandConstant('"{userstartup}\LoQQuei-WSL-Startup.cmd"'));
end;

// Procedimento para criar o utilitário de diagnóstico
procedure CreateWslDiagnosticScript;
var
  FilePath: String;
  Lines: TArrayOfString;
  Index: Integer;
begin
  FilePath := ExpandConstant('{tmp}\Diagnostico-WSL.cmd');
  Index := 0;
  
  // Definir o número de linhas para a primeira parte
  SetArrayLength(Lines, 25);
  
  // Criar o conteúdo do script de diagnóstico
  Lines[Index] := '@echo off'; Index := Index + 1;
  Lines[Index] := 'title Assistente de Diagnostico WSL'; Index := Index + 1;
  Lines[Index] := 'color 1F'; Index := Index + 1;
  Lines[Index] := 'cls'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := ':menu'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Assistente de Diagnostico WSL - Solucao de Problemas'; Index := Index + 1;
  Lines[Index] := 'echo ============================================='; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo 1. Verificar status do WSL'; Index := Index + 1;
  Lines[Index] := 'echo 2. Reiniciar WSL e servicos manualmente'; Index := Index + 1;
  Lines[Index] := 'echo 3. Verificar/Corrigir conflitos na porta da API'; Index := Index + 1;
  Lines[Index] := 'echo 4. Iniciar servico via script de inicializacao'; Index := Index + 1;
  Lines[Index] := 'echo 0. Sair'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'choice /C 12340 /N /M "Escolha uma opcao (0-4): "'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := 'if errorlevel 5 goto :EOF'; Index := Index + 1;
  Lines[Index] := 'if errorlevel 4 goto :executar'; Index := Index + 1;
  Lines[Index] := 'if errorlevel 3 goto :corrigirPorta'; Index := Index + 1;
  Lines[Index] := 'if errorlevel 2 goto :reiniciar'; Index := Index + 1;
  Lines[Index] := 'if errorlevel 1 goto :verificarStatus'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  
  // Salvar a primeira parte do arquivo
  SaveStringsToFile(FilePath, Lines, False);
  
  // Redefinir o array para a segunda parte
  SetArrayLength(Lines, 22);
  Index := 0;
  
  // Segunda parte - verificarStatus
  Lines[Index] := ':verificarStatus'; Index := Index + 1;
  Lines[Index] := 'cls'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Verificando status do WSL e servicos:'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Distribuicoes WSL ativas:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" --list --running'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Processos na porta 56258:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "lsof -i :56258 || echo ''Nenhum processo usando a porta''"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Status dos servicos no Ubuntu:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "systemctl status postgresql cups smbd | grep Active"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'pause'; Index := Index + 1;
  Lines[Index] := 'goto :menu'; Index := Index + 1;
  Lines[Index] := ''; Index := Index + 1;
  
  // Adicionar a segunda parte ao arquivo
  SaveStringsToFile(FilePath, Lines, True);
  
  // Redefinir o array para a terceira parte (corrigirPorta)
  SetArrayLength(Lines, 26);
  Index := 0;
  
  // Terceira parte - corrigirPorta
  Lines[Index] := ':corrigirPorta'; Index := Index + 1;
  Lines[Index] := 'cls'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Corrigindo conflitos de porta 56258...'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Desligando WSL completamente:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" --shutdown'; Index := Index + 1;
  Lines[Index] := 'timeout /t 5 /nobreak >nul'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Reiniciando Ubuntu:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root echo "Ubuntu reiniciado"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Matando processos na porta 56258:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "lsof -i :56258 | grep -v PID | awk ''{print \$2}'' | xargs -r kill -9 || echo ''Nenhum processo encontrado''"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Matando processos node:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "pkill -f node || echo ''Nenhum processo node encontrado''"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Reiniciando API manualmente:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Status final:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "lsof -i :56258 || echo ''Nenhum processo encontrado para porta 56258''"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'pause'; Index := Index + 1;
  Lines[Index] := 'goto :menu'; Index := Index + 1;
  
  // Adicionar a terceira parte ao arquivo
  SaveStringsToFile(FilePath, Lines, True);
  
  // Redefinir o array para a quarta parte (reiniciar)
  SetArrayLength(Lines, 22);
  Index := 0;
  
  // Quarta parte - reiniciar
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := ':reiniciar'; Index := Index + 1;
  Lines[Index] := 'cls'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Reiniciando WSL e servicos...'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Desligando WSL:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" --shutdown'; Index := Index + 1;
  Lines[Index] := 'timeout /t 5 /nobreak >nul'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Iniciando Ubuntu:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root echo "Ubuntu iniciado"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Iniciando servicos:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root systemctl restart postgresql cups smbd'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Iniciando API manualmente:'; Index := Index + 1;
  Lines[Index] := '"%SystemRoot%\System32\wsl.exe" -d Ubuntu -u root bash -c "cd /opt/loqquei/print_server_desktop && nohup node bin/www.js > /var/log/print_server.log 2>&1 &"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Reinicializacao concluida.'; Index := Index + 1;
  Lines[Index] := 'pause'; Index := Index + 1;
  Lines[Index] := 'goto :menu'; Index := Index + 1;
  
  // Adicionar a quarta parte ao arquivo
  SaveStringsToFile(FilePath, Lines, True);
  
  // Redefinir o array para a quinta parte (executar)
  SetArrayLength(Lines, 10);
  Index := 0;
  
  // Quinta parte - executar
  Lines[Index] := ''; Index := Index + 1;
  Lines[Index] := ':executar'; Index := Index + 1;
  Lines[Index] := 'cls'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Executando script de inicializacao diretamente...'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'call "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LoQQuei-WSL-Startup.cmd"'; Index := Index + 1;
  Lines[Index] := 'echo.'; Index := Index + 1;
  Lines[Index] := 'echo Execucao direta concluida.'; Index := Index + 1;
  Lines[Index] := 'pause'; Index := Index + 1;
  Lines[Index] := 'goto :menu'; Index := Index + 1;
  
  // Adicionar a quinta parte ao arquivo
  SaveStringsToFile(FilePath, Lines, True);
end;

// Função para remover antigo serviço LoQQueiWSLBoot se existir
procedure RemoveOldService;
var
  ResultCode: Integer;
begin
  // Parar o serviço se estiver em execução
  Exec('sc', 'stop LoQQueiWSLBoot', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  // Remover o serviço
  Exec('sc', 'delete LoQQueiWSLBoot', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  // Aguardar um momento para processamento
  Sleep(3000);
end;

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

    RemoveOldService;

    CreateWslStartupScripts;

    if MsgBox('Deseja iniciar o WSL agora?', mbConfirmation, MB_YESNO) = IDYES then
    begin
      Exec(ExpandConstant('{userstartup}\LoQQuei-WSL-Startup.cmd'), '', '', SW_SHOW, ewNoWait, ResultCode);
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