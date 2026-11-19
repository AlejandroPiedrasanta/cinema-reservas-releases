# Instalador Cinema Reservas

`build.ps1` genera `CinemaReservas-Setup.exe` (carpeta CINEMA RESERVAS).
Requiere: `py -m pip install PySide6 pyinstaller` y `python-embed\python-3.12.10-embed-amd64.zip`.

## Licencia (Gumroad)
1. Crea el producto en Gumroad y activa **License key**.
2. Pon su `product_id` en `..\app_servidor\license_core.py` (`GUMROAD_PRODUCT_ID`) y el enlace en `BUY_URL`.
   (Sin recompilar: archivo `license_config.json` junto a CinemaProductions.exe.)
3. Recompila con `build.ps1`.

Por defecto: 2 equipos por licencia (`MAX_DEVICES`), revalida cada 7 dias, 30 dias de gracia sin internet.
Prueba local sin Gumroad: variable `CP_DEV_NO_LICENSE=1` salta la compuerta de app.py.
