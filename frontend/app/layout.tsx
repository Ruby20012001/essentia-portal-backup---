import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";

// Lato only — Light (300), Regular (400), Bold (700). No other font families.
const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-lato",
});

export const metadata: Metadata = {
  title: "essentia portal",
  description: "essentia group — every client returns.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${lato.variable} bg-canvas font-body font-light text-white antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
