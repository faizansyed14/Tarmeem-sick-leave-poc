import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "Tarmeem Leave Verification", template: "%s · Tarmeem" },
  description: "Sick leave certificate verification for Tarmeem Hospital, Abu Dhabi.",
  icons: {
    icon: [{ url: "/favicon.png", sizes: "192x192", type: "image/png" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans text-[14px] leading-relaxed">{children}</body>
    </html>
  );
}
