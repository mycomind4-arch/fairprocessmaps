"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { ValueStrip } from "@/components/landing/ValueStrip";
import { PropertyInfo } from "@/components/landing/PropertyInfo";
import { UseCases } from "@/components/landing/UseCases";
import { TransparencyBand } from "@/components/landing/TransparencyBand";
import { ClosingCta } from "@/components/landing/ClosingCta";

export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  return (
    <div className="lovable-landing min-h-screen bg-background">
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
