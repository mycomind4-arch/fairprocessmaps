import { MapPin, ArrowRight } from "lucide-react";
import heroImage from "@/assets/hero-coast.jpg";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <img
        src={heroImage}
        alt="Aerial view of a forested Humboldt County coastline at sunset"
        width={1920}
        height={1080}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-forest/90 via-forest/60 to-forest/20" />

      <div className="relative mx-auto max-w-[1400px] px-6 py-24 md:py-32">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-forest-foreground/85">
          Public records. Real context. A fairer process.
        </p>
        <h1 className="mt-5 max-w-3xl font-serif text-5xl leading-[1.05] text-forest-foreground md:text-7xl">
          Knowledge
          <br />
          Levels the Ground.
        </h1>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-forest-foreground/85">
          FairProcess helps you find, understand, and act on property, permit, and code
          enforcement information — so you can protect what matters.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a
            href="#"
            className="inline-flex items-center gap-2.5 rounded-md bg-forest-foreground px-6 py-3.5 text-sm font-medium text-forest transition-opacity hover:opacity-90"
          >
            <MapPin className="h-4 w-4" />
            Explore the Map
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#"
            className="inline-flex items-center rounded-md border border-forest-foreground/50 px-6 py-3.5 text-sm font-medium text-forest-foreground transition-colors hover:bg-forest-foreground/10"
          >
            Search Your Property
          </a>
        </div>

        <p className="pointer-events-none absolute right-8 top-1/3 hidden max-w-[190px] -rotate-6 font-script text-2xl leading-snug text-forest-foreground/90 after:mt-1 after:block after:h-px after:w-24 after:bg-forest-foreground/50 lg:block">
          Stronger Communities Through Transparency
        </p>

        <div className="mt-16 text-right md:mt-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-forest-foreground">
            Humboldt County, CA
          </p>
          <p className="mt-1 text-[11px] text-forest-foreground/70">
            Land. People. Process.
          </p>
        </div>
      </div>
    </section>
  );
}
