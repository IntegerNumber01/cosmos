"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Logo } from "@/components/NavBar";
import HeroGlobe from "@/components/HeroGlobe";

const StarField = dynamic(() => import("@/components/StarField"), { ssr: false });

const MODES = [
  {
    href: "/explore",
    title: "Explore",
    line: "Pan and zoom around the whole sky in infrared.",
    img: "/img/explore-orion.webp",
    alt: "The Orion star-forming cloud in SPHEREx's infrared map of the sky",
    tag: "Real NASA SPHEREx data",
  },
  {
    href: "/fly",
    title: "Fly",
    line: "Fly in 3D between real stars near the Sun.",
    img: "/img/fly-eps-eri.webp",
    alt: "The COSMOS 3D flight view approaching the nearby star Epsilon Eridani",
    tag: "Real star distances from ESA's Gaia",
  },
  {
    href: "/timetravel?target=epsindib",
    title: "Time Travel",
    line: "Compare real dated photos, starting with a nearby brown dwarf.",
    img: "/img/timetravel.webp",
    alt: "Before-and-after comparison: comet SWAN present in October 2025, gone in May 2026",
    tag: "Real NASA SPHEREx data",
  },
  {
    href: "/investigate",
    title: "Investigate",
    line: "Follow a comet and check real cases, step by step.",
    img: "/img/investigate.webp",
    alt: "Comet C/2025 R2 (SWAN) in a SPHEREx picture",
    tag: "Real NASA SPHEREx data",
  },
];

export default function HomeClient() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-bg">
      {/* living background: real Gaia stars drifting past */}
      <div className="fixed inset-0 isolate z-0 opacity-90">
        <StarField mode="ambient" showLabels={false} />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,rgba(9,9,11,0.55)_60%,rgba(9,9,11,0.92)_100%)]" />

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <nav className="hidden gap-6 text-[13px] text-muted sm:flex">
          <Link href="/explore" className="hover:text-white">Explore</Link>
          <Link href="/fly" className="hover:text-white">Fly</Link>
          <Link href="/timetravel" className="hover:text-white">Time Travel</Link>
          <Link href="/investigate" className="hover:text-white">Investigate</Link>
          <Link href="/learn" className="hover:text-white">Learn</Link>
          <Link href="/about" className="hover:text-white">About</Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[78vh] max-w-[1320px] items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="fade-up max-w-2xl">
          <h1 className="font-display mt-4 text-[44px] font-semibold leading-[1.04] sm:text-[64px]">
            The sky changes.<br />
            <span className="bg-gradient-to-r from-[#7c5cff] via-[#28d2e6] to-[#ff5c48] bg-clip-text text-transparent">See the evidence.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-text/80">
            Compare real pictures from NASA&apos;s SPHEREx telescope. Watch a star brighten, measure a tiny motion, and learn what the observations can tell us.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/timetravel?target=rwaur&guide=1&mode=swipe" className="btn btn-primary !px-6 !py-3 !text-[15px]">
              See a real change →
            </Link>
            <Link href="/explore" className="btn !px-6 !py-3 !text-[15px]">
              Explore the infrared sky →
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-muted">No astronomy experience needed. <Link href="/learn" className="link">Learn the basics</Link> or <Link href="/timetravel" className="link">open the full tools</Link>.</p>
        </div>
        <div className="fade-up flex justify-center pb-4" style={{ animationDelay: "0.2s" }}>
          <HeroGlobe />
        </div>
      </section>

      <section id="ways-in" className="relative z-10 mx-auto max-w-[1320px] scroll-mt-6 px-5 pb-16 sm:px-8">
        <div className="mb-8 grid gap-4 rounded-2xl card p-5 sm:grid-cols-[1.2fr_1fr] sm:p-6">
          <div>
            <h2 className="font-display text-[23px] font-semibold">From a picture to an investigation</h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-text/80">For curious students, amateur astronomers and citizen scientists. Compare dates, measure a change, check what is known, and share the evidence.</p>
          </div>
          <div className="flex flex-col justify-center gap-3 text-[13px]">
            <Link href="/validation" className="link">Tested on the challenge&apos;s five targets →</Link>
            <Link href="/investigate/search" className="link">A blind search: promising leads and a false alarm →</Link>
            <Link href="/learn" className="link">A guided starting point, with science on request →</Link>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((m, i) => (
            <Link
              key={m.title}
              href={m.href}
              className="glass group fade-up overflow-hidden rounded-2xl transition hover:-translate-y-1 glass-hover"
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.img} alt={m.alt} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#141417] via-transparent to-transparent" />
              </div>
              <div className="p-4 pt-1">
                <div className="font-display text-[22px] font-semibold">
                  {m.title} <span className="inline-block text-muted transition group-hover:translate-x-0.5 group-hover:text-text">→</span>
                </div>
                <p className="mt-1 text-[14px] leading-snug text-text/80">{m.line}</p>
                <div className="mt-3 text-[11.5px] text-dim">{m.tag}</div>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-12 border-t border-line pt-6 text-center text-[13px] text-muted">
          Everything here is real data from public space archives — nothing is invented.{" "}
          <Link href="/about" className="link">
            Where it comes from →
          </Link>
        </p>
      </section>
    </main>
  );
}
