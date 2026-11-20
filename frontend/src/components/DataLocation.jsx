import { useCallback, useEffect, useState } from "react";
import { FolderOpen, FolderInput, HardDrive, Loader2, RotateCcw, ShieldCheck, ArrowRight, AlertTriangle, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getDataLocation, chooseDataFolder, setDataLocation, openDataFolder } from "@/lib/api";
import { apiMsg } from "@/lib/apiMsg";

const SEEN_KEY = "cp_data_location_seen";

function fmtSize(b) {
  if (!b) return "0 KB";
  return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

/**
 * "¿Dónde guardamos tus datos?": tarjeta en Base de Datos + ventana emergente (se abre sola
 * la primera vez) para ver la carpeta y elegir otra. Por defecto, la carpeta del programa.
 */
export default function DataLocation() {
  const { toast } = useToast();
  const [loc, setLoc] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState(null);   // carpeta elegida que ya tiene datos

  const load = useCallback(() => getDataLocation().then(setLoc).catch(() => {}), []);
  useEffect(() => {
    load();
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* ignore */ }
    if (!seen) {
      const t = setTimeout(() => setOpen(true), 450);
      return () => clearTimeout(t);
    }
  }, [load]);

  const close = (v) => {
    setOpen(v);
    if (!v) {
      setPending(null);
      try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    }
  };

  const apply = async (dir, mode) => {
    setBusy("apply");
    try {
      const r = await setDataLocation(dir, mode);
      if (r.needs_choice) { setPending(r); return; }
      setPending(null);
      await load();
      if (r.changed) {
        toast({
          title: r.reloaded ? "Datos abiertos desde la nueva carpeta ✓" : "Tus datos ahora se guardan en la nueva carpeta ✓",
          description: r.previous_dir ? `La copia anterior sigue en ${r.previous_dir}` : undefined,
        });
        if (r.reloaded) setTimeout(() => window.location.reload(), 1200);
      }
    } catch (e) {
      toast({ title: apiMsg(e, "No se pudo cambiar la carpeta"), variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const pick = async () => {
    setBusy("pick");
    try {
      const r = await chooseDataFolder();
      if (r.cancelled) return;
      await apply(r.dir);
    } catch (e) {
      toast({ title: apiMsg(e, "No se pudo abrir el selector de carpetas"), variant: "destructive" });
    } finally {
      setBusy((b) => (b === "pick" ? "" : b));
    }
  };

  const openFolder = () => openDataFolder().catch((e) => toast({ title: apiMsg(e), variant: "destructive" }));

  const PathBox = ({ small }) => (
    <div className={`flex items-start gap-2.5 rounded-2xl bg-slate-50 border border-slate-200 ${small ? "px-3 py-2" : "px-4 py-3"}`}>
      <HardDrive size={small ? 14 : 16} className="text-slate-500 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className={`font-mono text-slate-800 break-all ${small ? "text-[11px]" : "text-xs"}`} data-testid="data-location-path">
          {loc?.dir || "…"}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {loc?.is_default ? "Predeterminada · carpeta del programa" : "Carpeta elegida por ti"}
          {loc?.exists ? ` · ${fmtSize(loc.size)} · guardado ${loc.modified}` : ""}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Tarjeta fija en Base de Datos */}
      <div className="rounded-[28px] border border-slate-200/70 bg-white px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4" data-testid="data-location-card">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
            <FolderOpen size={18} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-black text-slate-900" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>¿Dónde guardamos tus datos?</p>
            <p className="text-xs text-slate-500 font-mono truncate" title={loc?.dir}>{loc?.dir || "…"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" onClick={openFolder} className="px-3.5 py-2 rounded-full text-[11px] font-black text-slate-700 bg-white border border-slate-200 hover:border-slate-300">
            Abrir carpeta
          </button>
          <button type="button" onClick={() => setOpen(true)} data-testid="data-location-change"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-black text-white bg-slate-900 hover:bg-slate-800">
            Cambiar carpeta <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* Ventana emergente */}
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-lg p-0 bg-white border border-slate-200 rounded-3xl overflow-hidden [&>button]:hidden" data-testid="data-location-dialog">
          <div className="px-6 pt-6 pb-2 flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl btn-primary flex items-center justify-center shrink-0 shadow-md">
              <FolderOpen size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-black text-slate-900" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>
                ¿Dónde guardamos tus datos?
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 mt-1">
                Tus reservas, socios, metas y ajustes se guardan en esta carpeta de tu equipo, junto con sus copias de seguridad.
              </DialogDescription>
            </div>
            <button type="button" onClick={() => close(false)} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>

          <div className="px-6 py-4 space-y-3">
            <PathBox />

            {pending ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3" data-testid="data-location-conflict">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 font-semibold">
                    En <span className="font-mono break-all">{pending.dir}</span> ya hay datos de Cinema Reservas
                    ({fmtSize(pending.size)}, guardados {pending.modified}). ¿Qué quieres hacer?
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button type="button" disabled={!!busy} onClick={() => apply(pending.dir, "use_existing")}
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-amber-300 text-amber-800 text-[11px] font-black disabled:opacity-60">
                    Abrir los datos de esa carpeta
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => apply(pending.dir, "replace")}
                    className="flex-1 px-3 py-2 rounded-xl bg-amber-600 text-white text-[11px] font-black disabled:opacity-60">
                    Llevar mis datos actuales
                  </button>
                </div>
                <p className="text-[10px] text-amber-700">No se borra nada: los datos que no elijas quedan guardados como copia.</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-[11px] text-slate-500">
                <ShieldCheck size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Al cambiar de carpeta llevamos tus datos al nuevo sitio y dejamos una copia en el anterior.
                  Puedes elegir otro disco, una carpeta sincronizada o tu NAS.
                </span>
              </div>
            )}

            {loc && !loc.local_db_in_use && (
              <p className="text-[11px] text-indigo-700 bg-indigo-50 rounded-xl px-3 py-2 font-semibold">
                Ahora usas una base de datos en la nube; esta carpeta guarda la copia local y los respaldos.
              </p>
            )}
          </div>

          <div className="px-6 pb-6 flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={pick} disabled={!!busy} data-testid="data-location-pick"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl btn-primary text-white text-sm font-black disabled:opacity-60">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <FolderInput size={15} />}
              {busy === "pick" ? "Elige la carpeta en la ventana…" : busy === "apply" ? "Moviendo tus datos…" : "Seleccionar carpeta"}
            </button>
            {loc && !loc.is_default && (
              <button type="button" onClick={() => apply(loc.default_dir)} disabled={!!busy} data-testid="data-location-default"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black disabled:opacity-60">
                <RotateCcw size={13} /> Usar la predeterminada
              </button>
            )}
            <button type="button" onClick={() => close(false)} disabled={busy === "apply"}
              className="inline-flex items-center justify-center px-4 py-3 rounded-2xl bg-slate-100 text-slate-700 text-xs font-black hover:bg-slate-200 disabled:opacity-60">
              Listo
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
