# Cinema Reservas

Gestor de reservas de eventos de **Cinema Productions**, 100 % local en tu computadora
(Windows y macOS). Se compra con licencia en
[Gumroad](https://cinemaproductions.gumroad.com/l/Cinemaflow).

## Descargar

Última versión en **[Releases](../../releases/latest)**:

| Sistema | Archivo |
|---|---|
| Windows 10/11 | `CinemaReservas-<versión>-Setup.exe` |
| Mac con Apple Silicon (M1–M4) | `CinemaReservas-<versión>-arm64.dmg` |
| Mac con Intel | `CinemaReservas-<versión>-x86_64.dmg` |

Al abrir la app por primera vez pide la clave de licencia que llega por correo al comprar.

## Actualizaciones

La app revisa este repositorio. Cuando aparece una versión nueva en *Releases*,
**Actualizaciones** la descarga y abre el instalador; las reservas y los respaldos se conservan.

Para publicar una versión nueva:
1. Sube `version.txt` (raíz y `app_servidor/`) a la versión nueva, p. ej. `1.20.85`.
2. Windows: `constructor_instalador/build.ps1` → `CinemaReservas-1.20.85-Setup.exe`.
3. Mac: pestaña **Actions → Instalador macOS → Run workflow** → descarga los `.dmg`.
4. Crea el release `v1.20.85` y adjunta los tres instaladores.

## Estructura

| Carpeta | Contenido |
|---|---|
| `app_servidor/` | Servidor (FastAPI) + pantallas ya compiladas (`build/`) y licencia (`license_core.py`) |
| `constructor_instalador/` | Instalador y lanzador de Windows. Interfaz web en `ui_web/` (HTML + Tailwind) |
| `constructor_instalador_mac/` | App y `.dmg` de macOS (`build_mac.sh`, lo usa el workflow) |

Compilar en Windows requiere `py -m pip install PySide6 pyinstaller pywebview` y el
Python embebido `python-3.12.10-embed-amd64.zip` (de python.org) en
`constructor_instalador/python-embed/`.
