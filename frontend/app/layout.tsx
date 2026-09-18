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
  /* The design deployment is light, full stop (Monica, 18 Sep: "pure tracker
     light me chahiye"). It is read off a shared screen in a lit room, and a
     visitor whose laptop happens to prefer dark should not be shown a
     different board from the one it was designed against. The full portal
     keeps the choice. */
  const locked = portalMode() === "tracker";

  return (
    // The server cannot know which theme this browser last chose, so the
    // attribute it renders and the one the script below sets can differ for a
    // tick. That is the whole point of the script, and the warning about it is
    // noise here rather than a bug. When the theme is locked there is nothing
    // to differ about, so the server renders the final answer.
    <html lang="en" data-theme={locked ? "light" : "dark"} suppressHydrationWarning>
      <head>
        {/* Runs before anything paints. Without it the page would render dark,
            then jump to light a frame later — the flash every theme toggle is
            judged by. It reads the stored choice, falls back to the system
            setting, and writes the attribute the CSS variables key off.

            Deliberately tiny and inline: a separate file would be a request the
            first paint has to wait for, which is the thing being avoided.

            Skipped entirely when the theme is locked: the attribute is already
            right, and a stored 'dark' from some earlier visit must not be
            allowed to override it. */}
        {locked ? null : (
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
        )}
      </head>
      <body
        className={`${lato.variable} bg-canvas font-body font-light text-ink antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
