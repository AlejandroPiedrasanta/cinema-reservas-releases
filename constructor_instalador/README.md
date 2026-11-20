# Instalador Cinema Reservas (Windows)

`build.ps1` genera `CinemaReservas-<versión>-Setup.exe` en `1_INSTALADOR_PARA_CLIENTES`.
Requiere: `py -m pip install PySide6 pyinstaller pywebview` y
`python-embed\python-3.12.10-embed-amd64.zip`. Node.js es opcional (recompila `ui_web\app.css`).

## Interfaz
- `ui_web\index.html` + `src.css` (Tailwind): instalador, licencia, arranque y desinstalar.
- `webui.py` la muestra con Edge WebView2; `web_launcher.py` es el flujo común con macOS.
- Sin WebView2 se usan las ventanas Qt de respaldo (`ui_common.py`, `license_ui.py`).

## Licencia (Gumroad)
1. Crea el producto en Gumroad y activa **License key**.
2. Pon su `product_id` en `..\app_servidor\license_core.py` (`GUMROAD_PRODUCT_ID`) y el enlace en `BUY_URL`.
   Es fijo en el código a propósito (no se puede cambiar con archivos ni variables).
3. Recompila con `build.ps1`.

Por defecto: 2 equipos por licencia (`MAX_DEVICES`), revalida cada 7 días, 30 días de gracia sin internet.
El archivo de licencia está firmado (clave, equipo, fechas, revocada, maestra).
Prueba local sin Gumroad: variable `CP_DEV_NO_LICENSE=1` salta la compuerta de app.py.
