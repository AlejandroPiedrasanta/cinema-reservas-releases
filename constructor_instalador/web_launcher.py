"""Flujo web del lanzador, comun a Windows (launcher.py) y macOS (launcher_mac.py):
licencia -> arranque del servidor -> ventana propia de la app.

Cada sistema pasa sus funciones (hooks):
  version()            -> "1.20.84"
  start_server(ui)     arranca el servidor y avisa con ui.status/failed/done/open
  stop_server()        lo detiene (se llama al cerrar la ventana de la app)
  do_uninstall(wipe)   opcional (solo Windows)
"""
from __future__ import annotations

import threading
import webbrowser
from types import SimpleNamespace

import license_core as lic
import webui

SIZES = {"license": (920, 600), "splash": (560, 400), "uninstall": (560, 420)}


class LauncherApi:
    """Funciones que la pagina ui_web llama con window.pywebview.api.<nombre>()."""

    def __init__(self, view: str, reason: str, hooks: SimpleNamespace):
        self._view, self._reason, self._h = view, reason, hooks
        self._win = None
        self._busy = False
        self._started = False
        self._app_open = False

    def init(self):
        return {"view": self._view, "version": self._h.version(), "reason": self._reason,
                "machineId": lic.machine_id() if self._view == "license" else ""}

    def activate(self, key):
        try:
            st = lic.activate(str(key or ""))
        except Exception as e:
            return {"ok": False, "reason": "Error inesperado: %s" % e}
        return {"ok": st.valid, "reason": st.reason, "master": st.email == "Licencia maestra"}

    def buy(self):
        webbrowser.open(lic.buy_url())

    def copy(self, text):
        webui.copy_text(str(text))

    def start(self):
        if self._busy:
            return
        self._busy = True
        self._started = True
        w = self._win
        if self._view == "license":          # tras activar: la ventana pasa al tamano del arranque
            try:
                import webview
                sw, sh = SIZES["splash"]
                s = (webview.screens or [None])[0]
                w.w.resize(sw, sh)
                if s:
                    w.w.move(s.x + (s.width - sw) // 2, s.y + (s.height - sh) // 2)
            except Exception:
                pass

        def done():
            self._busy = False
            w.push(done=True)
            threading.Timer(0.9, w.close).start()

        def failed(title, detail):
            self._busy = False
            w.push(failed=True, title=title, detail=detail)

        def open_app(url):
            self._app_open = True
            webui.app_window(url, on_closed=self._h.stop_server)

        ui = SimpleNamespace(status=lambda pct, title, detail: w.push(pct=pct, title=title, detail=detail),
                             failed=failed, done=done, open=open_app)
        threading.Thread(target=self._h.start_server, args=(ui,), daemon=True).start()

    def uninstall(self, mode):
        if not getattr(self._h, "do_uninstall", None):
            return False
        ok = self._h.do_uninstall(mode == "wipe")
        threading.Timer(2.2, self._win.close).start()
        return ok

    def minimize(self):
        self._win.minimize()

    def close(self):
        self._win.close()


def run(view: str, reason: str = "", **hooks) -> int:
    """Muestra licencia / arranque / desinstalar y, si arranca, la ventana de la app."""
    h = SimpleNamespace(**hooks)
    api = LauncherApi(view, reason, h)
    api._win = webui.Window(api, view, *SIZES[view])
    webui.start()
    # Se cerro todo: si se llego a arrancar el servidor (aunque se cerrara la ventana de
    # arranque antes de terminar, o con Cmd+Q en Mac), no dejarlo corriendo solo.
    if api._started or api._app_open:
        h.stop_server()
    return 0


def open_running(url: str, stop_server) -> int:
    """El servidor ya corre: trae la ventana al frente o abre una nueva."""
    if webui.focus_app_window():
        return 0
    webui.app_window(url, on_closed=stop_server)
    webui.start()
    stop_server()
    return 0
