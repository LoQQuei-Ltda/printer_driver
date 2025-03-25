# Script de coleta de informações sobre impressoras - Salvar como collect_printer_info.ps1
# Executar como administrador: powershell -ExecutionPolicy Bypass -File collect_printer_info.ps1

# Criar pasta para salvar os resultados
$outputFolder = "$env:USERPROFILE\Desktop\PrinterDiagnostics"
New-Item -ItemType Directory -Force -Path $outputFolder | Out-Null
$outputFile = "$outputFolder\printer_diagnostics.txt"

# Iniciar coleta de informações
"=== DIAGNOSTICO DE IMPRESSORAS ===" | Out-File -FilePath $outputFile
"Data e Hora: $(Get-Date)" | Out-File -FilePath $outputFile -Append
"Computador: $env:COMPUTERNAME" | Out-File -FilePath $outputFile -Append
"Usuário: $env:USERNAME" | Out-File -FilePath $outputFile -Append
"" | Out-File -FilePath $outputFile -Append

# Informações do sistema
"=== INFORMAÇÕES DO SISTEMA ===" | Out-File -FilePath $outputFile -Append
$os = Get-CimInstance Win32_OperatingSystem
"Sistema Operacional: $($os.Caption) $($os.Version)" | Out-File -FilePath $outputFile -Append
"Arquitetura: $($os.OSArchitecture)" | Out-File -FilePath $outputFile -Append
"" | Out-File -FilePath $outputFile -Append

# Lista de todas as impressoras
"=== LISTA DE IMPRESSORAS ===" | Out-File -FilePath $outputFile -Append
$printers = Get-Printer
$printerCount = $printers.Count
"Total de impressoras: $printerCount" | Out-File -FilePath $outputFile -Append
$printers | Format-Table Name, DriverName, PortName, Type, Shared, Published -AutoSize | Out-String | Out-File -FilePath $outputFile -Append
"" | Out-File -FilePath $outputFile -Append

# Detalhes da impressora LoQQuei Printer (se existir)
"=== DETALHES DA IMPRESSORA LOQQUEI PRINTER ===" | Out-File -FilePath $outputFile -Append
$loqqueiPrinter = Get-Printer -Name "LoQQuei Printer" -ErrorAction SilentlyContinue
if ($loqqueiPrinter) {
    "Impressora encontrada!" | Out-File -FilePath $outputFile -Append
    $loqqueiPrinter | Format-List * | Out-String | Out-File -FilePath $outputFile -Append
    
    # Verificar propriedades específicas
    $printerProperties = Get-PrinterProperty -PrinterName "LoQQuei Printer" -ErrorAction SilentlyContinue
    if ($printerProperties) {
        "Propriedades da impressora:" | Out-File -FilePath $outputFile -Append
        $printerProperties | Format-Table PropertyName, Value -AutoSize | Out-String | Out-File -FilePath $outputFile -Append
    }
    else {
        "Não foi possível obter propriedades da impressora." | Out-File -FilePath $outputFile -Append
    }
} 
else {
    "Impressora 'LoQQuei Printer' não encontrada." | Out-File -FilePath $outputFile -Append
}
"" | Out-File -FilePath $outputFile -Append

# Lista de todas as portas de impressora
"=== PORTAS DE IMPRESSORA ===" | Out-File -FilePath $outputFile -Append
$ports = Get-PrinterPort
"Total de portas: $($ports.Count)" | Out-File -FilePath $outputFile -Append
$ports | Format-Table Name, PrinterHostAddress, PortNumber, Protocol, Description -AutoSize | Out-String | Out-File -FilePath $outputFile -Append
"" | Out-File -FilePath $outputFile -Append

# Detalhes das portas CUPS/IPP
"=== DETALHES DAS PORTAS CUPS/IPP ===" | Out-File -FilePath $outputFile -Append
$ippPorts = $ports | Where-Object { $_.Name -like "*CUPS*" -or $_.Name -like "*IPP*" -or $_.PrinterHostAddress -like "*10.148.1.147*" }
if ($ippPorts) {
    $ippPorts | Format-List * | Out-String | Out-File -FilePath $outputFile -Append
}
else {
    "Nenhuma porta CUPS/IPP encontrada." | Out-File -FilePath $outputFile -Append
}
"" | Out-File -FilePath $outputFile -Append

# Lista de drivers de impressora
"=== DRIVERS DE IMPRESSORA ===" | Out-File -FilePath $outputFile -Append
$drivers = Get-PrinterDriver
"Total de drivers: $($drivers.Count)" | Out-File -FilePath $outputFile -Append
$drivers | Sort-Object Name | Format-Table Name, MajorVersion, DriverVersion, PrinterEnvironment -AutoSize | Out-String | Out-File -FilePath $outputFile -Append
"" | Out-File -FilePath $outputFile -Append

# Verificar conectividade com o servidor CUPS
"=== TESTE DE CONECTIVIDADE COM SERVIDOR CUPS (10.148.1.147) ===" | Out-File -FilePath $outputFile -Append
try {
    $ping = Test-Connection -ComputerName "10.148.1.147" -Count 2 -ErrorAction Stop
    "Ping bem-sucedido!" | Out-File -FilePath $outputFile -Append
    $ping | Format-Table Address, IPV4Address, ResponseTime -AutoSize | Out-String | Out-File -FilePath $outputFile -Append
}
catch {
    "Falha no ping para 10.148.1.147: $_" | Out-File -FilePath $outputFile -Append
}

# Testar porta 631 (IPP/CUPS)
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $timeout = $tcpClient.BeginConnect("10.148.1.147", 631, $null, $null)
    $success = $timeout.AsyncWaitHandle.WaitOne(1000, $true)
    
    if ($success) {
        "Porta 631 (IPP/CUPS) está aberta e acessível" | Out-File -FilePath $outputFile -Append
        $tcpClient.EndConnect($timeout)
    }
    else {
        "Porta 631 (IPP/CUPS) não está acessível" | Out-File -FilePath $outputFile -Append
    }
    $tcpClient.Close()
}
catch {
    "Erro ao verificar porta 631: $_" | Out-File -FilePath $outputFile -Append
}

# Testar porta 9100 (RAW)
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $timeout = $tcpClient.BeginConnect("10.148.1.147", 9100, $null, $null)
    $success = $timeout.AsyncWaitHandle.WaitOne(1000, $true)
    
    if ($success) {
        "Porta 9100 (RAW) está aberta e acessível" | Out-File -FilePath $outputFile -Append
        $tcpClient.EndConnect($timeout)
    }
    else {
        "Porta 9100 (RAW) não está acessível" | Out-File -FilePath $outputFile -Append
    }
    $tcpClient.Close()
}
catch {
    "Erro ao verificar porta 9100: $_" | Out-File -FilePath $outputFile -Append
}

# Tentar obter informações HTTP da porta 631
"=== INFORMAÇÕES DO SERVIDOR CUPS ===" | Out-File -FilePath $outputFile -Append
try {
    $webClient = New-Object System.Net.WebClient
    $webClient.Headers.Add("User-Agent", "PowerShell Diagnostic Script")
    $response = $webClient.DownloadString("http://10.148.1.147:631/")
    "Resposta do servidor CUPS:" | Out-File -FilePath $outputFile -Append
    $response.Substring(0, [Math]::Min(1000, $response.Length)) | Out-File -FilePath $outputFile -Append
    "..." | Out-File -FilePath $outputFile -Append
    
    # Tentar obter lista de impressoras
    try {
        $printersResponse = $webClient.DownloadString("http://10.148.1.147:631/printers/")
        "Impressoras no servidor CUPS:" | Out-File -FilePath $outputFile -Append
        $printersResponse.Substring(0, [Math]::Min(1000, $printersResponse.Length)) | Out-File -FilePath $outputFile -Append
        "..." | Out-File -FilePath $outputFile -Append
    }
    catch {
        "Erro ao obter lista de impressoras CUPS: $_" | Out-File -FilePath $outputFile -Append
    }
}
catch {
    "Erro ao conectar ao servidor CUPS via HTTP: $_" | Out-File -FilePath $outputFile -Append
}
"" | Out-File -FilePath $outputFile -Append

# Coletar trabalhos de impressão recentes
"=== TRABALHOS DE IMPRESSÃO RECENTES ===" | Out-File -FilePath $outputFile -Append
$jobs = Get-PrintJob -ComputerName $env:COMPUTERNAME -ErrorAction SilentlyContinue
if ($jobs) {
    $jobs | Format-Table PrinterName, DocumentName, JobStatus, TotalPages, JobTime -AutoSize | Out-String | Out-File -FilePath $outputFile -Append
}
else {
    "Nenhum trabalho de impressão encontrado." | Out-File -FilePath $outputFile -Append
}
"" | Out-File -FilePath $outputFile -Append

# Verificar a configuração do spooler
"=== SERVIÇO DE SPOOLER DE IMPRESSÃO ===" | Out-File -FilePath $outputFile -Append
$spoolerService = Get-Service -Name "Spooler"
"Status: $($spoolerService.Status)" | Out-File -FilePath $outputFile -Append
"Tipo de inicialização: $($spoolerService.StartType)" | Out-File -FilePath $outputFile -Append
"" | Out-File -FilePath $outputFile -Append

# Verificar logs de evento relacionados à impressão
"=== LOGS DE EVENTO DE IMPRESSÃO (ÚLTIMOS 50) ===" | Out-File -FilePath $outputFile -Append
try {
    $printEvents = Get-WinEvent -LogName "Microsoft-Windows-PrintService/Operational" -MaxEvents 50 -ErrorAction SilentlyContinue
    if ($printEvents) {
        $printEvents | Select-Object TimeCreated, Id, LevelDisplayName, Message |
          Format-Table -AutoSize | Out-String | Out-File -FilePath $outputFile -Append
    }
    else {
        "Nenhum evento de impressão encontrado." | Out-File -FilePath $outputFile -Append
    }
}
catch {
    "Erro ao obter logs de evento de impressão: $_" | Out-File -FilePath $outputFile -Append
}
"" | Out-File -FilePath $outputFile -Append

# Verificar dados de impressora de desktop
"=== DADOS DE IMPRESSORA DE DESKTOP ===" | Out-File -FilePath $outputFile -Append
$defaultPrinter = (Get-WmiObject -Query " SELECT * FROM Win32_Printer WHERE Default=$true").Name
"Impressora padrão: $defaultPrinter" | Out-File -FilePath $outputFile -Append
"" | Out-File -FilePath $outputFile -Append

# Informações sobre a impressora funcional (usada pelo usuário)
"=== INFORME SOBRE SUA IMPRESSORA FUNCIONAL ===" | Out-File -FilePath $outputFile -Append
"Por favor, insira o nome da impressora que você instalou manualmente e está funcionando:" | Out-File -FilePath $outputFile -Append
"Por favor, edite este arquivo e adicione o nome da impressora funcional aqui." | Out-File -FilePath $outputFile -Append
"" | Out-File -FilePath $outputFile -Append

# Resumo
"=== RESUMO ===" | Out-File -FilePath $outputFile -Append
"Diagnóstico concluído. Por favor, envie o arquivo $outputFile para análise." | Out-File -FilePath $outputFile -Append

Write-Host "Diagnóstico concluído! Os resultados foram salvos em: $outputFile"
Write-Host "Por favor, edite este arquivo e adicione o nome da impressora funcional na seção '=== INFORME SOBRE SUA IMPRESSORA FUNCIONAL ==='."
Write-Host "Pressione qualquer tecla para abrir o arquivo..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Start-Process "notepad.exe" $outputFile