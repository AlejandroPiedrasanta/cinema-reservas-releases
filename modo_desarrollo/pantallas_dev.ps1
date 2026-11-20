# Pantallas de Cinema Reservas con recarga en vivo: http://127.0.0.1:3010
#  - Al guardar un archivo de frontend\src el cambio aparece al instante.
#  - Necesita el servidor de desarrollo (servidor_dev.ps1, puerto 8002); si no esta, lo arranca.
# Uso:  pwsh -File pantallas_dev.ps1
$ErrorActionPreference = "Stop"
$front = Resolve-Path "$PSScriptRoot\..\frontend"
$apiUp = $false
try { $c = New-Object Net.Sockets.TcpClient; $c.Connect("127.0.0.1", 8002); $apiUp = $true; $c.Close() } catch {}
if (-not $apiUp) {
    Start-Process pwsh -ArgumentList "-NoProfile", "-File", "$PSScriptRoot\servidor_dev.ps1" -WindowStyle Hidden
}
Set-Location $front
if (-not (Test-Path "node_modules")) { npx --yes yarn@1.22.22 install --frozen-lockfile }
npx vite --config vite.local.config.mjs
