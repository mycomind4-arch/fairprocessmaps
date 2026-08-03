import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/providers";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "FairProcess 2.0 — Evidence-first Due-Process Analysis",
  description:
    "Property-centric GIS, public-record ingestion, AI extraction, timeline generation, and automated due-process discrepancy detection.",
  metadataBase: new URL("https://fairprocess.pages.dev"),
  openGraph: {
    title: "FairProcess 2.0",
    description: "Evidence-first platform for property due-process analysis",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${jetbrains.variable}`}>
      <body className="h-full antialiased">
        <AuthProvider>
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
