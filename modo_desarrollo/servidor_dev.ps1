# Cinema Reservas en modo desarrollo: http://127.0.0.1:8002
#  - Sin licencia, sin HTTPS (para verlo dentro de Claude o en cualquier navegador).
#  - Se recarga solo al guardar cambios en app_servidor\*.py.
#  - Usa la base local de app_servidor (cinema_data.json de desarrollo), NO la de la app instalada.
# Uso:  pwsh -File servidor_dev.ps1
$ErrorActionPreference = "Stop"
$app = Resolve-Path "$PSScriptRoot\..\app_servidor"
$py = Join-Path $env:LOCALAPPDATA "CinemaProductions\python\python.exe"   # Python con todo instalado
if (-not (Test-Path $py)) { $py = "py" }
$env:CP_DEV_NO_LICENSE = "1"
$env:CP_NO_BROWSER = "1"
$env:MONGO_URL = "embedded"
$port = if ($env:PORT) { $env:PORT } else { "8002" }
Set-Location $app
# recarga propia (uvicorn --reload se cuelga en Windows cuando no hay consola)
& $py "$PSScriptRoot\recargar.py" "$app" $port
