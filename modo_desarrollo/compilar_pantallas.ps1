# Compila las pantallas (frontend\src) y las deja en app_servidor\build, que es lo que
# empaquetan los instaladores de Windows y Mac. Despues: build.ps1 (Windows) o el
# workflow de GitHub (Mac).
# Uso:  pwsh -File compilar_pantallas.ps1
$ErrorActionPreference = "Stop"
$front = Resolve-Path "$PSScriptRoot\..\frontend"
$dest = Join-Path (Resolve-Path "$PSScriptRoot\..\app_servidor") "build"
Push-Location $front
try {
    if (-not (Test-Path "node_modules")) { npx --yes yarn@1.22.22 install --frozen-lockfile }
    npx vite build --logLevel warn
    if ($LASTEXITCODE) { throw "vite build fallo" }
} finally { Pop-Location }
$out = Join-Path $front "build"
if (-not (Test-Path (Join-Path $out "index.html"))) { throw "No se genero build\index.html" }
# reemplazar app_servidor\build por el resultado (robocopy /MIR: deja una copia exacta)
robocopy $out $dest /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "No se pudo copiar a app_servidor\build" }
Copy-Item (Join-Path (Split-Path $dest) "icono.ico") (Join-Path $dest "favicon.ico") -Force   # icono morado
Get-ChildItem $dest -Recurse -Filter *.map | Remove-Item -Force
"Pantallas compiladas -> $dest"
