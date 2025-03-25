# Fix CUPS-PDF Printer Configuration
Write-Host "=== CUPS-PDF Printer Fix Script ===" -ForegroundColor Green

# Check if printer exists
$printer = Get-Printer -Name "LoQQuei Printer" -ErrorAction SilentlyContinue
if ($printer) {
    Write-Host "Found LoQQuei Printer with these settings:" -ForegroundColor Yellow
    $printer | Format-List Name, DriverName, PortName, Comment
    
    # Update printer settings
    Write-Host "Updating printer settings..." -ForegroundColor Cyan
    
    # Step 1: Set proper driver with correct settings
    Set-Printer -Name "LoQQuei Printer" -DriverName "Microsoft IPP Class Driver"
    
    # Step 2: Fix potential timeout issues
    # Get current port to keep it
    $currentPort = $printer.PortName
    
    # Step 3: Configure printer for PDF printing
    Write-Host "Setting printer-specific settings..." -ForegroundColor Cyan
    
    # Set print preferences via rundll32 to ensure all settings are applied
    rundll32 printui.dll,PrintUIEntry /Xs /n "LoQQuei Printer" documentname DOCNAME
    rundll32 printui.dll,PrintUIEntry /Xs /n "LoQQuei Printer" portname $currentPort
    
    # Step 4: Enable printer bidirectional support
    rundll32 printui.dll,PrintUIEntry /Xs /n "LoQQuei Printer" EnableBidi 1
    
    # Step 5: Set advanced printer settings
    rundll32 printui.dll,PrintUIEntry /Xs /n "LoQQuei Printer" SpoolJobControl 1
    
    # Print a final verification of settings
    Write-Host "Updated printer settings:" -ForegroundColor Green
    Get-Printer -Name "LoQQuei Printer" | Format-List *
} else {
    Write-Host "LoQQuei Printer not found!" -ForegroundColor Red
}

# Check CUPS server connectivity and settings
Write-Host "Checking CUPS server configuration..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://10.148.1.147:631/printers/" -ErrorAction Stop
    Write-Host "Successfully connected to CUPS server" -ForegroundColor Green
    
    # Look for PDF printer
    if ($response.Content -match "PDF") {
        Write-Host "Found PDF printer on CUPS server" -ForegroundColor Green
    }
} catch {
    Write-Host "Error connecting to CUPS server: $_" -ForegroundColor Red
}

Write-Host "Fix script completed." -ForegroundColor Green