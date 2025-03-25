using System;
using System.Collections.Generic;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using System.Runtime.Versioning;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Timers;
using System.Net;
using System.Linq; // Adicione esta diretiva using
using System.Text.RegularExpressions;


namespace PrintMonitor
{
    [SupportedOSPlatform("windows")]
    class Program
    {
        // Application directories and files
        private static string appDataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PrintMonitor");
        private static string logFile = Path.Combine(appDataDirectory, "print_log.txt");
        
        // Application components
        private static AppConfig appConfig = null!;
        private static ApiClient apiClient = null!;
        
        // Print monitoring
        private static List<string> installedPrinters = new List<string>();
        private static System.Timers.Timer printerUpdateTimer = null!;
        private static bool isMonitoring = false;
        private static CancellationTokenSource monitoringCancellationTokenSource = null!;

        static async Task Main(string[] args)
        {
            Console.WriteLine("=== PrintMonitor - v1.0 ===");
            SetupApplication();
            
            // Check if already logged in
            if (appConfig.IsAuthenticated)
            {
                Console.WriteLine($"Welcome back, {appConfig.CurrentUser.Username}!");
                apiClient.SetAuthToken(appConfig.AuthToken);
            }
            else
            {
                // Login required
                if (!await PromptLogin())
                {
                    Console.WriteLine("Login failed. Exiting application.");
                    return;
                }
            }
            
            // Verify admin rights for printer installation
            if (!IsAdministrator())
            {
                Console.WriteLine("WARNING: Administrator privileges are required to install printers.");
                Console.WriteLine("Please restart the application as administrator.");
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }
            
            // Start the application main flow
            await StartApplication();
            
            Console.WriteLine("Application running. Press 'Q' to quit at any time.");
            
            // Wait for quit command
            while (true)
            {
                if (Console.KeyAvailable)
                {
                    var key = Console.ReadKey(true);
                    if (key.Key == ConsoleKey.Q)
                    {
                        StopMonitoring();
                        Console.WriteLine("Shutting down application...");
                        break;
                    }
                }
                Thread.Sleep(100);
            }
        }

        private static void SetupApplication()
        {
            try
            {
                // Create application directories
                if (!Directory.Exists(appDataDirectory))
                {
                    Directory.CreateDirectory(appDataDirectory);
                    Console.WriteLine($"Application directory created: {appDataDirectory}");
                }
                
                // Initialize log file if needed
                if (!File.Exists(logFile))
                {
                    File.WriteAllText(logFile, "=== PRINT JOB LOG ===\n");
                    Console.WriteLine($"Log file created: {logFile}");
                }
                
                // Initialize configuration
                appConfig = new AppConfig(appDataDirectory);
                
                // Initialize API client
                apiClient = new ApiClient(appConfig.ApiBaseUrl);
                
                Console.WriteLine("Application setup completed");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during application setup: {ex.Message}");
            }
        }

        private static async Task<bool> PromptLogin()
        {
            Console.WriteLine("Please login to continue");
            
            string username = "";
            string password = "";
            
            while (string.IsNullOrWhiteSpace(username))
            {
                Console.Write("Username: ");
                username = Console.ReadLine()?.Trim() ?? "";
            }
            
            while (string.IsNullOrWhiteSpace(password))
            {
                Console.Write("Password: ");
                password = ReadPassword();
                Console.WriteLine();
            }
            
            return await Login(username, password);
        }
        
        private static string ReadPassword()
        {
            var password = new StringBuilder();
            ConsoleKeyInfo key;
            
            do
            {
                key = Console.ReadKey(true);
                
                if (key.Key != ConsoleKey.Enter && key.Key != ConsoleKey.Backspace)
                {
                    password.Append(key.KeyChar);
                    Console.Write("*");
                }
                else if (key.Key == ConsoleKey.Backspace && password.Length > 0)
                {
                    password.Remove(password.Length - 1, 1);
                    Console.Write("\b \b");
                }
            } while (key.Key != ConsoleKey.Enter);
            
            return password.ToString();
        }

        private static async Task<bool> Login(string username, string password)
        {
            try
            {
                Console.WriteLine("Authenticating...");
                
                // Call API for authentication
                var response = await apiClient.LoginAsync(username, password);
                
                if (response.Success)
                {
                    // Save auth data
                    appConfig.SaveAuth(response.Token, response.User, response.ExpiresAt);
                    
                    // Setup API client with token
                    apiClient.SetAuthToken(response.Token);
                    
                    Console.WriteLine($"Login successful. Welcome, {response.User.Username}!");
                    return true;
                }
                else
                {
                    Console.WriteLine($"Login failed: {response.Message}");
                    return false;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Login failed: {ex.Message}");
                return false;
            }
        }

        private static async Task StartApplication()
        {
            try
            {
                Console.WriteLine("Initializing application...");
                
                // Setup printer update timer (hourly check for new printers)
                int updateIntervalMs = appConfig.UpdateIntervalMinutes * 60 * 1000;
                printerUpdateTimer = new System.Timers.Timer(updateIntervalMs);
                printerUpdateTimer.Elapsed += async (sender, e) => await UpdatePrinters();
                printerUpdateTimer.AutoReset = true;
                
                // Initial printer update
                await UpdatePrinters();
                
                // Start print job monitoring
                StartMonitoring();
                
                // Start the timer for regular printer updates
                printerUpdateTimer.Start();
                
                Console.WriteLine("Application initialized successfully");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error starting application: {ex.Message}");
            }
        }

        private static async Task UpdatePrinters()
        {
            try
            {
                Console.WriteLine("Checking for printer updates...");
                
                const string brotherPrinterName = "Brother DCP-T720DW Printer";
                
                // Verificar se a impressora Brother já existe
                if (PrinterExists(brotherPrinterName))
                {
                    Console.WriteLine($"Printer '{brotherPrinterName}' already exists in the system");
                    
                    // Obter detalhes da impressora para debug
                    using (Process detailsProcess = new Process())
                    {
                        detailsProcess.StartInfo.FileName = "powershell";
                        detailsProcess.StartInfo.Arguments = $"-Command \"Get-Printer -Name '{brotherPrinterName}' | Format-List Name, DriverName, PortName, Comment\"";
                        detailsProcess.StartInfo.UseShellExecute = false;
                        detailsProcess.StartInfo.RedirectStandardOutput = true;
                        detailsProcess.StartInfo.CreateNoWindow = true;
                        detailsProcess.Start();
                        
                        string details = await detailsProcess.StandardOutput.ReadToEndAsync();
                        await detailsProcess.WaitForExitAsync();
                        
                        Console.WriteLine("Printer details:");
                        Console.WriteLine(details);
                    }
                    
                    // Adicionar à lista de monitoramento se ainda não estiver
                    if (!installedPrinters.Contains(brotherPrinterName))
                    {
                        installedPrinters.Add(brotherPrinterName);
                        Console.WriteLine($"Added printer '{brotherPrinterName}' to monitoring list");
                    }
                    
                    // Testar se conseguimos detectar trabalhos desta impressora
                    await CheckPrinterJobs(brotherPrinterName);
                }
                else
                {
                    // A impressora Brother não existe, precisamos encontrá-la na rede e instalá-la
                    Console.WriteLine($"Printer '{brotherPrinterName}' not found. Searching on network...");
                    
                    // Procurar pela impressora na rede
                    var foundPrinters = await ScanNetworkForPrinters();
                    
                    // Verificar se encontramos a impressora Brother
                    IPAddress brotherIpAddress = null;
                    foreach (var printer in foundPrinters)
                    {
                        if (printer.Item2 != null && printer.Item2.Contains("Brother", StringComparison.OrdinalIgnoreCase))
                        {
                            brotherIpAddress = printer.Item1;
                            Console.WriteLine($"Found Brother printer at IP: {brotherIpAddress}");
                            break;
                        }
                    }
                    
                    if (brotherIpAddress != null)
                    {
                        // Instalar a impressora Brother
                        bool success = await InstallBrotherPrinter(brotherPrinterName, brotherIpAddress.ToString());
                        
                        if (success && PrinterExists(brotherPrinterName))
                        {
                            Console.WriteLine($"Brother printer '{brotherPrinterName}' installed successfully!");
                            if (!installedPrinters.Contains(brotherPrinterName))
                            {
                                installedPrinters.Add(brotherPrinterName);
                            }
                        }
                        else
                        {
                            Console.WriteLine($"Failed to install Brother printer '{brotherPrinterName}'");
                        }
                    }
                    else
                    {
                        Console.WriteLine("No Brother printer found on the network");
                    }
                }
                
                // Obter impressoras da API
                var printers = await apiClient.GetPrintersAsync();
                foreach (var printer in printers)
                {
                    if (printer.IsEnabled && PrinterExists(printer.Name) && !installedPrinters.Contains(printer.Name))
                    {
                        installedPrinters.Add(printer.Name);
                        Console.WriteLine($"Added printer '{printer.Name}' from API to monitoring list");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error updating printers: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
            }
        }

        private static async Task<List<Tuple<IPAddress, string>>> ScanNetworkForPrinters()
        {
            var foundPrinters = new List<Tuple<IPAddress, string>>();
            Console.WriteLine("Scanning network for printers...");
            
            try
            {
                // Tentar obter o endereço IP da impressora diretamente em endereços específicos
                Console.WriteLine("Checking common Brother printer addresses and your network...");
                
                // Lista de possíveis endereços específicos para a rede 10.148.1.x
                string[] specificNetworkAddresses = {
                    "10.148.1.147", // Tente o IP específico que você mencionou primeiro
                    "10.148.1.100", "10.148.1.101", "10.148.1.102", "10.148.1.200", 
                    "10.148.1.150", "10.148.1.151", "10.148.1.152", "10.148.1.153"
                };
                
                // Verificar primeiro endereços específicos na rede
                foreach (string ipAddress in specificNetworkAddresses)
                {
                    Console.WriteLine($"Checking address: {ipAddress}");
                    if (await PrinterHelpers.PingHostAsync(ipAddress))
                    {
                        Console.WriteLine($"Found device at {ipAddress}, checking if it's a printer...");
                        
                        // Verificar se é uma impressora verificando a porta 9100 (porta RAW)
                        if (await PrinterHelpers.IsPortOpenAsync(ipAddress, 9100))
                        {
                            Console.WriteLine($"Printer port detected at {ipAddress}!");
                            foundPrinters.Add(new Tuple<IPAddress, string>(IPAddress.Parse(ipAddress), "Brother Printer"));
                            return foundPrinters; // Retorna imediatamente ao encontrar uma impressora
                        }
                        
                        // Verificar também a porta 631 (IPP)
                        if (await PrinterHelpers.IsPortOpenAsync(ipAddress, 631))
                        {
                            Console.WriteLine($"IPP printer port detected at {ipAddress}!");
                            foundPrinters.Add(new Tuple<IPAddress, string>(IPAddress.Parse(ipAddress), "Brother Printer (IPP)"));
                            return foundPrinters;
                        }
                        
                        // Verificar porta 80 (HTTP) para impressora com servidor web
                        if (await PrinterHelpers.IsPortOpenAsync(ipAddress, 80))
                        {
                            Console.WriteLine($"Web server detected at {ipAddress}, probably a printer!");
                            foundPrinters.Add(new Tuple<IPAddress, string>(IPAddress.Parse(ipAddress), "Networked Printer"));
                            return foundPrinters;
                        }
                    }
                }
                
                // Verificar endereços específicos a partir do seu computador na rede
                string localIP = await GetLocalIPAddress();
                if (!string.IsNullOrEmpty(localIP))
                {
                    Console.WriteLine($"Your computer IP: {localIP}");
                    
                    // Verificar se conseguimos determinar o gateway
                    string gateway = await GetDefaultGateway();
                    if (!string.IsNullOrEmpty(gateway))
                    {
                        Console.WriteLine($"Your gateway: {gateway}");
                        
                        // Verificar se o gateway responde
                        if (await PrinterHelpers.PingHostAsync(gateway))
                        {
                            Console.WriteLine("Gateway is responding to ping");
                        }
                        
                        // Verificar se a impressora pode estar usando o mesmo IP do gateway
                        if (await PrinterHelpers.IsPortOpenAsync(gateway, 9100) || 
                            await PrinterHelpers.IsPortOpenAsync(gateway, 631) ||
                            await PrinterHelpers.IsPortOpenAsync(gateway, 80))
                        {
                            Console.WriteLine($"Gateway may be hosting a printer service!");
                            foundPrinters.Add(new Tuple<IPAddress, string>(IPAddress.Parse(gateway), "Possible Printer on Gateway"));
                        }
                    }
                }
                
                // Se ainda não encontrou, obter o próprio endereço IP para determinar a sub-rede
                string networkPrefix = await GetLocalNetworkPrefix();
                if (string.IsNullOrEmpty(networkPrefix))
                {
                    Console.WriteLine("Could not determine local network prefix. Using your network 10.148.1");
                    networkPrefix = "10.148.1";
                }
                
                Console.WriteLine($"Using network prefix: {networkPrefix}");
                
                // Lista de portas comuns para impressoras
                int[] commonPorts = { 9100, 515, 631, 80 };
                
                // Verificar apenas os endereços mais prováveis na sub-rede (ex: próximos ao gateway)
                Console.WriteLine("Scanning addresses closer to gateway first...");
                var scanTasks = new List<Task<Tuple<IPAddress, string>>>();
                
                // Verificar primeiro os números mais prováveis para impressoras (1-10, 100-150)
                for (int i = 1; i <= 10; i++)
                {
                    string ipAddress = $"{networkPrefix}.{i}";
                    scanTasks.Add(ScanIPAddressForPrinter(ipAddress, commonPorts));
                }
                
                for (int i = 100; i <= 150; i++)
                {
                    string ipAddress = $"{networkPrefix}.{i}";
                    scanTasks.Add(ScanIPAddressForPrinter(ipAddress, commonPorts));
                }
                
                // Aguardar todos os scans completarem
                int completedCount = 0;
                while (scanTasks.Count > 0)
                {
                    Task<Tuple<IPAddress, string>> completed = await Task.WhenAny(scanTasks);
                    scanTasks.Remove(completed);
                    completedCount++;
                    
                    // Log de progresso a cada 10 endereços
                    if (completedCount % 10 == 0)
                    {
                        Console.WriteLine($"Scanning progress: {completedCount} addresses checked...");
                    }
                    
                    var result = await completed;
                    if (result != null && result.Item2 != null)
                    {
                        foundPrinters.Add(result);
                        Console.WriteLine($"Found printer at {result.Item1}, type: {result.Item2}");
                    }
                }
                
                // Se encontrou impressoras, retornar
                if (foundPrinters.Count > 0)
                {
                    Console.WriteLine($"Found {foundPrinters.Count} printers on network {networkPrefix}.*");
                    return foundPrinters;
                }
                
                // Se não achou nas faixas mais prováveis, ampliar a busca se estiver na rede correta
                if (networkPrefix == "10.148.1")
                {
                    Console.WriteLine("No printers found in common IP range. Expanding search in your network...");
                    
                    scanTasks = new List<Task<Tuple<IPAddress, string>>>();
                    
                    // Verificar outros endereços na sub-rede em blocos para obter feedback mais rápido
                    for (int i = 151; i <= 200; i++)
                    {
                        string ipAddress = $"{networkPrefix}.{i}";
                        scanTasks.Add(ScanIPAddressForPrinter(ipAddress, commonPorts));
                    }
                    
                    // Aguardar todos os scans completarem
                    while (scanTasks.Count > 0)
                    {
                        Task<Tuple<IPAddress, string>> completed = await Task.WhenAny(scanTasks);
                        scanTasks.Remove(completed);
                        
                        var result = await completed;
                        if (result != null && result.Item2 != null)
                        {
                            foundPrinters.Add(result);
                            Console.WriteLine($"Found printer at {result.Item1}, type: {result.Item2}");
                        }
                    }
                }
                
                Console.WriteLine($"Found {foundPrinters.Count} printers on the network");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error scanning network: {ex.Message}");
            }
            
            return foundPrinters;
        }

        // Novo método para obter o endereço IP local atual
        private static async Task<string> GetLocalIPAddress()
        {
            try
            {
                using (Process process = new Process())
                {
                    process.StartInfo.FileName = "powershell";
                    process.StartInfo.Arguments = @"-Command ""Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '10.148.1.*' } | Select-Object -ExpandProperty IPAddress""";
                    process.StartInfo.UseShellExecute = false;
                    process.StartInfo.RedirectStandardOutput = true;
                    process.StartInfo.CreateNoWindow = true;
                    process.Start();
                    
                    string output = await process.StandardOutput.ReadToEndAsync();
                    await process.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(output))
                    {
                        return output.Trim();
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting local IP address: {ex.Message}");
            }
            
            return "";
        }

        // Novo método para obter o gateway padrão
        private static async Task<string> GetDefaultGateway()
        {
            try
            {
                using (Process process = new Process())
                {
                    process.StartInfo.FileName = "powershell";
                    process.StartInfo.Arguments = @"-Command ""Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Where-Object { $_.NextHop -like '10.148.1.*' } | Select-Object -ExpandProperty NextHop""";
                    process.StartInfo.UseShellExecute = false;
                    process.StartInfo.RedirectStandardOutput = true;
                    process.StartInfo.CreateNoWindow = true;
                    process.Start();
                    
                    string output = await process.StandardOutput.ReadToEndAsync();
                    await process.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(output))
                    {
                        return output.Trim();
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting default gateway: {ex.Message}");
            }
            
            return "10.148.1.1"; // Retorna o gateway padrão fornecido nos seus dados
        }


        private static async Task<string> GetLocalNetworkPrefix()
        {
            try
            {
                // Método modificado para priorizar adaptadores Wi-Fi e interfaces de rede ativas
                // Primeiro, tentar obter informações do adaptador Wi-Fi especificamente
                string wifiCommand = @"
                    Get-NetAdapter | 
                    Where-Object { 
                        $_.Status -eq 'Up' -and 
                        ($_.InterfaceDescription -like '*Wireless*' -or 
                        $_.InterfaceDescription -like '*Wi-Fi*' -or 
                        $_.Name -like '*Wi-Fi*' -or 
                        $_.Name -like '*Wireless*')
                    } | 
                    ForEach-Object { 
                        Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 
                    } | 
                    Where-Object { 
                        $_.IPAddress -like '192.168.*' -or 
                        $_.IPAddress -like '10.*' -or 
                        ($_.IPAddress -like '172.*' -and [int]($_.IPAddress.Split('.')[1]) -ge 16 -and [int]($_.IPAddress.Split('.')[1]) -le 31)
                    } | 
                    Select-Object -First 1 -ExpandProperty IPAddress
                ";
                
                using (Process wifiProcess = new Process())
                {
                    wifiProcess.StartInfo.FileName = "powershell";
                    wifiProcess.StartInfo.Arguments = $"-Command \"{wifiCommand}\"";
                    wifiProcess.StartInfo.UseShellExecute = false;
                    wifiProcess.StartInfo.RedirectStandardOutput = true;
                    wifiProcess.StartInfo.CreateNoWindow = true;
                    wifiProcess.Start();
                    
                    string wifiOutput = await wifiProcess.StandardOutput.ReadToEndAsync();
                    await wifiProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(wifiOutput))
                    {
                        string ipAddress = wifiOutput.Trim();
                        Console.WriteLine($"Found Wi-Fi IP address: {ipAddress}");
                        
                        // Pegar apenas os três primeiros octetos do IP
                        return string.Join(".", ipAddress.Split('.').Take(3));
                    }
                }
                
                // Terceiro método: usar ipconfig e extrair especificamente o adaptador com IPv4 ativo
                Console.WriteLine("Trying ipconfig method to find active Wi-Fi...");
                using (Process ipconfigProcess = new Process())
                {
                    ipconfigProcess.StartInfo.FileName = "cmd.exe";
                    ipconfigProcess.StartInfo.Arguments = "/c ipconfig /all";
                    ipconfigProcess.StartInfo.UseShellExecute = false;
                    ipconfigProcess.StartInfo.RedirectStandardOutput = true;
                    ipconfigProcess.StartInfo.CreateNoWindow = true;
                    ipconfigProcess.Start();
                    
                    string ipconfigOutput = await ipconfigProcess.StandardOutput.ReadToEndAsync();
                    await ipconfigProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(ipconfigOutput))
                    {
                        // Procurar por adaptadores Wi-Fi ou Ethernet ativos
                        string[] segments = ipconfigOutput.Split(new[] { "\r\n\r\n" }, StringSplitOptions.RemoveEmptyEntries);
                        
                        foreach (var segment in segments)
                        {
                            if ((segment.Contains("Wi-Fi") || segment.Contains("Wireless") || 
                                segment.Contains("Sem Fio") || segment.Contains("Ethernet")) && 
                                segment.Contains("IPv4") && !segment.Contains("Media disconnected"))
                            {
                                // Extrair o endereço IPv4
                                var match = Regex.Match(segment, @"IPv4.+?:\s*(\d+\.\d+\.\d+\.\d+)");
                                if (match.Success)
                                {
                                    string ipAddress = match.Groups[1].Value;
                                    Console.WriteLine($"Found active network adapter IP: {ipAddress}");
                                    
                                    // Pegar apenas os três primeiros octetos do IP
                                    return string.Join(".", ipAddress.Split('.').Take(3));
                                }
                            }
                        }
                    }
                }
                
                // Quarto método: tentar uma abordagem mais simples para encontrar qualquer IP na rede 10.*
                Console.WriteLine("Trying direct matching for your network (10.148.1.*)...");
                using (Process directProcess = new Process())
                {
                    directProcess.StartInfo.FileName = "powershell";
                    directProcess.StartInfo.Arguments = $"-Command \"Get-NetIPAddress -AddressFamily IPv4 | Where-Object {{ $_.IPAddress -like '10.148.1.*' }} | Select-Object -First 1 -ExpandProperty IPAddress\"";
                    directProcess.StartInfo.UseShellExecute = false;
                    directProcess.StartInfo.RedirectStandardOutput = true;
                    directProcess.StartInfo.CreateNoWindow = true;
                    directProcess.Start();
                    
                    string directOutput = await directProcess.StandardOutput.ReadToEndAsync();
                    await directProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(directOutput))
                    {
                        string ipAddress = directOutput.Trim();
                        Console.WriteLine($"Found IP address on your network: {ipAddress}");
                        
                        // Pegar apenas os três primeiros octetos do IP
                        return string.Join(".", ipAddress.Split('.').Take(3));
                    }
                }
                
                // Se tudo falhar, usar o IP fornecido pelo usuário
                Console.WriteLine("All automatic methods failed. Using your known network (10.148.1)");
                return "10.148.1";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting local network prefix: {ex.Message}");
                // Retornar diretamente o IP conhecido do usuário se houver erro
                return "10.148.1";
            }
        }

        private static async Task<Tuple<IPAddress, string>> ScanIPAddressForPrinter(string ipAddress, int[] portsToCheck)
        {
            try
            {
                // Verificar se o host responde ao ping
                if (await PrinterHelpers.PingHostAsync(ipAddress))
                {
                    // Verificar portas específicas de impressora
                    foreach (int port in portsToCheck)
                    {
                        if (await PrinterHelpers.IsPortOpenAsync(ipAddress, port))
                        {
                            // Tentar determinar o modelo da impressora via SNMP
                            string printerModel = await GetPrinterModelViaSNMP(ipAddress);
                            
                            if (string.IsNullOrEmpty(printerModel))
                            {
                                // Se não conseguiu via SNMP, tenta HTTP
                                printerModel = await GetPrinterModelViaHTTP(ipAddress);
                            }
                            
                            if (!string.IsNullOrEmpty(printerModel))
                            {
                                return new Tuple<IPAddress, string>(IPAddress.Parse(ipAddress), printerModel);
                            }
                            else if (port == 9100 || port == 515 || port == 631)
                            {
                                // Se alguma porta típica de impressora estiver aberta, assume que é uma impressora
                                return new Tuple<IPAddress, string>(IPAddress.Parse(ipAddress), "Unknown Printer");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error scanning IP {ipAddress}: {ex.Message}");
            }
            
            return null;
        }

        // Tentar obter o modelo da impressora via SNMP
        private static async Task<string> GetPrinterModelViaSNMP(string ipAddress)
        {
            try
            {
                // Usar PowerShell para obter informações via SNMP
                string psCommand = @"
                    try {
                        $snmpModel = (Get-SnmpData -IP " + ipAddress + @" -OID '1.3.6.1.2.1.25.3.2.1.3.1' -Community 'public' -ErrorAction Stop).Data
                        if (-not [string]::IsNullOrEmpty($snmpModel)) {
                            $snmpModel
                        } else {
                            ''
                        }
                    } catch {
                        ''
                    }
                ";
                
                using (Process process = new Process())
                {
                    process.StartInfo.FileName = "powershell";
                    process.StartInfo.Arguments = $"-Command \"{psCommand}\"";
                    process.StartInfo.UseShellExecute = false;
                    process.StartInfo.RedirectStandardOutput = true;
                    process.StartInfo.RedirectStandardError = true;
                    process.StartInfo.CreateNoWindow = true;
                    process.Start();
                    
                    string output = await process.StandardOutput.ReadToEndAsync();
                    string error = await process.StandardError.ReadToEndAsync();
                    await process.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(error) && error.Contains("Get-SnmpData"))
                    {
                        // SNMP module not available, try alternative method
                        string altCommand = @"
                            try {
                                $Client = New-Object -ComObject 'MSScriptControl.ScriptControl'
                                $Client.Language = 'VBScript'
                                $Client.AddCode('
                                    Function GetSNMP(strComputer, strCommunity, strOID)
                                        On Error Resume Next
                                        Dim objSNMP
                                        Set objSNMP = GetObject(""winmgmts:{impersonationLevel=impersonate}//./root/cimv2"").ExecQuery(""Select * from Win32_PerfRawData_Tcpip_ICMP where Name='"" & strComputer & ""'"")
                                        If Err.Number <> 0 Then
                                            GetSNMP = """"
                                            Exit Function
                                        End If
                                        
                                        GetSNMP = """"
                                        For Each objItem in objSNMP
                                            GetSNMP = objItem.Name
                                            Exit For
                                        Next
                                    End Function
                                ')
                                $result = $Client.Run('GetSNMP', '" + ipAddress + @"', 'public', '1.3.6.1.2.1.25.3.2.1.3.1')
                                $result
                            } catch {
                                ''
                            }
                        ";
                        
                        using (Process altProcess = new Process())
                        {
                            altProcess.StartInfo.FileName = "powershell";
                            altProcess.StartInfo.Arguments = $"-Command \"{altCommand}\"";
                            altProcess.StartInfo.UseShellExecute = false;
                            altProcess.StartInfo.RedirectStandardOutput = true;
                            altProcess.StartInfo.CreateNoWindow = true;
                            altProcess.Start();
                            
                            output = await altProcess.StandardOutput.ReadToEndAsync();
                            await altProcess.WaitForExitAsync();
                        }
                    }
                    
                    return output.Trim();
                }
            }
            catch
            {
                return string.Empty;
            }
        }

        // Tentar obter o modelo da impressora via HTTP
        private static async Task<string> GetPrinterModelViaHTTP(string ipAddress)
        {
            try
            {
                // Tentar acessar a página web da impressora para identificar o modelo
                using (HttpClient client = new HttpClient())
                {
                    client.Timeout = TimeSpan.FromSeconds(2);
                    string response = await client.GetStringAsync($"http://{ipAddress}");
                    
                    // Verificar se há menção a "Brother" ou "DCP" na resposta
                    if (response.Contains("Brother", StringComparison.OrdinalIgnoreCase) ||
                        response.Contains("DCP", StringComparison.OrdinalIgnoreCase) ||
                        response.Contains("T720", StringComparison.OrdinalIgnoreCase))
                    {
                        if (response.Contains("DCP-T720DW", StringComparison.OrdinalIgnoreCase))
                        {
                            return "Brother DCP-T720DW";
                        }
                        return "Brother Printer";
                    }
                    
                    return "Unknown Printer";
                }
            }
            catch
            {
                return string.Empty;
            }
        }

        // Método para instalar a impressora Brother
        // Versão corrigida do método InstallBrotherPrinter que usa apenas métodos públicos
        private static async Task<bool> InstallBrotherPrinter(string printerName, string printerIp)
        {
            try
            {
                Console.WriteLine($"Installing Brother printer '{printerName}' at IP {printerIp}...");
                
                // Verificar conectividade com a impressora
                bool pingSuccessful = await PrinterHelpers.PingHostAsync(printerIp);
                if (!pingSuccessful)
                {
                    Console.WriteLine($"WARNING: Cannot ping the printer at {printerIp}");
                    Console.WriteLine("Attempting to install anyway...");
                }
                
                // Verificar as portas comuns para impressora
                bool rawPortOpen = await PrinterHelpers.IsPortOpenAsync(printerIp, 9100);
                bool ippPortOpen = await PrinterHelpers.IsPortOpenAsync(printerIp, 631);
                bool webPortOpen = await PrinterHelpers.IsPortOpenAsync(printerIp, 80);
                
                Console.WriteLine($"RAW Port (9100) is open: {rawPortOpen}");
                Console.WriteLine($"IPP Port (631) is open: {ippPortOpen}");
                Console.WriteLine($"Web Port (80) is open: {webPortOpen}");
                
                // Usar o método público InstallPrinterAutomatically da classe PrinterHelpers
                // Este método já lida com a detecção de protocolo, criação de porta e seleção de driver
                Console.WriteLine($"Attempting automatic printer installation for Brother printer at {printerIp}...");
                bool success = await PrinterHelpers.InstallPrinterAutomatically(printerName, printerIp, 9100);
                
                if (success)
                {
                    Console.WriteLine($"Brother printer '{printerName}' installed successfully!");
                    return true;
                }
                else
                {
                    Console.WriteLine("Automatic installation failed. Trying alternative method...");
                    
                    // Método alternativo usando rundll32 diretamente, que não depende de métodos privados
                    string uniqueId = DateTime.Now.ToString("yyyyMMddHHmmss");
                    string portName = $"IP_{printerIp}_{uniqueId}";
                    
                    // Criar porta via PowerShell
                    using (Process portProcess = new Process())
                    {
                        portProcess.StartInfo.FileName = "powershell";
                        portProcess.StartInfo.Arguments = $"-Command \"Add-PrinterPort -Name '{portName}' -PrinterHostAddress '{printerIp}' -PortNumber 9100\"";
                        portProcess.StartInfo.UseShellExecute = false;
                        portProcess.StartInfo.RedirectStandardOutput = true;
                        portProcess.StartInfo.RedirectStandardError = true;
                        portProcess.StartInfo.CreateNoWindow = true;
                        portProcess.Start();
                        
                        string output = await portProcess.StandardOutput.ReadToEndAsync();
                        string error = await portProcess.StandardError.ReadToEndAsync();
                        await portProcess.WaitForExitAsync();
                        
                        if (!string.IsNullOrEmpty(error) && !error.Contains("already exists"))
                        {
                            Console.WriteLine($"Error creating port: {error}");
                        }
                    }
                    
                    // Encontrar o melhor driver disponível para Brother
                    string driverName = await FindBestBrotherDriver();
                    
                    // Adicionar impressora via rundll32
                    using (Process directProcess = new Process())
                    {
                        directProcess.StartInfo.FileName = "rundll32.exe";
                        directProcess.StartInfo.Arguments = $"printui.dll,PrintUIEntry /if /b \"{printerName}\" /f \"%windir%\\inf\\ntprint.inf\" /r \"{portName}\" /m \"{driverName}\"";
                        directProcess.StartInfo.UseShellExecute = false;
                        directProcess.StartInfo.CreateNoWindow = true;
                        directProcess.Start();
                        await directProcess.WaitForExitAsync();
                    }
                    
                    // Verificar se a impressora foi adicionada
                    await Task.Delay(3000); // Aguardar um pouco para o sistema registrar
                    
                    if (PrinterExists(printerName))
                    {
                        Console.WriteLine($"Brother printer '{printerName}' installed successfully via alternative method!");
                        return true;
                    }
                    else
                    {
                        Console.WriteLine("Installation failed via all methods");
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error installing Brother printer: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
                return false;
            }
        }

        // Método simplificado para encontrar o melhor driver Brother disponível
        private static async Task<string> FindBestBrotherDriver()
        {
            try
            {
                Console.WriteLine("Searching for appropriate Brother driver...");
                
                // Procurar especificamente o modelo DCP-T720DW
                string exactModelCommand = @"
                    Get-PrinterDriver | Where-Object { 
                        $_.Name -like '*Brother*DCP-T720DW*' -or 
                        $_.Name -like '*Brother*DCPT720DW*' -or 
                        $_.Name -like '*Brother*T720*' 
                    } | Select-Object -First 1 -ExpandProperty Name
                ";
                
                using (Process exactProcess = new Process())
                {
                    exactProcess.StartInfo.FileName = "powershell";
                    exactProcess.StartInfo.Arguments = $"-Command \"{exactModelCommand}\"";
                    exactProcess.StartInfo.UseShellExecute = false;
                    exactProcess.StartInfo.RedirectStandardOutput = true;
                    exactProcess.StartInfo.CreateNoWindow = true;
                    exactProcess.Start();
                    
                    string exactOutput = await exactProcess.StandardOutput.ReadToEndAsync();
                    await exactProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(exactOutput.Trim()))
                    {
                        Console.WriteLine($"Found exact Brother model driver: {exactOutput.Trim()}");
                        return exactOutput.Trim();
                    }
                }
                
                // Procurar a família de impressoras DCP ou T720
                string familyCommand = @"
                    Get-PrinterDriver | Where-Object { 
                        $_.Name -like '*Brother*DCP*' -or 
                        $_.Name -like '*Brother*Inkjet*' -or
                        $_.Name -like '*Brother*T7*' 
                    } | Select-Object -First 1 -ExpandProperty Name
                ";
                
                using (Process familyProcess = new Process())
                {
                    familyProcess.StartInfo.FileName = "powershell";
                    familyProcess.StartInfo.Arguments = $"-Command \"{familyCommand}\"";
                    familyProcess.StartInfo.UseShellExecute = false;
                    familyProcess.StartInfo.RedirectStandardOutput = true;
                    familyProcess.StartInfo.CreateNoWindow = true;
                    familyProcess.Start();
                    
                    string familyOutput = await familyProcess.StandardOutput.ReadToEndAsync();
                    await familyProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(familyOutput.Trim()))
                    {
                        Console.WriteLine($"Found Brother family driver: {familyOutput.Trim()}");
                        return familyOutput.Trim();
                    }
                }
                
                // Verificar por qualquer driver Brother
                string anyBrotherCommand = @"
                    Get-PrinterDriver | Where-Object { 
                        $_.Name -like '*Brother*' 
                    } | Select-Object -First 1 -ExpandProperty Name
                ";
                
                using (Process anyProcess = new Process())
                {
                    anyProcess.StartInfo.FileName = "powershell";
                    anyProcess.StartInfo.Arguments = $"-Command \"{anyBrotherCommand}\"";
                    anyProcess.StartInfo.UseShellExecute = false;
                    anyProcess.StartInfo.RedirectStandardOutput = true;
                    anyProcess.StartInfo.CreateNoWindow = true;
                    anyProcess.Start();
                    
                    string anyOutput = await anyProcess.StandardOutput.ReadToEndAsync();
                    await anyProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(anyOutput.Trim()))
                    {
                        Console.WriteLine($"Found generic Brother driver: {anyOutput.Trim()}");
                        return anyOutput.Trim();
                    }
                }
                
                Console.WriteLine("No Brother driver found, using Microsoft IPP Class Driver");
                return "Microsoft IPP Class Driver";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error finding Brother driver: {ex.Message}");
                return "Microsoft IPP Class Driver";
            }
        }

        // Novo método para procurar o melhor driver Brother disponível
        private static async Task<string> FindBestBrotherDriver(string printerModel)
        {
            try
            {
                Console.WriteLine("Searching for appropriate Brother driver...");
                
                // Procurar especificamente o modelo DCP-T720DW
                string exactModelCommand = @"
                    Get-PrinterDriver | Where-Object { 
                        $_.Name -like '*Brother*DCP-T720DW*' -or 
                        $_.Name -like '*Brother*DCPT720DW*' -or 
                        $_.Name -like '*Brother*T720*' 
                    } | Select-Object -First 1 -ExpandProperty Name
                ";
                
                using (Process exactProcess = new Process())
                {
                    exactProcess.StartInfo.FileName = "powershell";
                    exactProcess.StartInfo.Arguments = $"-Command \"{exactModelCommand}\"";
                    exactProcess.StartInfo.UseShellExecute = false;
                    exactProcess.StartInfo.RedirectStandardOutput = true;
                    exactProcess.StartInfo.CreateNoWindow = true;
                    exactProcess.Start();
                    
                    string exactOutput = await exactProcess.StandardOutput.ReadToEndAsync();
                    await exactProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(exactOutput.Trim()))
                    {
                        Console.WriteLine($"Found exact Brother model driver: {exactOutput.Trim()}");
                        return exactOutput.Trim();
                    }
                }
                
                // Procurar a família de impressoras DCP ou T720
                string familyCommand = @"
                    Get-PrinterDriver | Where-Object { 
                        $_.Name -like '*Brother*DCP*' -or 
                        $_.Name -like '*Brother*Inkjet*' -or
                        $_.Name -like '*Brother*T7*' 
                    } | Select-Object -First 1 -ExpandProperty Name
                ";
                
                using (Process familyProcess = new Process())
                {
                    familyProcess.StartInfo.FileName = "powershell";
                    familyProcess.StartInfo.Arguments = $"-Command \"{familyCommand}\"";
                    familyProcess.StartInfo.UseShellExecute = false;
                    familyProcess.StartInfo.RedirectStandardOutput = true;
                    familyProcess.StartInfo.CreateNoWindow = true;
                    familyProcess.Start();
                    
                    string familyOutput = await familyProcess.StandardOutput.ReadToEndAsync();
                    await familyProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(familyOutput.Trim()))
                    {
                        Console.WriteLine($"Found Brother family driver: {familyOutput.Trim()}");
                        return familyOutput.Trim();
                    }
                }
                
                return await GetBrotherDriver();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error finding Brother driver: {ex.Message}");
                return "";
            }
        }

        // Método para obter qualquer driver Brother disponível
        private static async Task<string> GetBrotherDriver()
        {
            try
            {
                // Verificar por qualquer driver Brother
                string anyBrotherCommand = @"
                    Get-PrinterDriver | Where-Object { 
                        $_.Name -like '*Brother*' 
                    } | Select-Object -First 1 -ExpandProperty Name
                ";
                
                using (Process anyProcess = new Process())
                {
                    anyProcess.StartInfo.FileName = "powershell";
                    anyProcess.StartInfo.Arguments = $"-Command \"{anyBrotherCommand}\"";
                    anyProcess.StartInfo.UseShellExecute = false;
                    anyProcess.StartInfo.RedirectStandardOutput = true;
                    anyProcess.StartInfo.CreateNoWindow = true;
                    anyProcess.Start();
                    
                    string anyOutput = await anyProcess.StandardOutput.ReadToEndAsync();
                    await anyProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(anyOutput.Trim()))
                    {
                        Console.WriteLine($"Found generic Brother driver: {anyOutput.Trim()}");
                        return anyOutput.Trim();
                    }
                }
                
                // Procurar driver Brother universal
                string universalCommand = @"
                    Get-PrinterDriver | Where-Object { 
                        $_.Name -like '*Brother*Universal*' -or 
                        $_.Name -like '*Universal*Brother*' 
                    } | Select-Object -First 1 -ExpandProperty Name
                ";
                
                using (Process universalProcess = new Process())
                {
                    universalProcess.StartInfo.FileName = "powershell";
                    universalProcess.StartInfo.Arguments = $"-Command \"{universalCommand}\"";
                    universalProcess.StartInfo.UseShellExecute = false;
                    universalProcess.StartInfo.RedirectStandardOutput = true;
                    universalProcess.StartInfo.CreateNoWindow = true;
                    universalProcess.Start();
                    
                    string universalOutput = await universalProcess.StandardOutput.ReadToEndAsync();
                    await universalProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(universalOutput.Trim()))
                    {
                        Console.WriteLine($"Found Brother universal driver: {universalOutput.Trim()}");
                        return universalOutput.Trim();
                    }
                }
                
                Console.WriteLine("No Brother driver found, will use Microsoft IPP Class Driver");
                return "Microsoft IPP Class Driver";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting Brother driver: {ex.Message}");
                return "Microsoft IPP Class Driver";
            }
        }

        // Verificar se um driver Brother está instalado
        private static async Task<bool> CheckBrotherDriverInstalled()
        {
            try
            {
                // Verificar se existe algum driver Brother instalado
                string psCommand = @"
                    Get-PrinterDriver | Where-Object { $_.Name -like '*Brother*' } | Select-Object -First 1 -ExpandProperty Name
                ";
                
                using (Process process = new Process())
                {
                    process.StartInfo.FileName = "powershell";
                    process.StartInfo.Arguments = $"-Command \"{psCommand}\"";
                    process.StartInfo.UseShellExecute = false;
                    process.StartInfo.RedirectStandardOutput = true;
                    process.StartInfo.CreateNoWindow = true;
                    process.Start();
                    
                    string output = await process.StandardOutput.ReadToEndAsync();
                    await process.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(output.Trim()))
                    {
                        Console.WriteLine($"Brother driver found: {output.Trim()}");
                        return true;
                    }
                }
                
                // Verificar outros drivers alternativos que podem funcionar
                Console.WriteLine("No Brother-specific driver found, checking for generic driver");
                
                string genericCommand = @"
                    (Get-PrinterDriver | Where-Object { $_.Name -like '*Generic*' -or $_.Name -like '*Universal*' } | 
                    Select-Object -First 1 -ExpandProperty Name) -ne $null
                ";
                
                using (Process genericProcess = new Process())
                {
                    genericProcess.StartInfo.FileName = "powershell";
                    genericProcess.StartInfo.Arguments = $"-Command \"{genericCommand}\"";
                    genericProcess.StartInfo.UseShellExecute = false;
                    genericProcess.StartInfo.RedirectStandardOutput = true;
                    genericProcess.StartInfo.CreateNoWindow = true;
                    genericProcess.Start();
                    
                    string output = await genericProcess.StandardOutput.ReadToEndAsync();
                    await genericProcess.WaitForExitAsync();
                    
                    if (output.Trim().ToLower() == "true")
                    {
                        Console.WriteLine("Generic driver found");
                        return true;
                    }
                }
                
                Console.WriteLine("No Brother or generic drivers found");
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error checking Brother drivers: {ex.Message}");
                return false;
            }
        }

        // New method specifically for installing CUPS-PDF printers
        private static async Task<bool> InstallCupsPdfPrinter(string printerName, string serverIp)
        {
            try
            {
                // Create a unique port name for the CUPS server
                string portName = $"CUPS_{serverIp}_{DateTime.Now.ToString("yyyyMMddHHmmss")}";
                
                Console.WriteLine($"Creating IPP port '{portName}' for CUPS server at {serverIp}:631...");
                
                // Create TCP/IP port on IPP port 631
                using (Process portProcess = new Process())
                {
                    portProcess.StartInfo.FileName = "powershell";
                    portProcess.StartInfo.Arguments = $"-Command \"Add-PrinterPort -Name '{portName}' -PrinterHostAddress '{serverIp}' -PortNumber 631\"";
                    portProcess.StartInfo.UseShellExecute = false;
                    portProcess.StartInfo.RedirectStandardOutput = true;
                    portProcess.StartInfo.RedirectStandardError = true;
                    portProcess.StartInfo.CreateNoWindow = true;
                    portProcess.Start();
                    
                    string output = await portProcess.StandardOutput.ReadToEndAsync();
                    string error = await portProcess.StandardError.ReadToEndAsync();
                    await portProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(error) && !error.Contains("already exists"))
                    {
                        Console.WriteLine($"Error creating port: {error}");
                        return false;
                    }
                }
                
                Console.WriteLine($"Adding printer '{printerName}' with Microsoft IPP Class Driver...");
                
                // Add printer with IPP Class Driver
                using (Process printerProcess = new Process())
                {
                    printerProcess.StartInfo.FileName = "powershell";
                    printerProcess.StartInfo.Arguments = $"-Command \"Add-Printer -Name '{printerName}' -DriverName 'Microsoft IPP Class Driver' -PortName '{portName}' -Comment 'PDF'\"";
                    printerProcess.StartInfo.UseShellExecute = false;
                    printerProcess.StartInfo.RedirectStandardOutput = true;
                    printerProcess.StartInfo.RedirectStandardError = true;
                    printerProcess.StartInfo.CreateNoWindow = true;
                    printerProcess.Start();
                    
                    string output = await printerProcess.StandardOutput.ReadToEndAsync();
                    string error = await printerProcess.StandardError.ReadToEndAsync();
                    await printerProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(error))
                    {
                        Console.WriteLine($"Error adding printer: {error}");
                        
                        // Try alternative method
                        Console.WriteLine("Trying alternative method...");
                        
                        using (Process altProcess = new Process())
                        {
                            altProcess.StartInfo.FileName = "rundll32.exe";
                            altProcess.StartInfo.Arguments = $"printui.dll,PrintUIEntry /if /b \"{printerName}\" /f \"%windir%\\inf\\ntprint.inf\" /r \"{portName}\" /m \"Microsoft IPP Class Driver\"";
                            altProcess.StartInfo.UseShellExecute = false;
                            altProcess.StartInfo.CreateNoWindow = true;
                            altProcess.Start();
                            await altProcess.WaitForExitAsync();
                        }
                        
                        // Check if printer was added
                        bool exists = PrinterExists(printerName);
                        if (exists)
                        {
                            Console.WriteLine("Printer added successfully via alternative method");
                            
                            // Set printer comment
                            using (Process commentProcess = new Process())
                            {
                                commentProcess.StartInfo.FileName = "powershell";
                                commentProcess.StartInfo.Arguments = $"-Command \"Set-Printer -Name '{printerName}' -Comment 'PDF'\"";
                                commentProcess.StartInfo.UseShellExecute = false;
                                commentProcess.StartInfo.CreateNoWindow = true;
                                commentProcess.Start();
                                await commentProcess.WaitForExitAsync();
                            }
                            
                            return true;
                        }
                        else
                        {
                            return false;
                        }
                    }
                }
                
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error installing CUPS-PDF printer: {ex.Message}");
                return false;
            }
        }

        private static void StartMonitoring()
        {
            if (isMonitoring)
            {
                Console.WriteLine("Print job monitoring already active");
                return;
            }
            
            Console.WriteLine("Starting print job monitoring...");
            isMonitoring = true;
            monitoringCancellationTokenSource = new CancellationTokenSource();
            
            // Start monitoring task
            Task.Run(() => MonitorPrintJobs(monitoringCancellationTokenSource.Token), monitoringCancellationTokenSource.Token);
        }

        private static void StopMonitoring()
        {
            if (!isMonitoring)
            {
                return;
            }
            
            Console.WriteLine("Stopping print job monitoring...");
            monitoringCancellationTokenSource.Cancel();
            isMonitoring = false;
        }

        private static async Task MonitorPrintJobs(CancellationToken cancellationToken)
        {
            Console.WriteLine("Print job monitoring started");
            
            try
            {
                while (!cancellationToken.IsCancellationRequested)
                {
                    try
                    {
                        // Verificar se há mudanças na lista de impressoras instaladas
                        await CheckForNewPrinters();
                        
                        // Verificar todas as impressoras instaladas para trabalhos
                        // Fazer uma cópia da lista para evitar erro de coleção modificada
                        List<string> printersToCheck = new List<string>(installedPrinters);
                        
                        foreach (var printerName in printersToCheck)
                        {
                            if (PrinterExists(printerName))
                            {
                                await CheckPrinterJobs(printerName);
                            }
                            else
                            {
                                // A impressora não existe mais, remover da lista
                                installedPrinters.Remove(printerName);
                                Console.WriteLine($"Printer '{printerName}' no longer exists, removed from monitoring");
                            }
                        }
                        
                        // Pequeno atraso para evitar uso excessivo de CPU
                        await Task.Delay(50, cancellationToken);
                    }
                    catch (OperationCanceledException)
                    {
                        // Esperado durante cancelamento
                        throw;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error in monitoring cycle: {ex.Message}");
                        // Continuar com o próximo ciclo
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Esperado quando o cancelamento é solicitado
                Console.WriteLine("Print job monitoring stopped");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Fatal error in print job monitoring: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
                
                // Tentar reiniciar o monitoramento se não for cancelado
                if (!cancellationToken.IsCancellationRequested)
                {
                    Console.WriteLine("Attempting to restart monitoring...");
                    await Task.Delay(5000, cancellationToken);
                    await MonitorPrintJobs(cancellationToken);
                }
            }
        }
        
        private static async Task CheckForNewPrinters()
        {
            try
            {
                // Verificar especificamente se a impressora LoQQuei Printer existe
                if (!installedPrinters.Contains("LoQQuei Printer") && PrinterExists("LoQQuei Printer"))
                {
                    installedPrinters.Add("LoQQuei Printer");
                    Console.WriteLine("Found and added 'LoQQuei Printer' to monitoring list");
                }
                
                // Verificar se alguma impressora foi removida da lista
                // Criar uma cópia da lista para evitar erro de coleção modificada
                List<string> currentPrinters = new List<string>(installedPrinters);
                
                foreach (var printer in currentPrinters)
                {
                    if (!PrinterExists(printer))
                    {
                        installedPrinters.Remove(printer);
                        Console.WriteLine($"Printer '{printer}' no longer exists, removed from monitoring");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error checking for new printers: {ex.Message}");
            }
        }

        // In Program.cs, modify the CheckPrinterJobs method for better debugging
        private static async Task CheckPrinterJobs(string printerName)
        {
            try {
                Console.WriteLine($"Checking for print jobs on '{printerName}'...");
                
                // Get port information first for debugging
                string portName = "";
                using (Process portProcess = new Process())
                {
                    portProcess.StartInfo.FileName = "powershell";
                    portProcess.StartInfo.Arguments = $"-Command \"(Get-Printer -Name '{printerName}').PortName\"";
                    portProcess.StartInfo.UseShellExecute = false;
                    portProcess.StartInfo.RedirectStandardOutput = true;
                    portProcess.StartInfo.CreateNoWindow = true;
                    portProcess.Start();
                    
                    portName = await portProcess.StandardOutput.ReadToEndAsync();
                    await portProcess.WaitForExitAsync();
                    
                    Console.WriteLine($"Printer '{printerName}' is using port: {portName.Trim()}");
                }
                
                // Use a simpler approach with direct WMI
                string wmiCommand = $@"
                    $jobs = Get-CimInstance -ClassName Win32_PrintJob | Where-Object {{ $_.PrinterName -eq '{printerName}' }};
                    if ($jobs) {{
                        $jobs | Select-Object JobId, Document, TotalPages, Status | ConvertTo-Json -Depth 3
                    }} else {{
                        'No jobs found'
                    }}
                ";
                
                Process process = new Process();
                process.StartInfo.FileName = "powershell";
                process.StartInfo.Arguments = $"-Command \"{wmiCommand}\"";
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.RedirectStandardOutput = true;
                process.StartInfo.RedirectStandardError = true;
                process.StartInfo.CreateNoWindow = true;
                process.Start();
                
                string output = await process.StandardOutput.ReadToEndAsync();
                string error = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();
                
                if (!string.IsNullOrEmpty(error))
                {
                    Console.WriteLine($"Error checking for print jobs: {error}");
                }
                
                Console.WriteLine($"Print job check output: {output}");
                
                // Check if we found any jobs
                if (!string.IsNullOrEmpty(output) && !output.Contains("No jobs found") && 
                    (output.Contains("JobId") || output.Contains("Document")))
                {
                    Console.WriteLine($"=== PRINT JOB DETECTED ON {printerName}! ===");
                    
                    // Try to parse the JSON result
                    try
                    {
                        // Check if it's an array or single object
                        if (output.Trim().StartsWith("["))
                        {
                            var jobsArray = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(output);
                            if (jobsArray != null)
                            {
                                foreach (var job in jobsArray)
                                {
                                    string docName = "Unknown Document";
                                    int pages = 1;
                                    string jobId = "unknown";
                                    
                                    if (job.TryGetValue("Document", out JsonElement docElement) && 
                                        docElement.ValueKind != JsonValueKind.Null)
                                    {
                                        docName = docElement.GetString() ?? docName;
                                    }
                                    
                                    if (job.TryGetValue("TotalPages", out JsonElement pagesElement) && 
                                        pagesElement.ValueKind == JsonValueKind.Number)
                                    {
                                        pages = pagesElement.GetInt32();
                                        if (pages <= 0) pages = 1;
                                    }
                                    
                                    if (job.TryGetValue("JobId", out JsonElement jobIdElement))
                                    {
                                        jobId = jobIdElement.ToString();
                                    }
                                    
                                    await ProcessPrintJob(printerName, new PrintJobInfo 
                                    { 
                                        DocumentName = docName,
                                        TotalPages = pages,
                                        JobId = int.TryParse(jobId, out int id) ? id : null
                                    });
                                }
                            }
                        }
                        else
                        {
                            var job = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(output);
                            if (job != null)
                            {
                                string docName = "Unknown Document";
                                int pages = 1;
                                string jobId = "unknown";
                                
                                if (job.TryGetValue("Document", out JsonElement docElement) && 
                                    docElement.ValueKind != JsonValueKind.Null)
                                {
                                    docName = docElement.GetString() ?? docName;
                                }
                                
                                if (job.TryGetValue("TotalPages", out JsonElement pagesElement) && 
                                    pagesElement.ValueKind == JsonValueKind.Number)
                                {
                                    pages = pagesElement.GetInt32();
                                    if (pages <= 0) pages = 1;
                                }
                                
                                if (job.TryGetValue("JobId", out JsonElement jobIdElement))
                                {
                                    jobId = jobIdElement.ToString();
                                }
                                
                                await ProcessPrintJob(printerName, new PrintJobInfo 
                                { 
                                    DocumentName = docName,
                                    TotalPages = pages,
                                    JobId = int.TryParse(jobId, out int id) ? id : null
                                });
                            }
                        }
                    }
                    catch (Exception jsonEx)
                    {
                        Console.WriteLine($"Error parsing print job JSON: {jsonEx.Message}");
                        // Fallback to string parsing if JSON fails
                        await ProcessJobJson(printerName, output);
                    }
                }
                else
                {
                    // Try alternative method for WSD printers
                    if (portName.Contains("WSD-"))
                    {
                        await CheckWsdPrinterJobs(printerName);
                    }
                }
            }
            catch (Exception ex) 
            {
                Console.WriteLine($"Exception checking printer '{printerName}': {ex.Message}");
            }
        }

        // New method to check WSD printer jobs specifically
        private static async Task CheckWsdPrinterJobs(string printerName)
        {
            try
            {
                Console.WriteLine($"Using alternative method to check WSD printer jobs for '{printerName}'...");
                
                // Use WMI to monitor the printer spooler
                string wmiSpoolerCommand = $@"
                    $jobs = Get-WmiObject Win32_PrintJob -Filter ""PrinterName = '{printerName}'""
                    if ($jobs) {{
                        $jobs | Select-Object @{{Name='JobId';Expression={{$_.JobId}}}}, @{{Name='DocumentName';Expression={{$_.Document}}}}, @{{Name='TotalPages';Expression={{$_.TotalPages}}}} | ConvertTo-Json -Depth 3
                    }} else {{
                        'No jobs found via WMI'
                    }}
                ";
                
                Process process = new Process();
                process.StartInfo.FileName = "powershell";
                process.StartInfo.Arguments = $"-Command \"{wmiSpoolerCommand}\"";
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.RedirectStandardOutput = true;
                process.StartInfo.RedirectStandardError = true;
                process.StartInfo.CreateNoWindow = true;
                process.Start();
                
                string output = await process.StandardOutput.ReadToEndAsync();
                string error = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();
                
                Console.WriteLine($"WMI print job check output: {output}");
                
                if (!string.IsNullOrEmpty(error))
                {
                    Console.WriteLine($"Error in WMI job check: {error}");
                }
                
                // Process the output if jobs were found
                if (!string.IsNullOrEmpty(output) && !output.Contains("No jobs found") &&
                    (output.Contains("JobId") || output.Contains("DocumentName")))
                {
                    Console.WriteLine($"=== WSD PRINT JOB DETECTED ON {printerName}! ===");
                    
                    // Process the job data...
                    // (Similar processing logic as in the main method)
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error checking WSD printer jobs: {ex.Message}");
            }
        }

        private static async Task ProcessPrintJob(string printerName, PrintJobInfo job)
        {
            try
            {
                string documentName = job.DocumentName ?? "Unknown Document";
                int pages = job.TotalPages > 0 ? job.TotalPages : 1;
                string jobId = job.JobId?.ToString() ?? "unknown";
                
                Console.WriteLine($"JOB INFO: Printer: '{printerName}', Document: '{documentName}', Pages: {pages}");
                
                // Update total page count
                appConfig.TotalPageCount += pages;
                
                // Log print job
                LogPrintJob(printerName, documentName, pages, appConfig.TotalPageCount);
                
                // Send to API
                await SendPrintJobToApi(printerName, documentName, jobId, pages);
                
                Console.WriteLine("Print job processed successfully!");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing print job: {ex.Message}");
            }
        }

        private static async Task ProcessJobJson(string printerName, string jobJson)
        {
            try
            {
                // Extract job info from JSON
                string documentName = "Unknown Document";
                int pages = 1;
                string jobId = "unknown";
                
                // Extract job ID
                if (jobJson.Contains("\"JobId\""))
                {
                    int idStart = jobJson.IndexOf("\"JobId\"") + "\"JobId\"".Length + 1;
                    int idEnd = jobJson.IndexOf(",", idStart);
                    if (idStart > 0)
                    {
                        if (idEnd < 0) // If it's the last element
                        {
                            idEnd = jobJson.IndexOf("}", idStart);
                        }
                        
                        if (idEnd > idStart)
                        {
                            string idStr = jobJson.Substring(idStart, idEnd - idStart).Trim();
                            idStr = idStr.Replace(",", "").Replace("}", "").Replace("\"", "").Trim();
                            jobId = idStr != "null" ? idStr : "unknown";
                        }
                    }
                }
                
                // Extract document name
                if (jobJson.Contains("\"DocumentName\""))
                {
                    int nameStart = jobJson.IndexOf("\"DocumentName\"") + "\"DocumentName\"".Length + 2;
                    int nameEnd = jobJson.IndexOf("\"", nameStart);
                    if (nameStart > 0 && nameEnd > nameStart)
                    {
                        documentName = jobJson.Substring(nameStart, nameEnd - nameStart);
                    }
                }
                
                // Extract page count
                if (jobJson.Contains("\"TotalPages\""))
                {
                    int pagesStart = jobJson.IndexOf("\"TotalPages\"") + "\"TotalPages\"".Length + 1;
                    int pagesEnd = jobJson.IndexOf(",", pagesStart);
                    if (pagesStart > 0)
                    {
                        if (pagesEnd < 0) // If it's the last element
                        {
                            pagesEnd = jobJson.IndexOf("}", pagesStart);
                        }
                        
                        if (pagesEnd > pagesStart)
                        {
                            string pagesStr = jobJson.Substring(pagesStart, pagesEnd - pagesStart).Trim();
                            pagesStr = pagesStr.Replace(",", "").Replace("}", "").Trim();
                            if (!int.TryParse(pagesStr, out pages) || pages <= 0)
                            {
                                pages = 1;
                            }
                        }
                    }
                }
                
                Console.WriteLine($"JOB INFO: Printer: '{printerName}', Document: '{documentName}', Pages: {pages}");
                
                // Update total page count
                appConfig.TotalPageCount += pages;
                
                // Log print job
                LogPrintJob(printerName, documentName, pages, appConfig.TotalPageCount);
                
                // Send to API
                await SendPrintJobToApi(printerName, documentName, jobId, pages);
                
                Console.WriteLine("Print job processed successfully!");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing print job: {ex.Message}");
            }
        }

        private static void LogPrintJob(string printerName, string documentName, int pages, int totalCount)
        {
            try
            {
                string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                string logEntry = $"{timestamp} - Printer: {printerName}, Document: {documentName}, Pages: {pages}, Total: {totalCount}";
                
                try
                {
                    // Ensure log directory exists
                    string logDir = Path.GetDirectoryName(logFile);
                    if (!string.IsNullOrEmpty(logDir) && !Directory.Exists(logDir))
                    {
                        Directory.CreateDirectory(logDir);
                    }
                    
                    // Write to log file
                    File.AppendAllText(logFile, logEntry + Environment.NewLine);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error writing to log file: {ex.Message}");
                    // Try alternative path
                    string altLogFile = Path.Combine(Path.GetTempPath(), "print_log.txt");
                    File.AppendAllText(altLogFile, logEntry + Environment.NewLine);
                    Console.WriteLine($"Log saved to alternative path: {altLogFile}");
                }
                
                Console.WriteLine("=============================================");
                Console.WriteLine(logEntry);
                Console.WriteLine("=============================================");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Fatal error in logging: {ex.Message}");
            }
        }

        private static async Task SendPrintJobToApi(string printerName, string documentName, string jobId, int pages)
        {
            try
            {
                Console.WriteLine("Sending print job data to API...");
                
                // Get printer port information for better debugging
                string printerPort = "";
                using (Process portProcess = new Process())
                {
                    portProcess.StartInfo.FileName = "powershell";
                    portProcess.StartInfo.Arguments = $"-Command \"(Get-Printer -Name '{printerName}').PortName\"";
                    portProcess.StartInfo.UseShellExecute = false;
                    portProcess.StartInfo.RedirectStandardOutput = true;
                    portProcess.StartInfo.CreateNoWindow = true;
                    portProcess.Start();
                    
                    printerPort = (await portProcess.StandardOutput.ReadToEndAsync()).Trim();
                    await portProcess.WaitForExitAsync();
                }
                
                // Create print job data with additional information
                var printJobData = new PrintJobData
                {
                    UserId = appConfig.CurrentUser.Id,
                    PrinterId = "12345", // Mock ID for the printer
                    PrinterName = printerName,
                    DocumentName = documentName,
                    JobId = jobId,
                    Pages = pages,
                    Timestamp = DateTime.Now,
                    CompanyId = appConfig.CurrentUser.CompanyId
                };
                
                // Log port information for debugging
                Console.WriteLine($"Print job uses port: {printerPort}");
                
                // Send to API
                var response = await apiClient.SendPrintJobAsync(printJobData);
                
                if (response.Success)
                {
                    Console.WriteLine("Print job data successfully sent to API");
                }
                else
                {
                    Console.WriteLine($"API error: {response.Message}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending print job to API: {ex.Message}");
            }
        }

        private static bool PrinterExists(string printerName)
        {
            try
            {
                // Usar método mais direto para verificar se a impressora existe
                using (Process process = new Process())
                {
                    process.StartInfo.FileName = "powershell";
                    process.StartInfo.Arguments = $"-Command \"[bool](Get-Printer -Name '{printerName}' -ErrorAction SilentlyContinue)\"";
                    process.StartInfo.UseShellExecute = false;
                    process.StartInfo.RedirectStandardOutput = true;
                    process.StartInfo.RedirectStandardError = true;
                    process.StartInfo.CreateNoWindow = true;
                    process.Start();
                    
                    string output = process.StandardOutput.ReadToEnd().Trim().ToLower();
                    string error = process.StandardError.ReadToEnd();
                    process.WaitForExit();
                    
                    // Se recebeu "true", a impressora existe
                    bool exists = output == "true";
                    
                    // Não logar cada verificação para não poluir o console
                    return exists;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error checking printer existence: {ex.Message}");
                return false;
            }
        }

        private static bool IsAdministrator()
        {
            var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            var principal = new System.Security.Principal.WindowsPrincipal(identity);
            return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        }
    }
}