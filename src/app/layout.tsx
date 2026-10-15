import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Arimo, Familjen_Grotesk } from "next/font/google";
import "./globals.css";

const arimo = Arimo({
  variable: "--font-arimo",
  subsets: ["latin"],
});

const familjen = Familjen_Grotesk({
  variable: "--font-familjen",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Can't Bleep This",
  description:
    "Can't Bleep This — Get it past the filter. Every message is checked before it's posted.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${arimo.variable} ${familjen.variable} h-full antialiased`}>
      <body className="flex h-dvh flex-col overflow-hidden">{children}</body>
    </html>
  );
}
