import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Playfair_Display, Caveat, Libre_Franklin } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/providers";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const libreFranklin = Libre_Franklin({ subsets: ["latin"], variable: "--font-landing-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });
const caveat = Caveat({ subsets: ["latin"], variable: "--font-script" });

export const metadata: Metadata = {
  title: "FairProcess — Property Records, Permits & Code Enforcement",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
  },
  description:
    "Find, understand, and act on property, permit, and code enforcement records in Humboldt County, CA — public data made clear.",
  metadataBase: new URL("https://fairprocess.pages.dev"),
  openGraph: {
    title: "FairProcess — Property Records, Permits & Code Enforcement",
    description:
      "Find, understand, and act on property, permit, and code enforcement records in Humboldt County, CA — public data made clear.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${libreFranklin.variable} ${jetbrains.variable} ${playfair.variable} ${caveat.variable}`}>
      <body className="h-full antialiased">
        <AuthProvider>
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
