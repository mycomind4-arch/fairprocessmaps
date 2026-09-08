import { MapPin, ArrowRight } from "lucide-react";
import ctaImage from "@/assets/cta-forest.jpg";

export function ClosingCta() {
  return (
    <section id="about" className="relative isolate overflow-hidden">
      <img
        src={ctaImage.src}
        alt="Misty river winding through a redwood forest at dawn"
        width={1920}
        height={900}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-forest/85 via-forest/55 to-forest/20" />

      <div className="relative mx-auto max-w-[1400px] px-6 py-24 md:py-28">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-forest-foreground/85">
          Same land. Brighter future.
        </p>
        <h2 className="mt-5 max-w-2xl font-serif text-4xl leading-tight text-forest-foreground md:text-5xl">
          Let's Build a More Transparent Tomorrow.
        </h2>
        <p className="mt-5 max-w-xl text-[14.5px] text-forest-foreground/85">
          Explore the map, find the facts, and be part of a fairer process.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a
            href="/map"
            className="inline-flex items-center gap-2.5 rounded-md bg-forest-foreground px-6 py-3.5 text-sm font-medium text-forest transition-opacity hover:opacity-90"
          >
            <MapPin className="h-4 w-4" />
            Explore the Map
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#use-cases"
            className="inline-flex items-center rounded-md border border-forest-foreground/50 px-6 py-3.5 text-sm font-medium text-forest-foreground transition-colors hover:bg-forest-foreground/10"
          >
            Learn More
          </a>
        </div>

        <p className="pointer-events-none absolute bottom-16 right-8 hidden max-w-[170px] -rotate-6 font-script text-2xl leading-snug text-forest-foreground/90 after:mt-1 after:block after:h-px after:w-24 after:bg-forest-foreground/50 lg:block">
          Knowledge Creates Opportunity
        </p>
      </div>
    </section>
  );
}
