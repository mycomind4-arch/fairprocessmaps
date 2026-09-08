import { ArrowRight } from "lucide-react";
import owners from "@/assets/use-owners.jpg";
import buyers from "@/assets/use-buyers.jpg";
import neighbors from "@/assets/use-neighbors.jpg";
import advocates from "@/assets/use-advocates.jpg";

const CASES = [
  {
    image: owners,
    alt: "Two-story family home with a front porch",
    title: "Property Owners",
    body: "Stay informed, protect your property, and respond with confidence.",
  },
  {
    image: buyers,
    alt: "House under construction with exposed wood framing",
    title: "Buyers & Investors",
    body: "Research before you buy. Avoid costly surprises.",
  },
  {
    image: neighbors,
    alt: "Coastal neighborhood on a forested bluff above the ocean",
    title: "Neighbors & Community",
    body: "Understand what's happening in your area.",
  },
  {
    image: advocates,
    alt: "White domed government capitol building",
    title: "Advocates & Professionals",
    body: "Access the data you need to support fair outcomes.",
  },
];

export function UseCases() {
  return (
    <section id="use-cases" className="border-y border-border bg-sand">
      <div className="mx-auto max-w-[1400px] px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Common ways people use FairProcess
            </p>
            <h2 className="mt-4 font-serif text-4xl text-foreground md:text-[2.6rem]">
              Information for Real Life.
            </h2>
          </div>
          <a
            href="#use-cases"
            className="inline-flex items-center gap-2 border-b border-foreground/40 pb-0.5 text-[13px] font-medium text-foreground transition-colors hover:text-forest"
          >
            View All Use Cases
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CASES.map((item) => (
            <article
              key={item.title}
              className="overflow-hidden rounded-md border border-border bg-card"
            >
              <img
                src={item.image.src}
                alt={item.alt}
                width={800}
                height={520}
                loading="lazy"
                className="h-[120px] w-full object-cover"
              />
              <div className="p-5">
                <h3 className="text-[15px] font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                <a
                  href="/map"
                  className="mt-5 inline-flex items-center gap-2 border-b border-foreground/40 pb-0.5 text-[12.5px] font-medium text-foreground transition-colors hover:text-forest"
                >
                  Learn More
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
