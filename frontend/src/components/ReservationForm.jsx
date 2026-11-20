import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { createReservation, updateReservation, getSocios, getReservations } from "@/lib/api";
import {
  ArrowLeft, X, Sparkles, User, Phone, Mail, Calendar as CalIcon, Clock, MapPin,
  Users, DollarSign, Package, StickyNote, PartyPopper, Heart, Cake, Briefcase,
  Mic2, Star, CheckCircle2, Loader2, Wallet, Tag, Pencil, RotateCcw, Zap,
  Camera, Video, Check, AlertTriangle, Plus, Trash2, Copy, Sun, Sunrise, Moon, Sunset, ChevronLeft, ChevronRight, ChevronDown
} from "lucide-react";
import { motion, AnimatePresence, MotionConfig, animate as fmAnimate } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/context/SettingsContext";
import { getEventTypeName, getEventConfig } from "@/lib/eventConfig";
import { celebrateReservation, celebratePayment, celebrateFullPayment } from "@/lib/celebrations";
import { apiMsg } from "@/lib/apiMsg";

const EVENT_TYPES = [
  { key: "Boda",               icon: Heart,       grad: "from-pink-400 to-rose-500" },
  { key: "Quinceañera",        icon: Cake,        grad: "from-fuchsia-400 to-purple-500" },
  { key: "Fiesta Social",      icon: PartyPopper, grad: "from-amber-400 to-orange-500" },
  { key: "Evento Corporativo", icon: Briefcase,   grad: "from-cyan-400 to-blue-500" },
  { key: "Otro",               icon: Star,        grad: "from-slate-300 to-slate-500" },
];

const PACKAGES = [
  { key: "",           label: "Sin paquete", icon: Tag },
  { key: "Básico",     label: "Básico",      icon: Package },
  { key: "Intermedio", label: "Intermedio",  icon: Package },
  { key: "Completo",   label: "Completo",    icon: Package },
];

export default function ReservationForm({ reservation, onClose, onSaved }) {
  const { toast } = useToast();
  const { tr, activeStatuses, formFieldsVisibility, currencySymbol, formatCurrency, currencyInfo, animations } = useSettings();
  const f = tr.form;
  const ff = formFieldsVisibility || {};
  const isEdit = !!reservation;

  // Renders the active currency symbol styled like a lucide icon (Q, $, €, L…)
  const CurrencyGlyph = ({ size = 16, className = "" }) => (
    <span
      className={className}
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.95), fontWeight: 900, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      {currencySymbol}
    </span>
  );

  const [form, setForm] = useState({
    client_name: "", client_phone: "", client_email: "",
    event_type: "Boda", event_date: "", event_time: "",
    venue: "", guests_count: "", total_amount: "",
    advance_paid: "0", status: "Reservado", notes: "",
    package_type: "",
  });

  const STATUS_OPTIONS = [
    { key: "Reservado", label: "Reservado" },
    { key: "Pagado",    label: "Pagado" },
  ];
  const [saving, setSaving] = useState(false);
  const [socios, setSocios] = useState([]);
  // Equipo (varios socios con su pago) y lugares extra
  const [team, setTeam] = useState([]);
  const addTeam = () => setTeam((t) => [...t, { key: Date.now() + Math.random(), socio_id: "", payment: "" }]);
  const updTeam = (key, patch) => setTeam((t) => t.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const delTeam = (key) => setTeam((t) => t.filter((m) => m.key !== key));
  const [locs, setLocs] = useState({ maquillaje: "", ceremonia: "", fiesta: "" });
  const [showLocs, setShowLocs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState([]);   // campos obligatorios que faltaron al guardar
  const [shake, setShake] = useState(0);
  const [done, setDone] = useState(false);    // animación de «¡Reserva creada!»

  // Borrador: si cierras sin querer, la reserva a medias se guarda y la recuperas al volver
  const DRAFT_KEY = "cp_reserva_borrador";
  const [draftOffer, setDraftOffer] = useState(() => {
    if (reservation) return null;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      return d && d.form && (d.form.client_name || d.form.event_date || d.form.total_amount) ? d : null;
    } catch { return null; }
  });

  // Cargar socios (solo en modo creación; en edición ya se gestiona desde Socios.jsx)
  useEffect(() => {
    if (isEdit) return;
    let alive = true;
    getSocios().then(list => { if (alive) setSocios(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, [isEdit]);

  // Snapshot original values for dirty tracking (edit mode)
  const originalRef = useRef(null);
  const buildSnapshot = (r) => ({
    client_name: r?.client_name || "",
    client_phone: r?.client_phone || "",
    client_email: r?.client_email || "",
    event_type: r?.event_type || "Boda",
    event_date: r?.event_date || "",
    event_time: r?.event_time || "",
    venue: r?.venue || "",
    guests_count: String(r?.guests_count ?? ""),
    total_amount: String(r?.total_amount ?? ""),
    advance_paid: String(r?.advance_paid ?? "0"),
    status: r?.status || "Reservado",
    notes: r?.notes || "",
    package_type: r?.package_type || "",
  });

  const isDirtyField = (field) => {
    if (!isEdit || !originalRef.current) return false;
    return String(form[field] ?? "") !== String(originalRef.current[field] ?? "");
  };

  const FIELD_META = useMemo(() => ({
    client_name:  { label: "Nombre",   icon: User },
    client_phone: { label: "Teléfono", icon: Phone },
    client_email: { label: "Email",    icon: Mail },
    event_type:   { label: "Tipo",     icon: Sparkles },
    event_date:   { label: "Fecha",    icon: CalIcon },
    event_time:   { label: "Hora",     icon: Clock },
    venue:        { label: "Lugar",    icon: MapPin },
    guests_count: { label: "Invitados",icon: Users },
    total_amount: { label: "Total",    icon: DollarSign },
    advance_paid: { label: "Anticipo", icon: Wallet },
    status:       { label: "Estado",   icon: Tag },
    package_type: { label: "Paquete",  icon: Package },
    notes:        { label: "Notas",    icon: StickyNote },
  }), []);

  const dirtyFields = useMemo(() => {
    if (!isEdit || !originalRef.current) return [];
    return Object.keys(FIELD_META).filter(k => String(form[k] ?? "") !== String(originalRef.current[k] ?? ""));
  }, [form, isEdit, FIELD_META]);

  const clientInitials = useMemo(() => {
    const src = (isEdit ? (originalRef.current?.client_name || reservation?.client_name) : form.client_name) || "?";
    return src.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || "").join("") || "?";
  }, [isEdit, reservation, form.client_name]);

  const handleRevert = () => {
    if (!originalRef.current) return;
    setForm({ ...originalRef.current });
    toast({ title: "Cambios descartados" });
  };

  // Lock body scroll while modal open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (reservation) {
      const snap = buildSnapshot(reservation);
      originalRef.current = snap;
      setForm(snap);
    }
  }, [reservation]);

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));
  // Al cambiar el monto total: si la reserva está marcada como "Pagado",
  // mantener el anticipo sincronizado con el total (pago completo real).
  const setTotal = (e) => {
    const val = e.target.value;
    setForm(prev => ({
      ...prev,
      total_amount: val,
      advance_paid: prev.status === "Pagado" ? val : prev.advance_paid,
    }));
  };
  const setStatus = (e) => {
    const newStatus = e.target.value;
    setForm(prev => ({
      ...prev,
      status: newStatus,
      advance_paid: newStatus === "Pagado"
        ? String(prev.total_amount || prev.advance_paid)
        : prev.advance_paid,
    }));
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (saving || done) return;
    const missing = [];
    if (!form.client_name.trim()) missing.push("client_name");
    if (!form.event_date) missing.push("event_date");
    if (!form.total_amount || isNaN(Number(form.total_amount))) missing.push("total_amount");
    if (missing.length) {
      const names = { client_name: "Cliente", event_date: "Fecha", total_amount: "Monto total" };
      setErrors(missing); setShake((n) => n + 1);
      toast({ title: "Faltan datos", description: `Completa: ${missing.map((k) => names[k]).join(", ")}`, variant: "destructive" });
      return;
    }
    setErrors([]);
    setSaving(true);
    const payload = {
      ...form,
      guests_count: form.guests_count ? parseInt(form.guests_count) : null,
      total_amount: parseFloat(form.total_amount),
      advance_paid: parseFloat(form.advance_paid) || 0,
    };
    // Garantizar que "Pagado" siempre signifique pago completo (anticipo = total),
    // sin importar el orden en que se llenaron los campos.
    if (form.status === "Pagado") {
      payload.advance_paid = parseFloat(form.total_amount) || 0;
    }
    // Al crear: equipo de trabajo y lugares extra
    if (!isEdit) {
      const members = team.filter((m) => m.socio_id);
      if (members.length) {
        payload.assigned_partners = members.map((m) => {
          const soc = socios.find((x) => x.id === m.socio_id);
          return {
            socio_id: m.socio_id, name: soc?.name || "", role: soc?.role || "Fotógrafo",
            photo: soc?.photo || null, photo_content_type: soc?.photo_content_type || null,
            payment: parseFloat(m.payment) || 0, payment_status: "Pendiente",
          };
        });
      }
      const filled = LOC_TYPES.map((l) => ({ l, v: (locs[l.key] || "").trim() })).filter((x) => x.v);
      if (filled.length) {
        payload.locations = filled.map(({ l, v }) => (/^https?:\/\//i.test(v)
          ? { type: l.key, address: "", waze_url: v }
          : { type: l.key, address: v, waze_url: "" }));
      }
    }
    try {
      if (isEdit) {
        await updateReservation(reservation.id, payload);
        toast({ title: "Reserva actualizada" });
        const prevAdvance = parseFloat(reservation.advance_paid || 0);
        const newAdvance = payload.advance_paid || 0;
        if (newAdvance > prevAdvance) {
          const total = payload.total_amount || 0;
          if (newAdvance >= total) celebrateFullPayment();
          else celebratePayment();
        }
      } else {
        await createReservation(payload);
        toast({ title: "🎉 ¡Reserva creada!" });
        celebrateReservation();
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* nada */ }
        setDone(true);
        setTimeout(() => onSaved(), 700);
        return;
      }
      onSaved();
    } catch (err) {
      toast({ title: "Error al guardar", description: apiMsg(err), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const title = isEdit ? "Editar reserva" : "Nueva reserva";
  const submitLabel = saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear reserva";
  const noReq = (s) => String(s || "").replace(/\s*\*\s*$/, "");

  // Saldo
  const totalNum = parseFloat(form.total_amount) || 0;
  const advNum = parseFloat(form.advance_paid) || 0;
  const balance = Math.max(0, totalNum - advNum);
  const progress = totalNum ? Math.min(100, (advNum / totalNum) * 100) : 0;

  // Otras reservas (para avisar si el día ya está ocupado y sugerir clientes anteriores)
  const [others, setOthers] = useState([]);
  useEffect(() => {
    let alive = true;
    getReservations().then((l) => { if (alive) setOthers(Array.isArray(l) ? l : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const busy = useMemo(() => {
    const m = {};
    others.forEach((r) => {
      if (!r.event_date || r.status === "Cancelado" || (isEdit && r.id === reservation?.id)) return;
      (m[r.event_date] ||= []).push(r);
    });
    return m;
  }, [others, isEdit, reservation]);
  const sameDay = form.event_date ? (busy[form.event_date] || []) : [];
  const clients = useMemo(() => {
    const seen = new Map();
    others.forEach((r) => {
      if (r.client_name && r.client_name !== "Desconocido" && !seen.has(r.client_name))
        seen.set(r.client_name, { phone: r.client_phone || "", email: r.client_email || "" });
    });
    return [...seen.entries()].map(([name, v]) => ({ name, ...v }));
  }, [others]);

  const meaningful = !!(form.client_name.trim() || form.event_date || form.total_amount);
  useEffect(() => {
    if (isEdit || done) return;
    if (!meaningful) return;
    if (draftOffer) setDraftOffer(null);   // empezó una nueva: el borrador viejo se reemplaza
    const id = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, team, at: Date.now() })); } catch { /* sin espacio */ }
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, team, isEdit, done]);
  const restoreDraft = () => {
    if (!draftOffer) return;
    setForm((p) => ({ ...p, ...draftOffer.form }));
    setTeam(Array.isArray(draftOffer.team) ? draftOffer.team : []);
    setDraftOffer(null);
  };
  const discardDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* nada */ } setDraftOffer(null); };
  const closeForm = () => {
    if (!isEdit && !done && meaningful) toast({ title: "Borrador guardado", description: "Lo recuperas al abrir Nueva reserva." });
    onClose();
  };

  // Atajos: Esc cierra · Ctrl+Enter guarda
  const submitRef = useRef(handleSubmit);
  submitRef.current = handleSubmit;
  const closeRef = useRef(null);
  closeRef.current = closeForm;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !document.querySelector("[data-partner-popup],[data-rf-popup]")) closeRef.current();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setAdvanceQuick = (ratio) => {
    if (!totalNum) return;
    const v = String(Math.round(totalNum * ratio * 100) / 100);
    setForm((p) => ({ ...p, advance_paid: v, status: ratio >= 1 ? "Pagado" : (p.status === "Pagado" ? "Reservado" : p.status) }));
  };

  // Identidad del evento + lista de lo obligatorio (para animaciones y resumen en vivo)
  const evCfg = getEventConfig(form.event_type);
  const EvIcon = evCfg.icon || Sparkles;
  const reqDone = [
    { k: "client", label: "Cliente", ok: !!form.client_name.trim() },
    { k: "date", label: "Fecha", ok: !!form.event_date },
    { k: "total", label: "Monto", ok: totalNum > 0 },
  ];
  const allReady = reqDone.every((r) => r.ok);
  const filledMap = { client_name: !!form.client_name.trim(), event_date: !!form.event_date, total_amount: !!form.total_amount && !isNaN(Number(form.total_amount)) };
  const errOn = (k) => errors.includes(k) && !filledMap[k];
  const teamCost = team.reduce((acc, m) => acc + (m.socio_id ? (parseFloat(m.payment) || 0) : 0), 0);
  const profit = totalNum - teamCost;
  const countdown = form.event_date ? relDays(form.event_date) : "";
  const clientKey = form.client_name.trim().toLowerCase();
  const clientHist = !isEdit && clientKey.length > 2 ? others.filter((r) => (r.client_name || "").trim().toLowerCase() === clientKey) : [];
  const locCount = Object.values(locs).filter((v) => v.trim()).length;

  const copyConfirm = async () => {
    const lines = [
      `¡Hola ${form.client_name.trim()}! Te confirmamos tu reserva:`,
      `🎉 ${getEventTypeName(form.event_type)}${form.package_type ? ` · Paquete ${form.package_type}` : ""}`,
      `📅 ${fechaLarga(form.event_date)}${form.event_time ? ` a las ${to12(form.event_time)}` : ""}`,
      form.venue && `📍 ${form.venue}`,
      `💰 Total: ${formatCurrency(totalNum)}`,
      `✅ Anticipo: ${formatCurrency(advNum)}`,
      `🧾 Saldo pendiente: ${formatCurrency(balance)}`,
      "",
      "¡Gracias por confiar en nosotros!",
    ].filter((x) => x !== false && x !== undefined && x !== null);
    const text = lines.join("\n");
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* nada */ } ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  const fullyPaid = totalNum > 0 && progress >= 100;
  const summaryBits = [getEventTypeName(form.event_type), form.event_date && fechaCorta(form.event_date)].filter(Boolean).join(" · ");

  return createPortal(
    <MotionConfig reducedMotion={animations === false ? "always" : "user"}>
    <AnimatePresence>
      <motion.div
        key="rf-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 px-4 bg-slate-900/40"
        onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
        data-testid="reservation-form"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 22 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10, transition: { duration: 0.16 } }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
          className="cp-rf relative w-full max-w-5xl my-auto flex flex-col rounded-[28px] bg-white border border-white shadow-[0_30px_80px_-24px_rgba(15,23,42,0.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={closeForm} aria-label="Cerrar" data-testid="cancel-form-btn"
            className="absolute top-5 right-5 z-20 w-9 h-9 rounded-full grid place-items-center text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 hover:rotate-90 transition-transform duration-300">
            <X size={18} />
          </button>
          <div className="grid md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Columna izquierda: evento y cliente */}
            <motion.form onSubmit={handleSubmit} variants={STAGGER} initial="hidden" animate="show" className="px-7 py-6 space-y-5 min-w-0">
              {isEdit ? (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl grid place-items-center text-white text-sm font-black shrink-0"
                    style={{ background: "linear-gradient(135deg, var(--t-from,#8b5cf6), var(--t-to,#ec4899))" }} data-testid="edit-avatar">
                    {clientInitials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-violet-600" data-testid="edit-mode-badge">Editando</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dirtyFields.length ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`} data-testid="edit-changes-counter">
                        {dirtyFields.length === 0 ? "Sin cambios" : `${dirtyFields.length} cambio${dirtyFields.length === 1 ? "" : "s"}`}
                      </span>
                      {dirtyFields.length > 0 && (
                        <button type="button" onClick={handleRevert} data-testid="revert-changes-btn"
                          className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800">
                          <RotateCcw size={11} /> Descartar
                        </button>
                      )}
                    </div>
                    <h2 className="text-lg font-black text-slate-900 truncate" data-testid="edit-client-name">{originalRef.current?.client_name || "Reserva"}</h2>
                  </div>
                </div>
              ) : (
                <motion.div variants={ITEM} className="flex items-center gap-3 pr-12 md:pr-0 min-w-0">
                  <div className="relative w-11 h-11 shrink-0">
                    <AnimatePresence initial={false}>
                      <motion.div key={form.event_type}
                        initial={{ scale: 0.3, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.3, rotate: 40, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 20 }}
                        className="absolute inset-0 rounded-2xl grid place-items-center text-white"
                        style={{ background: evCfg.fg, boxShadow: `0 10px 24px -10px ${evCfg.fg}` }}>
                        <EvIcon size={20} />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-slate-900 leading-tight">{title}</h2>
                    <p className="text-xs font-semibold truncate transition-colors duration-300" style={{ color: evCfg.fg }} data-testid="form-live-summary">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={summaryBits} className="inline-block" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.16 }}>{summaryBits}</motion.span>
                      </AnimatePresence>
                      {form.client_name.trim() && <span className="text-slate-500"> · {form.client_name.trim()}</span>}
                    </p>
                  </div>
                </motion.div>
              )}

              <AnimatePresence>
                {draftOffer && (
                  <motion.div key="draft" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden" data-testid="draft-banner">
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
                      <RotateCcw size={16} className="text-violet-600 shrink-0" />
                      <p className="flex-1 min-w-0 text-xs text-violet-900">
                        <b>Tienes una reserva sin terminar</b>
                        <span className="text-violet-700"> · {[draftOffer.form.client_name, draftOffer.form.event_type, draftOffer.form.event_date && fechaCorta(draftOffer.form.event_date)].filter(Boolean).join(" · ")}</span>
                      </p>
                      <button type="button" onClick={discardDraft} className="text-[11px] font-bold text-violet-500 hover:text-violet-800">Descartar</button>
                      <button type="button" onClick={restoreDraft} data-testid="draft-restore"
                        className="px-3 h-8 rounded-lg text-[11px] font-black text-white bg-violet-600 hover:bg-violet-700">Recuperar</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div variants={ITEM}>
                <RLabel>{noReq(f.eventType) || "Tipo de evento"}</RLabel>
                <EventTypeSlider value={form.event_type} onChange={(k) => setForm((p) => ({ ...p, event_type: k }))} />
                <select value={form.event_type} onChange={set("event_type")} data-testid="input-event-type" className="hidden">
                  {EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{getEventTypeName(t.key)}</option>)}
                </select>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RField label={noReq(f.clientName)} req dirty={isDirtyField("client_name")} testId="field-client-name" error={errOn("client_name")} shake={shake}>
                  <ClientAutocomplete value={form.client_name} clients={clients}
                    onChange={(v) => setForm((p) => ({ ...p, client_name: v }))}
                    onPick={(c) => setForm((p) => ({ ...p, client_name: c.name, client_phone: p.client_phone || c.phone, client_email: p.client_email || c.email }))} />
                  <AnimatePresence>
                    {clientHist.length > 0 && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-testid="frequent-client"
                        className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-violet-600">
                        <Star size={12} /> Cliente frecuente · {clientHist.length} reserva{clientHist.length === 1 ? "" : "s"} antes
                      </motion.p>
                    )}
                  </AnimatePresence>
                </RField>
                {ff.phone !== false && (
                  <RField label={f.phone} dirty={isDirtyField("client_phone")} testId="field-phone">
                    <RInput icon={Phone} type="tel" inputMode="tel" value={form.client_phone} onChange={(e) => setForm((p) => ({ ...p, client_phone: formatPhone(e.target.value) }))} placeholder="5555 1234" data-testid="input-phone" />
                  </RField>
                )}
                <RField label={noReq(f.eventDate)} req dirty={isDirtyField("event_date")} testId="field-date" error={errOn("event_date")} shake={shake}>
                  <RDateField value={form.event_date} busy={busy} onChange={(v) => setForm((p) => ({ ...p, event_date: v }))} />
                  <input type="date" value={form.event_date} onChange={set("event_date")} required data-testid="input-event-date" className="hidden" />
                </RField>
                {ff.time !== false && (
                  <RField label={f.time} dirty={isDirtyField("event_time")} testId="field-time">
                    <RTimeField value={form.event_time} onChange={(v) => setForm((p) => ({ ...p, event_time: v }))} />
                    <input type="time" value={form.event_time} onChange={set("event_time")} data-testid="input-event-time" className="hidden" />
                  </RField>
                )}
                {ff.venue !== false && (
                  <div className="md:col-span-2">
                  <RField label={f.venue} dirty={isDirtyField("venue")} testId="field-venue">
                    <RInput icon={MapPin} value={form.venue} onChange={set("venue")} placeholder="Salón, hotel o dirección" data-testid="input-venue" />
                  </RField>
                  </div>
                )}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {form.event_date && (sameDay.length ? (
                  <motion.p key={"busy" + form.event_date} data-testid="date-busy-warning"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }} exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.45 }}
                    className="cp-rf-note flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <AlertTriangle size={14} className="shrink-0" /> Ese día ya tienes {sameDay.length === 1 ? `1 evento (${sameDay[0].client_name})` : `${sameDay.length} eventos`}
                  </motion.p>
                ) : (
                  <motion.p key={"free" + form.event_date}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}
                    className="cp-rf-note flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <motion.span className="flex" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.08 }}><CheckCircle2 size={14} /></motion.span> Día libre, no tienes otros eventos
                  </motion.p>
                ))}
              </AnimatePresence>

              {/* Paquete */}
              <motion.div variants={ITEM}>
                <RLabel>Paquete</RLabel>
                <div className="flex flex-wrap gap-2">
                  {PACKAGES.map((pk) => {
                    const on = (form.package_type || "") === pk.key; const PkIcon = pk.icon;
                    return (
                      <motion.button key={pk.key || "none"} type="button" whileTap={{ scale: 0.95 }}
                        onClick={() => setForm((x) => ({ ...x, package_type: pk.key }))} data-testid={`package-${pk.key || "none"}`}
                        className={`relative px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${on ? "border-transparent text-white" : "border-slate-200 text-slate-500 hover:border-slate-300 bg-white"}`}>
                        {on && <motion.span layoutId="rf-pkg-pill" className="absolute inset-0 rounded-xl" style={{ background: evCfg.fg }} transition={{ type: "spring", stiffness: 500, damping: 34 }} />}
                        <span className="relative z-10 flex items-center gap-1.5"><PkIcon size={13} /> {pk.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <select value={form.package_type} onChange={set("package_type")} data-testid="input-package" className="hidden">
                  {PACKAGES.map((pk) => <option key={pk.key || "none"} value={pk.key}>{pk.label}</option>)}
                </select>
              </motion.div>

              {/* Equipo de trabajo */}
              {!isEdit && (
                <motion.div variants={ITEM} data-testid="field-partner">
                  <div className="flex items-center justify-between">
                    <RLabel>Equipo de trabajo</RLabel>
                    {teamCost > 0 && <span className="text-[11px] font-bold text-slate-500 mb-1.5 tabular-nums">Total equipo {formatCurrency(teamCost)}</span>}
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {team.map((m, i) => {
                        const taken = team.filter((x) => x.key !== m.key).map((x) => x.socio_id);
                        const soc = socios.find((x) => x.id === m.socio_id);
                        return (
                          <motion.div key={m.key} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22 }} className="overflow-hidden">
                            <div className="flex items-center gap-2">
                              <div className="w-9 h-9 shrink-0 rounded-xl overflow-hidden grid place-items-center text-[11px] font-black text-white"
                                style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                                {soc?.photo && soc?.photo_content_type
                                  ? <img src={`data:${soc.photo_content_type};base64,${soc.photo}`} alt="" className="w-full h-full object-cover" />
                                  : (soc?.name?.charAt(0).toUpperCase() || <Camera size={14} />)}
                              </div>
                              <div className="relative flex-1 min-w-0">
                                <select value={m.socio_id} onChange={(e) => updTeam(m.key, { socio_id: e.target.value })} data-testid={`team-socio-${i}`}
                                  className="cp-rf-input w-full h-11 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10">
                                  <option value="">Elegir persona…</option>
                                  {socios.filter((x) => !taken.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}{x.role ? ` · ${x.role}` : ""}</option>)}
                                </select>
                                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              </div>
                              <div className="w-28 sm:w-32 flex items-center gap-1 h-11 rounded-xl border border-slate-200 bg-white px-3 cp-rf-input">
                                <span className="text-xs font-black text-slate-400">{currencySymbol}</span>
                                <input type="number" min="0" step="0.01" value={m.payment} onChange={(e) => updTeam(m.key, { payment: e.target.value })}
                                  placeholder="Pago" data-testid={`team-pay-${i}`} className="w-full bg-transparent outline-none text-sm font-bold text-slate-800" />
                              </div>
                              <button type="button" onClick={() => delTeam(m.key)} aria-label="Quitar del equipo"
                                className="w-9 h-9 shrink-0 rounded-full grid place-items-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    {socios.length === 0 ? (
                      <p className="text-xs text-slate-400">Aún no tienes socios. Agrégalos en la sección Socios para asignarlos aquí.</p>
                    ) : team.length < socios.length && (
                      <motion.button type="button" onClick={addTeam} data-testid="team-add" whileTap={{ scale: 0.98 }}
                        className="w-full h-10 rounded-xl border-2 border-dashed border-slate-200 text-xs font-bold text-slate-500 hover:border-violet-300 hover:text-violet-600 flex items-center justify-center gap-1.5 transition-colors">
                        <Plus size={14} /> {team.length ? "Agregar otra persona" : "Agregar fotógrafo, videógrafo o asistente"}
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              )}


              <input value={form.notes} onChange={set("notes")} data-testid="input-notes" className="hidden" />
            </motion.form>

            {/* Columna derecha: el dinero */}
            <motion.div variants={STAGGER_RIGHT} initial="hidden" animate="show"
              className="relative bg-slate-50 border-t md:border-t-0 md:border-l border-slate-100 rounded-b-[28px] md:rounded-bl-none md:rounded-r-[28px] px-6 py-6">
              {/* Halo con el color del evento */}
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
              <AnimatePresence initial={false}>
                <motion.div key={evCfg.fg} aria-hidden className="pointer-events-none absolute -top-32 -right-32 w-80 h-80 rounded-full"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
                  style={{ background: `radial-gradient(circle, ${evCfg.fg}2e 0%, transparent 70%)` }} />
              </AnimatePresence>
              </div>
              <div className="md:sticky md:top-2 flex flex-col gap-4">
              <motion.p variants={ITEM} className="relative text-[11px] font-black uppercase tracking-wider text-slate-500 h-9 flex items-center">Pago</motion.p>
              <RField label={noReq(f.totalAmount)} req dirty={isDirtyField("total_amount")} testId="field-total" error={errOn("total_amount")} shake={shake}>
                <RInput icon={CurrencyGlyph} type="number" min="0" step="0.01" value={form.total_amount} onChange={setTotal} placeholder="5000" required data-testid="input-total" />
              </RField>
              {ff.advance !== false && (
                <motion.div variants={ITEM} className="relative">
                  <RField label={f.advancePaid} dirty={isDirtyField("advance_paid")} testId="field-advance">
                    <RInput icon={Wallet} type="number" min="0" step="0.01" value={form.advance_paid} onChange={set("advance_paid")} placeholder="0" data-testid="input-advance" />
                  </RField>
                  <AnimatePresence>
                    {totalNum > 0 && advNum > totalNum && (
                      <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="mt-1 text-[11px] font-bold text-rose-500" data-testid="advance-too-high">El anticipo es mayor que el total</motion.p>
                    )}
                  </AnimatePresence>
                  <div className="flex gap-1.5 mt-2">
                    {[["25 %", 0.25], ["50 %", 0.5], ["Todo", 1]].map(([l, r]) => {
                      const on = totalNum > 0 && Math.abs(advNum - totalNum * r) < 0.01;
                      return (
                        <motion.button key={l} type="button" disabled={!totalNum} onClick={() => setAdvanceQuick(r)} data-testid={`advance-quick-${Math.round(r * 100)}`}
                          whileTap={{ scale: 0.92 }}
                          className={`relative px-3 py-1 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40 ${on ? "border-slate-900 text-white" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                          {on && <motion.span layoutId="rf-quick-pill" className="absolute inset-0 rounded-[7px] bg-slate-900" transition={{ type: "spring", stiffness: 500, damping: 34 }} />}
                          <span className="relative z-10">{l}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Saldo */}
              <motion.div variants={ITEM}
                className="relative rounded-2xl bg-white border p-4 overflow-hidden transition-colors duration-500"
                style={{ borderColor: fullyPaid ? "#10b981" : undefined, boxShadow: fullyPaid ? "0 0 0 4px rgba(16,185,129,0.12)" : undefined }}>
                <div className="h-4 relative">
                  <AnimatePresence mode="wait" initial={false}>
                    {fullyPaid ? (
                      <motion.p key="paid" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        className="absolute inset-0 flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-emerald-600">
                        <motion.span className="flex" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}><CheckCircle2 size={13} /></motion.span>
                        Pagado completo
                      </motion.p>
                    ) : (
                      <motion.p key="due" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        className="absolute inset-0 text-[11px] font-bold uppercase tracking-wider text-slate-500">Saldo pendiente</motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <p className="text-3xl font-black text-slate-900 mt-1 tabular-nums" data-testid="balance-value">
                  <AnimatedMoney value={balance} show={totalNum > 0} format={formatCurrency} />
                </p>
                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div className={`h-full rounded-full ${fullyPaid ? "cp-rf-shine" : ""}`}
                    initial={false} animate={{ width: `${progress}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }}
                    style={{ background: fullyPaid ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg, var(--t-from,#8b5cf6), #10b981)" }} />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">{!totalNum ? "Escribe el monto" : fullyPaid ? "Todo cubierto 🎉" : `${Math.round(progress)} % pagado`}</p>
              </motion.div>

              {/* Ganancia después de pagar al equipo */}
              <AnimatePresence>
                {teamCost > 0 && totalNum > 0 && (
                  <motion.div initial={{ opacity: 0, y: 8, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden" data-testid="profit-card">
                    <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3 text-sm">
                      <div className="flex justify-between text-slate-500"><span>Pagos al equipo</span><span className="tabular-nums">− {formatCurrency(teamCost)}</span></div>
                      <div className="flex justify-between font-black text-slate-900 mt-1">
                        <span>Te queda</span>
                        <span className={`tabular-nums ${profit < 0 ? "text-rose-600" : "text-emerald-600"}`}><AnimatedMoney value={profit} show format={formatCurrency} /></span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Estado */}
              <motion.div variants={ITEM} className="inline-flex self-start p-1 rounded-full bg-white border border-slate-200">
                {STATUS_OPTIONS.map((s) => {
                  const active = form.status === s.key;
                  return (
                    <button key={s.key} type="button" onClick={() => setStatus({ target: { value: s.key } })}
                      data-testid={`status-toggle-${s.key.toLowerCase()}`}
                      className={`relative px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-colors ${active ? "text-white" : "text-slate-500 hover:text-slate-800"}`}>
                      {active && (
                        <motion.span layoutId="rf-status-pill" className="absolute inset-0 rounded-full"
                          style={{ background: s.key === "Pagado" ? "#10b981" : "var(--t-from,#8b5cf6)" }}
                          transition={{ type: "spring", stiffness: 500, damping: 34 }} />
                      )}
                      <span className="relative z-10">{s.label}</span>
                    </button>
                  );
                })}
              </motion.div>
              <select value={form.status} onChange={setStatus} data-testid="input-status" className="hidden">
                {STATUS_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>

              {/* Lo que falta + guardar */}
              <motion.button variants={ITEM} type="button" onClick={copyConfirm} disabled={!allReady} data-testid="copy-confirmation"
                whileTap={{ scale: 0.97 }}
                title={allReady ? "Copia un mensaje listo para mandar por WhatsApp" : "Llena cliente, fecha y monto primero"}
                className="w-full h-10 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-slate-400 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors">
                <AnimatePresence mode="wait" initial={false}>
                  {copied ? (
                    <motion.span key="ok" className="flex items-center gap-1.5 text-emerald-600" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
                      <Check size={14} strokeWidth={3} /> Copiado, pégalo en WhatsApp
                    </motion.span>
                  ) : (
                    <motion.span key="copy" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Copy size={13} /> Copiar confirmación para el cliente
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>

              <motion.div variants={ITEM} className="pt-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-3" data-testid="required-checklist">
                  {reqDone.map((r) => (
                    <span key={r.k}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-colors duration-300 ${r.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-400"}`}>
                      <AnimatePresence mode="wait" initial={false}>
                        {r.ok ? (
                          <motion.span key="ok" className="flex" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 520, damping: 18 }}><Check size={10} strokeWidth={3.5} /></motion.span>
                        ) : (
                          <motion.span key="no" className="w-1.5 h-1.5 rounded-full bg-slate-300" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} />
                        )}
                      </AnimatePresence>
                      {r.label}
                    </span>
                  ))}
                </div>
                <motion.button type="button" onClick={handleSubmit} disabled={saving || done || (isEdit && dirtyFields.length === 0)} data-testid="submit-form-btn"
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                  animate={{ boxShadow: allReady ? "0 14px 30px -10px rgba(139,92,246,0.65)" : "0 6px 16px -10px rgba(139,92,246,0.4)" }}
                  className={`w-full flex items-center justify-center gap-2 px-6 h-12 rounded-xl text-sm font-black text-white transition-[filter,opacity,background] hover:brightness-110 ${done ? "" : "disabled:opacity-50"} ${allReady && !saving && !done ? "cp-rf-shine" : ""}`}
                  style={{ background: done ? "linear-gradient(135deg,#10b981,#34d399)" : "linear-gradient(135deg, var(--t-from,#8b5cf6), var(--t-to,#ec4899))" }}>
                  <AnimatePresence mode="wait" initial={false}>
                    {done ? (
                      <motion.span key="done" className="flex items-center gap-2" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                        <Check size={17} strokeWidth={3.5} /> ¡Reserva creada!
                      </motion.span>
                    ) : (
                      <motion.span key="label" className="flex items-center gap-2" exit={{ opacity: 0, scale: 0.9 }}>
                        {saving ? <Loader2 size={15} className="animate-spin" /> : (
                          <motion.span className="flex" animate={allReady ? { scale: [1, 1.3, 1], rotate: [0, 12, 0] } : { scale: 1 }} transition={{ duration: 0.5 }}><CheckCircle2 size={15} /></motion.span>
                        )}
                        {submitLabel}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
                <p className="text-[11px] text-slate-400 text-center mt-2 hidden sm:block">
                  {allReady ? "Todo listo · Ctrl + Enter para guardar" : "Ctrl + Enter para guardar · Esc para cerrar"}
                </p>
              </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </MotionConfig>,
    document.body
  );
}


// ── Tipos de evento en tarjetas deslizables ──
function EventTypeSlider({ value, onChange }) {
  const scroller = useRef(null);
  const cardRefs = useRef({});
  const drag = useRef({ down: false, x: 0, left: 0, moved: false });
  const [edges, setEdges] = useState({ left: false, right: true });

  const updateEdges = () => {
    const el = scroller.current; if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    updateEdges();
    const el = scroller.current; if (!el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault(); el.scrollBy({ left: e.deltaY, behavior: "auto" });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", updateEdges);
    return () => { el.removeEventListener("wheel", onWheel); window.removeEventListener("resize", updateEdges); };
  }, []);
  // Lleva la tarjeta elegida al centro
  useEffect(() => {
    const el = scroller.current; const card = cardRefs.current[value];
    if (!el || !card) return;
    const target = card.offsetLeft - (el.clientWidth - card.clientWidth) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [value]);

  const page = (dir) => { const el = scroller.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" }); };
  const onPointerDown = (e) => {
    drag.current = { down: e.pointerType === "mouse", x: e.clientX, left: scroller.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current; if (!d.down) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 5) d.moved = true;
    if (d.moved) scroller.current.scrollLeft = d.left - dx;
  };
  // Al soltar: el clic que sigue a un arrastre se ignora, pero solo ese
  const endDrag = () => { drag.current.down = false; setTimeout(() => { drag.current.moved = false; }, 0); };
  const keys = EVENT_TYPES.map((t) => t.key);
  const onKey = (e) => {
    const i = keys.indexOf(value);
    if (e.key === "ArrowRight") { e.preventDefault(); onChange(keys[Math.min(keys.length - 1, i + 1)]); }
    if (e.key === "ArrowLeft") { e.preventDefault(); onChange(keys[Math.max(0, i - 1)]); }
  };

  return (
    <div className="relative -mx-1" data-testid="event-type-slider">
      <div ref={scroller} onScroll={updateEdges} onKeyDown={onKey}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}
        className="cp-rf-slider flex gap-3 overflow-x-auto snap-x snap-mandatory px-1 pt-1.5 pb-3 select-none"
        style={{
          scrollbarWidth: "none",
          WebkitMaskImage: `linear-gradient(90deg, ${edges.left ? "transparent" : "#000"} 0, #000 28px, #000 calc(100% - 28px), ${edges.right ? "transparent" : "#000"} 100%)`,
          maskImage: `linear-gradient(90deg, ${edges.left ? "transparent" : "#000"} 0, #000 28px, #000 calc(100% - 28px), ${edges.right ? "transparent" : "#000"} 100%)`,
        }}>
        {EVENT_TYPES.map((t, idx) => {
          const c = getEventConfig(t.key); const Icon = c.icon || t.icon;
          const active = value === t.key;
          return (
            <motion.button key={t.key} type="button" ref={(n) => { cardRefs.current[t.key] = n; }}
              data-testid={`event-type-${t.key.toLowerCase().replace(/\s/g, "-")}`}
              aria-pressed={active}
              onClick={() => { if (!drag.current.moved) onChange(t.key); }}
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0, scale: active ? 1 : 0.96 }}
              transition={{ opacity: { delay: 0.05 * idx }, x: { delay: 0.05 * idx, type: "spring", stiffness: 300, damping: 26 }, scale: { type: "spring", stiffness: 400, damping: 26 } }}
              whileHover={{ y: -4 }} whileTap={{ scale: 0.94 }}
              className="relative snap-center shrink-0 w-[138px] h-[104px] rounded-2xl overflow-hidden text-left outline-none focus-visible:ring-4 focus-visible:ring-violet-400/40"
              style={{
                background: active ? `linear-gradient(140deg, ${c.fg}, ${c.fg}cc)` : `linear-gradient(140deg, ${c.fg}12, ${c.fg}06)`,
                border: `1.5px solid ${active ? c.fg : `${c.fg}33`}`,
                boxShadow: active ? `0 16px 30px -14px ${c.fg}` : "none",
                color: active ? "#fff" : c.fg,
              }}>
              {/* icono grande de fondo */}
              <motion.span aria-hidden className="absolute -right-3 -bottom-4 flex"
                animate={{ rotate: active ? -8 : -16, scale: active ? 1.1 : 1, opacity: active ? 0.22 : 0.12 }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}>
                <Icon size={78} strokeWidth={1.6} />
              </motion.span>
              {/* brillo al elegir */}
              <AnimatePresence>
                {active && (
                  <motion.span key="shine" aria-hidden className="absolute inset-0"
                    initial={{ x: "-120%" }} animate={{ x: "120%" }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}
                    style={{ background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)" }} />
                )}
              </AnimatePresence>
              <div className="relative h-full flex flex-col justify-between p-3">
                <div className="flex items-start justify-between">
                  <span className="w-9 h-9 rounded-xl grid place-items-center"
                    style={{ background: active ? "rgba(255,255,255,0.22)" : "#fff", boxShadow: active ? "none" : `0 4px 12px -6px ${c.fg}` }}>
                    <Icon size={18} />
                  </span>
                  <AnimatePresence>
                    {active && (
                      <motion.span key="ok" className="w-5 h-5 rounded-full bg-white grid place-items-center"
                        initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}
                        transition={{ type: "spring", stiffness: 520, damping: 16 }} style={{ color: c.fg }}>
                        <Check size={12} strokeWidth={3.5} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <span className="text-[13px] font-black leading-tight">{getEventTypeName(t.key)}</span>
              </div>
            </motion.button>
          );
        })}
      </div>
      {/* Flechas */}
      <AnimatePresence>
        {edges.left && (
          <motion.button key="l" type="button" onClick={() => page(-1)} aria-label="Ver tipos anteriores"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className="absolute left-0 top-[46%] -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md grid place-items-center text-slate-600 hover:text-slate-900">
            <ChevronLeft size={16} />
          </motion.button>
        )}
        {edges.right && (
          <motion.button key="r" type="button" onClick={() => page(1)} aria-label="Ver más tipos"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className="absolute right-0 top-[46%] -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md grid place-items-center text-slate-600 hover:text-slate-900">
            <ChevronRight size={16} />
          </motion.button>
        )}
      </AnimatePresence>
      {/* Puntos */}
      <div className="flex justify-center gap-1.5 -mt-0.5">
        {EVENT_TYPES.map((t) => {
          const on = value === t.key; const c = getEventConfig(t.key);
          return (
            <motion.button key={t.key} type="button" aria-label={getEventTypeName(t.key)} onClick={() => onChange(t.key)}
              animate={{ width: on ? 18 : 6, backgroundColor: on ? c.fg : "#cbd5e1" }} transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="h-1.5 rounded-full" />
          );
        })}
      </div>
    </div>
  );
}

// ── Piezas del formulario (estilo claro) ──
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
function fechaLarga(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const t = `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]} ${y}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const LOC_TYPES = [
  { key: "maquillaje", label: "Maquillaje", emoji: "💄" },
  { key: "ceremonia",  label: "Ceremonia",  emoji: "⛪" },
  { key: "fiesta",     label: "Fiesta",     emoji: "🎉" },
];
function relDays(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((new Date(y, m - 1, d) - t) / 86400000);
  if (n === 0) return "es hoy";
  if (n === 1) return "es mañana";
  if (n > 1) return `faltan ${n} días`;
  return n === -1 ? "fue ayer" : `fue hace ${-n} días`;
}

const ITEM = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } },
};
const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } } };
const STAGGER_RIGHT = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 260, damping: 30, delay: 0.06, staggerChildren: 0.05, delayChildren: 0.16 } },
};
// «Sábado 28 nov» (con el año solo si no es el actual)
function fechaMedia(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dia = DIAS[new Date(y, m - 1, d).getDay()];
  const yr = y !== new Date().getFullYear() ? ` ${y}` : "";
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)} ${d} ${MESES[m - 1].slice(0, 3)}${yr}`;
}
function fechaCorta(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dia = DIAS[new Date(y, m - 1, d).getDay()].slice(0, 3);
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)} ${d} ${MESES[m - 1].slice(0, 3)}`;
}

// Número que «corre» hasta su nuevo valor (saldo)
function AnimatedMoney({ value, show, format }) {
  const [v, setV] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current; prev.current = value;
    if (from === value) { setV(value); return; }
    const ctl = fmAnimate(from, value, { duration: 0.5, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    return () => ctl.stop();
  }, [value]);
  if (!show) return "—";
  return format(Math.abs(v - value) < 0.5 ? value : Math.round(v));
}

function RLabel({ children, req }) {
  return <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{children}{req && <span className="text-rose-500"> *</span>}</p>;
}

function RField({ label, req, dirty, testId, children, error, shake = 0 }) {
  return (
    <motion.div variants={ITEM} className={`relative ${error ? "cp-rf-err" : ""}`} data-testid={testId}>
      <RLabel req={req}>{label}{dirty && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" data-testid="dirty-dot" />}</RLabel>
      <motion.div key={error ? `e${shake}` : "ok"} animate={error ? { x: [0, -7, 7, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.4 }}>
        {children}
      </motion.div>
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-1 text-[11px] font-bold text-rose-500" data-testid={`${testId}-error`}>Falta este dato</motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RInput({ icon: Icon, className = "", ...p }) {
  return (
    <div className="relative group">
      {Icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-violet-500 transition-colors pointer-events-none flex"><Icon size={15} /></span>}
      <input {...p}
        className={`cp-rf-input w-full h-11 rounded-xl border border-slate-200 bg-white ${Icon ? "pl-9" : "pl-3"} pr-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 transition ${className}`} />
    </div>
  );
}

function ClientAutocomplete({ value, clients, onChange, onPick }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const q = (value || "").trim().toLowerCase();
  const sug = q ? clients.filter((c) => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q).slice(0, 5) : [];
  const show = open && sug.length > 0;
  const pick = (c) => { onPick(c); setOpen(false); };
  const onKeyDown = (e) => {
    if (!show) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % sug.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + sug.length) % sug.length); }
    else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); pick(sug[Math.min(idx, sug.length - 1)]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };
  const mark = (name) => {
    const i = name.toLowerCase().indexOf(q);
    if (i < 0 || !q) return name;
    return <>{name.slice(0, i)}<b className="text-violet-700">{name.slice(i, i + q.length)}</b>{name.slice(i + q.length)}</>;
  };
  return (
    <div className="relative">
      <RInput icon={User} value={value} placeholder="María García" required data-testid="input-client-name" autoComplete="off"
        onKeyDown={onKeyDown}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setIdx(0); }} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      <AnimatePresence>
        {show && (
          <motion.div data-rf-popup initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}
            className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden" data-testid="client-suggestions">
            <p className="px-3 pt-2 pb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Clientes anteriores <span className="normal-case tracking-normal font-semibold">↑ ↓ y Enter</span>
            </p>
            {sug.map((c, i) => (
              <button key={c.name} type="button" onMouseDown={() => pick(c)} onMouseEnter={() => setIdx(i)}
                className={`w-full flex justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${i === idx ? "bg-violet-50" : ""}`}>
                <span className="text-slate-800 truncate">{mark(c.name)}</span><span className="text-slate-400 text-xs shrink-0">{c.phone}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Teléfono: agrupa los números de 4 en 4 (5555 1234); con +código lo deja como lo escribes
function formatPhone(v) {
  const raw = String(v || "");
  if (raw.trim().startsWith("+")) return raw.replace(/[^\d+ ]/g, "");
  const d = raw.replace(/\D/g, "").slice(0, 15);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ");
}


// Atajos de fecha: hoy y los próximos sábados (los eventos casi siempre caen en sábado)
function quickDates(todayIso) {
  const [y, m, d] = todayIso.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const sat = new Date(base); sat.setDate(base.getDate() + ((6 - base.getDay() + 7) % 7));
  const next = new Date(sat); next.setDate(sat.getDate() + 7);
  const after = new Date(sat); after.setDate(sat.getDate() + 14);
  return [
    { key: "hoy", label: "Hoy", iso: todayIso },
    { key: "sabado", label: base.getDay() === 6 ? "Este sábado (hoy)" : "Este sábado", iso: iso(sat) },
    { key: "proximo", label: "Próximo sábado", iso: iso(next) },
    { key: "en2", label: `Sáb ${after.getDate()} ${MESES[after.getMonth()].slice(0, 3)}`, iso: iso(after) },
  ];
}

// Abre un menú hacia arriba si abajo no cabe (pero arriba sí)
function useOpenUp(ref, open, height) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setUp(below < height + 16 && r.top > below);
  }, [open, ref, height]);
  return up;
}

// ── Hora: presets de eventos + reloj sencillo (12 h) ──
const TIME_PRESETS = ["10:00", "12:00", "14:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
function parseHM(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || "");
  return m ? { h: +m[1], m: +m[2] } : null;
}
function to12(v) {
  const t = parseHM(v); if (!t) return "";
  const ap = t.h >= 12 ? "p. m." : "a. m.";
  const h = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${h}:${String(t.m).padStart(2, "0")} ${ap}`;
}
function dayPart(v) {
  const t = parseHM(v); if (!t) return { label: "", icon: Clock, color: "#94a3b8" };
  if (t.h < 12) return { label: "Mañana", icon: Sunrise, color: "#f59e0b" };
  if (t.h < 17) return { label: "Tarde", icon: Sun, color: "#f97316" };
  if (t.h < 19) return { label: "Atardecer", icon: Sunset, color: "#ec4899" };
  return { label: "Noche", icon: Moon, color: "#6366f1" };
}
function RTimeField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const t = parseHM(value) || { h: 17, m: 0 };
  const pm = t.h >= 12;
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  const part = dayPart(value);
  const PartIcon = part.icon;
  const up = useOpenUp(ref, open, 440);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const setHM = (h24, m) => onChange(`${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  const pickHour = (h) => setHM(pm ? (h % 12) + 12 : h % 12, t.m);
  const pickMin = (m) => setHM(t.h, m);
  const pickAmPm = (isPm) => { if (isPm !== pm) setHM(isPm ? t.h + 12 : t.h - 12, t.m); };
  const bump = (mins) => { const total = (t.h * 60 + t.m + mins + 1440) % 1440; setHM(Math.floor(total / 60), total % 60); };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} data-testid="input-event-time-pretty"
        className={`cp-rf-input w-full h-11 rounded-xl border bg-white pl-9 pr-3 flex items-center justify-between text-left text-sm outline-none transition ${open ? "border-violet-400 ring-4 ring-violet-500/10" : "border-slate-200"} ${value ? "text-slate-800" : "text-slate-400"}`}>
        <span className="tabular-nums">{value ? to12(value) : "Elegir hora"}</span>
        <AnimatePresence mode="wait" initial={false}>
          {value && (
            <motion.span key={part.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ color: part.color, background: `${part.color}1a` }}>{part.label}</motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={part.label || "none"} className="absolute left-3 top-[22px] -translate-y-1/2 pointer-events-none flex"
          initial={{ rotate: -60, scale: 0.5, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 60, scale: 0.5, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 20 }} style={{ color: value ? part.color : "#94a3b8" }}>
          <PartIcon size={15} />
        </motion.span>
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div data-rf-popup initial={{ opacity: 0, y: up ? 6 : -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: up ? 6 : -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className={`absolute right-0 z-30 w-[300px] max-w-[85vw] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl ${up ? "bottom-full mb-2" : "mt-2"}`} data-testid="time-popup">
            {/* Hora grande con +/- */}
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={() => bump(-15)} aria-label="15 minutos menos"
                className="w-8 h-8 rounded-full grid place-items-center text-slate-500 hover:bg-slate-100 text-lg font-black">−</button>
              <div className="text-center">
                <p className="text-3xl font-black text-slate-900 tabular-nums leading-none">{h12}:{String(t.m).padStart(2, "0")}</p>
                <p className="text-[11px] font-bold mt-1" style={{ color: dayPart(`${t.h}:${t.m}`).color }}>{pm ? "p. m." : "a. m."} · {dayPart(`${t.h}:${t.m}`).label}</p>
              </div>
              <button type="button" onClick={() => bump(15)} aria-label="15 minutos más"
                className="w-8 h-8 rounded-full grid place-items-center text-slate-500 hover:bg-slate-100 text-lg font-black">+</button>
            </div>

            {/* Horas típicas de evento */}
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Horas comunes</p>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {TIME_PRESETS.map((v) => {
                const on = value === v;
                return (
                  <button key={v} type="button" onClick={() => { onChange(v); setOpen(false); }} data-testid={`time-preset-${v}`}
                    className={`h-8 rounded-lg text-[11px] font-bold border transition-colors ${on ? "border-transparent text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    style={on ? { background: "linear-gradient(135deg, var(--t-from,#8b5cf6), var(--t-to,#ec4899))" } : undefined}>
                    {to12(v).replace(":00", "").replace(" p. m.", " pm").replace(" a. m.", " am")}
                  </button>
                );
              })}
            </div>

            {/* Reloj: hora, minutos, a. m./p. m. */}
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Hora</p>
              <div className="inline-flex p-0.5 rounded-full bg-slate-100">
                {[["a. m.", false], ["p. m.", true]].map(([l, isPm]) => (
                  <button key={l} type="button" onClick={() => pickAmPm(isPm)}
                    className={`relative px-2.5 py-0.5 rounded-full text-[10px] font-black transition-colors ${pm === isPm ? "text-white" : "text-slate-500"}`}>
                    {pm === isPm && <motion.span layoutId="rf-ampm" className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 500, damping: 34 }} />}
                    <span className="relative z-10">{l}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1 mb-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                <button key={h} type="button" onClick={() => pickHour(h)} data-testid={`time-hour-${h}`}
                  className={`h-8 rounded-lg text-xs font-bold transition-colors ${value && h12 === h ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{h}</button>
              ))}
            </div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Minutos</p>
            <div className="grid grid-cols-4 gap-1 mb-3">
              {[0, 15, 30, 45].map((m) => (
                <button key={m} type="button" onClick={() => pickMin(m)} data-testid={`time-min-${m}`}
                  className={`h-8 rounded-lg text-xs font-bold transition-colors ${value && t.m === m ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>:{String(m).padStart(2, "0")}</button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-[11px] font-bold text-slate-400 hover:text-rose-500">Sin hora</button>
              <button type="button" onClick={() => { if (!value) setHM(t.h, t.m); setOpen(false); }} data-testid="time-done"
                className="px-4 h-8 rounded-lg text-xs font-black text-white"
                style={{ background: "linear-gradient(135deg, var(--t-from,#8b5cf6), var(--t-to,#ec4899))" }}>Listo</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RDateField({ value, busy, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const base = value ? new Date(value + "T12:00:00") : new Date();
  const [cur, setCur] = useState({ y: base.getFullYear(), m: base.getMonth() });
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const first = new Date(cur.y, cur.m, 1); const offset = (first.getDay() + 6) % 7;
  const days = new Date(cur.y, cur.m + 1, 0).getDate();
  const iso = (d) => `${cur.y}-${String(cur.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const move = (n) => setCur((c) => { const dt = new Date(c.y, c.m + n, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; });
  const today = new Date(); const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const up = useOpenUp(ref, open, 410);
  const nBusy = value ? (busy[value] || []).length : 0;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} data-testid="input-event-date-pretty"
        className={`cp-rf-input w-full h-11 rounded-xl border bg-white pl-9 pr-2 flex items-center justify-between gap-2 text-left text-sm outline-none transition ${open ? "border-violet-400 ring-4 ring-violet-500/10" : "border-slate-200"} ${value ? "text-slate-800" : "text-slate-400"}`}>
        <span className="truncate" title={value ? fechaLarga(value) : undefined}>{value ? fechaMedia(value) : "Elegir fecha"}</span>
        <AnimatePresence mode="wait" initial={false}>
          {value && (
            <motion.span key={value} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${nBusy ? "bg-amber-100 text-amber-700" : value < todayIso ? "bg-slate-100 text-slate-500" : "bg-violet-100 text-violet-700"}`}
              data-testid="date-countdown">{relDays(value)}</motion.span>
          )}
        </AnimatePresence>
      </button>
      <CalIcon size={15} className={`absolute left-3 top-[22px] -translate-y-1/2 pointer-events-none transition-colors ${open ? "text-violet-500" : "text-slate-400"}`} />
      {open && (
        <div data-rf-popup className={`absolute z-30 w-[310px] max-w-[85vw] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl ${up ? "bottom-full mb-2" : "mt-2"}`}>
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => move(-1)} className="w-8 h-8 rounded-full grid place-items-center hover:bg-slate-100 text-slate-500" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
            <p className="font-black text-slate-900">{MESES[cur.m].charAt(0).toUpperCase() + MESES[cur.m].slice(1)} {cur.y}</p>
            <button type="button" onClick={() => move(1)} className="w-8 h-8 rounded-full grid place-items-center hover:bg-slate-100 text-slate-500" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {["L","M","M","J","V","S","D"].map((x, i) => <span key={i} className="text-[10px] font-bold text-slate-400 py-1">{x}</span>)}
            {Array.from({ length: offset }).map((_, i) => <span key={`e${i}`} />)}
            {Array.from({ length: days }).map((_, i) => {
              const d = i + 1; const k = iso(d); const n = (busy[k] || []).length; const sel = value === k; const past = k < todayIso;
              return (
                <button key={k} type="button" onClick={() => { onChange(k); setOpen(false); }}
                  className={`relative h-9 rounded-xl text-sm font-bold transition ${sel ? "text-white" : past ? "text-slate-300 hover:bg-slate-50" : "text-slate-700 hover:bg-slate-100"} ${k === todayIso && !sel ? "ring-1 ring-slate-300" : ""}`}
                  style={sel ? { background: "linear-gradient(135deg, var(--t-from,#8b5cf6), var(--t-to,#ec4899))" } : undefined}>
                  {d}
                  {n > 0 && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">{Array.from({ length: Math.min(n, 3) }).map((_, j) => <i key={j} className={`w-1 h-1 rounded-full ${sel ? "bg-white" : "bg-rose-500"}`} />)}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
            {quickDates(todayIso).map((qd) => {
              const n = (busy[qd.iso] || []).length; const on = value === qd.iso;
              return (
                <button key={qd.label} type="button" onClick={() => { onChange(qd.iso); setOpen(false); }} data-testid={`date-quick-${qd.key}`}
                  className={`relative px-2.5 h-7 rounded-lg text-[11px] font-bold border transition-colors ${on ? "border-transparent text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                  style={on ? { background: "linear-gradient(135deg, var(--t-from,#8b5cf6), var(--t-to,#ec4899))" } : undefined}>
                  {qd.label}
                  {n > 0 && <i className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />}
                </button>
              );
            })}
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-2"><i className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Días con eventos ya reservados</p>
        </div>
      )}
    </div>
  );
}

// Socio/Fotógrafo — al crear una reserva
function PartnerPickerField({ socios, value, onChange, payment, onPaymentChange, currencySymbol }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = socios.find((s) => s.id === value);
  const ROLE_ICON = { "Fotógrafo": Camera, "Videógrafo": Video, "Asistente": Users };
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const Avatar = ({ s, cls }) => (s.photo && s.photo_content_type
    ? <img src={`data:${s.photo_content_type};base64,${s.photo}`} alt="" className={`${cls} rounded-lg object-cover shrink-0`} />
    : <div className={`${cls} rounded-lg grid place-items-center shrink-0 text-[10px] font-black text-white`} style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>{s.name?.charAt(0).toUpperCase()}</div>);
  return (
    <div className="relative" data-testid="field-partner" ref={ref}>
      <RLabel>Fotógrafo / socio</RLabel>
      <button type="button" onClick={() => setOpen((o) => !o)} data-testid="partner-picker-btn"
        className={`cp-rf-input w-full h-11 rounded-xl border bg-white pl-3 pr-3 flex items-center gap-2 text-left text-sm transition ${open ? "border-violet-400 ring-4 ring-violet-500/10" : "border-slate-200"}`}>
        {selected ? (<>
          <Avatar s={selected} cls="w-6 h-6" />
          <span className="flex-1 min-w-0 truncate font-bold text-slate-800">{selected.name}</span>
          <span role="button" tabIndex={0} aria-label="Quitar socio" data-testid="partner-picker-clear"
            onClick={(e) => { e.stopPropagation(); onChange(""); onPaymentChange(""); }}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-400"><X size={13} /></span>
        </>) : (<>
          <Camera size={15} className="text-slate-400" />
          <span className="flex-1 truncate text-slate-400">{socios.length === 0 ? "Sin socios registrados" : "Sin asignar (opcional)"}</span>
          <ChevronDown size={15} className="text-slate-400" />
        </>)}
      </button>
      {selected && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] text-slate-500 shrink-0">Se le pagará</span>
          <div className="flex-1 flex items-center gap-1 h-8 rounded-lg border border-slate-200 bg-white px-2">
            <span className="text-xs font-black text-slate-500">{currencySymbol}</span>
            <input type="number" min="0" step="0.01" value={payment} onChange={(e) => onPaymentChange(e.target.value)} placeholder="0"
              data-testid="partner-payment-input" className="w-full bg-transparent outline-none text-sm font-bold text-slate-800" />
          </div>
        </div>
      )}
      {open && socios.length > 0 && (
        <div data-partner-popup className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl" data-testid="partner-picker-list">
          {socios.map((s) => {
            const Icon = ROLE_ICON[s.role] || Users; const isSel = value === s.id;
            return (
              <button type="button" key={s.id} onClick={() => { onChange(s.id); setOpen(false); }} data-testid={`partner-picker-option-${s.id}`}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${isSel ? "bg-violet-50" : ""}`}>
                <Avatar s={s} cls="w-7 h-7" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-800 truncate">{s.name}</p>
                  <p className="text-[10px] text-slate-500 truncate flex items-center gap-1"><Icon size={9} /> {s.role}</p>
                </div>
                {isSel && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
