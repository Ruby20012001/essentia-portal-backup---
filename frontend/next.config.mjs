/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Two dev servers on one .next folder overwrite each other's build and both
     start answering 404. A second preview (.claude/launch.json) sets
     NEXT_DIST_DIR so it builds somewhere else. Unset, it is .next as always. */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* ONE LINK FOR A DECK. /deck/<id> is the address anybody is given: it reads
     for everybody, signs the design team in and out, and stays the same the
     whole way through. It is the deck tool itself — the one static file under
     public/tools — served at that address, not a copy of it. The tool reads
     the id off the path. (Monica, 15 Sep 2026.) */
  async rewrites() {
    return [
      {
        source: "/deck/:id([0-9a-fA-F-]{36})",
        destination: "/tools/concept-deck.html",
      },
    ];
  },
};

export default nextConfig;
