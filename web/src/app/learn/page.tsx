import Link from "next/link";
import NavBar from "@/components/NavBar";

export const metadata = { title: "Your first sky investigation · COSMOS", description: "Learn to compare real infrared observations, recognize a change, and understand its limits. Start with a guided investigation or open the full tools." };

const CONCEPTS = [
  { n: "01", title: "Infrared is light we cannot see", text: "SPHEREx measures light just beyond visible red, in 102 infrared colors. The purple and orange on your screen represent measured brightness; they are display colors, not what your eyes would see in space.", question: "Why use infrared?", answer: "It can reveal cool objects and regions obscured by dust. Different infrared colors also carry clues about the material that emitted or absorbed the light." },
  { n: "02", title: "Compare dates in the same color", text: "An object may look different because time passed, or because a different kind of light was measured. COSMOS first selects observations at closely matching infrared wavelengths, then lines up the sky.", question: "Why not just subtract any two pictures?", answer: "A star can be bright in one infrared color and faint in another without changing over time. Even small wavelength differences can sample a spectral feature, so matching is a safeguard, not a guarantee." },
  { n: "03", title: "A change is a question to investigate", text: "A source may move, brighten or fade. Camera artifacts, noisy pixels, overlapping stars and imperfect alignment can imitate those changes. Measurements need uncertainty and checks against other evidence.", question: "Does no catalog match mean a discovery?", answer: "No. Catalogs are incomplete and services can fail. An unmatched source needs independent observations, artifact checks and further investigation before any discovery claim." },
];

export default function LearnPage() {
  return (
    <main className="relative min-h-screen bg-bg pb-20">
      <NavBar />
      <div className="mx-auto max-w-[1100px] px-5 pt-24 sm:px-8">
        <div className="label text-accent">Learn by investigating</div>
        <h1 className="font-display mt-3 max-w-3xl text-[36px] font-semibold leading-tight sm:text-[52px]">The sky changes.<br />Learn how to check.</h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-text/80">You don&apos;t need to know astronomy coordinates or install software. Start with real NASA pictures, ask one question, and follow the evidence.</p>

        <section aria-label="Choose an investigation" className="mt-8 grid gap-4 md:grid-cols-2">
          <Link href="/timetravel?target=rwaur&guide=1&mode=swipe" className="glass group overflow-hidden rounded-2xl transition hover:border-accent/50">
            <div className="p-6">
              <div className="label text-accent">Start here · brightness</div>
              <h2 className="font-display mt-2 text-[27px] font-semibold">Did this young star get brighter?</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">Compare RW Aurigae on two dates, measure its brightness, and learn why a visible difference still needs checking.</p>
              <span className="btn btn-primary mt-5">Start the guided investigation →</span>
            </div>
          </Link>
          <Link href="/timetravel?target=epsindib&guide=1&mode=swipe" className="glass group overflow-hidden rounded-2xl transition hover:border-accent/50">
            <div className="p-6">
              <div className="label text-accent">Go further · motion</div>
              <h2 className="font-display mt-2 text-[27px] font-semibold">Can a brown dwarf move in a year?</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">Look for a tiny shift in Epsilon Indi B. Compare measured positions with a catalog prediction and understand the uncertainty.</p>
              <span className="btn mt-5">Investigate motion →</span>
            </div>
          </Link>
        </section>

        <section aria-label="Real-sky investigation kit" className="mt-6 rounded-2xl border border-accent/30 p-6">
          <div className="label text-accent">Try it yourself or with a group · 15–20 minutes</div>
          <h2 className="font-display mt-2 text-[27px] font-semibold">Would you believe this change?</h2>
          <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-muted">Investigate a young star, a brown dwarf and a misleading measurement from overlapping light. Give your reason before revealing the explanation, then keep a record someone else can check.</p>
          <div className="mt-4 flex flex-wrap gap-3"><Link href="/learn/lab" className="btn btn-primary">Try the three real cases</Link><Link href="/learn/kit" className="btn">Open the printable investigation kit</Link></div>
        </section>
        <h2 className="font-display mt-12 text-[27px] font-semibold">Three ideas to take with you</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {CONCEPTS.map((c) => <article key={c.n} className="glass rounded-2xl p-5">
            <div className="data text-[13px] text-accent">{c.n}</div>
            <h3 className="font-display mt-3 text-[21px] font-semibold leading-tight">{c.title}</h3>
            <p className="mt-3 text-[14px] leading-relaxed text-text/80">{c.text}</p>
            <details className="mt-4 border-t border-line pt-3 text-[13px]">
              <summary className="cursor-pointer text-accent">{c.question}</summary>
              <p className="mt-2 leading-relaxed text-muted">{c.answer}</p>
            </details>
          </article>)}
        </div>

        <section className="mt-10 grid gap-5 rounded-2xl border border-line p-6 md:grid-cols-2">
          <div>
            <h2 className="font-display text-[23px] font-semibold">Know your way around the sky?</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">Enter your own coordinates, select dates and wavelength windows, inspect quality flags, stack visits, or build an exploratory spectrum. Technical methods and original data links stay available in the viewer.</p>
            <Link href="/timetravel" className="btn mt-4">Open the full investigation tools →</Link>
          </div>
          <div>
            <h2 className="font-display text-[23px] font-semibold">Teaching a group?</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">Ask learners: What changed? What evidence supports that answer? What could fool us? Have each learner share a comparison and describe one limitation. Prepared examples use saved real observations when the image archive is unavailable.</p>
            <Link href="/learn/kit" className="btn mt-4">Get the facilitator guide →</Link>
          </div>
        </section>

        <section id="words" className="mt-10 scroll-mt-24">
          <h2 className="font-display text-[25px] font-semibold">A few words, explained</h2>
          <dl className="mt-4 grid gap-4 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Wavelength", "A way to describe a color of light. µm means micrometers; infrared wavelengths are longer than visible light."],
              ["RA and Dec", "Right ascension and declination: the sky's version of longitude and latitude. They locate a patch of sky."],
              ["Arcsecond (″)", "A tiny angle: 1/3,600 of a degree. One SPHEREx camera pixel spans about 6.2 arcseconds."],
              ["Uncertainty", "How precisely a quantity can be measured. Error bars show part of this uncertainty; unmodeled effects can still matter."],
              ["Catalog prediction", "Where a previously measured object is expected to be. It is separate from a detection in these pictures."],
              ["Saturation", "An object is too bright for a reliable reading in the affected camera pixels. More brightness does not always mean more useful data."],
            ].map(([word, meaning]) => <div key={word} className="rounded-xl bg-white/[0.025] p-4"><dt className="font-semibold text-text">{word}</dt><dd className="mt-1 leading-relaxed text-muted">{meaning}</dd></div>)}
          </dl>
        </section>
        <p className="mt-10 text-[13px] text-muted">SPHEREx DR1 observations from NASA/IPAC IRSA. <Link href="/about" className="text-accent hover:underline">Sources, methods and limits →</Link></p>
      </div>
    </main>
  );
}
