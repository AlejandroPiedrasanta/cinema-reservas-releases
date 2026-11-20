import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Sparkles, Loader2, RefreshCw, AlertTriangle, ChevronDown, ArrowDownCircle, ShieldCheck } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { apiMsg } from "@/lib/apiMsg";
import { checkGithubUpdates, applyGithubUpdate, getUpdateProgress, getUpdatesHistory } from "@/lib/api";

function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return ""; }
}

/** Convierte las notas de la versión (markdown sencillo) en una lista de frases. */
function notesToItems(md) {
  return (md || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^para empezar/i.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1"))
    .filter((l) => l.length > 2)
    .slice(0, 12);
}

/**
 * Actualizaciones, versión simple (app instalada con licencia): estado claro, un botón para
 * actualizar y las novedades de cada versión en lenguaje sencillo.
 */
export default function UpdatesSimple({ localVersion }) {
  const { toast } = useToast();
  const { autoCheckUpdates, changeAutoCheckUpdates } = useSettings();
  const [state, setState] = useState("checking");    // checking | latest | available | installing | error
  const [remote, setRemote] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(null);
  const timer = useRef(null);

  const check = useCallback(async () => {
    setState("checking"); setError("");
    try {
      const r = await checkGithubUpdates();
      setRemote(r.remote_version || "");
      setState(r.has_updates ? "available" : "latest");
    } catch (e) {
      setError(apiMsg(e, "No se pudo revisar. Comprueba tu conexión a internet."));
      setState("error");
    }
  }, []);

  useEffect(() => {
    check();
    getUpdatesHistory().then((h) => {
      const list = (h || []).filter((v) => v.created_at);
      setHistory(list);
      setOpen(list[0]?.version || null);
    }).catch(() => {});
    return () => clearInterval(timer.current);
  }, [check]);

  const install = async () => {
    setState("installing"); setProgress({ percent: 0, stage: "downloading" });
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try { setProgress(await getUpdateProgress()); } catch { /* la app se está cerrando */ }
    }, 700);
    try {
      const r = await applyGithubUpdate(true);
      if (r.restarted) {
        toast({ title: "Instalando la versión nueva…", description: "Cinema Reservas se cerrará y volverá a abrirse sola." });
        return;                                          // el instalador cierra y reabre la app
      }
      clearInterval(timer.current);
      if (r.download_url) {
        window.open(r.download_url, "_blank");
        setState("available");
        toast({ title: "Descargando la versión nueva", description: r.message });
      } else {
        setState("latest");
        toast({ title: r.message || "Ya tienes la versión más reciente" });
      }
    } catch (e) {
      clearInterval(timer.current);
      setError(apiMsg(e, "No se pudo instalar la actualización."));
      setState("error");
    }
  };

  const pct = Math.max(3, Math.min(100, Math.round(progress?.percent || 0)));
  const stageText = progress?.stage === "installing" ? "Instalando… la app se cerrará y se abrirá sola"
    : progress?.stage === "error" ? (progress?.error || "Hubo un problema")
    : "Descargando la versión nueva…";

  const hero = {
    checking: { bg: "linear-gradient(135deg,#64748b,#334155)", icon: <Loader2 size={30} className="animate-spin" />,
      title: "Buscando actualizaciones…", sub: `Tienes la versión ${localVersion}` },
    latest: { bg: "linear-gradient(135deg,#059669,#10b981 60%,#34d399)", icon: <CheckCircle2 size={30} />,
      title: "Estás al día", sub: `Tienes la versión más reciente: ${localVersion}` },
    available: { bg: "linear-gradient(135deg,#4f46e5,#7c3aed 55%,#db2777)", icon: <Sparkles size={30} />,
      title: `Hay una versión nueva: ${remote}`, sub: `Tienes la ${localVersion}. Se instala sola en un minuto.` },
    installing: { bg: "linear-gradient(135deg,#4f46e5,#7c3aed 55%,#db2777)", icon: <Loader2 size={30} className="animate-spin" />,
      title: `Actualizando a la ${remote}`, sub: stageText },
    error: { bg: "linear-gradient(135deg,#b45309,#d97706)", icon: <AlertTriangle size={30} />,
      title: "No se pudo completar", sub: error },
  }[state];

  return (
    <div className="space-y-5" data-testid="updates-simple">
      {/* Estado */}
      <div className="relative overflow-hidden rounded-[28px] p-6 sm:p-7 text-white shadow-lg" style={{ background: hero.bg }} data-testid={`updates-state-${state}`}>
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full border-4 border-white/15" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">{hero.icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-black leading-tight" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>{hero.title}</p>
            <p className="text-sm text-white/85 mt-1">{hero.sub}</p>
            {state === "installing" && (
              <div className="mt-3 h-2 rounded-full bg-white/25 overflow-hidden max-w-md">
                <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
          {state === "available" && (
            <button type="button" onClick={install} data-testid="updates-install"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-indigo-700 text-sm font-black shadow-md hover:bg-white/90 shrink-0">
              <ArrowDownCircle size={16} /> Actualizar ahora
            </button>
          )}
          {(state === "latest" || state === "error") && (
            <button type="button" onClick={check} data-testid="updates-check"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-black shrink-0">
              <RefreshCw size={14} /> Buscar de nuevo
            </button>
          )}
        </div>
      </div>

      {state === "available" && (
        <p className="flex items-center gap-2 text-xs text-slate-500 px-1">
          <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
          Tus reservas, socios y ajustes se conservan. La app se cerrará y volverá a abrirse sola.
        </p>
      )}

      {/* Revisión automática */}
      <div className="glass rounded-3xl px-5 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">Buscar actualizaciones al abrir la app</p>
          <p className="text-[11px] text-slate-500">Te avisamos cuando haya una versión nueva.</p>
        </div>
        <button type="button" role="switch" aria-checked={autoCheckUpdates} data-testid="auto-check-toggle"
          onClick={() => changeAutoCheckUpdates(!autoCheckUpdates)}
          className={`relative w-12 h-6 rounded-full transition-all shrink-0 ${autoCheckUpdates ? "btn-primary" : "bg-slate-200"}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${autoCheckUpdates ? "left-[26px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* Novedades */}
      <div className="glass rounded-3xl overflow-hidden" data-testid="updates-news">
        <div className="px-6 pt-5 pb-3">
          <p className="text-lg font-black text-slate-900" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>Novedades</p>
          <p className="text-xs text-slate-500">Lo que trae cada versión.</p>
        </div>
        {history.length === 0 ? (
          <p className="px-6 pb-6 text-xs text-slate-400">Las novedades aparecerán aquí cuando haya conexión.</p>
        ) : (
          <div className="divide-y divide-white/40">
            {history.slice(0, 8).map((v) => {
              const items = notesToItems(v.body);
              const isOpen = open === v.version;
              const isNewer = remote && v.version === remote && state === "available";
              return (
                <div key={v.version} className="px-6 py-3">
                  <button type="button" onClick={() => setOpen(isOpen ? null : v.version)}
                    className="w-full flex items-center gap-3 text-left">
                    <span className="text-base font-black text-slate-900" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>Versión {v.version}</span>
                    {v.is_latest && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">LA TUYA</span>}
                    {isNewer && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">NUEVA</span>}
                    <span className="text-xs text-slate-400 ml-auto">{fmtDate(v.created_at)}</span>
                    <ChevronDown size={15} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    items.length ? (
                      <ul className="mt-2.5 mb-1 space-y-1.5">
                        {items.map((t, i) => (
                          <li key={i} className="flex gap-2 text-[13px] text-slate-600 leading-snug">
                            <span className="text-indigo-500 mt-0.5">•</span><span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-xs text-slate-400">Mejoras y correcciones.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
