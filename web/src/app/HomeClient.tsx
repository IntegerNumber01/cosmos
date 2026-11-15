"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Logo } from "@/components/NavBar";
import HeroGlobe from "@/components/HeroGlobe";

const StarField = dynamic(() => import("@/components/StarField"), { ssr: false });

const MODES = [
  {
    href: "/explore",
    k: "01",
    title: "Explore",
    line: "The whole sky in 102 infrared colours",
    body: "Pan and zoom NASA SPHEREx's all-sky map. Slide from 0.75 to 5 µm and watch dust melt away, nebulae ignite and hidden starlight appear.",
    img: "/img/explore-orion.webp",
    alt: "Orion Molecular Cloud in the SPHEREx all-sky map at 3.29 µm",
    stat: "102 wavelengths · DR1",
  },
  {
    href: "/fly",
    k: "02",
    title: "Fly",
    line: "Travel between real stars",
    body: "59,218 stars placed in 3D by ESA Gaia's measured parallaxes. Fly out to Epsilon Eridani or Barnard's Star and read each star's distance and its uncertainty.",
    img: "/img/fly-eps-eri.webp",
    alt: "The COSMOS 3D flight view approaching Epsilon Eridani",
    stat: "Gaia DR3 · measured distances",
  },
  {
    href: "/timetravel",
    k: "03",
    title: "Time Travel",
    line: "Any coordinates, dated views",
    body: "Type a position or pick a star. COSMOS finds every SPHEREx exposure of that spot, keeps only dates at the same wavelength, lines them up and helps you find what changed.",
    img: "/img/timetravel.webp",
    alt: "Swipe comparison: comet SWAN present in October 2025, absent in May 2026",
    stat: "live IRSA search · matched wavelengths",
  },
  {
    href: "/investigate",
    k: "04",
    title: "Investigate",
    line: "Case files you can check",
    body: "Comet SWAN from orbit prediction to pixels, plus the challenge's five test targets. Each comes with what SPHEREx can and can't show, and whether the object is already known.",
    img: "/img/investigate.webp",
    alt: "Comet C/2025 R2 (SWAN) in a SPHEREx exposure",
    stat: "1 comet · 5 validation targets",
  },
];

export default function HomeClient() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#020308]">
      {/* living background: real Gaia stars drifting past */}
      <div className="fixed inset-0 isolate z-0 opacity-90">
        <StarField mode="ambient" showLabels={false} />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,rgba(2,3,8,0.55)_60%,rgba(2,3,8,0.92)_100%)]" />

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <nav className="hidden gap-6 text-[13px] text-muted sm:flex">
          <Link href="/explore" className="hover:text-white">Explore</Link>
          <Link href="/fly" className="hover:text-white">Fly</Link>
          <Link href="/timetravel" className="hover:text-white">Time Travel</Link>
          <Link href="/investigate" className="hover:text-white">Investigate</Link>
          <Link href="/about" className="hover:text-white">Data &amp; Method</Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[80vh] max-w-[1320px] items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="fade-up max-w-3xl">
          <div className="label text-accent">NASA Space Apps 2026 · Planet X and SPHEREx</div>
          <h1 className="font-display mt-4 text-[44px] font-semibold leading-[1.02] sm:text-[64px]">
            Most of the universe
            <br />
            is <span className="bg-gradient-to-r from-[#7c5cff] via-[#28d2e6] to-[#ff5c48] bg-clip-text text-transparent">invisible</span> to our eyes.
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-text/80">
            <b className="text-white">COSMOS</b> is Google Earth for the infrared universe. Explore real NASA SPHEREx observations in 102
            colours of light your eyes can&apos;t see, fly through stars that ESA&apos;s Gaia measured, and investigate how the sky changes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/explore" className="btn btn-primary !px-6 !py-3 !text-[15px]">
              Start exploring the infrared sky →
            </Link>
            <Link href="/timetravel" className="btn !px-6 !py-3 !text-[15px]">
              Time Travel any spot in the sky
            </Link>
          </div>
          <p className="mt-6 text-[12px] text-dim">
            Every pixel, date and distance here comes from a public archive and links back to it. No invented measurements, no
            discovery claims.
          </p>
        </div>
        <div className="fade-up flex justify-center pb-10" style={{ animationDelay: "0.2s" }}>
          <HeroGlobe />
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-[1320px] px-5 pb-20 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((m, i) => (
            <Link
              key={m.title}
              href={m.href}
              className="glass group fade-up overflow-hidden rounded-2xl transition hover:-translate-y-1 hover:border-accent/40"
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.img} alt={m.alt} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#070a16] via-transparent to-transparent" />
                <span className="data absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] text-muted">{m.k}</span>
              </div>
              <div className="p-4 pt-1">
                <div className="font-display text-[22px] font-semibold">{m.title}</div>
                <div className="text-[13px] text-accent">{m.line}</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{m.body}</p>
                <div className="data mt-3 text-[10.5px] uppercase tracking-wider text-dim">{m.stat}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-14 grid gap-6 border-t border-line pt-8 text-[12.5px] text-muted md:grid-cols-3">
          <div>
            <div className="label mb-2">Data</div>
            NASA SPHEREx DR1 (all-sky cube and Level-2 images) via NASA/IPAC IRSA · ESA Gaia DR3 · IRSA Moving Object Search Tool.
          </div>
          <div>
            <div className="label mb-2">Honesty</div>
            SPHEREx images have no depth, so 3D comes only from Gaia distances. The all-sky map is a time-average, so Time Travel uses dated
            frames. A prediction isn&apos;t a detection.
          </div>
          <div>
            <div className="label mb-2">Mission</div>
            Make the infrared universe a place that anyone can explore, question and understand.{" "}
            <Link href="/about" className="text-accent hover:underline">
              Read the method →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
