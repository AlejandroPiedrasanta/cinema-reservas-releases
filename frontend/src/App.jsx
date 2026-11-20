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
import CatalogoPage from "@/pages/CatalogoPage";
import DatabasePage from "@/pages/DatabasePage";
import AppearancePage from "@/pages/AppearancePage";
import UpdatesPage from "@/pages/UpdatesPage";
import { Toaster } from "@/components/ui/toaster";
import LockScreen from "@/components/LockScreen";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageErrorBoundary from "@/components/PageErrorBoundary";
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
          <Route path="/catalogo" element={<CatalogoPage />} />
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

function ProtectedApp() {
  const { animations, appLocked } = useSettings();
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
