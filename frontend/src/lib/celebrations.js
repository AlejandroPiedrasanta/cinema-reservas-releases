// ═══════════════════════════════════════════════════════════════════
// Celebrations — confeti y efectos para momentos importantes
//
// Rendimiento (Windows y Mac/Retina): antes era un lienzo a pantalla completa redibujado
// 60 veces por segundo durante 4-5 s (cientos de piezas) justo después de guardar. Ahora:
// · pocas piezas (≤ ~60), que duran ≤ 1,5 s;
// · cada pieza es un elemento pequeño que solo cambia transform/opacidad con la Web
//   Animations API: lo mueve la tarjeta gráfica, el hilo principal queda libre;
// · con «Animaciones» apagadas, «reducir movimiento» del sistema o la ventana oculta no
//   se lanza nada.
// · Capa propia ENCIMA de todo (incluidas ventanas como «¡Meta alcanzada!»), sin bloquear
//   clics. Si llegan varias celebraciones a la vez se juntan en una sola.
// · Colores del tema activo + paleta de cada tipo; lluvia de dinero con 💵 🪙 💰.
// ═══════════════════════════════════════════════════════════════════

const motionOff = () => {
  try {
    if (typeof document === "undefined" || document.hidden) return true;
    if (document.documentElement.dataset.animations === "false") return true;
    if (typeof Element === "undefined" || !Element.prototype.animate) return true;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch { return true; }
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

// ── Motor mínimo: piezas DOM animadas solo con transform/opacity ──────────
let _layer = null;
let _live = 0;
function layer() {
  if (_layer && _layer.isConnected) return _layer;
  _layer = document.createElement("div");
  _layer.id = "cp-confetti";
  _layer.setAttribute("aria-hidden", "true");
  Object.assign(_layer.style, {
    position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483000",
    overflow: "hidden", contain: "strict",
  });
  document.body.appendChild(_layer);
  _live = 0;
  return _layer;
}
function release() {
  _live -= 1;
  if (_live <= 0 && _layer) { _layer.remove(); _layer = null; _live = 0; }
}

const STAR = "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function piece(x, y, { color, shape, size, text }) {
  const el = document.createElement("span");
  const s = el.style;
  s.position = "absolute";
  s.left = `${x}px`;
  s.top = `${y}px`;
  if (text) {
    el.textContent = text;
    s.fontSize = `${size}px`;
    s.lineHeight = "1";
  } else {
    s.width = `${size}px`;
    s.height = `${shape === "square" ? Math.round(size * 0.6) : size}px`;
    s.background = color;
    if (shape === "circle") s.borderRadius = "50%";
    else if (shape === "star") s.clipPath = STAR;
    else s.borderRadius = "2px";
  }
  return el;
}

function launch(items) {
  if (!items.length) return;
  const root = layer();
  const frag = document.createDocumentFragment();
  for (const it of items) frag.appendChild(it.el);
  root.appendChild(frag);
  _live += items.length;
  for (const { el, keyframes, options } of items) {
    try {
      const an = el.animate(keyframes, { fill: "both", ...options });
      an.onfinish = () => { el.remove(); release(); };
      an.oncancel = an.onfinish;
    } catch { el.remove(); release(); }
  }
}

// Abanico de piezas desde un punto (origin en 0..1). angle: 90 = hacia arriba.
function burst({ origin, count, colors, angle = 90, spread = 80, power = 1, shapes = ["square", "circle"], duration = 1200, delay = 0, size = [6, 11] }) {
  const W = window.innerWidth, H = window.innerHeight;
  const ox = origin.x * W, oy = origin.y * H;
  const reach = Math.min(W, H) * 0.42 * power;
  const items = [];
  for (let i = 0; i < count; i++) {
    const a = ((angle + rand(-spread / 2, spread / 2)) * Math.PI) / 180;
    const v = reach * rand(0.5, 1);
    const dx = Math.cos(a) * v;
    const up = Math.sin(a) * v;
    const fall = H * rand(0.16, 0.3);
    const rot = rand(-540, 540);
    const el = piece(ox, oy, { color: pick(colors), shape: pick(shapes), size: rand(size[0], size[1]) });
    items.push({
      el,
      keyframes: [
        { transform: "translate(0px,0px) rotate(0deg)", opacity: 1, offset: 0, easing: "cubic-bezier(.15,.7,.35,1)" },
        { transform: `translate(${(dx * 0.8).toFixed(1)}px,${(-up).toFixed(1)}px) rotate(${(rot * 0.5).toFixed(0)}deg)`, opacity: 1, offset: 0.4, easing: "cubic-bezier(.5,0,.85,.6)" },
        { transform: `translate(${dx.toFixed(1)}px,${(fall - up).toFixed(1)}px) rotate(${rot.toFixed(0)}deg)`, opacity: 0, offset: 1 },
      ],
      options: { duration: duration * rand(0.85, 1), delay },
    });
  }
  launch(items);
}

// Lluvia desde arriba (estrellas, billetes)
function rain({ count, colors = [], shapes = ["star"], texts = null, duration = 1100, spreadTime = 400, size = [8, 13] }) {
  const W = window.innerWidth, H = window.innerHeight;
  const items = [];
  for (let i = 0; i < count; i++) {
    const el = piece(rand(0, W), -40, {
      color: pick(colors.length ? colors : ["#fbbf24"]), shape: pick(shapes),
      size: rand(size[0], size[1]), text: texts ? pick(texts) : null,
    });
    const drift = rand(-60, 60), rot = rand(-220, 220), dist = H * rand(0.75, 1.05);
    items.push({
      el,
      keyframes: [
        { transform: "translate(0px,0px) rotate(0deg)", opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.7 },
        { transform: `translate(${drift.toFixed(1)}px,${dist.toFixed(1)}px) rotate(${rot.toFixed(0)}deg)`, opacity: 0, offset: 1 },
      ],
      options: { duration, delay: rand(0, spreadTime), easing: "cubic-bezier(.35,0,.65,1)" },
    });
  }
  launch(items);
}

const safe = (fn) => { try { fn(); } catch (e) { console.warn("[confetti]", e?.message || e); } };

// Explosión desde un punto (guardar reserva, socio, meta…)
export const fireConfetti = (type = "success", origin = { x: 0.5, y: 0.65 }) => {
  if (motionOff() || !allow(1)) return;
  safe(() => burst({ origin, count: 36, colors: colorsFor(type), spread: 90, shapes: ["square", "circle", "star"] }));
};

// Dos cañones laterales + estallido central (pago completo, actualización, tutorial)
export const fireEpic = (type = "success") => {
  if (motionOff() || !allow(2)) return;
  const colors = colorsFor(type);
  safe(() => {
    burst({ origin: { x: 0, y: 0.72 }, count: 16, colors, angle: 60, spread: 45, power: 1.35, duration: 1100 });
    burst({ origin: { x: 1, y: 0.72 }, count: 16, colors, angle: 120, spread: 45, power: 1.35, duration: 1100 });
    burst({ origin: { x: 0.5, y: 0.5 }, count: 22, colors, spread: 160, power: 0.9, duration: 1150, delay: 280 });
    burst({ origin: { x: 0.5, y: 0.5 }, count: 6, colors: ["#fbbf24", "#fde68a"], spread: 160, power: 0.8, shapes: ["star"], duration: 1150, delay: 280, size: [10, 14] });
  });
};

// Lluvia suave de estrellas (abonos / pagos)
export const fireStars = (type = "payment") => {
  if (motionOff() || !allow(1)) return;
  safe(() => rain({ count: 18, colors: colorsFor(type), shapes: ["star"], duration: 1100, spreadTime: 380, size: [9, 15] }));
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
// (durationMs se mantiene por compatibilidad; la lluvia dura como máximo ~1,5 s)
// eslint-disable-next-line no-unused-vars
export const fireMoneyRain = (durationMs = 1500) => {
  if (motionOff() || !allow(3)) return;
  safe(() => {
    rain({ count: 14, texts: ["💵", "🪙", "💰"], duration: 1150, spreadTime: 350, size: [22, 30] });
    burst({
      origin: { x: 0.5, y: 0.55 }, count: 22, spread: 140, power: 0.9, duration: 1100, delay: 120,
      colors: ["#10b981", "#34d399", "#fbbf24", "#f59e0b", "#fde68a", ...themeColors()],
    });
  });
};

export const celebrateGoalReached = () => {
  fireMoneyRain();
  triggerSidebarSweep("emerald");
};
