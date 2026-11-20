# Cinema Reservas en modo desarrollo: http://127.0.0.1:8002
#  - Sin licencia, sin HTTPS (para verlo dentro de Claude o en cualquier navegador).
#  - Se recarga solo al guardar cambios en app_servidor\*.py.
#  - Usa la base local de app_servidor (cinema_data.json de desarrollo), NO la de la app instalada.
# Uso:  pwsh -File servidor_dev.ps1
$ErrorActionPreference = "Stop"
$app = Resolve-Path "$PSScriptRoot\..\app_servidor"
# Python propio del modo desarrollo (copia del de la app instalada, con todas las librerias).
# Antes se usaba directamente el instalado y, al reinstalar la app, el instalador cerraba
# este servidor (cierra todo lo que corre desde su carpeta).
$devPy = Join-Path $PSScriptRoot "_python"
$py = Join-Path $devPy "python.exe"
if (-not (Test-Path $py)) {
    $src = Join-Path $env:LOCALAPPDATA "CinemaProductions\python"
    if (-not (Test-Path "$src\python.exe")) { $src = Resolve-Path "$PSScriptRoot\..\constructor_instalador\_build\rt" -EA SilentlyContinue }
    if (-not $src -or -not (Test-Path "$src\python.exe")) { throw "Instala Cinema Reservas o ejecuta build.ps1 una vez (hace falta su Python)." }
    Write-Host "Preparando el Python de desarrollo (una sola vez)..."
    robocopy $src $devPy /E /NFL /NDL /NJH /NJS /NP | Out-Null
    # el ._pth del Python embebido apunta a ..\app: aqui la app es ..\app_servidor
    $pth = Get-ChildItem $devPy -Filter "python*._pth" | Select-Object -First 1
    if ($pth) { (Get-Content $pth.FullName) -replace '^\.\.\\app$', '..\..\app_servidor' | Set-Content $pth.FullName -Encoding ASCII }
}
$env:CP_DEV_NO_LICENSE = "1"
$env:CP_NO_BROWSER = "1"
$env:MONGO_URL = "embedded"
$port = if ($env:PORT) { $env:PORT } else { "8002" }
Set-Location $app
# recarga propia (uvicorn --reload se cuelga en Windows cuando no hay consola)
& $py "$PSScriptRoot\recargar.py" "$app" $port
