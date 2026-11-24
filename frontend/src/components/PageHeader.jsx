import { memo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

/**
 * Animated page header shared across internal pages.
 *
 * Rendimiento: solo una entrada corta (opacidad + desplazamiento). Antes tenía 5 bucles
 * infinitos (halo, flotación, dos barridos de luz y destello) en todas las pantallas.
 *
 * Props:
 *  - icon: lucide-react icon component
 *  - title: string (main title)
 *  - subtitle: string (optional)
 *  - gradient: CSS gradient for the icon tile & underline
 *  - iconColor: solid color fallback (unused if gradient set)
 *  - right: ReactNode rendered on the right (buttons, filters, etc.)
 *  - className: extra classes for the wrapper
 */
function PageHeader({
  icon: Icon,
  title,
  subtitle,
  gradient = "linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)",
  right,
  className = "",
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-wrap items-center justify-between gap-4 mb-8 ${className}`}
      data-testid="page-header"
    >
      <div className="flex items-center gap-4 min-w-0">
        {Icon && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative shrink-0"
          >
            {/* Icon tile */}
            <motion.div
              whileHover={{ rotate: [0, -8, 8, 0], scale: 1.06 }}
              className="relative w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden"
              style={{
                background: gradient,
                boxShadow: "0 10px 26px -10px rgba(99,102,241,0.55)",
              }}
            >
              <Icon size={20} className="text-white relative z-10" strokeWidth={2.2} />
            </motion.div>
            {/* Sparkle chip */}
            <span className="absolute -top-1 -right-1 text-amber-300" style={{ opacity: 0.8 }}>
              <Sparkles size={11} strokeWidth={2.5} fill="currentColor" />
            </span>
          </motion.div>
        )}

        <div className="min-w-0">
          <h1
            className="relative text-4xl sm:text-5xl font-black gradient-text tracking-tight leading-none overflow-hidden"
            style={{ fontFamily: "Cabinet Grotesk, sans-serif" }}
          >
            {title}
          </h1>

          {/* Underline accent */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.25, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: gradient, transformOrigin: "left" }}
            className="h-[3px] w-16 rounded-full mt-2"
          />

          {subtitle && (
            <p className="text-sm text-slate-500 font-semibold mt-2">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {right && (
        <div className="flex items-center gap-2 flex-wrap">
          {right}
        </div>
      )}
    </motion.div>
  );
}

export default memo(PageHeader);
