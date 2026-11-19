#!/bin/bash
# Fabrica "Cinema Reservas.app" y CinemaReservas-<version>-<arquitectura>.dmg  (SOLO en macOS).
# Requisitos (una vez):  brew install create-dmg  &&  python3 -m pip install PySide6 pyinstaller pywebview -r ../app_servidor/requirements.txt
# Interfaz: la misma web de Windows (../constructor_instalador/ui_web) sobre WKWebView (Safari).
# Uso:  ./build_mac.sh
# Firma (opcional, si tienes Apple Developer ID):  DEVELOPER_ID="Developer ID Application: Tu Nombre (TEAMID)" ./build_mac.sh
set -euo pipefail
cd "$(dirname "$0")"
SRV=../app_servidor
UI=../constructor_instalador
VER=$(tr -d '[:space:]' < "$SRV/version.txt")
ARCH=$(uname -m)                    # arm64 (Apple Silicon) | x86_64 (Intel)
OUT="${OUT_DIR:-../../1_INSTALADOR_PARA_CLIENTES}"
APP="Cinema Reservas.app"
PY="${PYTHON:-python3}"

rm -rf build dist
cp "$SRV/build/logo.png" "$UI/ui_web/logo.png"
echo "[1/4] Empaquetando app + servidor + Python (PyInstaller)…"
"$PY" -m PyInstaller --noconfirm --windowed --name CinemaReservas \
  --icon icon.icns --osx-bundle-identifier com.cinemaproductions.reservas \
  --paths "$SRV" --paths "$UI" --paths . \
  --hidden-import server_deps --hidden-import webui --hidden-import web_launcher \
  --hidden-import webview.platforms.cocoa --collect-data webview \
  --add-data "$UI/ui_web/index.html:ui_web" --add-data "$UI/ui_web/app.css:ui_web" \
  --add-data "$UI/ui_web/logo.png:ui_web" \
  --collect-submodules uvicorn --collect-submodules mongomock_motor --collect-submodules motor \
  --collect-submodules pymongo --collect-submodules dns --collect-data certifi --collect-data tzdata \
  --add-data "$SRV/build:build" --add-data "$SRV/themes:themes" --add-data "$SRV/version.txt:." \
  --add-data "$SRV/app.py:app_src" --add-data "$UI/icono.ico:." --add-data "$SRV/build/logo.png:." \
  --exclude-module tkinter --exclude-module matplotlib --exclude-module numpy \
  --exclude-module PySide6.QtNetwork --exclude-module PySide6.QtQml --exclude-module PySide6.QtQuick \
  --exclude-module PySide6.QtWebEngineCore --exclude-module PySide6.QtPdf --exclude-module PySide6.QtMultimedia \
  launcher_mac.py
mv "dist/CinemaReservas.app" "dist/$APP"

echo "[2/4] Firmando…"
if [ -n "${DEVELOPER_ID:-}" ]; then
  codesign --force --deep --options runtime --timestamp --sign "$DEVELOPER_ID" "dist/$APP"
else
  codesign --force --deep --sign - "dist/$APP"      # firma ad-hoc (sin cuenta Apple): ver LEEME_MAC.md
fi

echo "[3/4] Prueba rapida de la interfaz web y del servidor empaquetados…"
"dist/$APP/Contents/MacOS/CinemaReservas" --selftest || { echo "FALTA la interfaz web en el .app"; exit 1; }
CP_DEV_NO_LICENSE=1 CP_NO_BROWSER=1 "dist/$APP/Contents/MacOS/CinemaReservas" --server >/tmp/cr_smoke.log 2>&1 &
PID=$!
OK=0
for i in $(seq 1 60); do
  if curl -sk --max-time 3 https://localhost:8001/api/ | grep -q "Cinema Productions API"; then OK=1; break; fi
  sleep 1
done
kill $PID 2>/dev/null || true; pkill -f "CinemaReservas.*--server" 2>/dev/null || true
if [ "$OK" != "1" ]; then echo "FALLO la prueba del servidor:"; tail -30 /tmp/cr_smoke.log; exit 1; fi
echo "   servidor OK"

echo "[4/4] Creando el DMG…"
mkdir -p "$OUT"
cp "Detener Cinema Reservas.command" dist/ && chmod +x "dist/Detener Cinema Reservas.command"
DMG="$OUT/CinemaReservas-$VER-$ARCH.dmg"
rm -f "$DMG"
create-dmg --volname "Cinema Reservas" --background dmg_background.png \
  --window-pos 200 120 --window-size 660 400 --icon-size 110 --text-size 13 \
  --icon "$APP" 180 200 --hide-extension "$APP" --app-drop-link 480 200 \
  --icon "Detener Cinema Reservas.command" 330 320 \
  "$DMG" "dist/"
if [ -n "${DEVELOPER_ID:-}" ]; then codesign --force --sign "$DEVELOPER_ID" --timestamp "$DMG"; fi
echo "LISTO -> $DMG"
