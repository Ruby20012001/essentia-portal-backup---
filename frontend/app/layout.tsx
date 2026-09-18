import type { Metadata } from "next";
import { Lato } from "next/font/google";
import { portalMode } from "@/lib/portal-mode";
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
  /* The design deployment OPENS light and keeps the switch (Monica, 18 Sep:
     first "pure tracker light me chahiye", then "isme dark light mode add
     kro"). Those are not in conflict — the first is about what a visitor is
     shown before anyone touches anything, the second about being allowed to
     change it. So tracker mode only moves the fallback: no stored choice means
     light rather than whatever the laptop happens to prefer, because the board
     is read off a shared screen in a lit room. A person who picks dark keeps
     dark. The full portal still follows the system. */
  const defaultTheme = portalMode() === "tracker" ? "light" : "dark";

  return (
    // The server cannot know which theme this browser last chose, so the
    // attribute it renders and the one the script below sets can differ for a
    // tick. That is the whole point of the script, and the warning about it is
    // noise here rather than a bug.
    <html lang="en" data-theme={defaultTheme} suppressHydrationWarning>
      <head>
        {/* Runs before anything paints. Without it the page would render one
            theme and jump to the other a frame later — the flash every theme
            toggle is judged by. It reads the stored choice, falls back to this
            deployment's default, and writes the attribute the CSS variables
            key off.

            Deliberately tiny and inline: a separate file would be a request the
            first paint has to wait for, which is the thing being avoided. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
  var t = localStorage.getItem('essentia-theme');
  if (t !== 'light' && t !== 'dark') {
    t = ${JSON.stringify(defaultTheme)} === 'light' ? 'light'
      : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
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
