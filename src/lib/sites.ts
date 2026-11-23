/** Understands a window title: which site a tab is on, and what it is for. Titles are read,
 * understood and let go; nothing in this file stores them. */

export interface SiteRule { contains: string; category: string }
export interface Place {
  /** "YouTube", when the title names a site we know. */
  site: string | null;
  /** What the page or document is called. */
  page: string;
  /** Overrides the app's own category when known. */
  category: string | null;
}

/** Categories a rule may choose; the first few also come from apps. */
export const RULE_CATEGORIES = ["Productivity", "Developer Tools", "Learning", "Messages", "News", "Shopping", "Social Networking", "Video", "Entertainment", "Games", "Music", "Private"] as const;

interface Site { name: string; category: string; match: RegExp }
const site = (name: string, category: string, match: RegExp | string = name): Site =>
  ({ name, category, match: typeof match === "string" ? new RegExp(`^${match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") : match });

/* Matched against whole parts of a title ("Intro - YouTube" → "Intro", "YouTube"), so a
 * document about YouTube is still a document. */
const SITES: Site[] = [
  site("YouTube Music", "Music"), site("SoundCloud", "Music", /^(SoundCloud|.*on SoundCloud)$/i), site("Spotify", "Music", /^Spotify( Web Player.*)?$/i), site("Bandcamp", "Music"),
  site("YouTube", "Video"), site("Vimeo", "Video", /^(.* on )?Vimeo$/i), site("Twitch", "Video"), site("TikTok", "Social Networking", /^TikTok( - .*)?$/i),
  site("Netflix", "Entertainment"), site("Disney+", "Entertainment", /^Disney\s?\+$/i), site("Prime Video", "Entertainment", /^(Amazon )?Prime Video.*$/i), site("Crunchyroll", "Entertainment", /^(Watch on )?Crunchyroll$/i), site("Hulu", "Entertainment"), site("Max", "Entertainment", /^(HBO )?Max$/), site("Letterboxd", "Entertainment"),
  site("Reddit", "Social Networking", /^(Reddit.*|r\/\w+|u\/[\w-]+)$/i), site("X", "Social Networking", /^(X|Twitter|.* (on|\/) X)$/), site("Instagram", "Social Networking", /^(Instagram|.*Instagram photos and videos)$/i), site("Facebook", "Social Networking"), site("Threads", "Social Networking"), site("Bluesky", "Social Networking"), site("Mastodon", "Social Networking"), site("Pinterest", "Social Networking"), site("Tumblr", "Social Networking", /^(on )?Tumblr$/i), site("LinkedIn", "Social Networking"), site("Snapchat", "Social Networking"),
  site("Gmail", "Messages"), site("Outlook", "Messages", /^Outlook(\.com)?$/i), site("Proton Mail", "Messages"), site("WhatsApp", "Messages", /^WhatsApp( Web)?$/i), site("Messenger", "Messages"), site("Slack", "Messages"), site("Discord", "Messages", /^Discord( \|.*)?$/i), site("Telegram", "Messages", /^Telegram( Web)?$/i), site("Microsoft Teams", "Messages"),
  site("Google Docs", "Productivity"), site("Google Sheets", "Productivity"), site("Google Slides", "Productivity"), site("Google Drive", "Productivity"), site("Google Calendar", "Productivity"), site("Google Forms", "Productivity"), site("Notion", "Productivity"), site("Figma", "Productivity"), site("Canva", "Productivity"), site("Overleaf", "Productivity", /^Overleaf(, .*)?$/i), site("Linear", "Productivity"), site("Trello", "Productivity"), site("Asana", "Productivity"), site("Jira", "Productivity"), site("Word", "Productivity", /^Word( Online)?$/), site("Dropbox", "Productivity"), site("Miro", "Productivity"), site("Airtable", "Productivity"),
  site("ChatGPT", "Productivity"), site("Claude", "Productivity"), site("Gemini", "Productivity", /^(Google )?Gemini$/i), site("Perplexity", "Productivity"),
  site("GitHub", "Developer Tools", /^(GitHub|(Pull Request|Issue|Discussion) #\d+)$/i), site("GitLab", "Developer Tools"), site("Stack Overflow", "Developer Tools"), site("MDN", "Developer Tools", /^MDN( Web Docs)?$/i), site("Vercel", "Developer Tools"), site("npm", "Developer Tools"), site("LeetCode", "Developer Tools"), site("CodePen", "Developer Tools"), site("Docs.rs", "Developer Tools", /^Rust$/), site("localhost", "Developer Tools", /^localhost(:\d+)?.*$/i),
  site("Wikipedia", "Learning"), site("Khan Academy", "Learning"), site("Coursera", "Learning"), site("edX", "Learning"), site("Duolingo", "Learning"), site("Quizlet", "Learning"), site("Brilliant", "Learning"), site("Google Scholar", "Learning"), site("arXiv", "Learning", /^(arXiv.*|\[\d{4}\.\d+\].*)$/i), site("JSTOR", "Learning", /^(on )?JSTOR$/i), site("Canvas", "Learning", /^(Canvas|Instructure)$/i), site("Quercus", "Learning", /^.*Quercus$/i), site("Piazza", "Learning"), site("Gradescope", "Learning"), site("Anki", "Learning", /^AnkiWeb$/i),
  site("Hacker News", "News"), site("The New York Times", "News"), site("BBC", "News", /^BBC( News| Sport)?$/i), site("CNN", "News", /^CNN( .*)?$/i), site("The Guardian", "News"), site("CBC", "News", /^CBC( News)?$/i), site("Google News", "News"), site("The Verge", "News"), site("Medium", "News"), site("Substack", "News"),
  site("Amazon", "Shopping", /^Amazon(\.\w+)*$/i), site("eBay", "Shopping"), site("Etsy", "Shopping", /^Etsy( .*)?$/i), site("AliExpress", "Shopping"), site("Best Buy", "Shopping", /^Best Buy( .*)?$/i),
  site("Steam", "Games", /^(Welcome to |on )?Steam$/i), site("Chess.com", "Games"), site("Lichess", "Games", /^lichess(\.org)?$/i), site("itch.io", "Games"), site("Roblox", "Games"),
];

const BROWSER_SUFFIX = /\s+[—–-]\s+(Mozilla Firefox|Firefox|Zen Browser|Google Chrome( [—–-] .+)?|Chromium|Brave|Microsoft Edge|Vivaldi|Opera( GX)?|Arc|Safari|LibreWolf|Waterfox|Floorp)\s*$/i;
const EDGE_PROFILE = /\s+-\s+(Personal|Work|Profile \d+)$/;
const COUNT = /^\s*[([]\d+\+?[)\]]\s*|^\s*[•●*]\s+/;
const SEPARATOR = /\s+[—–\-|·•»/]\s+|\s+:\s+/;

/** Video sites hold lectures and music too. Only clear words count. */
const LEARNING = /\b(tutorials?|lectures?|lessons?|course|explained|how to|crash course|walk ?me through|study with me|documentary|exam|midterm|chapter \d+|problem set|calculus|algebra|physics|chemistry|biology|programming|for beginners)\b/i;
const MUSIC = /\b(lo-?fi|official (audio|music video|lyric video|video)|lyrics?|full album|playlist|soundtrack|\bost\b|ambient music|study music|piano music)\b/i;

export function cleanTitle(title: string): string {
  let text = title.replace(COUNT, "").trim();
  const trimmed = text.replace(BROWSER_SUFFIX, "");
  if (trimmed !== text) text = trimmed.replace(EDGE_PROFILE, "");
  return text.trim();
}

/** What's in front, from its title. `browser` says whether the title belongs to a tab. */
export function placeFrom(title: string | null | undefined, browser: boolean, rules: readonly SiteRule[] = []): Place | null {
  if (!title) return null;
  const text = cleanTitle(title);
  if (!text) return null;
  const lower = text.toLowerCase();
  const rule = rules.find(r => r.contains.trim() && lower.includes(r.contains.trim().toLowerCase()));
  if (rule?.category === "Private") return { site: null, page: "", category: "Private" };

  const parts = text.split(SEPARATOR).map(p => p.trim()).filter(Boolean);
  let found: Site | undefined;
  let at = -1;
  // The site's name is nearly always last; sometimes first; search titles put it last too.
  if (browser) for (const index of [...parts.keys()].reverse()) {
    found = SITES.find(s => s.match.test(parts[index]));
    if (found) { at = index; break; }
  }
  const rest = parts.filter((_, index) => index !== at);
  const page = rest.length ? rest.slice().sort((a, b) => b.length - a.length)[0] : text;
  let category = found?.category ?? null;
  if (found && (found.name === "YouTube" || found.name === "Vimeo")) {
    if (LEARNING.test(page)) category = "Learning";
    else if (MUSIC.test(page)) category = "Music";
  }
  return { site: found?.name ?? null, page: page.slice(0, 120), category: rule?.category ?? category };
}

/* ---- does this have to do with what you said you'd do? ---- */
const STOP = new Set("about after again also been before being could doing down each ever finish from getting give going have here into just like make more most much need next only other over part really some start still stuff such than that their them then there these they thing things this those through time today very want week well were what when where which while will with work working write your read review study learn practice draft page chapter section paragraph intro".split(" "));
const stem = (word: string) => word.replace(/(ies)$/, "y").replace(/(ing|ed|es|s|ly|e)$/, "");
const words = (text: string) => text.toLowerCase().normalize("NFKD").match(/[\p{L}\p{N}+#]{3,}/gu) ?? [];

export function onTopic(intention: string, title: string): boolean {
  const wanted = new Set(words(intention).filter(w => !STOP.has(w)).map(stem).filter(w => w.length >= 3));
  return wanted.size > 0 && words(title).some(w => wanted.has(stem(w)));
}
