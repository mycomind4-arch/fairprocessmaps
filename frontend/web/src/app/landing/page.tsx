"use client";

import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { ValueStrip } from "@/components/landing/ValueStrip";
import { PropertyInfo } from "@/components/landing/PropertyInfo";
import { UseCases } from "@/components/landing/UseCases";
import { TransparencyBand } from "@/components/landing/TransparencyBand";
import { ClosingCta } from "@/components/landing/ClosingCta";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background font-sans">
      <Header />
      <main>
        <Hero />
        <ValueStrip />
        <PropertyInfo />
        <UseCases />
        <TransparencyBand />
        <ClosingCta />
      </main>
    </div>
  );
}
