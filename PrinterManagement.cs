using System;
using System.Diagnostics;
using System.Threading.Tasks;

namespace PrintMonitor
{
    public static class PrinterManagement
    {
        /// <summary>
        /// Desinstala uma impressora pelo nome
        /// </summary>
        public static async Task UninstallPrinter(string printerName)
        {
            try
            {
                Console.WriteLine($"Removendo a impressora '{printerName}'...");
                
                // Verificar se a impressora existe antes de tentar remover
                bool exists = await CheckPrinterExists(printerName);
                
                if (!exists)
                {
                    Console.WriteLine($"A impressora '{printerName}' não foi encontrada. Nada a remover.");
                    return;
                }
                
                // Usar PowerShell para remover a impressora
                using (Process process = new Process())
                {
                    process.StartInfo.FileName = "powershell";
                    process.StartInfo.Arguments = $"-Command \"Remove-Printer -Name '{printerName}' -ErrorAction SilentlyContinue\"";
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
                        Console.WriteLine($"Erro ao remover a impressora: {error}");
                        
                        // Método alternativo: usar o PrintUI.dll
                        Console.WriteLine("Tentando método alternativo para remover a impressora...");
                        
                        using (Process altProcess = new Process())
                        {
                            altProcess.StartInfo.FileName = "rundll32.exe";
                            altProcess.StartInfo.Arguments = $"printui.dll,PrintUIEntry /dl /n\"{printerName}\"";
                            altProcess.StartInfo.UseShellExecute = false;
                            altProcess.StartInfo.CreateNoWindow = true;
                            altProcess.Start();
                            await altProcess.WaitForExitAsync();
                            
                            // Verificar se a impressora ainda existe
                            bool stillExists = await CheckPrinterExists(printerName);
                            if (!stillExists)
                            {
                                Console.WriteLine($"Impressora '{printerName}' removida com sucesso (método alternativo).");
                            }
                            else
                            {
                                Console.WriteLine($"Não foi possível remover a impressora '{printerName}'.");
                                
                                // Tente um terceiro método se os dois primeiros falharem
                                Console.WriteLine("Tentando método adicional para remoção...");
                                
                                using (Process thirdProcess = new Process())
                                {
                                    thirdProcess.StartInfo.FileName = "powershell";
                                    thirdProcess.StartInfo.Arguments = $"-Command \"$printer = Get-CimInstance -ClassName Win32_Printer -Filter \\\"Name = '{printerName}'\\\" ; if ($printer) {{ Invoke-CimMethod -InputObject $printer -MethodName Delete }}\"";
                                    thirdProcess.StartInfo.UseShellExecute = false;
                                    thirdProcess.StartInfo.RedirectStandardOutput = true;
                                    thirdProcess.StartInfo.RedirectStandardError = true;
                                    thirdProcess.StartInfo.CreateNoWindow = true;
                                    thirdProcess.Start();
                                    
                                    await thirdProcess.WaitForExitAsync();
                                    
                                    stillExists = await CheckPrinterExists(printerName);
                                    if (!stillExists)
                                    {
                                        Console.WriteLine($"Impressora '{printerName}' removida com sucesso (terceiro método).");
                                    }
                                    else
                                    {
                                        Console.WriteLine($"Todos os métodos falharam ao tentar remover a impressora '{printerName}'.");
                                    }
                                }
                            }
                        }
                    }
                    else
                    {
                        Console.WriteLine($"Impressora '{printerName}' removida com sucesso.");
                    }
                }
                
                // Limpar portas órfãs para evitar conflitos
                await CleanOrphanedPorts();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Erro ao desinstalar a impressora: {ex.Message}");
            }
        }
        
        /// <summary>
        /// Verifica se uma impressora existe no sistema
        /// </summary>
        private static async Task<bool> CheckPrinterExists(string printerName)
        {
            try
            {
                using (Process process = new Process())
                {
                    process.StartInfo.FileName = "powershell";
                    process.StartInfo.Arguments = $"-Command \"[bool](Get-Printer -Name '{printerName}' -ErrorAction SilentlyContinue)\"";
                    process.StartInfo.UseShellExecute = false;
                    process.StartInfo.RedirectStandardOutput = true;
                    process.StartInfo.RedirectStandardError = true;
                    process.StartInfo.CreateNoWindow = true;
                    process.Start();
                    
                    string output = await process.StandardOutput.ReadToEndAsync();
                    await process.WaitForExitAsync();
                    
                    return output.Trim().ToLower() == "true";
                }
            }
            catch (Exception)
            {
                return false;
            }
        }
        
        /// <summary>
        /// Limpa portas de impressora órfãs (não utilizadas por nenhuma impressora)
        /// </summary>
        private static async Task CleanOrphanedPorts()
        {
            try
            {
                Console.WriteLine("Verificando e limpando portas de impressora não utilizadas...");
                
                // Lista as portas utilizadas por impressoras
                using (Process usedProcess = new Process())
                {
                    usedProcess.StartInfo.FileName = "powershell";
                    usedProcess.StartInfo.Arguments = "-Command \"Get-Printer | Select-Object -ExpandProperty PortName\"";
                    usedProcess.StartInfo.UseShellExecute = false;
                    usedProcess.StartInfo.RedirectStandardOutput = true;
                    usedProcess.StartInfo.CreateNoWindow = true;
                    usedProcess.Start();
                    
                    string usedPortsOutput = await usedProcess.StandardOutput.ReadToEndAsync();
                    await usedProcess.WaitForExitAsync();
                    
                    // Criar lista de portas utilizadas
                    var usedPorts = new System.Collections.Generic.HashSet<string>(
                        usedPortsOutput.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                                     .Select(p => p.Trim())
                                     .Where(p => !string.IsNullOrEmpty(p))
                    );
                    
                    // Evitar remover portas especiais
                    usedPorts.Add("FILE:");
                    usedPorts.Add("LPT1:");
                    usedPorts.Add("COM1:");
                    usedPorts.Add("PORTPROMPT:");
                    usedPorts.Add("XPSPort:");
                    
                    // Listar todas as portas existentes
                    using (Process allProcess = new Process())
                    {
                        allProcess.StartInfo.FileName = "powershell";
                        allProcess.StartInfo.Arguments = "-Command \"Get-PrinterPort | Where-Object { $_.Name -like 'IP_*' -or $_.Name -like 'WSD-*' } | Select-Object -ExpandProperty Name\"";
                        allProcess.StartInfo.UseShellExecute = false;
                        allProcess.StartInfo.RedirectStandardOutput = true;
                        allProcess.StartInfo.CreateNoWindow = true;
                        allProcess.Start();
                        
                        string allPortsOutput = await allProcess.StandardOutput.ReadToEndAsync();
                        await allProcess.WaitForExitAsync();
                        
                        int removedCount = 0;
                        
                        // Encontrar e remover portas não utilizadas
                        foreach (string port in allPortsOutput.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                                                .Select(p => p.Trim())
                                                .Where(p => !string.IsNullOrEmpty(p)))
                        {
                            if (!usedPorts.Contains(port))
                            {
                                // Esta porta não está sendo usada por nenhuma impressora
                                try
                                {
                                    using (Process removeProcess = new Process())
                                    {
                                        removeProcess.StartInfo.FileName = "powershell";
                                        removeProcess.StartInfo.Arguments = $"-Command \"Remove-PrinterPort -Name '{port}' -ErrorAction SilentlyContinue\"";
                                        removeProcess.StartInfo.UseShellExecute = false;
                                        removeProcess.StartInfo.CreateNoWindow = true;
                                        removeProcess.Start();
                                        await removeProcess.WaitForExitAsync();
                                        
                                        removedCount++;
                                    }
                                }
                                catch
                                {
                                    // Ignore as exceções ao remover portas
                                }
                            }
                        }
                        
                        if (removedCount > 0)
                        {
                            Console.WriteLine($"Limpeza concluída: {removedCount} porta(s) removida(s)");
                        }
                        else
                        {
                            Console.WriteLine("Nenhuma porta órfã encontrada para remover");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Erro ao limpar portas órfãs: {ex.Message}");
            }
        }
    }
}