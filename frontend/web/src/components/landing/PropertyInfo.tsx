"use client";

import dynamic from "next/dynamic";
import { ArrowRight } from "lucide-react";

const LandingMap = dynamic(
  () => import("@/components/landing/LandingMap").then((mod) => mod.LandingMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center bg-forest/80 md:h-[520px]">
        <div className="flex items-center gap-3 rounded-md bg-card/95 px-4 py-3 text-[13px] text-foreground shadow-lg">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-forest/25 border-t-forest" />
          Loading live map…
        </div>
      </div>
    ),
  },
);

export function PropertyInfo() {
  return (
    <section className="bg-background">
      <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-6 py-20 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            See the bigger picture
          </p>
          <h2 className="mt-4 font-serif text-4xl leading-[1.12] text-foreground md:text-[2.75rem]">
            Property Information
            <br />
            Made Simple.
          </h2>
          <p className="mt-6 max-w-lg text-[14.5px] leading-relaxed text-muted-foreground">
            Search an address, explore the map, and see relevant records, cases, permits,
            and code enforcement activity — all in one place. FairProcess turns public data
            into clarity, so you can make informed decisions.
          </p>
          <a
            href="/map"
            className="mt-8 inline-flex items-center gap-2.5 rounded-md bg-forest px-6 py-3.5 text-sm font-medium text-forest-foreground transition-opacity hover:opacity-90"
          >
            Explore the Interactive Map
            <ArrowRight className="h-4 w-4" />
          </a>

          <dl className="mt-12 flex flex-wrap items-start gap-x-8 gap-y-6 border-t border-border pt-8">
            {[
              ["100%", "Public Data"],
              ["Live", "Parcel Lookup"],
              ["Humboldt County", "and Beyond"],
            ].map(([value, label], i) => (
              <div
                key={label}
                className={i > 0 ? "border-l border-border pl-8" : undefined}
              >
                <dt className="text-[15px] font-semibold text-foreground">{value}</dt>
                <dd className="mt-1 text-[13px] text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative overflow-hidden rounded-md border border-forest/30 bg-forest p-2 shadow-lg">
          <div className="relative overflow-hidden rounded-sm">
            <LandingMap />
          </div>
        </div>
      </div>
    </section>
  );
}
