import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

/**
 * The drum face. A tall, tight condensed grotesque is what real Solari boards
 * use: it fills the card edge to edge, so the glyph is cut cleanly in half by
 * the seam instead of floating in the middle of it.
 */
const flapFont = Barlow_Condensed({
  variable: "--font-flap",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const uiFont = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Bellwether",
  description:
    "The all hands prediction game. Call it before they announce it. Play credits, never money.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${flapFont.variable} ${uiFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#06070a] text-[#e8e4da]">
        {children}
      </body>
    </html>
  );
}
