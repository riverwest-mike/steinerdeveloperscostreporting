import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Inter covers display + body. Söhne Heavy is the brand display face but
// requires a commercial license; swap it in here once the foundry license
// is in place by replacing this Inter import with a self-hosted Söhne loader.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KILN — Where projects take shape.",
  description:
    "KILN is the financial control system for real estate development. Control commitments. Forecast exposure. Approve with confidence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
