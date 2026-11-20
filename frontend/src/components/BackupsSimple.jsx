import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays, Users, Target, ShieldCheck, Download, Upload, Plus, RotateCcw, Loader2,
  History, AlertTriangle, Cloud, ArrowRight, CheckCircle2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiMsg } from "@/lib/apiMsg";
import {
  getBackupHistory, createServerBackup, downloadBackupUrl, downloadBackupFileUrl,
  restoreBackup, restoreBackupFile, previewBackup, getDataSummary,
} from "@/lib/api";

const KIND = {
  automatica: { label: "Automática", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  manual: { label: "Manual", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  antes_restaurar: { label: "Antes de restaurar", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  antes_borrar: { label: "Antes de borrar", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  danada: { label: "Dañada", cls: "bg-red-50 text-red-700 border-red-200" },
};

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Hoy, ${time}`;
  if (d.toDateString() === y.toDateString()) return `Ayer, ${time}`;
  return d.toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" }) + `, ${time}`;
}

/**
 * Base de Datos en modo simple: qué datos tienes, copias de seguridad con un clic y
 * restaurar con confirmación clara. Lo técnico queda en "Avanzado".
 */
export default function BackupsSimple({ onShowAdvanced }) {
  const { toast } = useToast();
  const [sum, setSum] = useState(null);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [confirm, setConfirm] = useState(null);   // {title, when, reservations, socios, file?, filename?}
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try { setSum(await getDataSummary()); } catch { /* ignore */ }
    try { setList(await getBackupHistory()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const metas = sum?.collections?.metas ?? 0;

  const createNow = async () => {
    setBusy("create");
    try {
      await createServerBackup();
      toast({ title: "Copia de seguridad creada ✓", description: "Quedó guardada en este equipo." });
      await load();
    } catch (e) {
      toast({ title: apiMsg(e, "No se pudo crear la copia"), variant: "destructive" });
    } finally { setBusy(""); }
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy("preview");
    try {
      const p = await previewBackup(file);
      setConfirm({ title: file.name, when: p.created_at, reservations: p.reservations, socios: p.socios, file });
    } catch (err) {
      toast({ title: apiMsg(err, "Ese archivo no es una copia de seguridad válida"), variant: "destructive" });
    } finally { setBusy(""); }
  };

  const askRestore = (b) => setConfirm({
    title: KIND[b.kind]?.label || "Copia", when: b.created_at, reservations: b.reservations, socios: b.socios,
    filename: b.filename,
  });

  const doRestore = async () => {
    setBusy("restore");
    try {
      const r = confirm.file ? await restoreBackup(confirm.file) : await restoreBackupFile(confirm.filename);
      setConfirm(null);
      toast({ title: "Copia restaurada ✓", description: r.message });
      setTimeout(() => window.location.reload(), 1200);   // recargar todas las pantallas con los datos restaurados
    } catch (err) {
      toast({ title: apiMsg(err, "No se pudo restaurar"), variant: "destructive" });
    } finally { setBusy(""); }
  };

  const shown = showAll ? list : list.slice(0, 5);

  return (
    <div className="space-y-6" data-testid="db-simple">
      {/* ── Tus datos ── */}
      <div className="rounded-[28px] border border-slate-200/70 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={16} className="text-emerald-600" />
          <p className="text-sm font-black text-slate-900" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>Tus datos</p>
          <span className="text-[11px] text-slate-500">· se guardan solos al momento en este equipo</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: CalendarDays, n: sum?.reservations, label: "Reservas", c: "text-emerald-600 bg-emerald-50" },
            { icon: Users, n: sum?.socios, label: "Socios", c: "text-pink-600 bg-pink-50" },
            { icon: Target, n: metas, label: "Metas", c: "text-amber-600 bg-amber-50" },
          ].map(({ icon: Icon, n, label, c }) => (
            <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c}`}><Icon size={18} /></div>
              <div className="min-w-0">
                <p className="text-2xl font-black text-slate-900 leading-none" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }} data-testid={`db-count-${label.toLowerCase()}`}>
                  {n ?? "…"}
                </p>
                <p className="text-[11px] text-slate-500 font-semibold mt-1">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Copias de seguridad ── */}
      <div className="rounded-[28px] border border-slate-200/70 bg-white p-6" data-testid="db-backups">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-black text-slate-900" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>Copias de seguridad</p>
            <p className="text-xs text-slate-500 mt-1">
              Se hace una copia automática cada día al abrir la app. Si algo sale mal, elige una copia y pulsa «Restaurar».
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button type="button" onClick={createNow} disabled={!!busy} data-testid="db-backup-create"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl btn-primary text-white text-xs font-black disabled:opacity-60">
              {busy === "create" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Crear copia ahora
            </button>
            <a href={downloadBackupUrl()} data-testid="db-backup-download"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black hover:border-slate-300">
              <Download size={13} /> Descargar a mi PC
            </a>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} data-testid="db-backup-restore-file"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black hover:border-slate-300 disabled:opacity-60">
              {busy === "preview" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Restaurar desde archivo
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={pickFile} />
          </div>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
            <History size={22} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs text-slate-500">Aún no hay copias. Pulsa «Crear copia ahora».</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            {shown.map((b) => {
              const k = KIND[b.kind] || KIND.manual;
              return (
                <div key={b.filename} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/60" data-testid="db-backup-row">
                  <div className="min-w-[150px] flex-1">
                    <p className="text-sm font-bold text-slate-800">{fmtDate(b.created_at)}</p>
                    <p className="text-[11px] text-slate-500">
                      {b.reservations} reservas · {b.socios} socios{b.metas ? ` · ${b.metas} metas` : ""} · {b.size}
                    </p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${k.cls}`}>{k.label}</span>
                  <div className="flex gap-1.5">
                    <a href={downloadBackupFileUrl(b.filename)} title="Descargar esta copia"
                      className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                      <Download size={14} />
                    </a>
                    <button type="button" onClick={() => askRestore(b)} disabled={!!busy || b.kind === "danada"} data-testid="db-backup-row-restore"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] font-black hover:bg-slate-800 disabled:opacity-40">
                      <RotateCcw size={12} /> Restaurar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {list.length > 5 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-[11px] font-black text-indigo-600 hover:text-indigo-700">
            {showAll ? "Ver menos" : `Ver todas (${list.length})`}
          </button>
        )}
      </div>

      {/* ── Nube / NAS (opcional) ── */}
      <button type="button" onClick={onShowAdvanced} data-testid="db-simple-cloud"
        className="w-full rounded-[28px] border border-slate-200/70 bg-white px-6 py-5 flex items-center gap-4 text-left hover:border-slate-300">
        <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
          <Cloud size={18} className="text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-black text-slate-900" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>Usar la nube o tu NAS (opcional)</p>
          <p className="text-xs text-slate-500">Para ver los mismos datos desde varios equipos. Abre las opciones avanzadas.</p>
        </div>
        <ArrowRight size={16} className="text-slate-400" />
      </button>

      {/* ── Confirmar restaurar ── */}
      <Dialog open={!!confirm} onOpenChange={(v) => { if (!v && busy !== "restore") setConfirm(null); }}>
        <DialogContent className="max-w-md p-0 bg-white border border-slate-200 rounded-3xl overflow-hidden" data-testid="db-restore-confirm">
          {confirm && (
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
                <AlertTriangle size={22} />
              </div>
              <DialogTitle className="text-xl font-black text-slate-900" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>
                ¿Restaurar esta copia?
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 mt-1">
                Tus datos actuales se reemplazarán por los de la copia.
              </DialogDescription>
              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ahora tienes</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{sum?.reservations ?? "…"} reservas</p>
                  <p className="text-sm font-black text-slate-800">{sum?.socios ?? "…"} socios</p>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500">La copia trae</p>
                  <p className="text-sm font-black text-indigo-800 mt-1">{confirm.reservations} reservas</p>
                  <p className="text-sm font-black text-indigo-800">{confirm.socios} socios</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-3">
                {confirm.when ? <>Copia del <b>{fmtDate(confirm.when)}</b>. </> : null}
                <CheckCircle2 size={11} className="inline text-emerald-600 -mt-0.5" /> Antes de restaurar guardamos una copia de lo que tienes ahora, por si quieres volver.
              </p>
              <div className="flex gap-2 mt-5">
                <button type="button" onClick={() => setConfirm(null)} disabled={busy === "restore"}
                  className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 text-slate-700 text-xs font-black hover:bg-slate-200 disabled:opacity-60">
                  Cancelar
                </button>
                <button type="button" onClick={doRestore} disabled={busy === "restore"} data-testid="db-restore-confirm-btn"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 disabled:opacity-60">
                  {busy === "restore" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Restaurar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
