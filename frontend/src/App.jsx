import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { motion, MotionConfig } from "framer-motion";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { AuthProvider } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Reservations from "@/pages/Reservations";
import ReservationDetail from "@/pages/ReservationDetail";
import CalendarView from "@/pages/CalendarView";
import Settings from "@/pages/Settings";
import Socios from "@/pages/Socios";
import Metas from "@/pages/Metas";
import DatabasePage from "@/pages/DatabasePage";
import AppearancePage from "@/pages/AppearancePage";
import UpdatesPage from "@/pages/UpdatesPage";
import { Toaster } from "@/components/ui/toaster";
import LockScreen from "@/components/LockScreen";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageErrorBoundary from "@/components/PageErrorBoundary";
import ServerStatus from "@/components/ServerStatus";
import IncidentsNotifier from "@/components/IncidentsNotifier";
import { installGlobalErrorHandlers } from "@/lib/errorReporter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AnimatedRoutes() {
  const location = useLocation();
  const { pageTransition } = useSettings();

  // Rapidez: la página nueva entra AL INSTANTE (sin esperar a que salga la anterior
  // y sin desenfoque, que es caro de pintar en páginas grandes). Solo un fundido corto.
  const ease = [0.22, 1, 0.36, 1];
  const getVariants = () => {
    if (pageTransition === "slide") return {
      initial: { opacity: 0, x: 10 },
      animate: { opacity: 1, x: 0, transition: { duration: 0.16, ease } },
    };
    if (pageTransition === "zoom") return {
      initial: { opacity: 0, scale: 0.985 },
      animate: { opacity: 1, scale: 1, transition: { duration: 0.16, ease } },
    };
    if (pageTransition === "none") return { initial: {}, animate: {} };
    return {
      initial: { opacity: 0, y: 6 },
      animate: { opacity: 1, y: 0, transition: { duration: 0.16, ease } },
    };
  };

  return (
    <>
      <motion.div key={location.pathname} variants={getVariants()} initial="initial" animate="animate" style={{ minHeight: "100%" }}>
        <PageErrorBoundary key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/reservaciones" element={<Navigate to="/calendario" replace />} />
          <Route path="/reservaciones/:id" element={<ReservationDetail />} />
          <Route path="/calendario" element={<CalendarView />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="/socios" element={<Socios />} />
          <Route path="/metas" element={<Metas />} />
          <Route path="/catalogo" element={<Navigate to="/dashboard" replace />} />
          <Route path="/base-de-datos" element={<DatabasePage />} />
          <Route path="/apariencia" element={<AppearancePage />} />
          <Route path="/actualizaciones" element={<UpdatesPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </PageErrorBoundary>
      </motion.div>
    </>
  );
}

/**
 * Ahorro de energía (Windows y Mac): cuando la ventana está en segundo plano o minimizada,
 * las animaciones decorativas se CONGELAN (CSS y framer-motion) y vuelven al instante al
 * volver a la ventana o pasar el ratón por encima. Mientras usas la app (aunque no muevas
 * el ratón) todo va a 60 fps: nunca se ralentiza a saltos. Antes la app gastaba más de un
 * núcleo de CPU/GPU solo por estar abierta detrás de otras ventanas.
 */
function useQuietMode() {
  useEffect(() => {
    const root = document.documentElement;
    const AWAY_MS = 8000;   // ratón encima de la ventana sin foco: congelar de nuevo a los 8 s
    let quiet = false, idleTimer = null, repauseTimer = null, lastWake = 0;
    let paused = [];
    const pauseScripted = () => {
      try {
        for (const a of document.getAnimations()) {
          // las animaciones CSS ya las pausa la clase cp-quiet; aquí las de framer-motion (WAAPI)
          if (a.playState === "running" && !(window.CSSAnimation && a instanceof window.CSSAnimation)
              && !(window.CSSTransition && a instanceof window.CSSTransition)) {
            a.pause(); paused.push(a);
          }
        }
      } catch { /* ignore */ }
    };
    const setQuiet = (q) => {
      if (q === quiet) return;
      quiet = q;
      root.classList.toggle("cp-quiet", q);
      try { window.__cpSetQuiet?.(q); } catch { /* ignore */ }
      if (q) {
        pauseScripted();
        repauseTimer = setInterval(pauseScripted, 4000);    // las que se creen mientras tanto
      } else {
        clearInterval(repauseTimer);
        for (const a of paused) { try { if (a.playState === "paused") a.play(); } catch { /* ignore */ } }
        paused = [];
      }
    };
    const away = () => document.hidden || !document.hasFocus();
    const wake = () => {
      const now = Date.now();
      if (!quiet && now - lastWake < 300) return;          // el ratón dispara mucho: basta cada 300 ms
      lastWake = now;
      setQuiet(false);
      clearTimeout(idleTimer);
      // solo si la ventana NO está activa (p. ej. ratón encima sin hacer clic): volver a
      // congelar cuando el ratón se va. Con la ventana activa nunca se congela.
      if (away()) idleTimer = setTimeout(() => { if (away()) setQuiet(true); }, AWAY_MS);
    };
    const sleep = () => { clearTimeout(idleTimer); setQuiet(true); };
    const onVisibility = () => (document.hidden ? sleep() : wake());
    const evs = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "focus"];
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true, capture: true }));
    window.addEventListener("blur", sleep);
    document.addEventListener("visibilitychange", onVisibility);
    if (away()) sleep(); else wake();
    return () => {
      evs.forEach((e) => window.removeEventListener(e, wake, { capture: true }));
      window.removeEventListener("blur", sleep);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(idleTimer); clearInterval(repauseTimer);
      root.classList.remove("cp-quiet");
    };
  }, []);
}

function ProtectedApp() {
  const { animations, appLocked } = useSettings();
  useQuietMode();
  // Los recordatorios los envía el servidor como pop-ups nativos de Windows/macOS
  // (ver /api/notifications/desktop/*); ya no dependen de los permisos del navegador.

  if (appLocked) {
    return (
      <MotionConfig reducedMotion={animations ? "never" : "always"}>
        <LockScreen />
        <Toaster />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion={animations ? "never" : "always"}>
      <div className="App">
        <div className="mesh-bg" aria-hidden="true">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
          <div className="blob blob-4" />
        </div>
        <BrowserRouter>
          <Layout>
            <AnimatedRoutes />
          </Layout>
        </BrowserRouter>
        <Toaster />
        <ServerStatus />
      </div>
    </MotionConfig>
  );
}

function App() {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SettingsProvider>
            <ProtectedApp />
            <IncidentsNotifier />
          </SettingsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
