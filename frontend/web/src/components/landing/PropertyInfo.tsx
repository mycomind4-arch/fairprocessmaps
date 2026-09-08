import { ArrowRight, MapPin, Search } from "lucide-react";
import mapAerial from "@/assets/map-aerial.jpg";
import propertyThumb from "@/assets/property-thumb.jpg";

const PINS = [
  { top: "18%", left: "34%" },
  { top: "27%", left: "22%" },
  { top: "25%", left: "56%" },
  { top: "40%", left: "44%" },
  { top: "52%", left: "36%" },
  { top: "62%", left: "20%" },
  { top: "66%", left: "48%" },
  { top: "72%", left: "31%" },
  { top: "78%", left: "60%" },
];

const ROWS: [string, string][] = [
  ["APN", "510-123-456"],
  ["Zoning", "RS-5"],
  ["Code Enforcement", "1 Open Case"],
  ["Permits", "3 Records"],
  ["Last Activity", "Aug 18, 2025"],
];

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
              ["Real-Time", "Updates"],
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
            <img
              src={mapAerial.src}
              alt="Satellite map of a coastal community with property parcels"
              width={1200}
              height={1000}
              loading="lazy"
              className="h-[420px] w-full object-cover md:h-[520px]"
            />

            {PINS.map((pin, i) => (
              <MapPin
                key={i}
                aria-hidden
                className="absolute h-6 w-6 -translate-x-1/2 -translate-y-full fill-teal-pin text-forest-foreground drop-shadow"
                style={{ top: pin.top, left: pin.left }}
                strokeWidth={1.2}
              />
            ))}

            <div
              aria-hidden
              className="absolute left-[38%] top-[44%] h-[13%] w-[13%] -rotate-12 border-2 border-yellow-300 bg-yellow-300/25"
            />

            <div className="absolute left-4 right-4 top-4 md:right-[36%]">
              <div className="flex items-center gap-2.5 rounded-md bg-card px-4 py-3 shadow-md">
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-[13px] text-muted-foreground">
                  Search by address, APN, or case number...
                </span>
              </div>
            </div>

            <div className="absolute bottom-4 right-4 hidden w-[260px] rounded-md bg-card p-3 shadow-xl md:block">
              <img
                src={propertyThumb.src}
                alt="Forested river valley seen from 1234 Redwood Dr"
                width={800}
                height={560}
                loading="lazy"
                className="h-[110px] w-full rounded-sm object-cover"
              />
              <h3 className="mt-3 text-[15px] font-semibold text-foreground">
                1234 Redwood Dr
              </h3>
              <p className="text-[12px] text-muted-foreground">McKinleyville, CA 95519</p>
              <dl className="mt-3 space-y-1.5 border-t border-border pt-3">
                {ROWS.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11px] text-muted-foreground">{label}</dt>
                    <dd className="text-[11px] font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              <a
                href="/map"
                className="mt-4 flex items-center justify-center gap-2 rounded-md bg-forest px-4 py-3 text-[12.5px] font-medium text-forest-foreground transition-opacity hover:opacity-90"
              >
                View Full Property Report
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
