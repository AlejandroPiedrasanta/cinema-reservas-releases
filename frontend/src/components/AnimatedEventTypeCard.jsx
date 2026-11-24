import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getEventConfig } from "@/lib/eventConfig";

// Sin animaciones (ajuste «Animaciones» apagado o el sistema pide menos movimiento) o con la
// ventana oculta, el número aparece directamente: el contador re-renderiza la tarjeta en cada frame.
const skipMotion = () => {
  try {
    return document.documentElement.dataset.animations === "false" || document.hidden ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch { return false; }
};

function useCounter(target, duration = 900) {
  const [n, setN] = useState(() => (skipMotion() ? target : 0));
  const raf = useRef(null);
  useEffect(() => {
    if (skipMotion()) { setN(target); return undefined; }
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 4);
      setN(Math.round(target * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return n;
}

const hexA = (hex, a) => {
  const h = hex.replace("#", "");
  const b = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const r = parseInt(b.slice(0, 2), 16);
  const g = parseInt(b.slice(2, 4), 16);
  const bl = parseInt(b.slice(4, 6), 16);
  return `rgba(${r},${g},${bl},${a})`;
};

/**
 * Clean, readable event-type card.
 * - White background with subtle color-tinted glow
 * - Big dark number (very legible)
 * - Colored icon + type name
 * - Animated horizontal progress bar
 * - Subtle hover lift
 */
export default function AnimatedEventTypeCard({ type, count, total, paidCount = 0, index, language = "es" }) {
  const cfg = getEventConfig(type);
  const Icon = cfg.icon;
  const pct = total > 0 ? Math.round((paidCount / total) * 100) : 0;
  const num = useCounter(paidCount, 500 + Math.min(index, 6) * 40);
  const isAllPaid = total > 0 && paidCount >= total;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, delay: Math.min(index, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, scale: 1.02, transition: { duration: 0.2 } }}
      className="relative overflow-hidden rounded-3xl bg-white cursor-default group"
      style={{
        border: `1px solid ${hexA(cfg.fg, 0.15)}`,
        boxShadow: `0 8px 28px -12px ${hexA(cfg.fg, 0.35)}, 0 2px 6px rgba(15,23,42,0.05)`,
        padding: "22px",
      }}
      data-testid={`event-type-card-${type.replace(/\s+/g, "-").toLowerCase()}`}
    >
      {/* Corner color accent glow (quieto, opacidad media de la animación anterior) */}
      <div
        className="absolute -right-16 -top-16 w-40 h-40 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${hexA(cfg.fg, 0.28)}, transparent 70%)`,
          opacity: 0.85,
        }}
      />

      {/* Top center pill accent */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-2 h-1.5 w-14 rounded-full"
        style={{ background: `linear-gradient(90deg, ${cfg.fg}, ${hexA(cfg.fg, 0.4)})` }}
      />

      <div className="relative z-10">
        {/* Header row: icon + type name */}
        <div className="flex items-center gap-3 mb-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 + Math.min(index, 6) * 0.04 }}
            whileHover={{ rotate: [0, -8, 8, 0], transition: { duration: 0.5 } }}
            className="relative w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${cfg.fg}, ${hexA(cfg.fg, 0.75)})`,
              boxShadow: `0 6px 16px -4px ${hexA(cfg.fg, 0.5)}`,
            }}
          >
            <Icon size={20} className="text-white relative" strokeWidth={2.1} />
          </motion.div>
          <p
            className="text-base font-black text-slate-900 leading-tight flex-1 truncate"
            style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}
            title={type}
          >
            {type}
          </p>
        </div>

        {/* Big number */}
        <div className="flex items-baseline gap-2 mb-3">
          <motion.p
            className="text-5xl font-black tracking-tight leading-none text-slate-900"
            style={{ fontFamily: "Cabinet Grotesk, sans-serif", paddingBottom: "0.1em" }}
          >
            {num}
          </motion.p>
          <span className="text-sm font-bold text-slate-400">
            / {total}
          </span>
          <span
            className="ml-auto text-xs font-black px-2.5 py-1 rounded-full"
            style={{
              background: isAllPaid ? "rgba(16,185,129,0.14)" : hexA(cfg.fg, 0.12),
              color: isAllPaid ? "#059669" : cfg.fg,
            }}
          >
            {pct}%
          </span>
        </div>

        {/* Horizontal progress bar */}
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: hexA(cfg.fg, 0.12) }}
        >
          {/* Entra con scaleX (transform) en vez de animar width; sin brillo infinito */}
          <motion.div
            className="h-full rounded-full relative overflow-hidden"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: 0.1 + Math.min(index, 6) * 0.04 }}
            style={{
              width: `${pct}%`,
              transformOrigin: "left",
              background: isAllPaid
                ? "linear-gradient(90deg,#10b981,#22c55e)"
                : `linear-gradient(90deg, ${cfg.fg}, ${hexA(cfg.fg, 0.7)})`,
            }}
          />
        </div>

        {/* Subtitle */}
        <p className="text-[11px] text-slate-500 font-semibold mt-2 uppercase tracking-wider flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: isAllPaid ? "#10b981" : cfg.fg }}
          />
          {language === "es"
            ? `${paidCount} pagado${paidCount === 1 ? "" : "s"} de ${total}`
            : `${paidCount} paid of ${total}`}
        </p>
      </div>
    </motion.div>
  );
}
