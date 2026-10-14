import type { Metadata, Viewport } from "next";
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
  title: "Class Forum · Moderated chat demo",
  description:
    "A moderated class forum. Every message is checked by Jev (TypeSafe AI) before it's posted.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${arimo.variable} ${familjen.variable} h-full antialiased`}>
      <body className="flex h-dvh flex-col overflow-hidden">{children}</body>
    </html>
  );
}
