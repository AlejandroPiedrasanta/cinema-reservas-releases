// Aviso único cuando la app pierde contacto con su servidor interno.
// En lugar de mostrar un error rojo por cada cosa que no cargó, se ve un solo
// «Reconectando…»; cuando el servidor vuelve, la página se recarga sola.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ServerStatus() {
  const [state, setState] = useState("ok"); // ok | down | back
  const downSince = useRef(0);

  useEffect(() => {
    const onDown = () => {
      if (downSince.current) return;
      downSince.current = Date.now();
      setState("down");
    };
    window.addEventListener("cp:server-down", onDown);
    return () => window.removeEventListener("cp:server-down", onDown);
  }, []);

  useEffect(() => {
    if (state !== "down") return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/", { cache: "no-store" });
        if (!alive) return;
        if (r.ok) {
          const long = Date.now() - downSince.current > 1500;
          downSince.current = 0;
          window.__cpServerDown = 0;
          setState("back");
          setTimeout(() => {
            if (long) window.location.reload();
            else setState("ok");
          }, 700);
          return;
        }
      } catch { /* sigue caído */ }
      if (alive) setTimeout(tick, 1500);
    };
    const id = setTimeout(tick, 1200);
    return () => { alive = false; clearTimeout(id); };
  }, [state]);

  return (
    <AnimatePresence>
      {state !== "ok" && (
        <motion.div key="srv" role="status" aria-live="polite"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[2147482000] flex items-center gap-2 px-4 py-2 rounded-full shadow-xl text-sm font-bold text-white"
          style={{ background: state === "back" ? "#10b981" : "#334155" }} data-testid="server-status">
          {state === "back"
            ? <><CheckCircle2 size={16} /> Conexión restablecida</>
            : <><Loader2 size={16} className="animate-spin" /> Reconectando con la app…</>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
