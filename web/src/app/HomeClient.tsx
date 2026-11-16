"use client";
import Link from "next/link";
import { Logo } from "@/components/NavBar";
import MotionPreview from "@/components/MotionPreview";

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

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <nav aria-label="Main navigation" className="hidden gap-6 text-[13px] text-muted sm:flex">
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
          <div className="label">For students and astronomy clubs · no experience needed</div>
          <h1 className="font-display mt-4 text-[36px] font-semibold leading-[1.04] sm:text-[64px]">
            The sky changes.<br />
            <span className="bg-gradient-to-r from-[#7c5cff] via-[#28d2e6] to-[#ff5c48] bg-clip-text text-transparent">See the evidence.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-text/80">
            A dot moved. Is it real? Compare NASA&apos;s infrared images, measure the change, and learn which evidence deserves your trust.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/timetravel?target=epsindib&guide=1&mode=swipe" className="btn btn-primary !px-6 !py-3 !text-[15px]">
              Investigate a moving brown dwarf →
            </Link>
            <Link href="/learn/kit" className="btn !px-6 !py-3 !text-[15px]">
              Teach a 20-minute investigation →
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-muted">No telescope, account or science software. <Link href="/learn" className="link">Learn the basics</Link> or <Link href="/timetravel" className="link">open the full tools</Link>.</p>
          <ol className="mt-8 hidden gap-4 border-t border-line pt-5 text-[14px] sm:grid sm:grid-cols-3"><li><span className="data text-muted">01</span><p className="mt-1 font-semibold">Measure a real change</p></li><li><span className="data text-muted">02</span><p className="mt-1 font-semibold">Challenge a false alarm</p></li><li><span className="data text-muted">03</span><p className="mt-1 font-semibold">Explain your evidence</p></li></ol>
        </div>
        <div className="fade-up min-w-0 pb-4" style={{ animationDelay: "0.2s" }}>
          <MotionPreview />
        </div>
      </section>

      <section id="ways-in" className="relative z-10 mx-auto max-w-[1320px] scroll-mt-6 px-5 pb-16 sm:px-8">
        <div className="mb-8 grid gap-4 rounded-2xl card p-5 sm:grid-cols-[1.2fr_1fr] sm:p-6">
          <div>
            <h2 className="font-display text-[23px] font-semibold">From a picture to an investigation</h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-text/80">An investigation a learner can explain and a facilitator can discuss. Start with motion, test a brightness change, then challenge a misleading result. Keep the reasoning with the evidence.</p>
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
