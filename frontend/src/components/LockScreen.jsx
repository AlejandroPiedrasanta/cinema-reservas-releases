import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Unlock, Eye, EyeOff, Loader2, Lightbulb, ShieldCheck, KeyRound } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { verifyAppPassword, resetPasswordWithLicense } from "@/lib/api";

export default function LockScreen() {
  const { security, unlockApp } = useSettings();
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [licKey, setLicKey] = useState("");
  const [licBusy, setLicBusy] = useState(false);
  const [licMsg, setLicMsg] = useState("");

  const unlockWithLicense = async (e) => {
    e?.preventDefault();
    if (!licKey.trim() || licBusy) return;
    setLicBusy(true); setLicMsg("");
    try {
      await resetPasswordWithLicense(licKey.trim());
      setUnlocking(true);
      setTimeout(() => unlockApp(), 650);
    } catch (err) {
      setLicMsg(err?.response?.data?.detail || "No se pudo comprobar la clave");
    } finally { setLicBusy(false); }
  };

  const handleUnlock = async (e) => {
    e?.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(false);
    try {
      await verifyAppPassword(password);
      setUnlocking(true);
      setTimeout(() => unlockApp(), 650);
    } catch (err) {
      setError(true);
      setErrMsg(err?.response?.data?.detail || "Contraseña incorrecta — inténtalo de nuevo");
      setPassword("");
      setTimeout(() => setError(false), 700);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #1e1b4b 0%, #0f0e1f 60%, #090812 100%)" }}
      data-testid="lock-screen">

      {/* Decorative orbs (quietos: degradado radial, sin animación infinita) */}
      <div className="absolute w-72 h-72 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.22), transparent 70%)", top: "8%", left: "12%" }} />
      <div className="absolute w-96 h-96 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.16), transparent 70%)", bottom: "5%", right: "8%" }} />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={unlocking ? { opacity: 0, scale: 1.02 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[min(400px,92vw)] rounded-3xl p-8 text-center"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", boxShadow: "0 30px 90px rgba(0,0,0,0.5)" }}>

        {/* Lock icon */}
        <div className="relative w-20 h-20 mx-auto mb-5">
          <motion.div
            animate={error ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
            transition={{ duration: error ? 0.5 : 0.2 }}
            className="relative w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 12px 40px rgba(99,102,241,0.45)" }}>
            {unlocking ? <Unlock size={32} className="text-white" /> : <Lock size={32} className="text-white" />}
          </motion.div>
        </div>

        <h1 className="text-2xl font-black text-white mb-1" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>
          App Bloqueada
        </h1>
        <p className="text-sm text-slate-400 mb-6">Ingresa tu contraseña para continuar</p>

        <form onSubmit={handleUnlock} className="space-y-3">
          <motion.div animate={error ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.45 }} className="relative">
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoFocus
              data-testid="lock-password-input"
              className={`w-full px-4 py-3.5 pr-11 rounded-2xl text-sm font-semibold text-white placeholder-slate-500 focus:outline-none transition-all ${error ? "ring-2 ring-red-500/70" : "focus:ring-2 focus:ring-indigo-400/60"}`}
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}
            />
            <button type="button" onClick={() => setShowPass(s => !s)} tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors">
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </motion.div>

          <AnimatePresence>
            {errMsg && (
              <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="text-xs font-bold text-red-400" data-testid="lock-error-msg">
                {errMsg}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            type="submit" disabled={loading || !password}
            data-testid="lock-unlock-btn"
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black text-white disabled:opacity-50 transition-opacity"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 8px 30px rgba(99,102,241,0.4)" }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {loading ? "Verificando…" : "Desbloquear"}
          </motion.button>
        </form>

        {/* Hint */}
        <div className="mt-5">
          {!showHint ? (
            <button onClick={() => setShowHint(true)} data-testid="lock-show-hint-btn"
              className="text-xs font-semibold text-slate-400 hover:text-indigo-300 transition-colors">
              ¿Olvidaste tu contraseña?
            </button>
          ) : (
            <div className="space-y-3">
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-start gap-2.5 text-left rounded-2xl px-4 py-3"
              style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)" }}
              data-testid="lock-hint-box">
              <Lightbulb size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-black text-amber-300 uppercase tracking-wider">Tu pista</p>
                <p className="text-xs text-amber-100/90 mt-0.5">
                  {security.hint || "No configuraste una pista."}
                </p>
              </div>
            </motion.div>
            {/* Recuperar: quitar la contraseña con la clave de licencia de este equipo */}
            <form onSubmit={unlockWithLicense} className="text-left rounded-2xl px-4 py-3 space-y-2"
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(129,140,248,0.3)" }} data-testid="lock-license-box">
              <p className="text-[10px] font-black text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound size={12} /> Desbloquear con tu clave de licencia
              </p>
              <p className="text-[11px] text-indigo-100/80">Pega la clave que te llegó por correo al comprar. Se quitará la contraseña y podrás crear otra.</p>
              <div className="flex gap-2">
                <input value={licKey} onChange={e => setLicKey(e.target.value)} placeholder="Clave de licencia"
                  data-testid="lock-license-input"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }} />
                <button type="submit" disabled={licBusy || !licKey.trim()} data-testid="lock-license-btn"
                  className="px-3 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                  {licBusy ? <Loader2 size={13} className="animate-spin" /> : "Usar"}
                </button>
              </div>
              {licMsg && <p className="text-[11px] font-bold text-red-300" data-testid="lock-license-msg">{licMsg}</p>}
            </form>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
