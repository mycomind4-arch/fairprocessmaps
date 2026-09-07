import { Leaf, ShieldCheck, TreePine, Users } from "lucide-react";

const PILLARS = [
  { icon: Leaf, label: "Fairer Process" },
  { icon: Users, label: "More Informed Citizens" },
  { icon: ShieldCheck, label: "Accountable Government" },
  { icon: TreePine, label: "Healthier Communities" },
];

export function TransparencyBand() {
  return (
    <section className="bg-forest text-forest-foreground">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-6 py-14 lg:flex-row lg:items-center">
        <h2 className="font-serif text-3xl leading-tight lg:w-[30%]">
          Transparency Builds
          <br />
          Stronger Communities.
        </h2>
        <div className="grid flex-1 grid-cols-2 gap-8 lg:grid-cols-4">
          {PILLARS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center text-center">
              <Icon className="h-7 w-7 text-forest-foreground/90" strokeWidth={1.3} />
              <p className="mt-3 text-[12.5px] text-forest-foreground/90">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
