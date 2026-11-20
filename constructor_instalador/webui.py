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
        if inside and g["width"] >= 820 and g["height"] >= 560:
            return g
    except Exception:
        pass
    return {}


class _WinChrome:
    """Ventana de la app SIN la barra de Windows: los botones minimizar / maximizar / cerrar
    van dentro de la propia app. Como la ventana sin marco de Windows no se puede
    redimensionar ni maximizar bien (taparia la barra de tareas), se hace aqui con Win32:
      - maximizar = ocupar el area de trabajo del monitor (sin tapar la barra de tareas)
      - redimensionar = arrastrar los bordes (la pagina avisa del borde; aqui se sigue el raton)
    Los metodos publicos los llama la pagina con window.pywebview.api.<nombre>()."""

    MIN_W, MIN_H = 820, 560

    def __init__(self, start_max: bool, last_rect=None):
        self._w = None
        self._max = start_max
        self._normal = last_rect          # (x, y, w, h) antes de maximizar
        self._resizing = False

    # ── Win32 ──
    def _hwnd(self):
        return int(self._w.native.Handle.ToInt64())

    @staticmethod
    def _u():
        import ctypes
        return ctypes.windll.user32

    def _rect(self):
        import ctypes
        from ctypes import wintypes
        r = wintypes.RECT()
        self._u().GetWindowRect(ctypes.c_void_p(self._hwnd()), ctypes.byref(r))
        return r.left, r.top, r.right - r.left, r.bottom - r.top

    def _set(self, x, y, w, h):
        self._u().SetWindowPos(__import__("ctypes").c_void_p(self._hwnd()), None, int(x), int(y),
                               int(w), int(h), 0x0004 | 0x0010)    # SWP_NOZORDER | SWP_NOACTIVATE

    def _work_area(self):
        import ctypes
        from ctypes import wintypes

        class MONITORINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT),
                        ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]
        u = self._u()
        u.MonitorFromWindow.restype = ctypes.c_void_p
        mon = u.MonitorFromWindow(ctypes.c_void_p(self._hwnd()), 2)       # MONITOR_DEFAULTTONEAREST
        mi = MONITORINFO()
        mi.cbSize = ctypes.sizeof(MONITORINFO)
        u.GetMonitorInfoW(ctypes.c_void_p(mon), ctypes.byref(mi))
        r = mi.rcWork
        return r.left, r.top, r.right - r.left, r.bottom - r.top

    def _polish(self):
        try:   # esquinas redondeadas de Windows 11
            import ctypes
            v = ctypes.c_int(2)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(ctypes.c_void_p(self._hwnd()), 33, ctypes.byref(v), 4)
        except Exception:
            pass

    def _apply_max(self, on: bool):
        if on:
            if not self._max:
                self._normal = self._rect()
            self._set(*self._work_area())
        elif self._normal:
            self._set(*self._normal)
        self._max = on

    # ── llamados desde la pagina ──
    def win_minimize(self):
        self._w.minimize()

    def win_toggle_maximize(self):
        self._apply_max(not self._max)
        return self._max

    def win_is_maximized(self):
        return self._max

    def win_close(self):
        self._w.destroy()

    def win_start_resize(self, edge):
        """Arrastre de un borde: sigue el raton hasta soltar el boton."""
        if self._max or self._resizing:
            return
        self._resizing = True
        threading.Thread(target=self._resize_loop, args=(str(edge),), daemon=True).start()

    def _resize_loop(self, edge):
        import ctypes
        from ctypes import wintypes
        u = self._u()
        pt = wintypes.POINT()
        u.GetCursorPos(ctypes.byref(pt))
        sx, sy = pt.x, pt.y
        x0, y0, w0, h0 = self._rect()
        last = None
        try:
            while u.GetAsyncKeyState(0x01) & 0x8000:            # boton izquierdo apretado
                u.GetCursorPos(ctypes.byref(pt))
                dx, dy = pt.x - sx, pt.y - sy
                x, y, w, h = x0, y0, w0, h0
                if "e" in edge:
                    w = max(self.MIN_W, w0 + dx)
                if "s" in edge:
                    h = max(self.MIN_H, h0 + dy)
                if "w" in edge:
                    w = max(self.MIN_W, w0 - dx)
                    x = x0 + w0 - w
                if "n" in edge:
                    h = max(self.MIN_H, h0 - dy)
                    y = y0 + h0 - h
                if (x, y, w, h) != last:
                    self._set(x, y, w, h)
                    last = (x, y, w, h)
                time.sleep(0.012)
        finally:
            self._resizing = False

    def geometry(self):
        """Para recordar la ventana al cerrar: (x, y, w, h) normal y si estaba maximizada."""
        try:
            return (self._normal if self._max else self._rect()), self._max
        except Exception:
            return self._normal, self._max


# Barra propia dentro de la app (solo Windows): zona para arrastrar + botones.
_CHROME_JS = r"""
(function () {
  if (window.__crChrome || !window.pywebview || !window.pywebview.api || !pywebview.api.win_close) return;
  window.__crChrome = true;
  const api = pywebview.api;
  const ink = () => getComputedStyle(document.body || document.documentElement).color || "#334";
  const css = `
  #cr-drag{position:fixed;top:0;left:0;right:150px;height:30px;z-index:2147483000;cursor:default}
  #cr-btns{position:fixed;top:8px;right:10px;z-index:2147483001;display:flex;gap:2px;padding:3px;border-radius:12px;
    background:rgba(128,128,140,.16);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px);
    box-shadow:inset 0 0 0 1px rgba(128,128,140,.22),0 6px 18px -8px rgba(0,0,0,.35);transition:opacity .2s}
  #cr-btns button{all:unset;width:34px;height:26px;display:grid;place-items:center;border-radius:9px;cursor:pointer;
    color:var(--cr-ink);opacity:.82;transition:background .15s,opacity .15s,color .15s}
  #cr-btns button:hover{background:rgba(128,128,140,.24);opacity:1}
  #cr-btns button.x:hover{background:#e5484d;color:#fff}
  #cr-btns svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .cr-edge{position:fixed;z-index:2147482999}
  .cr-n{top:0;left:8px;right:8px;height:5px;cursor:ns-resize}.cr-s{bottom:0;left:8px;right:8px;height:6px;cursor:ns-resize}
  .cr-w{left:0;top:8px;bottom:8px;width:6px;cursor:ew-resize}.cr-e{right:0;top:8px;bottom:8px;width:6px;cursor:ew-resize}
  .cr-nw{top:0;left:0;width:10px;height:10px;cursor:nwse-resize}.cr-ne{top:0;right:0;width:10px;height:10px;cursor:nesw-resize}
  .cr-sw{bottom:0;left:0;width:12px;height:12px;cursor:nesw-resize}.cr-se{bottom:0;right:0;width:12px;height:12px;cursor:nwse-resize}
  html.cr-max .cr-edge{display:none}`;
  const st = document.createElement("style"); st.textContent = css;
  const I = {
    min: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    max: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>',
    res: '<svg viewBox="0 0 24 24"><rect x="5" y="9" width="10" height="10" rx="2"/><path d="M9 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/></svg>',
    x:   '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'};
  const drag = document.createElement("div"); drag.id = "cr-drag"; drag.className = "pywebview-drag-region";
  const btns = document.createElement("div"); btns.id = "cr-btns";
  btns.innerHTML = `<button data-a="min" title="Minimizar" aria-label="Minimizar">${I.min}</button>`
    + `<button data-a="max" title="Maximizar" aria-label="Maximizar">${I.max}</button>`
    + `<button data-a="close" class="x" title="Cerrar" aria-label="Cerrar">${I.x}</button>`;
  const root = document.documentElement;
  root.appendChild(st); root.appendChild(drag); root.appendChild(btns);
  ["n","s","w","e","nw","ne","sw","se"].forEach(e => {
    const d = document.createElement("div"); d.className = "cr-edge cr-" + e;
    d.addEventListener("mousedown", ev => { if (ev.button === 0) { ev.preventDefault(); api.win_start_resize(e); } });
    root.appendChild(d);
  });
  const paintMax = (m) => {
    root.classList.toggle("cr-max", !!m);
    const b = btns.querySelector('[data-a="max"]');
    b.innerHTML = m ? I.res : I.max; b.title = m ? "Restaurar" : "Maximizar"; b.setAttribute("aria-label", b.title);
  };
  const toggle = async () => paintMax(await api.win_toggle_maximize());
  btns.addEventListener("click", ev => {
    const a = ev.target.closest("button")?.dataset.a;
    if (a === "min") api.win_minimize(); else if (a === "max") toggle(); else if (a === "close") api.win_close();
  });
  drag.addEventListener("dblclick", toggle);
  const tint = () => root.style.setProperty("--cr-ink", ink());
  tint(); setInterval(tint, 1500);                     // sigue el tema (claro / oscuro) de la app
  api.win_is_maximized().then(paintMax);
})();
"""


def app_window(url: str, on_closed=None):
    """Abre la app en su ventana. En Windows sin la barra del sistema (botones propios dentro
    de la app); en Mac con la barra nativa (semaforo). Recuerda tamano, posicion y si estaba
    maximizada (la primera vez se abre maximizada)."""
    import webview
    g = _load_geom()
    state = {"max": g.get("maximized", True)}
    kw = dict(width=g.get("width", 1440), height=g.get("height", 900), min_size=(820, 560),
              resizable=True, background_color="#0b0a10")
    chrome = None
    if IS_WIN:
        # el tamano guardado esta en pixeles reales (Win32): se aplica al mostrarse
        chrome = _WinChrome(state["max"], (g["x"], g["y"], g["width"], g["height"]) if g else None)
        kw.update(width=1440, height=900, frameless=True, easy_drag=False, js_api=chrome)
    else:
        if g:
            kw.update(x=g["x"], y=g["y"])
        kw.update(maximized=state["max"])
    w = webview.create_window(APP_TITLE, url, **kw)

    if chrome:
        chrome._w = w

        def shown(*_):
            chrome._polish()
            if state["max"]:
                chrome._max = False
                chrome._apply_max(True)
            elif chrome._normal:
                chrome._set(*chrome._normal)

        def loaded(*_):
            try:
                w.evaluate_js(_CHROME_JS)
            except Exception:
                pass
        w.events.shown += shown
        w.events.loaded += loaded

    def maximized(*_):
        state["max"] = True

    def restored(*_):
        state["max"] = False

    def save():
        try:
            old = _load_geom() or {"x": 80, "y": 60, "width": 1440, "height": 900}
            if chrome:
                rect, is_max = chrome.geometry()
                if rect and rect[0] > -10000 and rect[1] > -10000:
                    old = {"x": rect[0], "y": rect[1], "width": rect[2], "height": rect[3]}
                data = dict(old, maximized=bool(is_max))
            elif state["max"]:
                data = dict(old, maximized=True)
            elif w.x <= -10000 or w.y <= -10000:        # cerrada minimizada: posicion falsa
                data = old
            else:
                data = {"x": w.x, "y": w.y, "width": w.width, "height": w.height, "maximized": False}
            _geom_file().write_text(json.dumps(data), encoding="utf-8")
        except Exception:
            pass

    done = {"v": False}

    def closing(*_):
        save()
        # al cerrar (tambien Cmd+Q en Mac, donde "closed" puede no llegar) se detiene el servidor
        # (sincrono: con Cmd+Q la app termina enseguida y un hilo no alcanzaria a correr)
        if on_closed and not done["v"]:
            done["v"] = True
            try:
                on_closed()
            except Exception:
                pass

    w.events.maximized += maximized
    w.events.restored += restored
    w.events.closing += closing
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
        from ctypes import wintypes
        k = ctypes.WinDLL("kernel32", use_last_error=True)
        k.CreateMutexW.restype = wintypes.HANDLE
        k.CreateMutexW.argtypes = (ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR)
        _mutex = k.CreateMutexW(None, False, "Local\\" + name)
        return ctypes.get_last_error() != 183    # ERROR_ALREADY_EXISTS
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
