import React from "react";

/**
 * Protección por pantalla: si una página falla al dibujarse, solo esa página muestra
 * un aviso con "Reintentar" — el menú y el resto de la app siguen funcionando
 * (antes un fallo en cualquier pantalla tapaba toda la app).
 * Se monta con key = ruta, así al cambiar de pantalla se limpia solo.
 */
export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, tries: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    import("@/lib/errorReporter")
      .then(({ reportError }) => reportError?.({
        source: "frontend",
        message: `Fallo en la pantalla ${window.location.pathname}: ${error?.message || error}`,
        stack: (error?.stack || "") + "\n" + (info?.componentStack || ""),
        context: { path: window.location.pathname },
      }))
      .catch(() => {});
  }

  render() {
    if (!this.state.error) return this.props.children;
    const retry = () => this.setState((s) => ({ error: null, tries: s.tries + 1 }));
    return (
      <div className="px-6 py-16 max-w-xl mx-auto" data-testid="page-error">
        <div className="glass rounded-3xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4 text-2xl font-black">!</div>
          <h2 className="text-xl font-black text-slate-900 mb-1" style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}>
            Esta pantalla tuvo un problema
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Tus datos están a salvo. Puedes reintentar o ir a otra sección desde el menú.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button type="button" onClick={retry} data-testid="page-error-retry"
              className="px-5 py-2.5 rounded-2xl btn-primary text-white text-xs font-black">
              Reintentar
            </button>
            {this.state.tries > 0 && (
              <button type="button" onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black">
                Recargar la app
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
