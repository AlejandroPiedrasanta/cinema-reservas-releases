"""Arranca el servidor de desarrollo y lo reinicia al guardar cualquier app_servidor/*.py.

Sustituye a `uvicorn --reload`: en Windows, sin consola (p. ej. lanzado desde Claude),
uvicorn manda CTRL_C al proceso hijo, la señal no llega y la recarga se queda colgada.
Uso: python recargar.py <carpeta app_servidor> <puerto>
"""
import subprocess
import sys
import time
from pathlib import Path

app_dir = Path(sys.argv[1]).resolve()
port = sys.argv[2] if len(sys.argv) > 2 else "8002"
cmd = [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", port,
       "--timeout-graceful-shutdown", "2", "--log-level", "warning"]


def snapshot():
    return {p: p.stat().st_mtime for p in app_dir.glob("*.py")}


def start():
    print("[dev] servidor en http://127.0.0.1:%s" % port, flush=True)
    return subprocess.Popen(cmd, cwd=str(app_dir))


proc, seen = start(), snapshot()
try:
    while True:
        time.sleep(0.7)
        now = snapshot()
        if now != seen:
            changed = [p.name for p in now if now.get(p) != seen.get(p)]
            print("[dev] cambio en %s: reiniciando" % ", ".join(changed), flush=True)
            seen = now
            proc.terminate()
            try:
                proc.wait(5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            time.sleep(0.3)
            proc = start()
        elif proc.poll() is not None:                 # se cayo (p. ej. error de sintaxis)
            print("[dev] el servidor se detuvo (codigo %s); esperando un cambio para reiniciar" % proc.returncode,
                  flush=True)
            while snapshot() == seen:
                time.sleep(0.7)
            seen = snapshot()
            proc = start()
finally:
    proc.terminate()
