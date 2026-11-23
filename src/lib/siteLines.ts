import type { Place } from "./sites";

const BY_SITE: Record<string, string[]> = {
  "Google Docs": ["one sentence, then the next", "the blinking cursor and me, cheering", "ugly first drafts are allowed"],
  "Google Sheets": ["cells. so many cells", "=SUM(snacks)"],
  "Google Slides": ["fewer bullets. trust me"],
  Gmail: ["inbox zero is a myth", "reply, or let it rest"],
  GitHub: ["ship it? ship it", "reading someone’s diff like a novel"],
  "Stack Overflow": ["closed as duplicate, surely", "the answer with 4 votes is the good one"],
  Wikipedia: ["how did we get to this article", "one more blue link"],
  YouTube: ["scoot over, I’m watching too", "the sidebar is looking at you"],
  Reddit: ["is the good stuff in the comments?", "just the top five, right?"],
  ChatGPT: ["tell it I said hi", "I could’ve told you that. maybe"],
  Claude: ["ooh, what are you two making?", "ask it about capybaras"],
  Figma: ["nudge it two pixels. hey, that’s my name", "align, then breathe"],
  Notion: ["organizing counts. up to a point"],
  Overleaf: ["it compiled?!", "overfull hbox, overfull me"],
  Netflix: ["are we still watching?"],
  Amazon: ["is it in the cart because you need it?"],
};
const BY_CATEGORY: Record<string, string[]> = {
  Learning: ["ooh, what are we learning?", "explain it to me after", "save the good bit for later"],
  Messages: ["say hi from me", "short replies are kind replies"],
  News: ["a little news goes a long way", "big world out there"],
  Shopping: ["sleep on it?", "window shopping is free"],
};

/** Something to say about where you are, if there is anything. */
export function siteLine(place: Place | null, random = Math.random()): string | null {
  if (!place) return null;
  const lines = [...(place.site ? BY_SITE[place.site] ?? [] : []), ...(place.category ? BY_CATEGORY[place.category] ?? [] : [])];
  return lines.length ? lines[Math.floor(random * lines.length)] : null;
}
