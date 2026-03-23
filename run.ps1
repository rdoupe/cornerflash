$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location "C:\Users\ryand\Documents\Claude\Projects\CornerFlash"
Write-Host "=== Downloading sample images: Nordschleife ===" -ForegroundColor Cyan
node scripts/download-images.cjs --track nordschleife --sample
Write-Host ""
Write-Host "=== Downloading sample images: Spa ===" -ForegroundColor Cyan
node scripts/download-images.cjs --track spa --sample
