"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/explore", label: "Explore", hint: "102-colour infrared sky" },
  { href: "/fly", label: "Fly", hint: "Gaia-measured 3D stars" },
  { href: "/investigate", label: "Investigate", hint: "Time Travel + evidence" },
  { href: "/about", label: "Data & Method", hint: "Sources and limits" },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`} aria-label="COSMOS home">
      <span className="relative inline-block h-6 w-6">
        <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_200deg,#7c5cff,#408cff,#28d2e6,#5ae68c,#ffc446,#ff5c48,#7c5cff)] opacity-90" />
        <span className="absolute inset-[5px] rounded-full bg-[#03040a]" />
        <span className="absolute inset-[9px] rounded-full bg-white/90" />
      </span>
      <span className="font-display hidden text-[17px] font-semibold tracking-[0.18em] sm:inline">COSMOS</span>
    </Link>
  );
}

export default function NavBar() {
  const path = usePathname();
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 py-3 sm:px-5">
      <div className="pointer-events-auto glass flex items-center rounded-full px-3 py-2 sm:px-4">
        <Logo />
      </div>
      <nav className="pointer-events-auto glass flex items-center gap-1 rounded-full p-1">
        {LINKS.map((l) => {
          const active = path?.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              title={l.hint}
              className={`rounded-full px-2.5 py-1.5 text-[12.5px] font-medium transition sm:px-4 sm:text-[13px] ${
                active ? "bg-white/10 text-white" : "text-muted hover:text-white"
              }`}
            >
              {l.href === "/about" ? (
                <>
                  <span className="hidden sm:inline">Data &amp; </span>Method
                </>
              ) : (
                l.label
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
