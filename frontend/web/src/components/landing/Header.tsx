import { Search, TreePine } from "lucide-react";

const NAV = [
  "Map",
  "Property Records",
  "Code Enforcement",
  "Cases & Permits",
  "Resources",
  "About",
];

export function Header() {
  return (
    <header className="w-full border-b border-border bg-background">
      <div className="mx-auto flex max-w-[1400px] items-center gap-8 px-6 py-4">
        <a href="/" className="flex items-center gap-2.5">
          <TreePine className="h-8 w-8 text-forest" strokeWidth={1.5} />
          <span className="leading-none">
            <span className="block font-serif text-2xl font-semibold tracking-tight text-forest">
              FairProcess
            </span>
            <span className="mt-0.5 block text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Know your property. Defend your rights.
            </span>
          </span>
        </a>

        <nav className="hidden flex-1 items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <a
              key={item}
              href="#"
              className="text-[13px] font-medium text-foreground/80 transition-colors hover:text-forest"
            >
              {item}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            aria-label="Search"
            className="p-1.5 text-foreground/70 transition-colors hover:text-forest"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <a
            href="#"
            className="rounded-md border border-border px-5 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Sign In
          </a>
          <a
            href="#"
            className="rounded-md bg-forest px-5 py-2.5 text-[13px] font-medium text-forest-foreground transition-opacity hover:opacity-90"
          >
            Explore the Map
          </a>
        </div>
      </div>
    </header>
  );
}
