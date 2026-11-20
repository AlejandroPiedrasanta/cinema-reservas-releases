// Mensaje legible de un error de la API (axios o fetch).
// El servidor manda {detail: "texto en español"}; versiones antiguas mandaban una lista
// de objetos, que pasada tal cual a un toast rompia la pantalla.
export function apiMsg(err, fallback = "Inténtalo de nuevo.") {
  const d = err?.response?.data?.detail ?? err?.detail;
  if (typeof d === "string" && d.trim()) return d;
  if (Array.isArray(d) && d.length) {
    return d.map((x) => (typeof x === "string" ? x : x?.msg || "")).filter(Boolean).join("; ") || fallback;
  }
  if (d && typeof d === "object") return d.message || d.msg || fallback;
  if (err && !err.response && (err.code === "ERR_NETWORK" || err.message === "Network Error")) {
    return "No se pudo conectar con el servidor de Cinema Reservas.";
  }
  return fallback;
}

// Fecha local AAAA-MM-DD (toISOString usa UTC: en America, desde la tarde, daba el dia siguiente).
export function localDate(date = new Date(), addDays = 0) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + addDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
