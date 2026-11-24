import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Download, Globe, DollarSign,
  Bell, BellRing, Database, CheckCircle, XCircle, RefreshCw,
  Wifi, WifiOff, MessageCircle, Mail, Loader2, Monitor,
  Package, AlertCircle, Zap, Clock, ChevronDown, ChevronRight, Clipboard,
  Github, GitBranch, GitCommit, AlertTriangle, ArrowDownCircle, ExternalLink, CheckCircle2, Cog,
} from "lucide-react";
import { useSettings, CURRENCIES } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { getAppSettings, updateAppSettings, getDbStats, testDbConnection, switchDatabase, resetDatabase, sendTestReminder, testEmailConnection, getBackupHistory, createServerBackup, deleteBackupFile, downloadBackupUrl, restoreBackup, getGithubConfig, saveGithubConfig, checkGithubUpdates, applyGithubUpdate, getDesktopNotifStatus, testDesktopNotif, notifyNextDesktop, openNotifSettings } from "@/lib/api";
import { apiMsg } from "@/lib/apiMsg";
import { celebrateUpdate } from "@/lib/celebrations";
import { Section, SectionSearchBar } from "@/components/appearance/SectionShell";
import { SectionSearchContext } from "@/lib/sectionSearch";
import { SecuritySection } from "@/components/SecuritySection";
import LicenseSection from "@/components/LicenseSection";
import IncidentsPanel from "@/components/IncidentsPanel";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2, staggerChildren: 0.04 } } };

function StatCard({ label, value }) {
  return (
    <div className="bg-white/60 rounded-2xl p-3 text-center">
      <div className="text-base font-black text-slate-800" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>{value}</div>
      <div className="text-[11px] text-slate-400 font-semibold mt-0.5">{label}</div>
    </div>
  );
}

// WhatsApp link generator
function buildWhatsappLink(phone, events) {
  const clean = (phone || "").replace(/\D/g, "");
  if (!clean) return null;
  const text = events && events.length > 0
    ? `Hola! Recordatorio de Cinema Productions:\n${events.map(e => `• ${e.client_name} — ${e.event_type} el ${e.event_date}`).join("\n")}`
    : "Hola! Recordatorio de Cinema Productions: Tienes eventos próximos.";
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

export default function Settings() {
  const [searchQuery, setSearchQuery] = useState("");
  const { language, currency, tr, changeLanguage, changeCurrency, formatCurrency } = useSettings();
  const { toast } = useToast();
  const s = tr.settings;

  // Notification + Business settings state
  const [notif, setNotif] = useState({    reminders_enabled: false,
    reminder_periods: [3],
    reminder_time: "09:00",
    reminder_hours_before: 0,
    admin_email: "",
    admin_whatsapp: "",
    notification_channel: "email",
    resend_api_key: "",
    telegram_enabled: false,
    telegram_bot_token: "",
    telegram_chat_id: "",
    ntfy_enabled: false,
    ntfy_topic: "",
    email_enabled: true,
    // WhatsApp Cloud API (Meta)
    whatsapp_enabled: false,
    whatsapp_access_token: "",
    whatsapp_phone_number_id: "",
    whatsapp_recipient: "",
    whatsapp_template_name: "",
    // Google OAuth (Gmail) — user-provided credentials
    google_client_id: "",
    google_client_secret: "",
    // SMS placeholder
    sms_enabled: false,
    // Business config
    company_name: "",
    company_address: "",
    company_phone: "",
    company_website: "",
    company_tax_id: "",
    timezone: "America/Guatemala",
    default_advance_pct: 30,
    business_hours_start: "08:00",
    business_hours_end: "22:00",
    backup_retention: 10,
    auto_cleanup_months: "",
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [telegramTestLoading, setTelegramTestLoading] = useState(false);
  const [ntfyTestLoading, setNtfyTestLoading] = useState(false);
  // Gmail OAuth state
  const [gmailStatus, setGmailStatus] = useState({ connected: false, email: "", credentials_configured: false, redirect_uri: "" });
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailTestResult, setGmailTestResult] = useState(null);
  // WhatsApp state
  const [waVerifyBusy, setWaVerifyBusy] = useState(false);
  const [waTestBusy, setWaTestBusy] = useState(false);
  const [waResult, setWaResult] = useState(null);
  // Reminders UI: which channel accordion is expanded (only one at a time)
  const [openChannel, setOpenChannel] = useState(null);

  // Helper: paste from clipboard into a notif field
  const pasteInto = async (field) => {
    try {
      const text = (await navigator.clipboard.readText())?.trim();
      if (!text) { toast({ title: "Portapapeles vacío", variant: "destructive" }); return; }
      setNotif(p => ({ ...p, [field]: text }));
      toast({ title: "Pegado ✓" });
    } catch {
      toast({ title: "No se pudo leer el portapapeles", description: "Permite el acceso o pega manualmente", variant: "destructive" });
    }
  };

  // Desktop app has been moved to Database page → "Soporte avanzado"

  // ── GitHub updates state (App de Escritorio) ─────────────────
  const [ghConfig, setGhConfig] = useState({ repo_url: "", branch: "main", is_configured: false, suggested_repo: "" });
  const [ghDraft, setGhDraft] = useState({ repo_url: "", branch: "main", token: "" });
  const [ghSaving, setGhSaving] = useState(false);
  const [ghChecking, setGhChecking] = useState(false);
  const [ghApplying, setGhApplying] = useState(false);
  const [ghResult, setGhResult] = useState(null);
  const [ghAutoCheck, setGhAutoCheck] = useState(true);

  const loadGhConfig = React.useCallback(async () => {
    try {
      const cfg = await getGithubConfig();
      setGhConfig(cfg);
      // Precargar el draft con lo que hay (o con el sugerido si no hay nada guardado)
      setGhDraft({
        repo_url: cfg.repo_url || cfg.suggested_repo || "",
        branch: cfg.branch || "main",
        token: "",
      });
    } catch { /* noop */ }
  }, []);

  useEffect(() => { loadGhConfig(); }, [loadGhConfig]);

  const handleGhCheck = async (silent = false) => {
    setGhChecking(true);
    setGhResult(null);
    try {
      const res = await checkGithubUpdates();
      setGhResult(res);
      if (!silent) {
        if (res.has_updates) {
          toast({ title: `¡${res.commits_ahead} actualización(es) disponible(s)!`, description: `Rama: ${res.branch}` });
        } else {
          toast({ title: "Todo al día ✓", description: "No hay actualizaciones nuevas en GitHub" });
        }
      }
    } catch (err) {
      if (!silent) toast({ title: "Error al buscar", description: err?.response?.data?.detail || String(err), variant: "destructive" });
    } finally {
      setGhChecking(false);
    }
  };

  const handleGhApply = async () => {
    if (!window.confirm("¿Aplicar la actualización desde GitHub?\n\nEsto sobreescribirá cambios locales y reiniciará los servicios.")) return;
    setGhApplying(true);
    try {
      const res = await applyGithubUpdate(true);
      toast({ title: "🎉 ¡Actualización aplicada!", description: `Nuevo commit: ${res.new_sha_short}. Reiniciando…` });
      celebrateUpdate();
      setTimeout(() => window.location.reload(), 5000);
    } catch (err) {
      toast({ title: "Error al aplicar", description: err?.response?.data?.detail || String(err), variant: "destructive" });
    } finally {
      setGhApplying(false);
    }
  };

  const handleGhSaveRepo = async () => {
    const url = ghDraft.repo_url.trim();
    if (!url) {
      toast({ title: language === "es" ? "Ingresa una URL de GitHub válida" : "Enter a valid GitHub URL", variant: "destructive" });
      return;
    }
    if (!/^https?:\/\/github\.com\/[^/]+\/[^/]+/.test(url)) {
      toast({ title: language === "es" ? "URL inválida" : "Invalid URL", description: language === "es" ? "Formato: https://github.com/usuario/repositorio" : "Format: https://github.com/user/repo", variant: "destructive" });
      return;
    }
    setGhSaving(true);
    try {
      await saveGithubConfig({
        repo_url: url,
        branch: (ghDraft.branch || "main").trim(),
        token: ghDraft.token || undefined,
      });
      toast({ title: language === "es" ? "Repositorio guardado ✓" : "Repository saved ✓" });
      await loadGhConfig();
      // Reset del resultado previo para que el usuario deba refrescar
      setGhResult(null);
    } catch (err) {
      const detail = err?.response?.data?.detail || String(err);
      toast({ title: language === "es" ? "Error al guardar" : "Save error", description: detail, variant: "destructive" });
    } finally {
      setGhSaving(false);
    }
  };

  // Auto-check GitHub al abrir Ajustes (una vez, si hay repo configurado)
  useEffect(() => {
    if (ghAutoCheck && ghConfig.is_configured) {
      handleGhCheck(true);
      setGhAutoCheck(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghConfig.is_configured]);

  // Deployment / hosting state
  const [deployUrl,        setDeployUrl]        = useState("");
  const [healthLoading,    setHealthLoading]     = useState(false);
  const [healthResult,     setHealthResult]      = useState(null);
  const [expandedPlatform, setExpandedPlatform]  = useState(null);

  // ── Email test ───────────────────────────────────────────────────
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [emailTestResult, setEmailTestResult]   = useState(null);

  // ── Timezone sync ─────────────────────────────────────────────────
  const [timezoneMsg, setTimezoneMsg] = useState(null);

  const handleSyncTimezone = () => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setNotif(p => ({ ...p, timezone: detected }));
      setTimezoneMsg({ ok: true, tz: detected });
      toast({ title: `Zona horaria sincronizada: ${detected}` });
    } catch {
      setTimezoneMsg({ ok: false });
      toast({ title: "No se pudo detectar la zona horaria", variant: "destructive" });
    }
  };

  const handleTestEmail = async () => {
    setEmailTestLoading(true);
    setEmailTestResult(null);
    try {
      const res = await testEmailConnection();
      setEmailTestResult({ ok: true, msg: res.message });
      toast({ title: "✓ " + res.message });
    } catch (e) {
      const msg = e.response?.data?.detail || "Error al enviar email de prueba";
      setEmailTestResult({ ok: false, msg });
      toast({ title: msg, variant: "destructive" });
    } finally { setEmailTestLoading(false); }
  };

  // DB state
  const [dbStats, setDbStats] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [newDbUrl, setNewDbUrl] = useState("");
  const [dbTestResult, setDbTestResult] = useState(null);
  const [dbConnecting, setDbConnecting] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbResetting, setDbResetting] = useState(false);

  // Backup state
  const [backupHistory, setBackupHistory] = useState([]);
  const [backupCreating, setBackupCreating] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const notifReady = React.useRef(false);
  const restoreInputRef = React.useRef(null);

  useEffect(() => {
    getAppSettings().then(data => {
      if (data && Object.keys(data).length > 0) {
        setNotif(prev => ({
          ...prev,
          reminders_enabled: data.reminders_enabled ?? false,
          reminder_periods: data.reminder_periods ?? [data.reminder_days ?? 3],
          reminder_time: data.reminder_time ?? "09:00",
          reminder_hours_before: data.reminder_hours_before ?? 0,
          admin_email: data.admin_email ?? "",
          admin_whatsapp: data.admin_whatsapp ?? "",
          notification_channel: data.notification_channel ?? "email",
          resend_api_key: data.has_resend_key ? "re_" + "•".repeat(20) + "••••" : "",
          telegram_enabled: data.telegram_enabled ?? false,
          telegram_bot_token: data.has_telegram_token ? "•".repeat(8) + "•".repeat(20) + "••••" : "",
          telegram_chat_id: data.telegram_chat_id ?? "",
          ntfy_enabled: data.ntfy_enabled ?? false,
          email_enabled: data.email_enabled ?? true,
          ntfy_topic: data.ntfy_topic ?? "",
          // WhatsApp Cloud API
          whatsapp_enabled: data.whatsapp_enabled ?? false,
          whatsapp_access_token: data.has_whatsapp_token ? "•".repeat(24) + "••••" : "",
          whatsapp_phone_number_id: data.whatsapp_phone_number_id ?? "",
          whatsapp_recipient: data.whatsapp_recipient ?? "",
          whatsapp_template_name: data.whatsapp_template_name ?? "",
          // Google OAuth credentials
          google_client_id: data.google_client_id ?? "",
          google_client_secret: data.has_google_client_secret ? "•".repeat(24) + "••••" : "",
          // SMS
          sms_enabled: data.sms_enabled ?? false,
          // Business config
          company_name: data.company_name ?? "",
          company_address: data.company_address ?? "",
          company_phone: data.company_phone ?? "",
          company_website: data.company_website ?? "",
          company_tax_id: data.company_tax_id ?? "",
          timezone: data.timezone ?? "America/Guatemala",
          default_advance_pct: data.default_advance_pct ?? 30,
          business_hours_start: data.business_hours_start ?? "08:00",
          business_hours_end: data.business_hours_end ?? "22:00",
          backup_retention: data.backup_retention ?? 10,
          auto_cleanup_months: data.auto_cleanup_months ?? "",
        }));
        notifReady.current = true;
      }
    }).catch(() => {});
    loadDbStats();
    loadGmailStatus();
    // Handle OAuth redirect toast
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("gmail_ok")) {
        toast({ title: "✓ Gmail conectado correctamente" });
        window.history.replaceState({}, "", window.location.pathname);
      } else if (params.get("gmail_error")) {
        toast({ title: "Error al conectar Gmail", description: params.get("gmail_error"), variant: "destructive" });
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch { /* noop */ }
  }, []);

  const loadGmailStatus = async () => {
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      const r = await fetch(`${API}/api/oauth/gmail/status`);
      if (r.ok) setGmailStatus(await r.json());
    } catch { /* noop */ }
  };

  const handleConnectGmail = async () => {
    setGmailBusy(true);
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      // First save credentials + settings so backend has them
      await updateAppSettings({
        google_client_id: notif.google_client_id,
        ...(notif.google_client_secret && !notif.google_client_secret.includes("•") ? { google_client_secret: notif.google_client_secret } : {}),
      });
      const r = await fetch(`${API}/api/oauth/gmail/start`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "Error al iniciar OAuth");
      window.location.href = j.url;
    } catch (e) {
      toast({ title: "Error al conectar Gmail", description: e.message, variant: "destructive" });
      setGmailBusy(false);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!window.confirm("¿Desconectar Gmail? Los recordatorios ya no llegarán por este canal.")) return;
    setGmailBusy(true);
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      await fetch(`${API}/api/oauth/gmail/disconnect`, { method: "DELETE" });
      toast({ title: "Gmail desconectado" });
      await loadGmailStatus();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setGmailBusy(false); }
  };

  const handleTestGmail = async () => {
    setGmailBusy(true);
    setGmailTestResult(null);
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      const r = await fetch(`${API}/api/oauth/gmail/test`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "Error al enviar prueba");
      setGmailTestResult({ ok: true, msg: j.message });
    } catch (e) {
      setGmailTestResult({ ok: false, msg: e.message });
    } finally { setGmailBusy(false); }
  };

  const handleVerifyWhatsApp = async () => {
    setWaVerifyBusy(true);
    setWaResult(null);
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      // Save first if user typed new credentials
      const payload = {};
      if (notif.whatsapp_access_token && !notif.whatsapp_access_token.includes("•")) payload.access_token = notif.whatsapp_access_token;
      if (notif.whatsapp_phone_number_id) payload.phone_number_id = notif.whatsapp_phone_number_id;
      const r = await fetch(`${API}/api/whatsapp/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.ok) setWaResult({ ok: true, msg: `Conectado: ${j.verified_name || j.display_phone_number || "OK"}` });
      else setWaResult({ ok: false, msg: j.error || "Error" });
    } catch (e) { setWaResult({ ok: false, msg: e.message }); }
    finally { setWaVerifyBusy(false); }
  };

  const handleTestWhatsApp = async () => {
    setWaTestBusy(true);
    setWaResult(null);
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      const payload = { recipient: notif.whatsapp_recipient };
      if (notif.whatsapp_access_token && !notif.whatsapp_access_token.includes("•")) payload.access_token = notif.whatsapp_access_token;
      if (notif.whatsapp_phone_number_id) payload.phone_number_id = notif.whatsapp_phone_number_id;
      if (notif.whatsapp_template_name) payload.template_name = notif.whatsapp_template_name;
      const r = await fetch(`${API}/api/whatsapp/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.ok) setWaResult({ ok: true, msg: j.message });
      else setWaResult({ ok: false, msg: j.error || "Error" });
    } catch (e) { setWaResult({ ok: false, msg: e.message }); }
    finally { setWaTestBusy(false); }
  };

  // Build status polling & desktop handlers moved to DesktopAppSection component
  // (rendered inside DatabasePage → "Soporte avanzado")

  const loadDbStats = () => {
    setDbLoading(true);
    getDbStats()
      .then(setDbStats)
      .catch(() => setDbStats(null))
      .finally(() => setDbLoading(false));
  };

  // ── Backup handlers ─────────────────────────────────────────
  const loadBackupHistory = () => {
    getBackupHistory()
      .then(setBackupHistory)
      .catch(() => setBackupHistory([]));
  };

  const handleDownloadBackup = () => {
    const url = downloadBackupUrl();
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: "Descargando respaldo completo..." });
  };

  const handleCreateServerBackup = async () => {
    setBackupCreating(true);
    try {
      const res = await createServerBackup();
      toast({ title: res.message || "Respaldo guardado en servidor" });
      loadBackupHistory();
    } catch (e) {
      toast({ title: e.response?.data?.detail || "Error al crear respaldo", variant: "destructive" });
    } finally {
      setBackupCreating(false);
    }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreLoading(true);
    setRestoreResult(null);
    try {
      const res = await restoreBackup(file);
      setRestoreResult({ ok: true, msg: res.message });
      toast({ title: res.message });
      loadDbStats();
      loadBackupHistory();
    } catch (err) {
      const msg = err.response?.data?.detail || "Error al restaurar";
      setRestoreResult({ ok: false, msg });
      toast({ title: msg, variant: "destructive" });
    } finally {
      setRestoreLoading(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  };

  const handleDeleteBackup = async (filename) => {
    try {
      await deleteBackupFile(filename);
      setBackupHistory(prev => prev.filter(b => b.filename !== filename));
      toast({ title: "Respaldo eliminado" });
    } catch {
      toast({ title: "Error al eliminar respaldo", variant: "destructive" });
    }
  };

  // handleDownloadPackage moved to DesktopAppSection component

  const handleExport = async (format) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/export/reservations?format=${format}`);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "json" ? "reservaciones.json" : "reservaciones.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Descarga iniciada ✓" });
    } catch {
      toast({ title: "Error al exportar", variant: "destructive" });
    }
  };

  const handleSaveNotif = async ({ silent = false } = {}) => {
    if (!silent) setNotifLoading(true);
    try {
      const payload = { ...notif };
      // If key looks like masked dots, don't send it (keep existing)
      if (payload.resend_api_key && payload.resend_api_key.includes("•")) {
        delete payload.resend_api_key;
      }
      if (payload.whatsapp_access_token && payload.whatsapp_access_token.includes("•")) {
        delete payload.whatsapp_access_token;
      }
      if (payload.google_client_secret && payload.google_client_secret.includes("•")) {
        delete payload.google_client_secret;
      }
      if (payload.telegram_bot_token && payload.telegram_bot_token.includes("•")) {
        delete payload.telegram_bot_token;
      }
      // Convert empty string to null for optional integer fields
      if (payload.auto_cleanup_months === "" || payload.auto_cleanup_months === undefined) {
        payload.auto_cleanup_months = null;
      }
      await updateAppSettings(payload);
      setTimeout(loadDesk, 2500);       // el servidor reprograma los avisos con los ajustes nuevos
      if (silent) setAutoSaved("ok");
      else toast({ title: s.notifSaved + " ✓" });
    } catch {
      if (silent) setAutoSaved("err");
      else toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      if (!silent) setNotifLoading(false);
    }
  };

  // ── Guardado automático de Recordatorios (sin tener que pulsar «Guardar») ──
  const [autoSaved, setAutoSaved] = useState("");
  const autoKey = JSON.stringify([
    notif.reminders_enabled, notif.reminder_periods, notif.reminder_time, notif.reminder_hours_before,
    notif.desktop_notifications, notif.email_enabled, notif.telegram_enabled, notif.ntfy_enabled,
    notif.ntfy_topic, notif.admin_email, notif.telegram_chat_id, notif.telegram_bot_token, notif.resend_api_key,
    notif.timezone,
  ]);
  const autoPrev = React.useRef(null);
  useEffect(() => {
    if (!notifReady.current) return;
    if (autoPrev.current === null) { autoPrev.current = autoKey; return; }   // primera carga
    if (autoPrev.current === autoKey) return;
    autoPrev.current = autoKey;
    setAutoSaved("saving");
    const t = setTimeout(() => handleSaveNotif({ silent: true }), 900);
    return () => clearTimeout(t);
  }, [autoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTestReminder = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await sendTestReminder();
      const msg = res.message || s.notifTestSent;
      setTestResult({ ok: res.success !== false, msg, events: res.events_found });
      toast({ title: msg, variant: res.success === false ? "destructive" : undefined });
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Error al enviar";
      setTestResult({ ok: false, msg });
      toast({ title: msg, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  };

  const handleTelegramTest = async () => {
    setTelegramTestLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/telegram/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) toast({ title: data.message || "Mensaje enviado a Telegram ✓" });
      else toast({ title: data.error || "Error al enviar a Telegram", variant: "destructive" });
    } catch (e) {
      toast({ title: e.message || "Error al enviar a Telegram", variant: "destructive" });
    } finally {
      setTelegramTestLoading(false);
    }
  };

  const handleNtfyTest = async () => {
    setNtfyTestLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/ntfy/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) toast({ title: data.message || "Notificación enviada vía ntfy ✓" });
      else toast({ title: data.error || "Error al enviar ntfy", variant: "destructive" });
    } catch (e) {
      toast({ title: e.message || "Error al enviar ntfy", variant: "destructive" });
    } finally {
      setNtfyTestLoading(false);
    }
  };

  const handleDbTest = async () => {
    if (!newDbUrl.trim()) return;
    setDbTesting(true);
    setDbTestResult(null);
    try {
      await testDbConnection(newDbUrl.trim());
      setDbTestResult({ ok: true, msg: s.dbTestOk });
      toast({ title: s.dbTestOk + " ✓" });
    } catch (err) {
      const msg = err.response?.data?.detail || "Error de conexión";
      setDbTestResult({ ok: false, msg });
      toast({ title: msg, variant: "destructive" });
    } finally {
      setDbTesting(false);
    }
  };

  const handleDbConnect = async () => {
    if (!newDbUrl.trim()) return;
    setDbConnecting(true);
    try {
      await switchDatabase(newDbUrl.trim());
      toast({ title: s.dbConnectOk + " ✓" });
      setNewDbUrl("");
      setDbTestResult(null);
      setTimeout(loadDbStats, 500);
    } catch (err) {
      const msg = err.response?.data?.detail || "Error al conectar";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setDbConnecting(false);
    }
  };

  const handleDbReset = async () => {
    setDbResetting(true);
    try {
      await resetDatabase();
      toast({ title: s.dbResetOk + " ✓" });
      setNewDbUrl("");
      setDbTestResult(null);
      setTimeout(loadDbStats, 500);
    } catch (err) {
      const msg = err.response?.data?.detail || "Error al restaurar";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setDbResetting(false);
    }
  };

  // ── Pop-ups nativos del sistema (Windows / macOS) ─────────────
  const [desk, setDesk] = useState(null);
  const [deskBusy, setDeskBusy] = useState("");
  const loadDesk = React.useCallback(() => {
    getDesktopNotifStatus().then(setDesk).catch(() => setDesk(d => d || { supported: false }));
  }, []);
  useEffect(() => { loadDesk(); }, [loadDesk]);
  const deskAction = async (kind) => {
    setDeskBusy(kind);
    try {
      const fn = kind === "test" ? testDesktopNotif : kind === "next" ? notifyNextDesktop : openNotifSettings;
      const res = await fn();
      if (res?.message) toast({ title: res.message });
      loadDesk();
    } catch (err) {
      toast({ title: apiMsg(err), variant: "destructive" });
    } finally {
      setDeskBusy("");
    }
  };
  const fmtAt = (at) => {
    try {
      const d = new Date(at.replace(" ", "T"));
      return d.toLocaleString(language === "es" ? "es-GT" : "en-US", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return at; }
  };

  // ── Clear All Data ───────────────────────────────────────────
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);

  const handleClearAll = async () => {
    setClearLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/data/clear-all`, { method: "DELETE" });
      const data = await res.json();
      setShowClearConfirm(false);
      toast({ title: `✓ Datos eliminados — ${data.deleted_reservations} reservas, ${data.deleted_socios} socios` });
    } catch {
      toast({ title: "Error al borrar los datos", variant: "destructive" });
    } finally {
      setClearLoading(false);
    }
  };

  const channels = [
    { value: "email", label: "Email", icon: Mail },
    { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { value: "both", label: language === "es" ? "Ambos" : "Both", icon: Bell },
  ];

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
     <div className="w-full">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mb-8">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl btn-primary flex items-center justify-center shadow-lg flex-shrink-0"
          >
            <Cog size={22} className="text-white" strokeWidth={2} />
          </div>
          <h1 className="text-5xl font-black gradient-text tracking-tight" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>{s.title}</h1>
        </div>
        <p className="text-sm text-slate-500 font-medium mt-1.5">{s.subtitle}</p>
      </motion.div>

      <SectionSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={language === "es" ? "Buscar función… (ej: idioma, recordatorio, escritorio)" : "Search feature… (e.g. language, reminder, desktop)"}
        testId="settings-search-input"
      />

      <SectionSearchContext.Provider value={searchQuery}>
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">

        {/* Language */}
        <Section icon={Globe} title={s.langTitle} desc={s.langDesc}>
          <div className="flex gap-3">
            {[{ code: "es", flag: "🇬🇹", label: "Español" }, { code: "en", flag: "🇺🇸", label: "English" }].map(l => (
              <motion.button key={l.code} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => changeLanguage(l.code)} data-testid={`lang-${l.code}`}
                className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl text-sm font-bold transition-all flex-1 justify-center ${language === l.code ? "btn-primary text-white" : "glass border-white/60 text-slate-600 hover:bg-white/50"}`}>
                <span className="text-base flag-emoji">{l.flag}</span> {l.label}
                {language === l.code && <span className="text-[10px] opacity-70 ml-1">✓</span>}
              </motion.button>
            ))}
          </div>
        </Section>

        {/* Currency — rediseñada con banderas e iconos animados */}
        <Section icon={DollarSign} title={s.currencyTitle} desc={s.currencyDesc}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CURRENCIES.map((c, idx) => {
              const active = currency === c.code;
              return (
                <motion.button
                  key={c.code}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx, 6) * 0.04, duration: 0.2, ease: "easeOut" }}
                  whileHover={{ y: -4, scale: 1.03, transition: { duration: 0.2 } }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    changeCurrency(c.code);
                    toast({ title: `${c.flag} ${c.name}`, description: language === "es" ? `Moneda cambiada a ${c.code} (${c.symbol})` : `Currency changed to ${c.code} (${c.symbol})` });
                  }}
                  data-testid={`currency-${c.code}`}
                  className={`relative overflow-hidden flex flex-col items-center gap-1.5 py-4 px-3 rounded-3xl transition-all duration-300 ${active ? "btn-primary text-white shadow-lg" : "glass border-white/60 text-slate-600 hover:bg-white/60 hover:shadow-md"}`}
                >
                  {/* Glow animado del fondo cuando está activo */}
                  {active && (
                    <motion.span
                      layoutId="currency-active-glow"
                      className="absolute inset-0 pointer-events-none"
                      style={{ background: "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.35), transparent 65%)" }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    />
                  )}

                  {/* Bandera (quieta; se anima solo al pasar el ratón) */}
                  <motion.span
                    className="relative text-3xl leading-none flag-emoji"
                    whileHover={{ scale: 1.25, rotate: [0, -12, 12, 0], transition: { duration: 0.5 } }}
                    style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.18))" }}
                  >
                    {c.flag}
                  </motion.span>

                  {/* Símbolo + código */}
                  <span className="relative flex items-baseline gap-1">
                    <span className="text-lg font-black">
                      {c.symbol}
                    </span>
                    <span className="text-sm font-black tracking-wide">{c.code}</span>
                  </span>

                  {/* Nombre */}
                  <span className={`relative text-[10px] font-semibold text-center leading-tight ${active ? "text-white/80" : "text-slate-400"}`}>
                    {c.name}
                  </span>

                  {/* Check animado */}
                  <AnimatePresence>
                    {active && (
                      <motion.span
                        initial={{ scale: 0.96, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-md"
                      >
                        <CheckCircle2 size={14} className="text-emerald-500" strokeWidth={3} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          {/* Vista previa en vivo del formato de moneda */}
          <motion.div
            key={currency}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 glass border-white/60"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-2xl leading-none flag-emoji">
                {(CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]).flag}
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {language === "es" ? "Vista previa" : "Preview"}
                </p>
                <p className="text-[11px] font-semibold text-slate-500 leading-tight">
                  {(CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]).country}
                </p>
              </div>
            </div>
            <motion.span
              key={`prev-${currency}`}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-xl font-black gradient-text"
              style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}
            >
              {formatCurrency(1250)}
            </motion.span>
          </motion.div>
        </Section>

        {/* ── ZONA HORARIA ───────────────────────── */}
        <Section icon={Clock} title={language === "es" ? "Hora y Zona Horaria" : "Time & Timezone"} desc={language === "es" ? "Sincroniza con tu hora local para recordatorios precisos" : "Sync with your local time for accurate reminders"}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-2 block">{language === "es" ? "Zona horaria" : "Timezone"}</label>
              <div className="flex gap-2">
                <select
                  value={notif.timezone || "America/Guatemala"}
                  onChange={e => { setNotif(p => ({ ...p, timezone: e.target.value })); setTimezoneMsg(null); }}
                  data-testid="timezone-select"
                  className="flex-1 bg-white/70 border border-white/80 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <optgroup label="América">
                    <option value="America/Guatemala">Guatemala (UTC-6)</option>
                    <option value="America/Mexico_City">México CDMX (UTC-6)</option>
                    <option value="America/Bogota">Colombia (UTC-5)</option>
                    <option value="America/Lima">Perú (UTC-5)</option>
                    <option value="America/Caracas">Venezuela (UTC-4)</option>
                    <option value="America/Montevideo">Uruguay (UTC-3)</option>
                    <option value="America/Argentina/Buenos_Aires">Argentina (UTC-3)</option>
                    <option value="America/Santiago">Chile (UTC-3)</option>
                    <option value="America/New_York">Nueva York (UTC-5)</option>
                    <option value="America/Los_Angeles">Los Ángeles (UTC-8)</option>
                    <option value="America/Chicago">Chicago (UTC-6)</option>
                    <option value="America/Denver">Denver (UTC-7)</option>
                  </optgroup>
                  <optgroup label="Europa">
                    <option value="Europe/Madrid">España (UTC+1)</option>
                    <option value="Europe/London">Londres (UTC+0)</option>
                    <option value="Europe/Paris">Francia (UTC+1)</option>
                  </optgroup>
                  <optgroup label="Otras">
                    <option value="UTC">UTC</option>
                  </optgroup>
                </select>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={handleSyncTimezone}
                  data-testid="sync-timezone-btn"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-white text-xs font-bold whitespace-nowrap shrink-0">
                  <Zap size={13} />
                  {language === "es" ? "Detectar auto" : "Auto-detect"}
                </motion.button>
              </div>
              {timezoneMsg && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`text-[11px] mt-1.5 font-semibold ${timezoneMsg.ok ? "text-emerald-600" : "text-red-500"}`}>
                  {timezoneMsg.ok ? `✓ Detectado: ${timezoneMsg.tz}` : "No se pudo detectar"}
                </motion.p>
              )}
            </div>

            <div className="flex items-center gap-3 bg-white/50 rounded-2xl px-4 py-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <Clock size={14} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">
                  {language === "es" ? "Hora local ahora: " : "Local time now: "}
                  <span className="font-black text-indigo-600">
                    {new Date().toLocaleTimeString(language === "es" ? "es-GT" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: notif.timezone || "America/Guatemala" })}
                  </span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {language === "es" ? "Los recordatorios automáticos usarán esta hora" : "Automatic reminders use this time"}
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5 block">
                <Clock size={11} /> {language === "es" ? "Hora de aviso diario" : "Daily reminder time"}
              </label>
              <input type="time" value={notif.reminder_time || "09:00"}
                onChange={e => setNotif(p => ({ ...p, reminder_time: e.target.value }))}
                data-testid="notif-time-input"
                className="w-full bg-white/70 border border-white/80 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <p className="text-[10px] text-slate-400 mt-1">{language === "es" ? "El sistema enviará recordatorios diariamente a esta hora" : "System will send daily reminders at this time"}</p>
            </div>
          </div>
        </Section>

        {/* Notifications */}
        {/* ── SEGURIDAD ── */}
        {/* ── LICENCIA ── */}
        <LicenseSection />

        <SecuritySection />

        <Section icon={Bell} title={s.notifTitle} desc={s.notifDesc}
          badge={
            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${notif.reminders_enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
              {notif.reminders_enabled ? "ACTIVO" : "INACTIVO"}
            </span>
          }>
          <div className="space-y-5">

            {/* ── Toggle ── */}
            <div className="flex items-center justify-between gap-3 bg-white/50 rounded-2xl px-4 py-3">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-slate-700">{s.notifEnabled}</span>
                <p className="text-[10px] text-slate-500 mt-0.5" data-testid="notif-channels-summary">
                  {notif.reminders_enabled
                    ? <>Te avisamos por: <b>{[
                        notif.desktop_notifications !== false && desk?.supported ? (desk?.platform === "mac" ? "este Mac" : "este equipo") : null,
                        ...(desk?.channels || []).map(c => ({ telegram: "Telegram", ntfy: "tu celular", email: "correo" }[c])),
                      ].filter(Boolean).join(" · ") || "ningún canal (activa uno abajo)"}</b></>
                    : "Apagado: no se enviará ningún aviso."}
                  {autoSaved === "saving" && <span className="ml-2 text-slate-400">· guardando…</span>}
                  {autoSaved === "ok" && <span className="ml-2 text-emerald-600 font-bold">· guardado ✓</span>}
                  {autoSaved === "err" && <span className="ml-2 text-red-600 font-bold">· no se pudo guardar</span>}
                </p>
              </div>
              <button onClick={() => setNotif(p => ({ ...p, reminders_enabled: !p.reminders_enabled }))}
                data-testid="notif-toggle"
                className={`w-11 h-6 rounded-full transition-all relative ${notif.reminders_enabled ? "btn-primary" : "bg-slate-200"}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${notif.reminders_enabled ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>

            {/* ── Cuándo recordar ── */}
            <div className="space-y-3 bg-white/30 rounded-2xl p-4">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                {language === "es" ? "¿Cuándo recordar?" : "When to remind?"}
              </p>

              {/* Múltiples períodos */}
              <div>
                <label className="text-xs font-bold text-slate-600 mb-2 block">
                  {language === "es" ? "Días de anticipación (puedes elegir varios)" : "Days before event (multiple allowed)"}
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { d: 7, label: "7 días" }, { d: 3, label: "3 días" },
                    { d: 2, label: "2 días" }, { d: 1, label: "1 día" },
                    { d: 0, label: "Mismo día" },
                  ].map(({ d, label }) => {
                    const active = (notif.reminder_periods || [3]).includes(d);
                    return (
                      <button
                        key={d}
                        data-testid={`period-btn-${d}`}
                        onClick={() => {
                          const cur = notif.reminder_periods || [3];
                          const next = active ? cur.filter(x => x !== d) : [...cur, d];
                          setNotif(p => ({ ...p, reminder_periods: next.length ? next : [d] }));
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${active ? "btn-primary text-white shadow-sm" : "bg-white/70 text-slate-500 border border-slate-200 hover:border-indigo-300"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Horas antes (para eventos con horario definido) */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5 block">
                    <Clock size={11} />
                    {language === "es" ? "Horas antes del evento" : "Hours before event"}
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={12} step={1} value={notif.reminder_hours_before || 0}
                      onChange={e => setNotif(p => ({ ...p, reminder_hours_before: parseInt(e.target.value) }))}
                      data-testid="notif-hours-slider"
                      className="flex-1 accent-indigo-500" />
                    <span className="text-sm font-black text-slate-800 w-14 text-center bg-white/60 rounded-xl py-1">
                      {notif.reminder_hours_before > 0 ? `${notif.reminder_hours_before}h` : "Off"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {notif.reminder_hours_before > 0
                      ? `Aviso ${notif.reminder_hours_before}h antes del evento (requiere hora en la reserva)`
                      : "Desactivado — actívalo para avisar horas antes"}
                  </p>
                </div>
              </div>

            </div> {/* close grid-cols-2 */}


            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ── CANALES DE RECORDATORIO — DISEÑO COMPACTO 2026 ─────────── */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="space-y-3" data-testid="notification-channels-compact">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                  {language === "es" ? "¿Por dónde te avisamos?" : "Where should we notify you?"}
                </p>
                <span className="text-[10px] font-bold text-slate-400">
                  {language === "es" ? "Toca para expandir" : "Tap to expand"}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 -mt-1">
                Puedes usar varios a la vez. El aviso de este equipo sale aunque la app esté cerrada; celular, Telegram y correo
                se envían con Cinema Reservas abierta (si estaba cerrada, en cuanto la abres).
              </p>

              {/* ─── 0. Pop-up nativo de Windows / macOS (recomendado, sin configurar) ─── */}
              {(() => {
                const isOpen = openChannel === "pc";
                const isMac = desk?.platform === "mac";
                const osName = isMac ? "macOS" : "Windows";
                const deskOn = notif.desktop_notifications !== false;
                const blocked = !!desk?.blocked;
                const active = !!desk?.supported && deskOn && notif.reminders_enabled && !blocked;
                const badge = !desk?.supported ? "NO DISPONIBLE" : blocked ? "BLOQUEADO" : !deskOn ? "OFF" : notif.reminders_enabled ? "ACTIVO" : "EN PAUSA";
                const badgeCls = active ? "bg-emerald-100 text-emerald-700" : blocked ? "bg-red-100 text-red-600" : badge === "EN PAUSA" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
                return (
                  <div className={`rounded-2xl border transition-all ${active ? "border-indigo-300/70 bg-gradient-to-br from-indigo-50/70 to-white/40" : "border-slate-200/70 bg-white/40"}`}>
                    <button type="button"
                      data-testid="pc-channel-header"
                      onClick={() => { setOpenChannel(isOpen ? null : "pc"); if (!isOpen) loadDesk(); }}
                      className="w-full flex items-center gap-3 p-3.5 text-left">
                      <div className="w-9 h-9 rounded-xl bg-white shadow-inner border border-indigo-200/60 flex items-center justify-center shrink-0">
                        <Monitor size={16} className="text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-800 truncate">{osName} · pop-up</p>
                          <span data-testid="pc-status-badge" className={`text-[9px] font-black px-2 py-0.5 rounded-full ${badgeCls}`}>{badge}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">
                          {active && desk?.next?.length
                            ? <>Próximo aviso: <b>{fmtAt(desk.next[0].at)}</b></>
                            : "Aviso emergente en este equipo · gratis, sin configurar"}
                        </p>
                      </div>
                      <ChevronRight size={16} className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-3.5 pb-3.5 space-y-3 border-t border-indigo-100/60 pt-3" data-testid="pc-channel-body">
                            {!desk?.supported ? (
                              <p className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2.5">
                                Este equipo no admite notificaciones emergentes.
                              </p>
                            ) : (
                              <>
                                {blocked && (
                                  <div className="flex items-start gap-2 text-[11px] text-red-700 bg-red-50 rounded-xl p-2.5">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <p className="font-semibold">{desk.blocked_text || `${osName} está bloqueando las notificaciones.`}</p>
                                      <button type="button" onClick={() => deskAction("settings")}
                                        className="mt-1.5 inline-flex items-center gap-1 font-black underline">
                                        <ExternalLink size={11} /> Abrir configuración de notificaciones
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center justify-between bg-white/60 rounded-xl px-3 py-2">
                                  <span className="text-xs font-bold text-slate-700">Mostrar pop-ups en este equipo</span>
                                  <button type="button" data-testid="pc-desktop-toggle"
                                    onClick={() => setNotif(p => ({ ...p, desktop_notifications: !deskOn }))}
                                    className={`w-10 h-5 rounded-full transition-all relative ${deskOn ? "btn-primary" : "bg-slate-200"}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${deskOn ? "left-[22px]" : "left-0.5"}`} />
                                  </button>
                                </div>

                                {!notif.reminders_enabled && (
                                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2.5 font-semibold">
                                    Activa «recordatorios automáticos» arriba y pulsa Guardar para empezar a recibir avisos.
                                  </p>
                                )}

                                <div className="flex flex-wrap gap-2">
                                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                    onClick={() => deskAction("test")} disabled={!!deskBusy}
                                    data-testid="pc-test-btn"
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg btn-primary text-white text-[11px] font-black disabled:opacity-60">
                                    {deskBusy === "test" ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Enviar prueba
                                  </motion.button>
                                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                    onClick={() => deskAction("next")} disabled={!!deskBusy}
                                    data-testid="pc-notify-immediate-btn"
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-indigo-300 text-indigo-700 text-[11px] font-black hover:bg-indigo-50 disabled:opacity-60">
                                    {deskBusy === "next" ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} />} Avisar próximo evento
                                  </motion.button>
                                </div>

                                {active && desk?.next?.length > 0 && (
                                  <div className="bg-white/50 rounded-xl p-2.5 space-y-1" data-testid="pc-next-list">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Próximos avisos</p>
                                    {desk.next.map((n, i) => (
                                      <div key={i} className="flex items-center gap-2 text-[11px]">
                                        <Clock size={11} className="text-indigo-500 shrink-0" />
                                        <span className="font-bold text-slate-700 shrink-0">{fmtAt(n.at)}</span>
                                        <span className="text-slate-500 truncate">{n.title}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {desk?.last_sent?.length > 0 && (
                                  <p className="text-[10px] text-slate-500">
                                    Último aviso: <b>{desk.last_sent[0].title}</b> — {desk.last_sent[0].text}
                                  </p>
                                )}
                                {desk?.error && !blocked && (
                                  <p className="text-[10px] text-red-600 font-semibold">{desk.error}</p>
                                )}

                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                  {isMac
                                    ? "Los avisos salen mientras Cinema Reservas está abierta (aunque esté minimizada). Si estaba cerrada a la hora del aviso, te avisa al abrirla."
                                    : <>Windows guarda los avisos programados{desk?.scheduled_in_windows ? <> (<b>{desk.scheduled_in_windows}</b> ahora)</> : null} y los muestra a su hora <b>aunque Cinema Reservas esté cerrada</b>, mientras el equipo esté encendido. Se quedan en pantalla hasta que los cierres.</>}
                                </p>
                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                  ¿No ves el pop-up? Si {osName} tiene <b>«No molestar»</b> activo (se activa solo en pantalla completa, juegos o ciertas horas), el aviso va directo al centro de notificaciones.
                                  {!isMac && <> Para que salga igual, añade Cinema Reservas a las <b>notificaciones prioritarias</b>.</>}{" "}
                                  <button type="button" data-testid="pc-open-settings" onClick={() => deskAction("settings")}
                                    className="inline-flex items-center gap-1 font-black text-indigo-600 hover:text-indigo-700">
                                    <ExternalLink size={10} /> Abrir configuración de notificaciones
                                  </button>
                                </p>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}

              {/* ─── 3. Resend (Email transaccional) ─── */}
              {(() => {
                const isOpen = openChannel === "resend";
                const configured = !!(notif.resend_api_key && notif.admin_email);
                const active = configured && notif.email_enabled !== false;
                return (
                  <div className={`rounded-2xl border transition-all ${active ? "border-blue-300/70 bg-gradient-to-br from-blue-50/70 to-white/40" : "border-slate-200/70 bg-white/40"}`}>
                    <button type="button"
                      data-testid="resend-channel-header"
                      onClick={() => setOpenChannel(isOpen ? null : "resend")}
                      className="w-full flex items-center gap-3 p-3.5 text-left">
                      <div className="w-9 h-9 rounded-xl bg-white shadow-inner border border-blue-200/60 flex items-center justify-center shrink-0">
                        <Mail size={16} className="text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-800 truncate">Correo electrónico <span className="text-[10px] font-bold text-slate-400">vía Resend</span></p>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${active ? "bg-emerald-100 text-emerald-700" : configured ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>
                            {active ? "ACTIVO" : configured ? "OFF" : "SIN CONFIGURAR"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">
                          {notif.admin_email ? `Te llega a ${notif.admin_email}` : "Gratis hasta 3.000 correos al mes"}
                        </p>
                      </div>
                      {configured && (
                        <span role="switch" aria-checked={notif.email_enabled !== false} data-testid="email-toggle"
                          onClick={(e) => { e.stopPropagation(); setNotif(p => ({ ...p, email_enabled: p.email_enabled === false })); }}
                          className={`w-9 h-5 rounded-full transition-all relative shrink-0 cursor-pointer ${notif.email_enabled !== false ? "bg-blue-500" : "bg-slate-200"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${notif.email_enabled !== false ? "left-[18px]" : "left-0.5"}`} />
                        </span>
                      )}
                      <ChevronRight size={16} className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-3.5 pb-3.5 space-y-2.5 border-t border-blue-100/60 pt-3">
                            {/* Prominent Resend auto-login buttons */}
                            <div className="grid grid-cols-2 gap-2">
                              <a href="https://resend.com/login" target="_blank" rel="noreferrer"
                                data-testid="resend-login-btn"
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black shadow-sm">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M2 12l1.4-1.4 4.6 4.6L18 4l2 2L8 18z"/></svg>
                                {language === "es" ? "Login Resend (Google)" : "Login (Google)"}
                              </a>
                              <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer"
                                data-testid="resend-apikeys-btn"
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black">
                                <ExternalLink size={11} /> {language === "es" ? "Crear API Key" : "Create API Key"}
                              </a>
                            </div>
                            <div className="text-[10px] text-slate-500 bg-blue-50/60 rounded-lg px-2.5 py-1.5">
                              💡 {language === "es"
                                ? "Resend permite login con Google/GitHub en un clic. Crea el API key y pégalo aquí con 📋"
                                : "Resend supports one-click Google/GitHub login. Create the API key and paste here with 📋"}
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">API Key</label>
                              <div className="flex gap-1.5">
                                <input type="password" value={notif.resend_api_key}
                                  onChange={e => setNotif(p => ({ ...p, resend_api_key: e.target.value }))}
                                  placeholder="re_xxxxxxxxxxxxxxx"
                                  data-testid="notif-resend-key-input"
                                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                                <button type="button" onClick={() => pasteInto("resend_api_key")}
                                  data-testid="resend-key-paste"
                                  title="Pegar" className="px-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300">
                                  <Clipboard size={13} />
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Email Admin</label>
                                <input type="email" value={notif.admin_email}
                                  onChange={e => setNotif(p => ({ ...p, admin_email: e.target.value }))}
                                  placeholder="tu@email.com"
                                  data-testid="notif-email-input"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                              </div>
                              <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Remitente</label>
                                <input type="text" value={notif.sender_name || ""}
                                  onChange={e => setNotif(p => ({ ...p, sender_name: e.target.value }))}
                                  placeholder="Cinema Productions"
                                  data-testid="notif-sender-name"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
                                {language === "es" ? "Asunto (opcional)" : "Subject (optional)"}
                              </label>
                              <input type="text" value={notif.email_subject || ""}
                                onChange={e => setNotif(p => ({ ...p, email_subject: e.target.value }))}
                                placeholder="Recordatorio: eventos próximos"
                                data-testid="notif-email-subject"
                                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">CC (coma)</label>
                              <input type="text" value={notif.cc_emails || ""}
                                onChange={e => setNotif(p => ({ ...p, cc_emails: e.target.value }))}
                                placeholder="socio@email.com, asistente@email.com"
                                data-testid="notif-cc-emails"
                                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                            </div>
                            <div className="flex items-center justify-between bg-white/50 rounded-lg px-3 py-2">
                              <div>
                                <p className="text-[11px] font-bold text-slate-700">
                                  {language === "es" ? "Enviar también al cliente" : "Also send to client"}
                                </p>
                                <p className="text-[9px] text-slate-400">
                                  {language === "es" ? "Al email del cliente en la reserva" : "To the client's reservation email"}
                                </p>
                              </div>
                              <button data-testid="notify-client-toggle"
                                onClick={() => setNotif(p => ({ ...p, notify_client: !p.notify_client }))}
                                className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${notif.notify_client ? "bg-blue-500" : "bg-slate-200"}`}>
                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${notif.notify_client ? "left-[18px]" : "left-0.5"}`} />
                              </button>
                            </div>
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                              onClick={handleTestEmail} disabled={emailTestLoading}
                              data-testid="test-email-btn"
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black disabled:opacity-50">
                              {emailTestLoading ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                              {emailTestLoading ? "Enviando…" : (language === "es" ? "Probar conexión" : "Test connection")}
                            </motion.button>
                            {emailTestResult && (
                              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold ${emailTestResult.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" : "bg-red-50 text-red-600 border border-red-200/60"}`}>
                                {emailTestResult.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                {emailTestResult.msg}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}

              {/* ─── 4. Telegram Bot ─── */}
              {(() => {
                const isOpen = openChannel === "telegram";
                const active = notif.telegram_enabled && notif.telegram_bot_token && notif.telegram_chat_id;
                return (
                  <div className={`rounded-2xl border transition-all ${active ? "border-sky-300/70 bg-gradient-to-br from-sky-50/70 to-white/40" : "border-slate-200/70 bg-white/40"}`}>
                    <button type="button"
                      data-testid="telegram-channel-header"
                      onClick={() => setOpenChannel(isOpen ? null : "telegram")}
                      className="w-full flex items-center gap-3 p-3.5 text-left">
                      <div className="w-9 h-9 rounded-xl bg-white shadow-inner border border-sky-200/60 flex items-center justify-center shrink-0">
                        <MessageCircle size={16} className="text-sky-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-800 truncate">Telegram Bot</p>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {active ? "ACTIVO" : "OFF"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">100% gratis · instantáneo</p>
                      </div>
                      <button data-testid="telegram-toggle"
                        onClick={(e) => { e.stopPropagation(); setNotif(p => ({ ...p, telegram_enabled: !p.telegram_enabled })); }}
                        className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${notif.telegram_enabled ? "bg-sky-500" : "bg-slate-200"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${notif.telegram_enabled ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                      <ChevronRight size={16} className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-3.5 pb-3.5 space-y-2.5 border-t border-sky-100/60 pt-3">
                            <div className="grid grid-cols-2 gap-2">
                              <a href="https://t.me/BotFather" target="_blank" rel="noreferrer"
                                data-testid="telegram-botfather-btn"
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-black">
                                <ExternalLink size={11} /> {language === "es" ? "Abrir @BotFather" : "Open @BotFather"}
                              </a>
                              <a
                                href={notif.telegram_bot_token ? `https://api.telegram.org/bot${notif.telegram_bot_token}/getUpdates` : "#"}
                                target="_blank" rel="noreferrer"
                                onClick={(e) => { if (!notif.telegram_bot_token) { e.preventDefault(); toast({ title: "Ingresa primero el token del bot" }); } }}
                                data-testid="telegram-getupdates-btn"
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-sky-300 text-sky-700 hover:bg-sky-50 text-[11px] font-black">
                                <ExternalLink size={11} /> {language === "es" ? "Obtener Chat ID" : "Get Chat ID"}
                              </a>
                            </div>
                            <div className="text-[10px] text-slate-600 bg-sky-50/70 rounded-lg px-2.5 py-1.5 space-y-0.5">
                              <p><b>1.</b> Abre @BotFather → <code className="bg-white px-1 rounded">/newbot</code> → copia el token</p>
                              <p><b>2.</b> Abre tu bot y envía cualquier mensaje</p>
                              <p><b>3.</b> Pulsa <b>Obtener Chat ID</b> → busca <code className="bg-white px-1 rounded">&quot;id&quot;</code> dentro de <code className="bg-white px-1 rounded">&quot;chat&quot;</code></p>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Bot Token</label>
                              <div className="flex gap-1.5">
                                <input type="password" value={notif.telegram_bot_token}
                                  onChange={e => setNotif(p => ({ ...p, telegram_bot_token: e.target.value }))}
                                  placeholder="1234567890:AAF..."
                                  data-testid="telegram-token-input"
                                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                <button type="button" onClick={() => pasteInto("telegram_bot_token")}
                                  data-testid="telegram-token-paste"
                                  title="Pegar" className="px-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-sky-600 hover:border-sky-300">
                                  <Clipboard size={13} />
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Chat ID</label>
                              <div className="flex gap-1.5">
                                <input type="text" value={notif.telegram_chat_id}
                                  onChange={e => setNotif(p => ({ ...p, telegram_chat_id: e.target.value }))}
                                  placeholder="123456789"
                                  data-testid="telegram-chatid-input"
                                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                <button type="button" onClick={() => pasteInto("telegram_chat_id")}
                                  data-testid="telegram-chatid-paste"
                                  title="Pegar" className="px-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-sky-600 hover:border-sky-300">
                                  <Clipboard size={13} />
                                </button>
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                  onClick={handleTelegramTest} disabled={telegramTestLoading}
                                  data-testid="telegram-test-btn"
                                  className="px-3 rounded-lg bg-sky-500 text-white text-[11px] font-black disabled:opacity-60 whitespace-nowrap">
                                  {telegramTestLoading ? <Loader2 size={12} className="animate-spin" /> : (language === "es" ? "Probar" : "Test")}
                                </motion.button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}

              {/* ─── 5. ntfy.sh ─── */}
              {(() => {
                const isOpen = openChannel === "ntfy";
                const active = notif.ntfy_enabled && notif.ntfy_topic;
                return (
                  <div className={`rounded-2xl border transition-all ${active ? "border-orange-300/70 bg-gradient-to-br from-orange-50/70 to-white/40" : "border-slate-200/70 bg-white/40"}`}>
                    <button type="button"
                      data-testid="ntfy-channel-header"
                      onClick={() => setOpenChannel(isOpen ? null : "ntfy")}
                      className="w-full flex items-center gap-3 p-3.5 text-left">
                      <div className="w-9 h-9 rounded-xl bg-white shadow-inner border border-orange-200/60 flex items-center justify-center shrink-0">
                        <Bell size={16} className="text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-800 truncate">Tu celular <span className="text-[10px] font-bold text-slate-400">app ntfy</span></p>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {active ? "ACTIVO" : "OFF"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">Avisos en tu teléfono · gratis, sin crear cuenta</p>
                      </div>
                      <button data-testid="ntfy-toggle"
                        onClick={(e) => { e.stopPropagation(); setNotif(p => ({ ...p, ntfy_enabled: !p.ntfy_enabled })); }}
                        className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${notif.ntfy_enabled ? "bg-orange-500" : "bg-slate-200"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${notif.ntfy_enabled ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                      <ChevronRight size={16} className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-3.5 pb-3.5 space-y-2.5 border-t border-orange-100/60 pt-3">
                            <div className="grid grid-cols-2 gap-2">
                              <a href="https://ntfy.sh/app" target="_blank" rel="noreferrer"
                                data-testid="ntfy-open-app-btn"
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-black">
                                <ExternalLink size={11} /> {language === "es" ? "Abrir ntfy Web" : "Open ntfy Web"}
                              </a>
                              <a href="https://ntfy.sh/docs/subscribe/phone/" target="_blank" rel="noreferrer"
                                data-testid="ntfy-mobile-btn"
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-orange-300 text-orange-700 hover:bg-orange-50 text-[11px] font-black">
                                <ExternalLink size={11} /> {language === "es" ? "App móvil" : "Mobile app"}
                              </a>
                            </div>
                            <div className="text-[10px] text-slate-600 bg-orange-50/70 rounded-lg px-2.5 py-1.5">
                              💡 {language === "es"
                                ? "Instala ntfy en tu celular/PC, elige un nombre único de tema y pégalo aquí."
                                : "Install ntfy, pick a unique topic name and paste it here."}
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
                                {language === "es" ? "Nombre del tema" : "Topic name"}
                              </label>
                              <div className="flex gap-1.5">
                                <input type="text" value={notif.ntfy_topic}
                                  onChange={e => setNotif(p => ({ ...p, ntfy_topic: e.target.value }))}
                                  placeholder="cinema-alex-2026"
                                  data-testid="ntfy-topic-input"
                                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300" />
                                <button type="button" onClick={() => pasteInto("ntfy_topic")}
                                  data-testid="ntfy-topic-paste"
                                  title="Pegar" className="px-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-orange-600 hover:border-orange-300">
                                  <Clipboard size={13} />
                                </button>
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                  onClick={handleNtfyTest} disabled={ntfyTestLoading}
                                  data-testid="ntfy-test-btn"
                                  className="px-3 rounded-lg bg-orange-500 text-white text-[11px] font-black disabled:opacity-60 whitespace-nowrap">
                                  {ntfyTestLoading ? <Loader2 size={12} className="animate-spin" /> : (language === "es" ? "Probar" : "Test")}
                                </motion.button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}

            </div>



            {/* Test result */}
            {testResult && (
              <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl ${testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                {testResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {testResult.msg}
              </div>
            )}

            {/* ── Buttons ── */}
            <div className="flex gap-3 pt-1">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={handleSaveNotif} disabled={notifLoading}
                data-testid="notif-save-btn"
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl btn-primary text-white text-sm font-bold flex-1 justify-center disabled:opacity-60">
                {notifLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {s.notifSave}
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={handleTestReminder} disabled={testLoading}
                data-testid="notif-test-btn"
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl glass border-white/60 text-slate-700 text-sm font-bold hover:bg-white/50 transition-all disabled:opacity-60">
                {testLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Probar todos los canales
              </motion.button>
            </div>

          </div>
        </Section>

        {/* Subscription Section - added below all settings */}
        {/* Suscripción eliminada */}

        <IncidentsPanel />

      </motion.div>
      </SectionSearchContext.Provider>
     </div>
    </div>
  );
}
