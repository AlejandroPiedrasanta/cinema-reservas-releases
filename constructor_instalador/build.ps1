# Genera CinemaReservas-Setup.exe (instalador todo incluido).
# Interfaz: web (ui_web\index.html + Tailwind) en Edge WebView2 via pywebview;
# si el PC no tiene WebView2 se usa la interfaz PySide6 de respaldo.
# Requisitos (solo en el PC que compila): Python 3.12+ con PySide6, pyinstaller y pywebview.
#   py -m pip install PySide6 pyinstaller pywebview
#   Node.js (opcional): recompila ui_web\app.css con Tailwind; sin Node se usa el app.css ya incluido.
# Uso:  powershell -ExecutionPolicy Bypass -File build.ps1 [-EmbedZip ruta\python-3.12.x-embed-amd64.zip]
param(
    [string]$EmbedZip = "$PSScriptRoot\python-embed\python-3.12.10-embed-amd64.zip",
    [string]$Out = (Resolve-Path "$PSScriptRoot\..\..\1_INSTALADOR_PARA_CLIENTES").Path
)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$sys = Resolve-Path "$here\..\app_servidor"
$work = "$here\_build"
$pay = "$work\payload"
if (-not (Test-Path $EmbedZip)) { throw "Falta $EmbedZip (python-3.12.x-embed-amd64.zip de python.org)" }

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $pay, "$work\rt", "$work\app" | Out-Null

# ── 0) estilos de la interfaz web (Tailwind v4) ──
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "[0/4] Tailwind -> ui_web\app.css"
    $tw = "$here\_tailwind"
    New-Item -ItemType Directory -Force $tw | Out-Null
    Push-Location $tw
    try {
        if (-not (Test-Path "$tw\node_modules\tailwindcss")) {
            npm init -y *> $null
            npm i --silent tailwindcss@4.3.5 @tailwindcss/cli@4.3.5
        }
        Copy-Item "$here\ui_web\src.css", "$here\ui_web\index.html" $tw -Force
        npx tailwindcss -i src.css -o "$here\ui_web\app.css" --minify
        if ($LASTEXITCODE) { throw "Tailwind fallo" }
    } finally { Pop-Location }
} else {
    Write-Host "[0/4] Node no instalado: se usa ui_web\app.css existente"
}

# ── 1) runtime: Python embebido + dependencias offline (libs/*.whl) ──
Write-Host "[1/4] Runtime Python 3.12 + dependencias"
Expand-Archive $EmbedZip "$work\rt" -Force
$pth = Get-ChildItem "$work\rt\python*._pth" | Select-Object -First 1
@("python312.zip", ".", "Lib\site-packages", "..\app", "import site") | Set-Content $pth.FullName -Encoding ASCII
# Solo wheels binarias de Python 3.12 / win_amd64. El PC que compila necesita internet;
# el cliente final NO: todo viaja dentro del instalador.
py -m pip install --target "$work\rt\Lib\site-packages" --platform win_amd64 --python-version 3.12 `
    --only-binary=:all: --no-compile --disable-pip-version-check -q -r "$sys\requirements.txt"
if ($LASTEXITCODE) { throw "pip fallo instalando las dependencias" }
Compress-Archive "$work\rt\*" "$pay\runtime.zip" -CompressionLevel Optimal

# ── 2) app: servidor + frontend (sin datos, tests ni mapas) ──
Write-Host "[2/4] Programa"
foreach ($f in "app.py", "license_core.py", "notificador.py", "ssl_bootstrap.py", "requirements.txt", "version.txt", "version.json", "icono.ico") {
    Copy-Item "$sys\$f" "$work\app\$f"
}
Copy-Item "$sys\themes" "$work\app\themes" -Recurse
Copy-Item "$sys\build" "$work\app\build" -Recurse
Get-ChildItem "$work\app\build" -Recurse -Filter *.map | Remove-Item -Force
Compress-Archive "$work\app\*" "$pay\app.zip" -CompressionLevel Optimal
Copy-Item "$sys\version.txt" "$pay\version.txt"
Copy-Item "$sys\icono.ico" "$pay\icono.ico"
Copy-Item "$sys\icono.ico" "$here\icono.ico" -Force
Copy-Item "$sys\build\logo.png" "$here\logo.png" -Force
Copy-Item "$sys\build\logo.png" "$here\ui_web\logo.png" -Force
$web = @("--add-data", "$here\ui_web\index.html;ui_web", "--add-data", "$here\ui_web\app.css;ui_web",
         "--add-data", "$here\ui_web\logo.png;ui_web")

# Datos de version de los .exe (Propiedades > Detalles; Windows/SmartScreen muestran editor y version)
$ver = (Get-Content "$sys\version.txt" -Raw).Trim()
$vt = (($ver -split '\.') + @('0', '0', '0', '0'))[0..3] -join ', '
function New-VersionFile([string]$path, [string]$desc, [string]$file) {
    @"
VSVersionInfo(
  ffi=FixedFileInfo(filevers=($vt), prodvers=($vt), mask=0x3f, flags=0x0, OS=0x40004,
                    fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('0C0A04B0', [
      StringStruct('CompanyName', 'Cinema Productions'),
      StringStruct('FileDescription', '$desc'),
      StringStruct('FileVersion', '$ver'),
      StringStruct('InternalName', '$file'),
      StringStruct('LegalCopyright', '(c) $(Get-Date -Format yyyy) Cinema Productions'),
      StringStruct('OriginalFilename', '$file'),
      StringStruct('ProductName', 'Cinema Reservas'),
      StringStruct('ProductVersion', '$ver')])]),
    VarFileInfo([VarStruct('Translation', [0x0C0A, 1200])])
  ]
)
"@ | Set-Content $path -Encoding ASCII
}
New-VersionFile "$work\ver_launcher.txt" "Cinema Reservas" "CinemaProductions.exe"
New-VersionFile "$work\ver_setup.txt" "Instalador de Cinema Reservas" "CinemaReservas-$ver-Setup.exe"

# ── 3) launcher (CinemaProductions.exe: licencia + arranque) ──
# En CARPETA (exe + _lanzador\) y no en un solo archivo: asi no se descomprime en cada
# arranque y la app abre en menos de un segundo.
Write-Host "[3/4] Launcher"
$ex = @("tkinter", "matplotlib", "numpy", "PySide6.QtNetwork", "PySide6.QtQml", "PySide6.QtQuick",
        "PySide6.QtWebEngineCore", "PySide6.QtPdf", "PySide6.QtMultimedia", "PySide6.Qt3DCore") |
      ForEach-Object { "--exclude-module", $_ }
py -m PyInstaller --noconfirm --onedir --contents-directory _lanzador --windowed --name CinemaProductions `
    --icon "$here\icono.ico" --version-file "$work\ver_launcher.txt" `
    --paths $sys --distpath "$work\dist" --workpath "$work\pi_launcher" --specpath "$work" `
    --add-data "$here\icono.ico;." @web @ex "$here\launcher.py"
if ($LASTEXITCODE) { throw "PyInstaller (launcher) fallo" }
Compress-Archive "$work\dist\CinemaProductions\*" "$pay\launcher.zip" -CompressionLevel Optimal

# ── 4) instalador ──
# --splash: imagen que aparece AL INSTANTE mientras el instalador se prepara (antes: 5 s sin nada)
Write-Host "[4/4] Instalador"
$exSetup = @("matplotlib", "numpy", "PySide6.QtNetwork", "PySide6.QtQml", "PySide6.QtQuick",   # sin tkinter:
             "PySide6.QtWebEngineCore", "PySide6.QtPdf", "PySide6.QtMultimedia", "PySide6.Qt3DCore") |  # el splash usa Tcl/Tk
           ForEach-Object { "--exclude-module", $_ }
py -m PyInstaller --noconfirm --onefile --windowed --name CinemaReservas-Setup --icon "$here\icono.ico" `
    --version-file "$work\ver_setup.txt" --splash "$here\splash.png" `
    --distpath "$work\dist" --workpath "$work\pi_setup" --specpath "$work" `
    --add-data "$pay;payload" --add-data "$here\icono.ico;." --add-data "$here\logo.png;." @web @exSetup "$here\setup_app.py"
if ($LASTEXITCODE) { throw "PyInstaller (setup) fallo" }
$exe = "CinemaReservas-$ver-Setup.exe"
Get-ChildItem $Out -Filter "CinemaReservas*Setup.exe" | Remove-Item -Force
Copy-Item "$work\dist\CinemaReservas-Setup.exe" "$Out\$exe" -Force
Write-Host ("OK -> {0}\{2} ({1} MB)" -f $Out, [int]((Get-Item "$Out\$exe").Length / 1MB), $exe)
