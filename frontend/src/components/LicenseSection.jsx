import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, AlertTriangle, RefreshCw, Loader2, Crown, ExternalLink, Monitor, Calendar, Wifi } from "lucide-react";
import { Section } from "@/components/appearance/SectionShell";
import { useToast } from "@/hooks/use-toast";
import { apiMsg } from "@/lib/apiMsg";
import { getLicense, recheckLicense } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";

function fmt(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return "—"; }
}
function daysFrom(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** Ajustes > Licencia: la licencia activa en este equipo (sin mostrar la clave completa). */
export default function LicenseSection() {
  const { toast } = useToast();
  const { language } = useSettings();
  const [lic, setLic] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getLicense().then(setLic).catch(() => setLic({ available: false })); }, []);

  const verify = async () => {
    setBusy(true);
    try {
      const r = await recheckLicense();
      setLic(r);
      toast({ title: r.message, variant: r.active ? undefined : "destructive" });
    } catch (e) {
      toast({ title: apiMsg(e, "No se pudo verificar"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const active = !!lic?.active;
  const offlineLeft = daysFrom(lic?.offline_until);
  const badge = (
    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
      {lic ? (active ? (language === "en" ? "ACTIVE" : "ACTIVA") : (language === "en" ? "INACTIVE" : "SIN ACTIVAR")) : "…"}
    </span>
  );

  const Row = ({ icon: Icon, label, value, testId }) => (
    <div className="flex items-start gap-3 py-2.5">
      <Icon size={15} className="text-slate-400 mt-0.5 shrink-0" />
      <span className="text-xs text-slate-500 w-40 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-slate-800 min-w-0 break-words" data-testid={testId}>{value}</span>
    </div>
  );

  return (
    <Section icon={KeyRound} title={language === "en" ? "License" : "Licencia"}
      desc={language === "en" ? "Your Cinema Reservas license on this computer" : "Tu licencia de Cinema Reservas en este equipo"} badge={badge}
      keywords="licencia clave activacion gumroad comprar equipo maestra">
      {!lic ? (
        <div className="h-24 rounded-2xl bg-white/50 animate-pulse" />
      ) : !lic.available ? (
        <p className="text-sm text-slate-500">La información de la licencia no está disponible en este modo.</p>
      ) : (
        <div className="space-y-4" data-testid="license-section">
          {/* Estado */}
          <div className={`rounded-2xl p-4 flex items-center gap-4 ${active ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${active ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
              {lic.master ? <Crown size={22} /> : active ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-base font-black ${active ? "text-emerald-800" : "text-red-700"}`} data-testid="license-state">
                {active ? `${lic.type} activa` : "La licencia no está activa"}
              </p>
              <p className={`text-xs ${active ? "text-emerald-700" : "text-red-600"}`}>
                {active
                  ? (lic.master ? "Acceso completo, sin vencimiento y sin necesidad de internet."
                      : offlineLeft !== null && offlineLeft <= 7
                        ? `Conéctate a internet pronto: funciona sin conexión ${Math.max(0, offlineLeft)} día(s) más.`
                        : "Todo en orden. Se verifica sola cada semana cuando hay internet.")
                  : lic.reason}
              </p>
            </div>
          </div>

          {/* Detalle */}
          <div className="rounded-2xl bg-white/70 border border-slate-100 px-4 divide-y divide-slate-100">
            <Row icon={KeyRound} label="Clave" value={<span className="font-mono">{lic.key_masked || "—"}</span>} testId="license-key" />
            {!lic.master && <Row icon={Calendar} label="Comprada por" value={lic.email || "—"} />}
            <Row icon={Calendar} label="Activada el" value={fmt(lic.activated_at)} />
            {!lic.master && <Row icon={Wifi} label="Última verificación" value={fmt(lic.last_check)} />}
            {!lic.master && <Row icon={Wifi} label="Funciona sin internet hasta"
              value={`${fmt(lic.offline_until)}${offlineLeft !== null ? ` (${Math.max(0, offlineLeft)} días)` : ""}`} />}
            <Row icon={Monitor} label="Este equipo" value={<span className="font-mono">{lic.machine || "—"}</span>} />
            {!lic.master && <Row icon={Monitor} label="Equipos permitidos" value={`Hasta ${lic.max_devices} equipos con la misma licencia`} />}
            <Row icon={ShieldCheck} label="Producto" value={`${lic.product} · versión ${lic.version}`} />
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2">
            {!lic.master && (
              <button type="button" onClick={verify} disabled={busy} data-testid="license-verify"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl btn-primary text-white text-xs font-black disabled:opacity-60">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Verificar ahora
              </button>
            )}
            <a href={lic.buy_url} target="_blank" rel="noreferrer" data-testid="license-buy"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black hover:border-slate-300">
              <ExternalLink size={13} /> Comprar otra licencia
            </a>
            <a href="https://app.gumroad.com/library" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black hover:border-slate-300">
              <ExternalLink size={13} /> Ver mis compras
            </a>
          </div>
          {!lic.master && (
            <p className="text-[11px] text-slate-500">
              Para pasar la licencia a otro equipo, instala Cinema Reservas allí y pega la misma clave (máximo {lic.max_devices} equipos).
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
