import { memo, useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Sparkles, Zap, ArrowRight, Flame, Plus, ChevronDown, CalendarClock } from "lucide-react";
import { getEventConfig } from "@/lib/eventConfig";
import { localDate } from "@/lib/apiMsg";

/**
 * Big animated hero banner replacing the 4 stat cards.
 * Shows: current-month events (big) + total events + animated ticker of upcoming events.
 *
 * Rendimiento: fondo estático (sin partículas ni orbes girando con blur); el ticker que
 * rota cada 3 s vive en <MonthTicker> (solo se redibuja esa línea y se pausa con la
 * ventana oculta) y el número grande que cuenta hacia arriba en <CountUp>.
 */

// Sin animaciones (ajuste «Animaciones» apagado o el sistema pide menos movimiento)
const motionOff = () =>
  typeof document !== "undefined" &&
  (document.documentElement.dataset.animations === "false" ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));

function useCounter(target, duration = 1200) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (target === undefined || target === null) return;
    if (motionOff()) { setDisplay(target); return; }
    const start = performance.now();
    const from = 0;
    const tick = (t) => {
      const p = Math.min((t - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 4);
      setDisplay(Math.round(from + (target - from) * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return display;
}

// Número que cuenta hacia arriba, aislado para que el conteo no redibuje todo el banner
const CountUp = memo(function CountUp({ value, duration }) {
  return useCounter(value, duration);
});

// Índice que avanza cada `ms`; se detiene mientras la ventana está oculta/minimizada
function useRotation(count, ms) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    let id = null;
    const start = () => { if (id === null) id = setInterval(() => setIdx((i) => (i + 1) % count), ms); };
    const stop = () => { if (id !== null) { clearInterval(id); id = null; } };
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [count, ms]);
  return [idx, setIdx];
}

// Ticker of upcoming events (rotates every 3s). Owns its index so each tick only re-renders this line.
const MonthTicker = memo(function MonthTicker({ monthEvents, onViewAll }) {
  const [tickerIdx] = useRotation(monthEvents.length, 3000);
  const tickerEvent = monthEvents[tickerIdx];
  const tickerCfg = tickerEvent ? getEventConfig(tickerEvent.event_type) : null;
  const TickerIcon = tickerCfg?.icon;
  if (!tickerEvent) return null;

  return (
    <div className="mt-6 relative h-14">
      <AnimatePresence mode="wait">
        <motion.button
          key={tickerEvent.id}
          onClick={onViewAll}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
          exit={{ opacity: 0, y: -12, transition: { duration: 0.15 } }}
          className="absolute inset-0 flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.20)",
          }}
          data-testid="banner-ticker"
        >
          {TickerIcon && (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: tickerCfg.fg }}
            >
              <TickerIcon size={16} className="text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm truncate" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>
              {tickerEvent.event_type || "Evento"}
              {tickerEvent.client_name ? ` · ${tickerEvent.client_name}` : ""}
            </p>
            <p className="text-white/60 text-xs font-semibold">
              {(() => {
                if (!tickerEvent.event_date) return "";
                const [y, m, d] = tickerEvent.event_date.split("-");
                return `${d}/${m}/${y}`;
              })()}
            </p>
          </div>
          <ArrowRight size={16} className="text-white/70 flex-shrink-0" />
        </motion.button>
      </AnimatePresence>
    </div>
  );
});

export default function MonthlyEventsBanner({
  monthEvents = [],
  pendingEvents = [],
  nextMonthName = "",
  monthName = "",
  language = "es",
  onCreate,
  onViewAll,
  onEventClick,
}) {
  const monthCount = monthEvents.length;
  // primer evento del mes DE HOY EN ADELANTE (antes tomaba el primero del mes aunque ya
  // hubiera pasado, y mostraba "Un evento es HOY")
  const todayStr = localDate();
  const nextEvent = monthEvents.find(e => (e.event_date || "") >= todayStr) || null; // ya vienen en orden
  const pendingCount = pendingEvents.length;
  const [upcomingOpen, setUpcomingOpen] = useState(false);

  // Sorted list of upcoming pending events (asc by date), cap for display
  const upcomingList = useMemo(() => {
    return [...pendingEvents]
      .filter(e => !!e.event_date)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .slice(0, 6);
  }, [pendingEvents]);

  // Month labels for date formatting
  const monthLabels = useMemo(() => {
    const es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const en = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return language === "es" ? es : en;
  }, [language]);

  // Days until next event
  let daysToNext = null;
  if (nextEvent?.event_date) {
    const [y, m, d] = nextEvent.event_date.split("-");
    const ev = new Date(+y, +m - 1, +d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    daysToNext = Math.max(0, Math.round((ev - today) / 86400000));
  }

  const isHot = monthCount >= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[32px] mb-8 shadow-2xl"
      style={{
        background:
          "linear-gradient(120deg, #0f172a 0%, #1e1b4b 30%, #4c1d95 65%, #831843 100%)",
        boxShadow: "0 30px 80px -20px rgba(76, 29, 149, 0.55)",
      }}
      data-testid="monthly-events-banner"
    >
      {/* Gradient overlay (quieto) */}
      <div
        className="absolute inset-0 opacity-70 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 80% at 20% 20%, rgba(236,72,153,0.35), transparent 60%), radial-gradient(50% 80% at 80% 80%, rgba(59,130,246,0.35), transparent 60%)",
        }}
      />

      {/* Grain / noise-ish texture using SVG */}
      <div
        className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence baseFrequency='0.9'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      {/* Halos de color en las esquinas: antes eran orbes cónicos girando con blur(60-80px);
          ahora quietos y sin filtro (un degradado radial suave da el mismo halo, mismo centro) */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          right: -216, top: -216, width: 624, height: 624,
          background:
            "radial-gradient(circle closest-side, rgba(110,119,214,0.98) 0%, rgba(110,119,214,0.97) 23%, rgba(110,119,214,0.84) 42%, rgba(110,119,214,0.5) 62%, rgba(110,119,214,0.16) 81%, rgba(110,119,214,0) 100%)",
          opacity: 0.35,
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          left: -288, bottom: -288, width: 740, height: 740,
          background:
            "radial-gradient(circle closest-side, rgba(218,91,141,0.98) 0%, rgba(218,91,141,0.97) 14%, rgba(218,91,141,0.84) 35%, rgba(218,91,141,0.5) 57%, rgba(218,91,141,0.16) 78%, rgba(218,91,141,0) 100%)",
          opacity: 0.28,
        }}
      />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 p-8 md:p-10">
        {/* LEFT — Big month number */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }}
            >
              <CalendarDays size={20} className="text-white" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-white/70 font-black">
                {language === "es" ? "Eventos de" : "Events in"} {monthName}
              </p>
              <p className="text-xs text-white/50 mt-0.5 font-semibold">
                {language === "es" ? "Enfócate en este mes" : "Focus on this month"}
              </p>
            </div>
            {isHot && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease: "easeOut", delay: 0.2 }}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider"
                style={{
                  background: "linear-gradient(135deg,#f97316,#ec4899)",
                  color: "white",
                  boxShadow: "0 6px 20px -4px rgba(236,72,153,0.6)",
                }}
              >
                <span>
                  <Flame size={12} />
                </span>
                {language === "es" ? "Mes activo" : "Hot month"}
              </motion.div>
            )}
          </div>

          {/* Giant number */}
          <div className="flex items-end gap-6 flex-wrap">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: "easeOut", delay: 0.1 }}
              className="relative"
              style={{ paddingBottom: "0.5rem", paddingTop: "0.5rem" }}
            >
              <p
                className="font-black text-white"
                style={{
                  fontFamily: "Cabinet Grotesk, sans-serif",
                  fontSize: "clamp(6rem, 14vw, 11rem)",
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                  textShadow: "0 4px 40px rgba(236,72,153,0.4)",
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #fce7f3 40%, #c4b5fd 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  paddingBottom: "0.15em",
                  paddingRight: "0.12em",
                  display: "inline-block",
                  overflow: "visible",
                }}
                data-testid="banner-month-count"
              >
                <CountUp value={monthCount} duration={1000} />
              </p>
              <span className="absolute -right-4 -top-2">
                <Sparkles size={22} className="text-pink-300" />
              </span>
            </motion.div>

            <div className="pb-4 min-w-[220px] flex-1">
              <p
                className="text-white font-black leading-[1.1] tracking-tight"
                style={{
                  fontFamily: "Cabinet Grotesk, sans-serif",
                  fontSize: "clamp(1.5rem, 2.6vw, 2.25rem)",
                  textShadow: "0 2px 20px rgba(0,0,0,0.25)",
                }}
                data-testid="banner-month-label"
              >
                {monthCount === 0
                  ? (language === "es" ? "Sin eventos este mes" : "No events this month")
                  : monthCount === 1
                  ? (language === "es" ? "Reserva confirmada este mes" : "Reservation confirmed this month")
                  : (language === "es" ? "Reservas confirmadas este mes" : "Reservations confirmed this month")}
              </p>
              {daysToNext !== null && nextEvent && (
                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.2 }}
                  className="text-white/85 text-base mt-3 font-bold flex items-center gap-2"
                >
                  <Zap size={16} className="text-yellow-300" />
                  {daysToNext === 0
                    ? (language === "es" ? "Un evento es HOY" : "An event is TODAY")
                    : daysToNext === 1
                    ? (language === "es" ? "Próximo evento: mañana" : "Next event: tomorrow")
                    : (language === "es" ? `Próximo evento en ${daysToNext} días` : `Next event in ${daysToNext} days`)}
                </motion.p>
              )}
            </div>
          </div>

          {/* Ticker of upcoming events */}
          <MonthTicker monthEvents={monthEvents} onViewAll={onViewAll} />
        </div>

        {/* RIGHT — Clean "Próximos eventos" with hover/click reveal + CTA */}
        <div className="flex flex-col justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.25 }}
            onMouseEnter={() => setUpcomingOpen(true)}
            onMouseLeave={() => setUpcomingOpen(false)}
            className="rounded-3xl relative overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
            data-testid="banner-upcoming-card"
          >
            <div
              className="absolute -right-8 -top-8 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%)", opacity: 0.8 }}
            />

            {/* Header — clickable to toggle on mobile */}
            <button
              type="button"
              onClick={() => setUpcomingOpen(o => !o)}
              className="w-full text-left p-6 flex items-center gap-4 relative z-10"
              data-testid="banner-upcoming-toggle"
              aria-expanded={upcomingOpen}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg,#f472b6,#a78bfa)",
                  boxShadow: "0 8px 20px -6px rgba(168,85,247,0.55)",
                }}
              >
                <CalendarClock size={22} className="text-white" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-white font-black leading-tight"
                  style={{
                    fontFamily: "Cabinet Grotesk, sans-serif",
                    fontSize: "clamp(1.35rem, 2vw, 1.75rem)",
                  }}
                >
                  {language === "es" ? "Próximos eventos" : "Upcoming events"}
                </p>
                <p className="text-white/70 text-sm font-semibold mt-0.5">
                  {pendingCount === 0
                    ? (language === "es" ? "Sin eventos pendientes" : "No pending events")
                    : pendingCount === 1
                    ? (language === "es" ? "1 evento pendiente" : "1 pending event")
                    : (language === "es" ? `${pendingCount} eventos pendientes` : `${pendingCount} pending events`)}
                </p>
              </div>
              <motion.div
                animate={{ rotate: upcomingOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)" }}
              >
                <ChevronDown size={18} className="text-white" />
              </motion.div>
            </button>

            {/* Expandable list (solo opacidad: animar la altura recalcula el diseño en cada cuadro) */}
            <AnimatePresence initial={false}>
              {upcomingOpen && upcomingList.length > 0 && (
                <motion.div
                  key="upcoming-list"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  className="relative z-10 overflow-hidden"
                  data-testid="banner-upcoming-list"
                >
                  <div className="px-4 pb-4 space-y-1.5 max-h-[280px] overflow-y-auto">
                    {upcomingList.map((ev, i) => {
                      const cfg = getEventConfig(ev.event_type);
                      const Icon = cfg?.icon;
                      let dateLabel = "";
                      if (ev.event_date) {
                        const [y, m, d] = ev.event_date.split("-");
                        dateLabel = `${d} ${monthLabels[parseInt(m, 10) - 1]}`;
                      }
                      return (
                        <motion.button
                          key={ev.id || i}
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.2 }}
                          onClick={() => onEventClick && onEventClick(ev.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left group hover:bg-white/10 transition-colors"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                          data-testid={`banner-upcoming-item-${i}`}
                        >
                          {Icon && (
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: cfg.fg }}
                            >
                              <Icon size={14} className="text-white" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm truncate">
                              {ev.event_type || (language === "es" ? "Evento" : "Event")}
                              {ev.client_name ? ` · ${ev.client_name}` : ""}
                            </p>
                            <p className="text-white/60 text-xs font-semibold">{dateLabel}</p>
                          </div>
                          <ArrowRight
                            size={14}
                            className="text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0"
                          />
                        </motion.button>
                      );
                    })}
                    {pendingCount > upcomingList.length && (
                      <button
                        type="button"
                        onClick={onViewAll}
                        className="w-full text-center text-white/80 hover:text-white text-xs font-black uppercase tracking-widest py-2 mt-1"
                        data-testid="banner-upcoming-viewall"
                      >
                        {language === "es"
                          ? `Ver los ${pendingCount} eventos →`
                          : `View all ${pendingCount} events →`}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
              {upcomingOpen && upcomingList.length === 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.2 } }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  className="px-6 pb-6 text-white/60 text-sm font-semibold relative z-10"
                >
                  {language === "es"
                    ? `Aún sin eventos para ${nextMonthName || "los próximos meses"}`
                    : `No events yet for ${nextMonthName || "upcoming months"}`}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onCreate}
            data-testid="banner-create-btn"
            className="group relative w-full rounded-2xl px-6 py-4 font-black text-sm text-white uppercase tracking-widest flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg,#ec4899 0%,#a855f7 60%,#3b82f6 100%)",
              boxShadow: "0 10px 30px -8px rgba(168,85,247,0.5)",
            }}
          >
            {/* Sombra de hover: aparece con opacidad (antes se animaba box-shadow cuadro a cuadro) */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              style={{ boxShadow: "0 20px 40px -12px rgba(236,72,153,0.55)" }}
            />
            <Plus size={16} />
            {language === "es" ? "Nueva Reserva" : "New Reservation"}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
