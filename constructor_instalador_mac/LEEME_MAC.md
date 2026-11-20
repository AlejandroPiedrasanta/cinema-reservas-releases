# Instalador para Mac (.dmg)

**Estado:** el codigo esta escrito, pero NO se ha podido fabricar ni probar en un Mac real
(el .dmg solo se puede construir en macOS). La primera vez que lo fabriques, revisa la prueba
del paso 3 de `build_mac.sh`: si algo falla, el log queda en pantalla.

## Que recibe el cliente
Un `.dmg` por tipo de Mac:
- `CinemaReservas-<version>-arm64.dmg`  → Mac con chip Apple (M1/M2/M3/M4)
- `CinemaReservas-<version>-x86_64.dmg` → Mac con Intel

Al abrirlo se ve una ventana con el icono y una flecha hacia **Aplicaciones** (arrastrar y listo).
Todo va dentro del `.app` (Python, servidor, pantallas): no necesita internet para instalar.

Al abrir la app por primera vez pide la **licencia** (misma pantalla que en Windows). Despues arranca
el servidor y abre la app en su propia ventana de Mac (WKWebView, el motor de Safari; nada que instalar).

## Donde guarda las cosas
`~/Library/Application Support/CinemaProductions/`
- `license.json` → licencia activada (ligada a esa Mac)
- `app/` → reservas, respaldos, `.env`, `server_log.txt`, certificado

Arrastrar una version nueva del `.app` a Aplicaciones **no borra** los datos.
Para desinstalar: arrastrar el `.app` a la papelera (y, si quiere, borrar esa carpeta).
El servidor queda en segundo plano; el DMG trae `Detener Cinema Reservas.command` para cerrarlo.

## Como fabricarlo
**Opcion A – GitHub (no necesitas Mac):**
1. Sube la carpeta `3_CODIGO_FUENTE` a un repo **privado** de GitHub (su contenido va en la raiz del repo).
2. Pestana **Actions → Instalador macOS → Run workflow**.
3. En ~10 min descargas los dos `.dmg` de **Artifacts**.

**Opcion B – en un Mac:**
```bash
brew install create-dmg
python3 -m pip install PySide6 pyinstaller -r ../app_servidor/requirements.txt
cd 3_CODIGO_FUENTE/constructor_instalador_mac && ./build_mac.sh
```
El `.dmg` queda en `1_INSTALADOR_PARA_CLIENTES`.

## Aviso importante: "no se puede abrir" (Gatekeeper)
Sin cuenta de Apple Developer ($99/año) la app NO esta firmada ni notarizada. Al descargarla de
internet, macOS dira *"no se puede abrir porque no se puede verificar al desarrollador"*.
El cliente debe hacer **una sola vez**: clic derecho sobre la app → **Abrir** → **Abrir**
(o en Terminal: `xattr -cr "/Applications/Cinema Reservas.app"`).
Para evitarlo hay que firmar y notarizar: guarda el certificado "Developer ID Application" como secrets
(`DEVELOPER_ID`, `MACOS_CERT_P12`, `MACOS_CERT_PASSWORD`) y el workflow ya firma el `.app` y el `.dmg`.
(La notarizacion con `notarytool` no esta incluida: añadirla es el ultimo paso para cero avisos.)

## Archivos de esta carpeta
| Archivo | Que hace |
|---|---|
| `launcher_mac.py` | La app: pide licencia, arranca el servidor (`--server`) y abre la ventana de la app. `--selftest` comprueba que la interfaz web va incluida |
| `server_deps.py` | Lista de librerias del servidor para que PyInstaller las meta en el `.app` |
| `build_mac.sh` | Fabrica `.app` + prueba del servidor + `.dmg` |
| `gen_assets.py` | Genera `icon.icns` y el fondo del DMG (ya generados) |
| `icon.icns`, `dmg_background*.png` | Icono (clip morado) y fondo de la ventana del DMG |
| `Detener Cinema Reservas.command` | Cierra el servidor en segundo plano |
| `../.github/workflows/build-mac.yml` | Fabrica los DMG en GitHub (Apple Silicon + Intel) |

Comparte con Windows: `app_servidor/` (app + `license_core.py`) y `constructor_instalador/`: interfaz web `ui_web/` + `webui.py` + `web_launcher.py` (licencia, arranque, ventana de la app) y, como respaldo si fallara, la interfaz Qt (`ui_common.py`, `license_ui.py`).

## Prueba automatica en Mac

El workflow «Instalador macOS» del repo publico cinema-reservas-releases fabrica los dos .dmg en Macs reales de GitHub (macos-15 y macos-15-intel), abre la app con `--uitest` (licencia -> arranque -> ventana de la app -> cerrar, con capturas) y solo adjunta los .dmg al release si la prueba pasa. Las capturas quedan en el run, en «Artifacts».
