import { describe, expect, it } from "vitest";
import { cleanTitle, onTopic, placeFrom } from "../src/lib/sites";
import { siteLine } from "../src/lib/siteLines";
import { Wandering } from "../src/lib/wandering";

const tab = (title: string) => placeFrom(title, true);

describe("understanding a tab from its title", () => {
  it.each([
    ["Lo-fi hip hop radio - YouTube", "YouTube", "Music"],
    ["(3) Funny cats compilation - YouTube", "YouTube", "Video"],
    ["Photosynthesis explained - YouTube — Zen Browser", "YouTube", "Learning"],
    ["Essay draft - Google Docs", "Google Docs", "Productivity"],
    ["Essay draft - Google Docs - Google Chrome – Work", "Google Docs", "Productivity"],
    ["Budget - Google Sheets - Personal - Microsoft Edge", "Google Sheets", "Productivity"],
    ["Inbox (12) - me@example.com - Gmail", "Gmail", "Messages"],
    ["What's your favourite crab? : r/crabs", "Reddit", "Social Networking"],
    ["Someone on X: “hello” / X", "X", "Social Networking"],
    ["Fix the thing by someone · Pull Request #12 · owner/repo · GitHub", "GitHub", "Developer Tools"],
    ["Fix the thing by someone · Pull Request #12 · owner/repo", "GitHub", "Developer Tools"],
    ["Capybara - Wikipedia", "Wikipedia", "Learning"],
    ["● general | Discord", "Discord", "Messages"],
    ["[2401.00001] A paper about things", "arXiv", "Learning"],
    ["Netflix", "Netflix", "Entertainment"],
  ])("%s", (title, site, category) => {
    expect(tab(title)).toMatchObject({ site, category });
  });
  it("is not fooled by a document about a site", () => {
    expect(tab("Why YouTube is addictive - Google Docs")).toMatchObject({ site: "Google Docs", category: "Productivity" });
    expect(tab("YouTube - Wikipedia")).toMatchObject({ site: "Wikipedia" });
    expect(tab("Marking X on the map")?.site).toBeNull();
    expect(tab("Maximum Max - a history")?.site).toBeNull();
  });
  it("keeps the page's name, and leaves an unknown site to its app", () => {
    expect(tab("Photosynthesis explained - YouTube")?.page).toBe("Photosynthesis explained");
    expect(tab("Some small blog post")).toEqual({ site: null, page: "Some small blog post", category: null });
  });
  it("never reads a site into another app's window", () => {
    expect(placeFrom("notes - Reddit", false)).toMatchObject({ site: null, category: null });
  });
  it("lets your rules win, and forgets what you marked private", () => {
    const rules = [{ contains: "bio150", category: "Learning" }, { contains: "Bank", category: "Private" }];
    expect(placeFrom("BIO150 memes : r/uoft", true, rules)).toMatchObject({ site: "Reddit", category: "Learning" });
    expect(placeFrom("My Bank - Accounts", true, rules)).toEqual({ site: null, page: "", category: "Private" });
    expect(placeFrom("anything", true, [{ contains: "  ", category: "Games" }])?.category).toBeNull();
  });
  it("copes with nothing and with odd titles", () => {
    for (const empty of [null, undefined, "", "   ", "(4) "]) expect(tab(empty as string)).toBeNull();
    expect(tab("—")).not.toBeUndefined();
    expect(tab("x".repeat(900))!.page.length).toBe(120);
    expect(cleanTitle("New Tab — Zen Browser")).toBe("New Tab");
  });
});

describe("whether a page belongs to what you're doing", () => {
  it.each([
    ["Photosynthesis essay", "Photosynthesis explained", true],
    ["Study derivatives", "How to find a derivative", true],
    ["Learn C++", "C++ in 100 seconds", true],
    ["Photosynthesis essay", "10 funniest cats", false],
    ["Finish reading chapter 4", "Chapter one: the beginning", false],
    ["work", "Work it - official video", false],
    ["", "Anything", false],
  ])("%s / %s", (intention, title, related) => expect(onTopic(intention, title)).toBe(related));
});

describe("wandering", () => {
  it("notices a flurry of tabs once, not ordinary browsing", () => {
    const w = new Wandering();
    let now = 1_800_000_000_000;
    for (let i = 0; i < 40; i++) expect(w.hop(now += 30_000)).toBe(false);
    const flurry = Array.from({ length: 40 }, () => w.hop(now += 3000));
    expect(flurry.filter(Boolean)).toHaveLength(1);
  });
  it("counts real visits, not seconds, and starts over each day", () => {
    const w = new Wandering();
    let now = new Date(2026, 10, 23, 9).getTime();
    const seen: number[] = [];
    for (let visit = 0; visit < 10; visit++) {
      for (let s = 0; s < 60; s++) { const n = w.visit("Reddit", now += 1000); if (n) seen.push(n); }
      now += 5 * 60_000;
    }
    expect(seen).toEqual([5, 10]);
    expect(w.visit("Reddit", now + 86_400_000)).toBeNull();
  });
  it("only has something to say where it knows something", () => {
    expect(siteLine(null)).toBeNull();
    expect(siteLine({ site: null, page: "x", category: null })).toBeNull();
    expect(siteLine({ site: "Gmail", page: "x", category: "Messages" }, 0.999)).toBeTruthy();
  });
});
