import { Map, FileText, ShieldCheck, Users } from "lucide-react";

const ITEMS = [
  {
    icon: Map,
    title: "Interactive Maps",
    body: "Explore parcels, cases, and public data in one place.",
  },
  {
    icon: FileText,
    title: "Access Public Records",
    body: "Find permits, inspections, notices and more.",
  },
  {
    icon: ShieldCheck,
    title: "Understand Your Rights",
    body: "Get clear, plain-language guidance.",
  },
  {
    icon: Users,
    title: "Build Stronger Communities",
    body: "Transparency helps everyone.",
  },
];

export function ValueStrip() {
  return (
    <section className="border-b border-border bg-sand">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-6 py-9 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-4">
            <Icon className="mt-0.5 h-7 w-7 shrink-0 text-forest" strokeWidth={1.3} />
            <div>
              <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
