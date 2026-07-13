import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
export const metadata: Metadata = { title: "Cheetrade — Your trades, finally in focus", description: "A read-only MT5 trading journal and analytics workspace.", openGraph: { title: "Cheetrade", description: "Your trades. Clearer decisions.", images: ["/og.png"] }, twitter: { card: "summary_large_image", title: "Cheetrade", description: "Your trades. Clearer decisions.", images: ["/og.png"] } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className={geist.variable}>{children}</body></html>; }
