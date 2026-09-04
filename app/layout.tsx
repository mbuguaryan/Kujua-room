import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import "./host-access.css";
import "./mobile-chat.css";
import "./host-dashboard.css";
import "./mic-controls.css";
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const serif = Fraunces({ subsets: ["latin"], weight: ["600"], variable: "--font-serif" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono" });
export const metadata: Metadata = { title: "Kujua Room — Audio Calls", description: "Voice-only coaching and conference rooms", applicationName: "Kujua Room" };
export const viewport: Viewport = { themeColor: "#1c1f1e", colorScheme: "dark", viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}><body>{children}</body></html>; }
