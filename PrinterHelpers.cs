using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading.Tasks;
using System.Linq;
using System.Text;
using System.Net;
using System.Text.RegularExpressions;

namespace PrintMonitor
{
    public enum PrinterProtocol
    {
        RAW,      // Porta 9100
        LPR,      // Porta 515
        IPP,      // Porta 631
        CUPS_PDF, // Impressora virtual CUPS-PDF
        UNKNOWN   // Protocolo não identificado
    }

    // Classe renomeada para PrinterCapabilities para evitar conflito
    public class PrinterCapabilities
    {
        public string Model { get; set; } = "Unknown";
        public string Manufacturer { get; set; } = "Unknown";
        public PrinterProtocol Protocol { get; set; } = PrinterProtocol.UNKNOWN;
        public string RecommendedDriver { get; set; } = "Microsoft IPP Class Driver";
        public bool IsVirtual { get; set; } = false;
        public bool SupportsPostScript { get; set; } = false;
        public bool SupportsPCL { get; set; } = false;
    }

    public static class PrinterHelpers
    {
        // Lista de drivers universais conhecidos e confiáveis
        private static readonly Dictionary<string, string[]> UniversalDrivers = new Dictionary<string, string[]>
        {
            { "HP", new[] { "HP Universal Printing PCL 6", "HP Universal Printing PCL 5", "HP Universal Printing PS" } },
            { "Canon", new[] { "Canon Generic Plus PCL6", "Canon Generic Plus PS3" } },
            { "Brother", new[] { "Brother Universal Printer Driver", "Brother Mono Universal Printer Driver" } },
            { "Lexmark", new[] { "Lexmark Universal", "Lexmark Universal v2" } },
            { "Kyocera", new[] { "Kyocera PCL6 Driver", "Kyocera KPDL Driver" } },
            { "Xerox", new[] { "Xerox Global Print Driver PCL6", "Xerox Global Print Driver PS" } },
            { "Ricoh", new[] { "Ricoh PCL6 UniversalDriver", "RICOH PCL5e Universal Driver" } },
            { "Epson", new[] { "EPSON Universal Print Driver", "EPSON Universal Print Driver PS" } },
            { "Samsung", new[] { "Samsung Universal Print Driver" } },
            { "Virtual", new[] { "Microsoft IPP Class Driver", "Generic / Text Only", "Microsoft Print To PDF" } },
            { "CUPS", new[] { "Microsoft IPP Class Driver", "Generic / Text Only" } }
        };

        // Método principal para instalar uma impressora automaticamente
        public static async Task<bool> InstallPrinterAutomatically(string printerName, string ipAddress, int port = 9100)
        {
            try
            {
                Console.WriteLine($"=== Iniciando instalação automatizada da impressora '{printerName}' ===");
                Console.WriteLine($"Endereço IP: {ipAddress}, Porta padrão: {port}");
                
                // 1. Verificar conectividade básica
                bool canPing = await PingHostAsync(ipAddress);
                if (!canPing)
                {
                    Console.WriteLine($"AVISO: Não foi possível fazer ping no endereço {ipAddress}");
                    Console.WriteLine("Tentando prosseguir mesmo assim...");
                }
                
                // 2. Detectar impressora
                Console.WriteLine("Detectando características da impressora...");
                var detectedPrinter = await DetectPrinterCapabilities(ipAddress);
                Console.WriteLine($"Detecção: Fabricante={detectedPrinter.Manufacturer}, Modelo={detectedPrinter.Model}");
                Console.WriteLine($"Protocolo recomendado: {detectedPrinter.Protocol}");
                Console.WriteLine($"Driver recomendado: {detectedPrinter.RecommendedDriver}");
                Console.WriteLine($"Impressora virtual: {detectedPrinter.IsVirtual}");
                
                // 3. Definir porta e protocolo
                string uniqueId = DateTime.Now.ToString("yyyyMMddHHmmss");
                string portName = "";
                
                // Usar o protocolo detectado para criar a porta apropriada
                switch (detectedPrinter.Protocol)
                {
                    case PrinterProtocol.RAW:
                        portName = $"IP_{ipAddress}_{uniqueId}";
                        await CreateTCPIPPort(portName, ipAddress, 9100);
                        break;
                        
                    case PrinterProtocol.LPR:
                        portName = $"LPR_{ipAddress}_{uniqueId}";
                        await CreateLPRPort(portName, ipAddress, "lp");
                        break;
                        
                    case PrinterProtocol.IPP:
                        portName = $"IPP_{ipAddress}_{uniqueId}";
                        await CreateIPPPort(portName, ipAddress);
                        break;
                        
                    case PrinterProtocol.CUPS_PDF:
                        portName = $"CUPS_{ipAddress}_{uniqueId}";
                        await CreateTCPIPPort(portName, ipAddress, 631);
                        break;
                        
                    default:
                        // Se não conseguirmos detectar, usamos RAW por padrão
                        portName = $"IP_{ipAddress}_{uniqueId}";
                        await CreateTCPIPPort(portName, ipAddress, port);
                        break;
                }
                
                if (string.IsNullOrEmpty(portName))
                {
                    Console.WriteLine("Falha ao criar porta. Abortando instalação.");
                    return false;
                }
                
                // 4. Selecionar o driver mais adequado
                string driverName = await FindBestDriver(detectedPrinter);
                Console.WriteLine($"Driver selecionado: {driverName}");
                
                // 5. Instalar a impressora
                bool installed = await AddPrinter(printerName, driverName, portName);
                
                if (!installed)
                {
                    // Tentar com driver alternativo se o primeiro falhar
                    string altDriver = "Microsoft IPP Class Driver";
                    Console.WriteLine($"Tentando com driver alternativo: {altDriver}");
                    installed = await AddPrinter(printerName, altDriver, portName);
                    
                    if (!installed)
                    {
                        // Tentar com driver genérico se os dois primeiros falharem
                        string genericDriver = "Generic / Text Only";
                        Console.WriteLine($"Tentando com driver genérico: {genericDriver}");
                        installed = await AddPrinter(printerName, genericDriver, portName);
                    }
                }
                
                // 6. Verificar se a impressora foi instalada corretamente
                if (installed)
                {
                    Console.WriteLine($"Instalação da impressora '{printerName}' foi concluída com sucesso");
                    return true;
                }
                else
                {
                    Console.WriteLine($"Falha na instalação da impressora '{printerName}'");
                    return false;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Erro durante a instalação automática da impressora: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
                return false;
            }
        }
        
        // Detectar capacidades da impressora
        private static async Task<PrinterCapabilities> DetectPrinterCapabilities(string ipAddress)
        {
            var printerCapabilities = new PrinterCapabilities();
            
            try
            {
                // Check ports to determine protocol
                bool rawPortOpen = await IsPortOpenAsync(ipAddress, 9100);
                bool lprPortOpen = await IsPortOpenAsync(ipAddress, 515);
                bool ippPortOpen = await IsPortOpenAsync(ipAddress, 631);
                
                Console.WriteLine($"Available ports - RAW(9100): {rawPortOpen}, LPR(515): {lprPortOpen}, IPP(631): {ippPortOpen}");
                
                // MODIFY: Prioritize IPP protocol for CUPS
                if (ippPortOpen)
                {
                    // If port 631 is open, it's likely a CUPS or IPP printer
                    try
                    {
                        using (var client = new WebClient())
                        {
                            try
                            {
                                string ippResponse = client.DownloadString($"http://{ipAddress}:631/");
                                if (ippResponse.Contains("CUPS") || ippResponse.Contains("PDF"))
                                {
                                    printerCapabilities.Protocol = PrinterProtocol.CUPS_PDF;
                                    printerCapabilities.IsVirtual = true;
                                    printerCapabilities.Manufacturer = "CUPS";
                                    printerCapabilities.Model = "PDF Printer";
                                    printerCapabilities.RecommendedDriver = "Microsoft IPP Class Driver";
                                    printerCapabilities.SupportsPostScript = true;
                                    return printerCapabilities;
                                }
                            }
                            catch
                            {
                                // If we can't connect via HTTP but port 631 is open, use IPP protocol
                                printerCapabilities.Protocol = PrinterProtocol.IPP;
                                printerCapabilities.RecommendedDriver = "Microsoft IPP Class Driver";
                            }
                        }
                    }
                    catch
                    {
                        // If HTTP connection fails but port 631 is open, use IPP protocol
                        printerCapabilities.Protocol = PrinterProtocol.IPP;
                        printerCapabilities.RecommendedDriver = "Microsoft IPP Class Driver";
                    }
                }
                else if (rawPortOpen)
                {
                    printerCapabilities.Protocol = PrinterProtocol.RAW;
                }
                else if (lprPortOpen)
                {
                    printerCapabilities.Protocol = PrinterProtocol.LPR;
                }
                else
                {
                    // Default to IPP for CUPS-PDF if no ports are detected
                    printerCapabilities.Protocol = PrinterProtocol.IPP;
                    printerCapabilities.RecommendedDriver = "Microsoft IPP Class Driver";
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error detecting printer capabilities: {ex.Message}");
                // Set safe default values
                printerCapabilities.Protocol = PrinterProtocol.IPP;
                printerCapabilities.RecommendedDriver = "Microsoft IPP Class Driver";
            }
            
            return printerCapabilities;
        }
        
        // Criar porta TCP/IP (RAW)
        private static async Task<bool> CreateTCPIPPort(string portName, string ipAddress, int port)
        {
            try
            {
                Console.WriteLine($"Criando porta TCP/IP '{portName}' para {ipAddress}:{port}...");
                
                string createPortCmd = $"Add-PrinterPort -Name \"{portName}\" -PrinterHostAddress \"{ipAddress}\" -PortNumber {port}";
                using (Process createPortProcess = new Process())
                {
                    createPortProcess.StartInfo.FileName = "powershell";
                    createPortProcess.StartInfo.Arguments = $"-Command \"{createPortCmd}\"";
                    createPortProcess.StartInfo.UseShellExecute = false;
                    createPortProcess.StartInfo.RedirectStandardOutput = true;
                    createPortProcess.StartInfo.RedirectStandardError = true;
                    createPortProcess.StartInfo.CreateNoWindow = true;
                    createPortProcess.Start();
                    
                    string output = await createPortProcess.StandardOutput.ReadToEndAsync();
                    string error = await createPortProcess.StandardError.ReadToEndAsync();
                    await createPortProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(error) && !error.Contains("already exists"))
                    {
                        Console.WriteLine($"Erro ao criar a porta TCP/IP: {error}");
                        return false;
                    }
                    
                    Console.WriteLine("Porta TCP/IP criada com sucesso");
                    return true;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Exceção ao criar porta TCP/IP: {ex.Message}");
                return false;
            }
        }
        
        // Criar porta LPR
        private static async Task<bool> CreateLPRPort(string portName, string ipAddress, string queueName)
        {
            try
            {
                Console.WriteLine($"Criando porta LPR '{portName}' para {ipAddress}, fila '{queueName}'...");
                
                string createPortCmd = $"Add-PrinterPort -Name \"{portName}\" -LprHostAddress \"{ipAddress}\" -LprQueueName \"{queueName}\"";
                using (Process createPortProcess = new Process())
                {
                    createPortProcess.StartInfo.FileName = "powershell";
                    createPortProcess.StartInfo.Arguments = $"-Command \"{createPortCmd}\"";
                    createPortProcess.StartInfo.UseShellExecute = false;
                    createPortProcess.StartInfo.RedirectStandardOutput = true;
                    createPortProcess.StartInfo.RedirectStandardError = true;
                    createPortProcess.StartInfo.CreateNoWindow = true;
                    createPortProcess.Start();
                    
                    string output = await createPortProcess.StandardOutput.ReadToEndAsync();
                    string error = await createPortProcess.StandardError.ReadToEndAsync();
                    await createPortProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(error) && !error.Contains("already exists"))
                    {
                        Console.WriteLine($"Erro ao criar a porta LPR: {error}");
                        return false;
                    }
                    
                    Console.WriteLine("Porta LPR criada com sucesso");
                    return true;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Exceção ao criar porta LPR: {ex.Message}");
                return false;
            }
        }
        
        // Criar porta IPP
        private static async Task<bool> CreateIPPPort(string portName, string ipAddress)
        {
            try
            {
                Console.WriteLine($"Criando porta IPP '{portName}' para {ipAddress}...");
                
                // O PowerShell não tem um parâmetro direto para portas IPP, então vamos criar uma porta TCP/IP na porta 631
                return await CreateTCPIPPort(portName, ipAddress, 631);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Exceção ao criar porta IPP: {ex.Message}");
                return false;
            }
        }
        
        // Adicionar impressora
        private static async Task<bool> AddPrinter(string printerName, string driverName, string portName)
        {
            try
            {
                Console.WriteLine($"Adicionando impressora '{printerName}' com driver '{driverName}' na porta '{portName}'...");
                
                // CORRIGIDO: Escapar aspas em nomes com espaços usando aspas simples e duplas corretamente
                // O formato correto para passar strings com espaços para o PowerShell é usar aspas duplas escapadas dentro de aspas simples
                string addPrinterCmd = $"Add-Printer -Name '\"{printerName}\"' -DriverName '\"{driverName}\"' -PortName '{portName}'";
                
                using (Process addPrinterProcess = new Process())
                {
                    addPrinterProcess.StartInfo.FileName = "powershell";
                    addPrinterProcess.StartInfo.Arguments = $"-Command \"{addPrinterCmd}\"";
                    addPrinterProcess.StartInfo.UseShellExecute = false;
                    addPrinterProcess.StartInfo.RedirectStandardOutput = true;
                    addPrinterProcess.StartInfo.RedirectStandardError = true;
                    addPrinterProcess.StartInfo.CreateNoWindow = true;
                    addPrinterProcess.Start();
                    
                    string output = await addPrinterProcess.StandardOutput.ReadToEndAsync();
                    string error = await addPrinterProcess.StandardError.ReadToEndAsync();
                    await addPrinterProcess.WaitForExitAsync();
                    
                    if (!string.IsNullOrEmpty(error))
                    {
                        Console.WriteLine($"Erro ao adicionar a impressora: {error}");
                        
                        // Tentar método alternativo com aspas simples apenas
                        Console.WriteLine("Tentando método alternativo de aspas...");
                        string altCmd = $"Add-Printer -Name '{printerName}' -DriverName '{driverName}' -PortName '{portName}'";
                        
                        using (Process altProcess = new Process())
                        {
                            altProcess.StartInfo.FileName = "cmd.exe";
                            altProcess.StartInfo.Arguments = $"/c powershell -Command \"{altCmd}\"";
                            altProcess.StartInfo.UseShellExecute = false;
                            altProcess.StartInfo.RedirectStandardOutput = true;
                            altProcess.StartInfo.RedirectStandardError = true;
                            altProcess.StartInfo.CreateNoWindow = true;
                            altProcess.Start();
                            
                            string altOutput = await altProcess.StandardOutput.ReadToEndAsync();
                            string altError = await altProcess.StandardError.ReadToEndAsync();
                            await altProcess.WaitForExitAsync();
                            
                            if (!string.IsNullOrEmpty(altError) && !altError.Contains("successfully"))
                            {
                                Console.WriteLine($"Método alternativo de aspas também falhou: {altError}");
                                
                                // Terceiro método: usar rundll32 com PrintUIEntry
                                Console.WriteLine("Tentando criar impressora via PrintUI...");
                                
                                // Remover qualquer impressora existente com o mesmo nome para evitar conflito
                                try
                                {
                                    using (Process removeProcess = new Process())
                                    {
                                        removeProcess.StartInfo.FileName = "rundll32.exe";
                                        removeProcess.StartInfo.Arguments = $"printui.dll,PrintUIEntry /dl /n\"{printerName}\"";
                                        removeProcess.StartInfo.UseShellExecute = false;
                                        removeProcess.StartInfo.CreateNoWindow = true;
                                        removeProcess.Start();
                                        await removeProcess.WaitForExitAsync();
                                        await Task.Delay(1000); // Esperar a remoção ser concluída
                                    }
                                }
                                catch {}
                                
                                // Adicionar a impressora usando PrintUI
                                using (Process printUIProcess = new Process())
                                {
                                    printUIProcess.StartInfo.FileName = "rundll32.exe";
                                    printUIProcess.StartInfo.Arguments = $"printui.dll,PrintUIEntry /if /b \"{printerName}\" /f \"%windir%\\inf\\ntprint.inf\" /r \"{portName}\" /m \"{driverName}\"";
                                    printUIProcess.StartInfo.UseShellExecute = false;
                                    printUIProcess.StartInfo.RedirectStandardOutput = true;
                                    printUIProcess.StartInfo.RedirectStandardError = true;
                                    printUIProcess.StartInfo.CreateNoWindow = true;
                                    printUIProcess.Start();
                                    
                                    await printUIProcess.WaitForExitAsync();
                                }
                                
                                // Verificar se a impressora foi adicionada
                                await Task.Delay(2000);
                                using (Process verify3Process = new Process())
                                {
                                    verify3Process.StartInfo.FileName = "powershell";
                                    verify3Process.StartInfo.Arguments = $"-Command \"Get-Printer -Name '\"{printerName}\"' -ErrorAction SilentlyContinue\"";
                                    verify3Process.StartInfo.UseShellExecute = false;
                                    verify3Process.StartInfo.RedirectStandardOutput = true;
                                    verify3Process.StartInfo.CreateNoWindow = true;
                                    verify3Process.Start();
                                    
                                    string verify3Output = await verify3Process.StandardOutput.ReadToEndAsync();
                                    await verify3Process.WaitForExitAsync();
                                    
                                    if (!string.IsNullOrEmpty(verify3Output))
                                    {
                                        Console.WriteLine("Impressora adicionada com sucesso via PrintUI");
                                        return true;
                                    }
                                }
                                
                                // Quarto método: último recurso, criar um arquivo .bat e executá-lo
                                Console.WriteLine("Tentando criar um arquivo .bat para instalar a impressora...");
                                string batFile = Path.Combine(Path.GetTempPath(), "addprinter.bat");
                                string batContent = $@"
                                @echo off
                                echo Instalando impressora...
                                powershell -Command ""& {{Add-Printer -Name '{printerName.Replace("'", "''")}' -DriverName '{driverName.Replace("'", "''")}' -PortName '{portName}'}}""
                                echo Verificando instalação...
                                powershell -Command ""& {{Get-Printer -Name '{printerName.Replace("'", "''")}' | Format-List}}""
                                ";
                                
                                File.WriteAllText(batFile, batContent);
                                
                                using (Process batProcess = new Process())
                                {
                                    batProcess.StartInfo.FileName = "cmd.exe";
                                    batProcess.StartInfo.Arguments = $"/c \"{batFile}\"";
                                    batProcess.StartInfo.UseShellExecute = true;
                                    batProcess.StartInfo.Verb = "runas"; // Executar como administrador
                                    batProcess.Start();
                                    
                                    await batProcess.WaitForExitAsync();
                                }
                                
                                // Limpar arquivo bat
                                try { File.Delete(batFile); } catch { }
                                
                                // Verificar novamente
                                return await VerifyPrinterExists(printerName);
                            }
                            else
                            {
                                Console.WriteLine("Impressora adicionada com sucesso via método alternativo de aspas");
                                return true;
                            }
                        }
                        
                        return false;
                    }
                    else
                    {
                        // Verificar se a impressora foi adicionada
                        await Task.Delay(1000); // Pequena pausa para garantir que o sistema processou a adição
                        
                        using (Process verifyProcess = new Process())
                        {
                            verifyProcess.StartInfo.FileName = "powershell";
                            verifyProcess.StartInfo.Arguments = $"-Command \"Get-Printer -Name '\"{printerName}\"' -ErrorAction SilentlyContinue | Select-Object Name, PortName, DriverName\"";
                            verifyProcess.StartInfo.UseShellExecute = false;
                            verifyProcess.StartInfo.RedirectStandardOutput = true;
                            verifyProcess.StartInfo.CreateNoWindow = true;
                            verifyProcess.Start();
                            
                            string verifyOutput = await verifyProcess.StandardOutput.ReadToEndAsync();
                            await verifyProcess.WaitForExitAsync();
                            
                            if (!string.IsNullOrEmpty(verifyOutput) && verifyOutput.Contains(printerName))
                            {
                                Console.WriteLine($"Impressora '{printerName}' adicionada com sucesso!");
                                Console.WriteLine($"Detalhes: {verifyOutput}");
                                return true;
                            }
                        }
                        
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Exceção ao adicionar impressora: {ex.Message}");
                return false;
            }
        }
        
        private static async Task<bool> VerifyPrinterExists(string printerName)
        {
            try
            {
                using (Process verifyProcess = new Process())
                {
                    verifyProcess.StartInfo.FileName = "powershell";
                    verifyProcess.StartInfo.Arguments = $"-Command \"Get-Printer -Name '\"{printerName}\"' -ErrorAction SilentlyContinue\"";
                    verifyProcess.StartInfo.UseShellExecute = false;
                    verifyProcess.StartInfo.RedirectStandardOutput = true;
                    verifyProcess.StartInfo.CreateNoWindow = true;
                    verifyProcess.Start();
                    
                    string verifyOutput = await verifyProcess.StandardOutput.ReadToEndAsync();
                    await verifyProcess.WaitForExitAsync();
                    
                    return !string.IsNullOrEmpty(verifyOutput);
                }
            }
            catch
            {
                return false;
            }
        }

        // Encontrar o melhor driver para a impressora
        private static async Task<string> FindBestDriver(PrinterCapabilities printerCapabilities)
        {
            // Lista de drivers disponíveis no sistema
            var availableDrivers = await GetAvailablePrinterDrivers();
            
            // Se a impressora for virtual (como CUPS-PDF), preferimos drivers virtuais
            if (printerCapabilities.IsVirtual)
            {
                foreach (string driver in UniversalDrivers["Virtual"])
                {
                    if (availableDrivers.Contains(driver))
                    {
                        return driver;
                    }
                }
            }
            
            // Se conhecemos o fabricante, tentar um driver universal desse fabricante
            if (UniversalDrivers.ContainsKey(printerCapabilities.Manufacturer))
            {
                foreach (string driver in UniversalDrivers[printerCapabilities.Manufacturer])
                {
                    if (availableDrivers.Contains(driver))
                    {
                        return driver;
                    }
                }
            }
            
            // Se for CUPS, usar Microsoft IPP Class Driver ou Generic
            if (printerCapabilities.Manufacturer == "CUPS")
            {
                foreach (string driver in UniversalDrivers["CUPS"])
                {
                    if (availableDrivers.Contains(driver))
                    {
                        return driver;
                    }
                }
            }
            
            // Se não encontrou um driver específico, procurar qualquer driver universal
            foreach (var driverSet in UniversalDrivers.Values)
            {
                foreach (string driver in driverSet)
                {
                    if (availableDrivers.Contains(driver))
                    {
                        return driver;
                    }
                }
            }
            
            // Se ainda não encontrou, usar o driver recomendado pela detecção
            if (availableDrivers.Contains(printerCapabilities.RecommendedDriver))
            {
                return printerCapabilities.RecommendedDriver;
            }
            
            // Último recurso: Microsoft IPP Class Driver
            if (availableDrivers.Contains("Microsoft IPP Class Driver"))
            {
                return "Microsoft IPP Class Driver";
            }
            
            // Se tudo falhar, usar o primeiro driver disponível
            if (availableDrivers.Count > 0)
            {
                return availableDrivers[0];
            }
            
            // Caso extremo: o sistema deve ter pelo menos este driver
            return "Microsoft Print To PDF";
        }
        
        // Obter lista de drivers disponíveis
        private static async Task<List<string>> GetAvailablePrinterDrivers()
        {
            var availableDrivers = new List<string>();
            
            try
            {
                using (Process process = new Process())
                {
                    process.StartInfo.FileName = "powershell";
                    process.StartInfo.Arguments = "-Command \"Get-PrinterDriver | Select-Object Name\"";
                    process.StartInfo.UseShellExecute = false;
                    process.StartInfo.RedirectStandardOutput = true;
                    process.StartInfo.CreateNoWindow = true;
                    process.Start();
                    
                    string output = await process.StandardOutput.ReadToEndAsync();
                    await process.WaitForExitAsync();
                    
                    string[] lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    
                    foreach (string line in lines)
                    {
                        string trimmedLine = line.Trim();
                        if (!string.IsNullOrEmpty(trimmedLine) && trimmedLine != "Name" && trimmedLine != "----")
                        {
                            availableDrivers.Add(trimmedLine);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Erro ao obter drivers disponíveis: {ex.Message}");
            }
            
            return availableDrivers;
        }
        
        // Verificar se uma porta está aberta
        public static async Task<bool> IsPortOpenAsync(string host, int port)
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var connectTask = client.ConnectAsync(host, port);
                    var timeoutTask = Task.Delay(2000); // 2 segundos de timeout
                    
                    var completedTask = await Task.WhenAny(connectTask, timeoutTask);
                    
                    if (completedTask == connectTask && client.Connected)
                    {
                        return true;
                    }
                }
            }
            catch
            {
                // Ignorar erros na verificação de porta
            }
            
            return false;
        }
        
        // Verificar se um host responde a ping
        public static async Task<bool> PingHostAsync(string host)
        {
            try
            {
                using (Process process = new Process())
                {
                    process.StartInfo.FileName = "ping";
                    process.StartInfo.Arguments = $"{host} -n 1 -w 1000";
                    process.StartInfo.UseShellExecute = false;
                    process.StartInfo.RedirectStandardOutput = true;
                    process.StartInfo.CreateNoWindow = true;
                    process.Start();
                    
                    string output = await process.StandardOutput.ReadToEndAsync();
                    await process.WaitForExitAsync();
                    
                    // Se contém "bytes=32" é porque recebeu resposta
                    return output.Contains("bytes=32") || output.Contains("TTL=");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error pinging host: {ex.Message}");
                return false;
            }
        }
    }
}