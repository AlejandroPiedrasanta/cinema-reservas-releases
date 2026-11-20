/**
 * Regulador del reloj de animación (requestAnimationFrame) para ahorrar CPU/GPU.
 *
 * Se importa ANTES que todo lo demás (ver index.jsx): así framer-motion y el resto usan
 * esta versión. Normalmente no cambia nada (60 fps). En "modo quieto" (ventana en segundo
 * plano o minimizada, ver useQuietMode en App.jsx) las animaciones por JavaScript se
 * CONGELAN (no van a saltos) y siguen al instante al volver. Antes la app hacía ~1.500
 * cambios de estilo por segundo aunque estuviera detrás de otras ventanas.
 */
if (typeof window !== "undefined" && window.requestAnimationFrame && !window.__cpRafGovernor) {
  window.__cpRafGovernor = true;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const queue = new Map();
  let quiet = false;
  let nextId = 1e9;
  let flushTimer = null;

  const flush = () => {
    flushTimer = null;
    if (!queue.size) return;
    const cbs = [...queue.values()];
    queue.clear();
    const t = performance.now();
    for (const cb of cbs) {
      try { cb(t); } catch (e) { setTimeout(() => { throw e; }); }
    }
  };

  window.requestAnimationFrame = (cb) => {
    if (!quiet) return nativeRaf(cb);
    const id = nextId++;
    queue.set(id, cb);                                // se ejecuta al salir del modo quieto
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (queue.has(id)) queue.delete(id);
    else nativeCancel(id);
  };
  window.__cpSetQuiet = (q) => {
    quiet = !!q;
    if (!quiet) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      const pending = [...queue.values()];
      queue.clear();
      for (const cb of pending) nativeRaf(cb);       // retomar a 60 fps en el siguiente frame
    }
  };
}
