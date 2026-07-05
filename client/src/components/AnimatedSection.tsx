import { ReactNode, useEffect, useRef, useState } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
}

const offsetMap: Record<NonNullable<Props["direction"]>, string> = {
  up: "translateY(30px)",
  down: "translateY(-30px)",
  left: "translateX(30px)",
  right: "translateX(-30px)",
  none: "none",
};

/**
 * Revela o conteúdo com fade + slide quando ele entra na viewport.
 * Antes usava framer-motion (~120KB no bundle eager); agora é IntersectionObserver
 * + transição CSS — mesmo efeito, zero dependência. Respeita prefers-reduced-motion.
 */
export default function AnimatedSection({ children, className = "", delay = 0, direction = "up" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setInView(true); return; }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { rootMargin: "-50px 0px", threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : offsetMap[direction],
        transition: `opacity 0.6s cubic-bezier(0.25,0.46,0.45,0.94) ${delay}s, transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}
