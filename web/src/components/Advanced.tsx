"use client";
import { ReactNode, useState } from "react";

/**
 * Plain-language first, science on request. Wrap technical detail (units, coordinates, method,
 * caveats for experts) in <Advanced> so the default view stays calm for a first-time visitor.
 */
export default function Advanced({
  children,
  label = "Show the science",
  openLabel = "Hide the science",
  defaultOpen = false,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  openLabel?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent/90 transition hover:text-white"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
          ›
        </span>
        {open ? openLabel : label}
      </button>
      {open && <div className="fade-up mt-2 text-[12px] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}
