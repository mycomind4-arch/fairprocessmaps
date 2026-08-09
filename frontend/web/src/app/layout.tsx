import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/providers";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "FairProcessMaps — Build Your Case",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
  },
  description:
    "Evidence-first case analysis for building, documenting, and defending a fair process.",
  metadataBase: new URL("https://fairprocess.pages.dev"),
  openGraph: {
    title: "FairProcessMaps — Build Your Case",
    description: "Evidence, analysis, defense, response, and proof in one case workspace.",
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
