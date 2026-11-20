/**
 * EventHoverCard (simplificado)
 *
 * Antes: mostraba un preview flotante al pasar el mouse y auto-navegaba.
 * Ahora: solo envuelve el children con un click handler para navegar.
 * (El usuario pidió eliminar la apertura por hover en el Panel).
 * Los eventos que ya pasaron se muestran atenuados con la etiqueta "Ya pasó".
 */
import { localDate } from "@/lib/apiMsg";

export default function EventHoverCard({
  event,
  onNavigate,
  className = "",
  children,
  testId,
  language = "es",
}) {
  const handleClick = () => {
    if (typeof onNavigate === "function") onNavigate();
  };
  const isPast = !!event?.event_date && event.event_date.slice(0, 10) < localDate();

  return (
    <div
      className={`cursor-pointer relative transition-opacity ${isPast ? "opacity-60 hover:opacity-100 saturate-50 hover:saturate-100" : ""} ${className}`}
      onClick={handleClick}
      data-testid={testId}
      data-past={isPast ? "true" : undefined}
      title={isPast ? (language === "es" ? "Este evento ya pasó" : "This event is over") : undefined}
    >
      {isPast && (
        <span className="absolute -top-2 left-4 z-10 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-700 text-white shadow-sm pointer-events-none">
          {language === "es" ? "Ya pasó" : "Past"}
        </span>
      )}
      {children}
    </div>
  );
}
