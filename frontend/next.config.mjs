/** @type {import('next').NextConfig} */
const nextConfig = {
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
      /* PLOT TO PLAN. /planner is the link the design team is given — the
         space-planning tool itself, the second static file under public/tools,
         served at an address worth sending rather than at its filename. It
         holds nothing and reads nothing, so it is open like /deck is. */
      {
        source: "/planner",
        destination: "/tools/area-planner.html",
      },
    ];
  },
};

export default nextConfig;
