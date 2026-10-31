import type { Metadata } from "next";
import { headers } from "next/headers";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { Logo } from "@/components/Logo";
import { SiteHeader } from "@/components/SiteHeader";
import { siteTitle } from "@/lib/siteTitle";
import { hostnameFromHost, isComingSoonHostname } from "@/lib/siteHosts";
import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: siteTitle("The Plate Lab — 360×180 Environments"),
  description:
    "Pro-stitched 360×180 driving plates for VFX, LED volumes & virtual production. Captured on the Spheris 9-camera array.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const hostname = hostnameFromHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  const isComingSoon = isComingSoonHostname(hostname);
  const localComposite = process.env.PLATELAB_COMPOSITE_REVIEW === "1" && ["127.0.0.1", "localhost", "[::1]"].includes(hostname);

  return (
    <html lang="en" className={`${hanken.variable} ${plexMono.variable}`}>
      <body className={isComingSoon ? "coming-soon-host" : undefined}>
        {!isComingSoon && (localComposite ? <header className="site-header"><div className="wrap"><Logo href="/review" /><nav className="site-nav"><a href="/review" className="mono" style={{fontSize:11}}>LOCAL COLLECTION</a><span className="mono dimmer" style={{fontSize:10}}>COMPOSITE INGEST PILOT</span></nav></div></header> : <SiteHeader />)}
        {children}
        {!isComingSoon && (
          <footer className="site-footer">
            <div className="horizon" />
            <div className="wrap">
              <Logo href={localComposite ? "/review" : "/"} />
              <div style={{ textAlign: "right" }}>
                <p className="mono dimmer">
                  Captured on the Spheris array · Meridian Live Stitch
                </p>
                <p className="mono dimmer" style={{ marginTop: 6 }}>
                  © 2026 The Plate Lab · {localComposite ? "Local composite review" : "All previews watermarked"}
                </p>
              </div>
            </div>
          </footer>
        )}
      </body>
    </html>
  );
}
