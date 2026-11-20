// ═══════════════════════════════════════════════════════════════════
// Celebrations — confeti y efectos para momentos importantes
//
// · Capa propia ENCIMA de todo (incluidas ventanas como «¡Meta alcanzada!»), sin
//   bloquear clics.
// · Se dibuja en un hilo aparte (Web Worker + OffscreenCanvas) cuando el sistema lo
//   permite: la app no se traba mientras cae el confeti (Windows y Mac).
// · Si llegan varias celebraciones a la vez (p. ej. 5 metas alcanzadas al abrir Metas)
//   se juntan en una sola: nada de lluvias encimadas.
// · Colores del tema activo + paleta de cada tipo; partículas variadas (círculos,
//   cuadros, estrellas) y lluvia de dinero con billetes y monedas de verdad (💵 🪙).
// ═══════════════════════════════════════════════════════════════════
import confettiLib from "canvas-confetti";

const _lib = (typeof confettiLib === "function")
  ? confettiLib
  : (confettiLib && typeof confettiLib.default === "function" ? confettiLib.default : null);

let _fx = null;        // instancia en hilo aparte (si se puede)
let _fxMain = null;    // instancia en el hilo principal (para figuras con emoji)

function _canvas(id, z) {
  let c = document.getElementById(id);
  if (!c) {
    c = document.createElement("canvas");
    c.id = id;
    c.setAttribute("aria-hidden", "true");
    Object.assign(c.style, {
      position: "fixed", inset: "0", width: "100vw", height: "100vh",
      pointerEvents: "none", zIndex: String(z),
    });
    document.body.appendChild(c);
  }
  return c;
}

function fx() {
  if (_fx || !_lib || typeof document === "undefined") return _fx;
  try {
    _fx = _lib.create(_canvas("cp-confetti", 2147483000), { resize: true, useWorker: true, disableForReducedMotion: true });
  } catch {
    try { _fx = _lib.create(_canvas("cp-confetti", 2147483000), { resize: true, useWorker: false, disableForReducedMotion: true }); }
    catch { _fx = null; }
  }
  return _fx;
}
function fxMain() {
  if (_fxMain || !_lib || typeof document === "undefined") return _fxMain;
  try { _fxMain = _lib.create(_canvas("cp-confetti-main", 2147483001), { resize: true, useWorker: false, disableForReducedMotion: true }); }
  catch { _fxMain = null; }
  return _fxMain;
}

const shoot = (opts, main = false) => {
  try {
    const f = main ? fxMain() : fx();
    if (f) f(opts);
  } catch (e) {
    console.warn("[confetti]", e?.message || e);   // nunca romper el flujo (guardar, etc.)
  }
};

const isReducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

// Colores del tema activo (variables CSS del acento) para que el confeti combine
const themeColors = () => {
  try {
    const cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue("--t-from"), cs.getPropertyValue("--t-to")]
      .map((c) => c.trim()).filter((c) => /^#|^rgb/.test(c));
  } catch { return []; }
};

const PALETTES = {
  reservation: ["#8b5cf6", "#a78bfa", "#c4b5fd", "#f472b6", "#fbbf24"],
  payment:     ["#10b981", "#34d399", "#6ee7b7", "#fbbf24", "#f59e0b"],
  socio:       ["#3b82f6", "#60a5fa", "#93c5fd", "#a78bfa", "#f472b6"],
  update:      ["#f59e0b", "#fbbf24", "#fde68a", "#8b5cf6", "#10b981"],
  tutorial:    ["#ec4899", "#f472b6", "#fbbf24", "#a78bfa", "#10b981"],
  success:     ["#10b981", "#34d399", "#3b82f6", "#8b5cf6", "#fbbf24"],
};
const colorsFor = (type) => [...(PALETTES[type] || PALETTES.success), ...themeColors()];

// Juntar celebraciones que llegan casi a la vez: solo la primera (o la más grande) se ve
let _lastAt = 0;
let _lastWeight = 0;
const allow = (weight) => {
  const now = Date.now();
  if (now - _lastAt < 1600 && weight <= _lastWeight) return false;
  _lastAt = now;
  _lastWeight = weight;
  return true;
};

const base = { disableForReducedMotion: true, ticks: 240, gravity: 1, decay: 0.92 };

// Explosión desde un punto (guardar reserva, socio, meta…)
export const fireConfetti = (type = "success", origin = { x: 0.5, y: 0.65 }) => {
  if (isReducedMotion() || !allow(1)) return;
  const colors = colorsFor(type);
  const burst = (ratio, opts) => shoot({
    ...base, origin, colors, ...opts, particleCount: Math.round(160 * ratio),
  });
  burst(0.25, { spread: 26, startVelocity: 55, shapes: ["circle"] });
  burst(0.2, { spread: 60, scalar: 1.1 });
  burst(0.35, { spread: 100, decay: 0.91, scalar: 0.85, shapes: ["circle", "square"] });
  burst(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.25 });
  burst(0.1, { spread: 120, startVelocity: 45, shapes: ["star"], scalar: 0.9 });
};

// Dos cañones laterales + estallido central (pago completo, actualización, tutorial)
export const fireEpic = (type = "success") => {
  if (isReducedMotion() || !allow(2)) return;
  const colors = colorsFor(type);
  const end = Date.now() + 750;
  const tick = () => {
    shoot({ ...base, particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.72 }, colors, startVelocity: 62 });
    shoot({ ...base, particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.72 }, colors, startVelocity: 62 });
    if (Date.now() < end) setTimeout(tick, 32);
  };
  tick();
  setTimeout(() => {
    shoot({ ...base, particleCount: 110, spread: 150, origin: { x: 0.5, y: 0.5 }, colors, startVelocity: 48, scalar: 1.15, ticks: 300 });
    shoot({ ...base, particleCount: 25, spread: 160, origin: { x: 0.5, y: 0.5 }, colors: ["#fbbf24", "#fde68a"], shapes: ["star"], startVelocity: 40, scalar: 1.2 });
  }, 650);
};

// Lluvia suave de estrellas (abonos / pagos)
export const fireStars = (type = "payment") => {
  if (isReducedMotion() || !allow(1)) return;
  const colors = colorsFor(type);
  const end = Date.now() + 1800;
  const iv = setInterval(() => {
    if (Date.now() > end) { clearInterval(iv); return; }
    shoot({
      ...base, particleCount: 2, startVelocity: 0, gravity: 0.55, ticks: 260, decay: 0.95,
      origin: { x: Math.random(), y: -0.08 }, colors, shapes: ["star"], scalar: Math.random() * 0.7 + 0.7,
    });
  }, 110);
};

// ══════════════ Barrido de luz del menú lateral ══════════════
export const triggerSidebarSweep = (color = "purple") => {
  try { window.dispatchEvent(new CustomEvent("cp:sidebar-sweep", { detail: { color } })); }
  catch (e) { console.warn("[sidebar-sweep]", e?.message || e); }
};

// ══════════════ Celebraciones específicas ══════════════
export const celebrateReservation = () => { fireConfetti("reservation"); triggerSidebarSweep("purple"); };
export const celebratePayment     = () => { fireStars("payment");       triggerSidebarSweep("emerald"); };
export const celebrateFullPayment = () => { fireEpic("payment");        triggerSidebarSweep("emerald"); };
export const celebrateSocio       = () => { fireConfetti("socio", { x: 0.5, y: 0.6 }); triggerSidebarSweep("blue"); };
export const celebrateUpdate      = () => { fireEpic("update");         triggerSidebarSweep("amber"); };
export const celebrateTutorial    = () => { fireEpic("tutorial"); };

// ══════════════ Lluvia de dinero — metas alcanzadas ══════════════
let _money = null;
const moneyShapes = () => {
  if (_money) return _money;
  try {
    const t = _lib && _lib.shapeFromText;
    _money = t ? [t({ text: "💵", scalar: 2.2 }), t({ text: "🪙", scalar: 2 }), t({ text: "💰", scalar: 2.2 })] : [];
  } catch { _money = []; }
  return _money;
};

export const fireMoneyRain = (durationMs = 2600) => {
  if (isReducedMotion() || !allow(3)) return;
  const shapes = moneyShapes();
  const end = Date.now() + durationMs;
  const iv = setInterval(() => {
    if (Date.now() > end) { clearInterval(iv); return; }
    if (shapes.length) {
      // billetes y monedas de verdad (emoji): hilo principal, pocas piezas y grandes
      shoot({
        particleCount: 2, startVelocity: 8, gravity: 0.9, ticks: 320, decay: 0.96, flat: false,
        origin: { x: Math.random(), y: -0.12 }, shapes, scalar: 2.2, drift: (Math.random() - 0.5) * 0.8,
      }, true);
    } else {
      shoot({
        ...base, particleCount: 4, startVelocity: 12, gravity: 1.05, ticks: 300,
        origin: { x: Math.random(), y: -0.12 }, colors: ["#10b981", "#34d399", "#84cc16"], shapes: ["square"], scalar: 1.4,
      });
    }
  }, 120);
  // estallido dorado al empezar
  setTimeout(() => shoot({
    ...base, particleCount: 120, spread: 140, origin: { x: 0.5, y: 0.55 }, startVelocity: 46, scalar: 1.1,
    colors: ["#10b981", "#34d399", "#fbbf24", "#f59e0b", "#fde68a", ...themeColors()],
  }), 250);
};

export const celebrateGoalReached = () => {
  fireMoneyRain(2600);
  triggerSidebarSweep("emerald");
};
