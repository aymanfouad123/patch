import { ArrowDown, ArrowUpRight, Asterisk } from "lucide-react";
import { Patch } from "@patch/react";

const projects = [
  { number: "01", name: "Forma", category: "Brand & digital experience", year: "2026", description: "A quieter home for everyday objects. An identity and storefront built around thoughtful living.", color: "bg-[#e7e9e1]", art: "forma" },
  { number: "02", name: "Offbeat", category: "Product design & development", year: "2026", description: "Making room for the unexpected. A discovery platform for people who take the scenic route.", color: "bg-[#e9e2f0]", art: "offbeat" },
  { number: "03", name: "Fieldnotes", category: "Editorial & web design", year: "2025", description: "Ideas worth keeping. A small digital publication about the places and people in between.", color: "bg-[#ece5da]", art: "fieldnotes" },
];

export default function Home() {
  return (
    <>
      <a href="#main" className="sr-only fixed top-4 left-4 z-50 rounded-full bg-foreground px-4 py-2 text-background focus:not-sr-only">Skip to content</a>
      <div className="mx-auto max-w-[1040px] px-6 sm:px-12">
        <header className="flex items-center justify-between border-b border-border py-7 sm:py-9">
          <a href="#" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight"><Asterisk className="size-5" strokeWidth={1.5} /><span className="sr-only">Home</span></a>
          <nav aria-label="Main navigation" className="flex items-center gap-6 text-xs text-muted-foreground sm:gap-8"><a href="#work" className="transition-colors hover:text-foreground">Work</a><a href="#about" className="transition-colors hover:text-foreground">About</a><a href="mailto:hello@example.com" className="flex items-center gap-1 text-foreground">Let’s talk<ArrowUpRight className="size-3.5" /></a></nav>
        </header>
        <main id="main">
          <section className="pt-20 pb-20 sm:pt-28 sm:pb-24">
            <p className="mb-7 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="relative flex size-1.5"><span className="absolute inline-flex size-full rounded-full bg-emerald-500/20 ring-4 ring-emerald-500/10" /><span className="relative size-1.5 rounded-full bg-emerald-600" /></span>Independent designer & developer</p>
            <h1 className="max-w-3xl text-[clamp(2.8rem,6.2vw,4.5rem)] leading-[1.08] font-medium tracking-[-0.06em]">Thoughtful design.<br /><span className="text-[#91918a]">A little personality.</span></h1>
            <div className="mt-8 flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
              <p className="max-w-[360px] text-sm leading-7 text-muted-foreground">A designer who codes. I turn complex ideas into simple, considered digital experiences. Currently making things on the internet.</p>
              <a href="#work" className="flex w-fit items-center gap-3 rounded-full border border-border px-4 py-2.5 text-xs transition-colors hover:bg-accent">Explore my work<ArrowDown className="size-3.5" /></a>
            </div>
          </section>
          <section id="work" className="scroll-mt-8">
            <div className="mb-7 flex items-center justify-between border-t border-border pt-6 text-[10px] tracking-[0.15em] text-muted-foreground uppercase"><h2>Selected work</h2><span>2025 — 2026</span></div>
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2">
              {projects.map((project, index) => (
                <article key={project.name} className={index === 2 ? "sm:col-span-2" : ""}>
                  <div aria-hidden="true" className={`relative flex ${index === 2 ? "h-56 sm:h-64" : "aspect-[1.32]"} items-center justify-center overflow-hidden rounded-xl ${project.color}`}>
                    <span className="absolute top-4 left-4 text-[9px] tracking-widest text-black/35">{project.number} / CONCEPT</span>
                    {project.art === "forma" && <div className="relative flex h-44 w-56 items-center justify-center"><div className="absolute bottom-0 h-9 w-40 rounded-[50%] bg-[#b2b7a3]/30 blur-md" /><div className="absolute right-5 bottom-5 h-28 w-20 rounded-t-[45%] rounded-b-[30%] bg-[#bcc2af] shadow-[inset_-12px_-5px_20px_#8f9982,inset_8px_0_16px_#d9ddcf]" /><span className="relative -ml-10 font-serif text-6xl tracking-[-0.08em] text-[#44503b]">forma.</span></div>}
                    {project.art === "offbeat" && <div className="relative -rotate-6 rounded-xl bg-[#f7f4fa] px-9 py-8 shadow-[8px_14px_0_#c8badb]"><span className="absolute top-3 right-3 size-2 rounded-full bg-[#a58cbf]" /><p className="text-[9px] tracking-[0.2em] text-[#9783ac] uppercase">Go somewhere new.</p><p className="mt-3 text-4xl font-bold tracking-[-0.07em] text-[#6b4d86]">offbeat<Asterisk className="ml-1 inline size-7" /></p><div className="mt-5 flex gap-1.5"><span className="h-1 w-14 rounded bg-[#d8cde4]" /><span className="h-1 w-7 rounded bg-[#e8e0ef]" /></div></div>}
                    {project.art === "fieldnotes" && <div className="flex w-full items-center justify-center gap-8 px-8 sm:gap-20"><div><p className="mb-3 text-[8px] tracking-[0.3em] text-[#8f806e] uppercase">An independent journal</p><p className="font-serif text-4xl leading-none tracking-[-0.06em] text-[#645743] sm:text-6xl">Fieldnotes<span className="text-[#b09c7c]">®</span></p><p className="mt-4 text-[9px] text-[#8f806e]">On finding something in the everyday.</p></div><div className="hidden h-40 w-28 rotate-6 items-center justify-center bg-[#f7f1e7] shadow-[5px_8px_20px_#69533920] sm:flex"><div className="h-24 w-16 rounded-t-full bg-[#b6ad95]"><div className="mx-auto mt-6 h-16 w-10 rounded-t-full bg-[#d8d0bd]" /></div></div></div>}
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-4"><div><h3 className="text-sm font-medium">{project.name}</h3><p className="mt-1 text-[11px] text-muted-foreground">{project.category}</p></div><span className="pt-0.5 text-[10px] text-muted-foreground">{project.year}</span></div>
                  <p className="mt-2 max-w-lg text-xs leading-6 text-muted-foreground">{project.description}</p>
                </article>
              ))}
            </div>
          </section>
          <section id="about" className="mt-20 grid gap-6 border-t border-border py-12 sm:grid-cols-[1fr_2fr]">
            <h2 className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase">A little about me</h2>
            <div className="max-w-lg"><p className="text-lg leading-8 tracking-tight">Equal parts curious and considered. I care about the small details that make something feel right.</p><p className="mt-4 text-xs leading-6 text-muted-foreground">This is a fictional portfolio, built to give Patch a place to play. See that little purple character in the corner? Say hello and try the demo.</p></div>
          </section>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 pb-24 text-[10px] text-muted-foreground"><p>© 2026 · Demo portfolio</p><a href="mailto:hello@example.com" className="flex items-center gap-1 hover:text-foreground">Have something in mind? Let’s talk<ArrowUpRight className="size-3" /></a></footer>
      </div>
      <Patch />
    </>
  );
}
