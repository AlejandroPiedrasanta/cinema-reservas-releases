"""Ventanas con interfaz web (HTML + Tailwind, estilo shadcn) para Windows y macOS.

Usa pywebview con el motor web que ya trae el sistema:
  Windows -> Edge WebView2 (viene en Windows 10/11)
  macOS   -> WKWebView (Safari), sin instalar nada
Si no esta disponible, los llamadores vuelven a la interfaz Qt de siempre.
Forzar Qt para pruebas: variable de entorno CP_UI=qt.  Consola web: CP_UI_DEBUG=1.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

IS_WIN, IS_MAC = sys.platform == "win32", sys.platform == "darwin"
APP_TITLE = "Cinema Reservas"
_WV2 = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"   # Edge WebView2 Runtime

# Menus nativos de macOS (Editar: copiar/pegar con Cmd) y dialogos en espanol
_ES = {
    "global.quitConfirmation": "¿Seguro que quieres salir?", "global.ok": "Aceptar",
    "global.quit": "Salir", "global.cancel": "Cancelar", "global.saveFile": "Guardar archivo",
    "cocoa.menu.about": "Acerca de", "cocoa.menu.services": "Servicios", "cocoa.menu.view": "Ver",
    "cocoa.menu.edit": "Edición", "cocoa.menu.hide": "Ocultar", "cocoa.menu.hideOthers": "Ocultar otros",
    "cocoa.menu.showAll": "Mostrar todo", "cocoa.menu.quit": "Salir", "cocoa.menu.fullscreen":
    "Pantalla completa", "cocoa.menu.cut": "Cortar", "cocoa.menu.copy": "Copiar",
    "cocoa.menu.paste": "Pegar", "cocoa.menu.selectAll": "Seleccionar todo",
    "windows.fileFilter.allFiles": "Todos los archivos", "windows.fileFilter.otherFiles": "Otros tipos",
}


def res_path(name: str) -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent)) / name


def data_dir() -> Path:
    """Carpeta de datos del usuario (sesion de la ventana, posicion, etc.)."""
    if IS_MAC:
        base = Path.home() / "Library" / "Application Support" / "CinemaProductions"
    else:
        base = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "CinemaProductions"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _webview2_installed() -> bool:
    import winreg
    sub = "Microsoft\\EdgeUpdate\\Clients\\" + _WV2
    for root, path in ((winreg.HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\" + sub),
                       (winreg.HKEY_LOCAL_MACHINE, "SOFTWARE\\" + sub),
                       (winreg.HKEY_CURRENT_USER, "Software\\" + sub)):
        try:
            with winreg.OpenKey(root, path) as k:
                v = str(winreg.QueryValueEx(k, "pv")[0])
                if v and v != "0.0.0.0":
                    return True
        except OSError:
            pass
    return False


def available() -> bool:
    if os.environ.get("CP_UI", "").lower() == "qt" or not (IS_WIN or IS_MAC):
        return False
    if not res_path("ui_web/index.html").exists():
        return False
    try:
        import webview  # noqa: F401
    except Exception:
        return False
    return _webview2_installed() if IS_WIN else True


def _page_url(view: str) -> str:
    # ruta larga real (el TEMP de PyInstaller puede venir en formato 8.3 "CINEMA~1",
    # que WebView2 no abre); los parametros van tras "#" para no tocar el nombre del archivo
    return res_path("ui_web/index.html").resolve().as_uri() + "#pw=1&view=" + view


class Window:
    """Ventana sin marco (pantallas propias: instalador, licencia, arranque, desinstalar)."""

    def __init__(self, api, view: str, width: int, height: int, title: str = APP_TITLE):
        import webview
        self._lock = threading.Lock()
        self._last = 0.0
        self.can_close = lambda: True
        self.w = webview.create_window(title, _page_url(view), js_api=api, width=width, height=height,
                                       resizable=False, frameless=True, easy_drag=False,
                                       background_color="#0b0a10", text_select=False)
        self.w.events.shown += self._polish
        self.w.events.closing += self._closing

    # Windows 11: esquinas redondeadas + modo oscuro del marco. En macOS la ventana "frameless"
    # de pywebview ya es una ventana normal con barra transparente (esquinas y sombra nativas).
    def _polish(self, *_):
        if not IS_WIN:
            return
        try:
            import ctypes
            hwnd = ctypes.c_void_p(int(self.w.native.Handle.ToInt64()))
            for attr, val in ((33, 2), (20, 1)):      # CORNER_PREFERENCE=ROUND, DARK_MODE
                v = ctypes.c_int(val)
                ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, attr, ctypes.byref(v), 4)
        except Exception:
            pass

    def _closing(self, *_):
        return bool(self.can_close())

    def push(self, throttle: float = 0.0, **state) -> None:
        """Envia cambios de estado a la pagina (ui.set). throttle: seg. minimos entre envios."""
        now = time.monotonic()
        if throttle and now - self._last < throttle:
            return
        self._last = now
        try:
            with self._lock:
                self.w.evaluate_js("window.ui && ui.set(%s)" % json.dumps(state, ensure_ascii=False))
        except Exception:
            pass

    def minimize(self) -> None:
        self.w.minimize()

    def close(self) -> None:
        self.can_close = lambda: True
        self.w.destroy()


# ── ventana de la app (normal, con barra de titulo del sistema) ─────────
def _geom_file() -> Path:
    return data_dir() / "ventana.json"


def _load_geom() -> dict:
    try:
        g = json.loads(_geom_file().read_text(encoding="utf-8"))
        import webview
        scr = webview.screens or []
        inside = any(s.x - 50 <= g["x"] < s.x + s.width - 100 and s.y - 50 <= g["y"] < s.y + s.height - 100
                     for s in scr)
        if inside and g["width"] >= 1024 and g["height"] >= 680:
            return g
    except Exception:
        pass
    return {}


def app_window(url: str, on_closed=None):
    """Abre la app en una ventana propia del sistema. Recuerda tamano, posicion y si
    estaba maximizada (la primera vez se abre maximizada)."""
    import webview
    g = _load_geom()
    state = {"max": g.get("maximized", True)}
    kw = dict(width=g.get("width", 1440), height=g.get("height", 900), min_size=(1024, 680),
              resizable=True, maximized=state["max"], background_color="#0b0a10")
    if g:
        kw.update(x=g["x"], y=g["y"])
    w = webview.create_window(APP_TITLE, url, **kw)

    def maximized(*_):
        state["max"] = True

    def restored(*_):
        state["max"] = False

    def save(*_):
        try:
            if state["max"]:
                old = _load_geom() or {"x": 80, "y": 60, "width": 1440, "height": 900}
                old["maximized"] = True
                data = old
            else:
                data = {"x": w.x, "y": w.y, "width": w.width, "height": w.height, "maximized": False}
            _geom_file().write_text(json.dumps(data), encoding="utf-8")
        except Exception:
            pass

    w.events.maximized += maximized
    w.events.restored += restored
    w.events.closing += save
    if on_closed:
        w.events.closed += lambda *_: on_closed()
    return w


_mutex = None


def single_instance(name: str = "CinemaReservasLauncher") -> bool:
    """False si ya hay otro lanzador abierto (doble clic en el icono). En macOS el propio
    sistema evita abrir la .app dos veces."""
    global _mutex
    if not IS_WIN:
        return True
    try:
        import ctypes
        k = ctypes.windll.kernel32
        _mutex = k.CreateMutexW(None, False, "Local\\" + name)
        return k.GetLastError() != 183          # ERROR_ALREADY_EXISTS
    except Exception:
        return True


def focus_app_window() -> bool:
    """Si la ventana de la app ya esta abierta, la trae al frente (evita abrir otra).
    En macOS lo hace el propio sistema al volver a abrir la .app."""
    if not IS_WIN:
        return False
    try:
        import ctypes
        u = ctypes.windll.user32
        hwnd = u.FindWindowW(None, APP_TITLE)
        if not hwnd:
            return False
        if u.IsIconic(hwnd):
            u.ShowWindow(hwnd, 9)          # SW_RESTORE
        u.SetForegroundWindow(hwnd)
        return True
    except Exception:
        return False


def start() -> None:
    import webview
    # La app corre en https://localhost con certificado propio (ssl_bootstrap): se acepta
    # dentro de esta ventana. Los enlaces externos se abren en el navegador del sistema.
    webview.settings["IGNORE_SSL_ERRORS"] = True
    webview.settings["ALLOW_DOWNLOADS"] = True              # exportar Excel, respaldos, PDF
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    store = data_dir() / "webview"
    store.mkdir(parents=True, exist_ok=True)
    webview.start(gui="edgechromium" if IS_WIN else None, debug=bool(os.environ.get("CP_UI_DEBUG")),
                  private_mode=False, storage_path=str(store),   # conserva sesion y ajustes
                  localization=_ES)


def copy_text(text: str) -> None:
    if IS_MAC:
        subprocess.run(["pbcopy"], input=text.encode("utf-8"))
    else:
        subprocess.run(["clip"], input=text.encode("ascii", "ignore"), creationflags=0x08000000)
