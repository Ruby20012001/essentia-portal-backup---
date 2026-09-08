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
    // The server cannot know which theme this browser last chose, so the
    // attribute it renders and the one the script below sets can differ for a
    // tick. That is the whole point of the script, and the warning about it is
    // noise here rather than a bug.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Runs before anything paints. Without it the page would render dark,
            then jump to light a frame later — the flash every theme toggle is
            judged by. It reads the stored choice, falls back to the system
            setting, and writes the attribute the CSS variables key off.

            Deliberately tiny and inline: a separate file would be a request the
            first paint has to wait for, which is the thing being avoided. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
  var t = localStorage.getItem('essentia-theme');
  if (t !== 'light' && t !== 'dark') {
    t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', t);
}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${lato.variable} bg-canvas font-body font-light text-ink antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
