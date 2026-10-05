import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV } from "@/components/shell/nav";
import { GATES, progressByGroup, progressTotals, SCREENS } from "@/lib/build-progress";

/**
 * Keeps the Build Progress page honest. Every menu entry must be listed, and
 * a screen is "built" exactly when its page file does not render a
 * PagePlaceholder. Build a placeholder out, and this fails until the list
 * says so — which is the point.
 */

const APP = path.resolve(__dirname, "../../app");

function pageFile(href: string): string | null {
  for (const dir of [path.join(APP, "(portal)"), APP]) {
    const f = path.join(dir, ...href.split("/").filter(Boolean), "page.tsx");
    if (existsSync(f)) return f;
  }
  return null;
}

const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));

describe("Build Progress", () => {
  it("lists every menu entry, and nothing that is not in the menu", () => {
    expect(hrefs.filter((h) => !SCREENS[h])).toEqual([]);
    expect(Object.keys(SCREENS).filter((h) => !hrefs.includes(h))).toEqual([]);
  });

  it.each(hrefs)("%s matches its page file", (href) => {
    const file = pageFile(href);
    expect(file, `no page.tsx for ${href}`).not.toBeNull();
    const isPlaceholder = readFileSync(file!, "utf8").includes("PagePlaceholder");
    expect(SCREENS[href].status).toBe(isPlaceholder ? "placeholder" : "built");
  });

  it("has eight gates, numbered in order", () => {
    expect(GATES.map((g) => g.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("totals add up", () => {
    const t = progressTotals(progressByGroup());
    expect(t.total).toBe(hrefs.length);
    expect(t.built + Object.values(SCREENS).filter((s) => s.status === "placeholder").length).toBe(t.total);
    expect(t.gatesPassed).toBe(GATES.filter((g) => g.status === "passed").length);
  });
});
