/** Continuous minutes on a category before the pet nudges you off it.
 *  `0` disables overuse nudges for that category. */
export type CategoryOveruseMins = Record<string, number>;

export const DEFAULT_CATEGORY_OVERUSE_MINS: CategoryOveruseMins = {
  Games: 60,
  "Social Networking": 30,
  Entertainment: 45,
  Video: 45,
  Music: 0, // passive — don't nag
  "Developer Tools": 0, // covered by the general energy reminder
  Productivity: 0,
  Unknown: 0,
};

/** Categories the Settings UI exposes as adjustable overuse limits. */
export const OVERUSE_SETTING_CATEGORIES = [
  "Games",
  "Social Networking",
  "Entertainment",
  "Video",
] as const;

export function mergeCategoryOveruseMins(
  saved: CategoryOveruseMins | undefined | null,
): CategoryOveruseMins {
  return { ...DEFAULT_CATEGORY_OVERUSE_MINS, ...(saved ?? {}) };
}

/** Pick a spicy "get off that app" line for an overuse nudge. */
export function pickOverusePhrase(
  category: string,
  stretchSeconds: number,
): string {
  const mins = Math.max(1, Math.round(stretchSeconds / 60));
  const pool = OVERUSE_PHRASES[category] ?? OVERUSE_PHRASES.default;
  const template = pool[Math.floor(Math.random() * pool.length)];
  return template(mins);
}

type PhraseFn = (mins: number) => string;

const OVERUSE_PHRASES: Record<string, PhraseFn[]> = {
  Games: [
    (m) => `${m} minutes of gaming — touch grass, champ.`,
    (m) => `one more match? that's what you said ${m} minutes ago.`,
    (m) => `${m} mins deep. the boss can wait. you can't.`,
    (m) => `gg — now go stretch. you've been gaming ${m} minutes.`,
  ],
  "Social Networking": [
    (m) => `${m} minutes of scrolling. the timeline will still be there.`,
    (m) => `you've been doomscrolling for ${m} mins. close the tab.`,
    (m) => `${m} minutes online. nobody needs that many opinions.`,
    () => `put the phone down. wait — you're on a computer. same idea.`,
  ],
  Entertainment: [
    (m) => `${m} minutes of entertainment. the show will wait.`,
    (m) => `binge pause? you've been here ${m} minutes.`,
    (m) => `${m} mins of content. your eyes need a plot twist: rest.`,
  ],
  Video: [
    (m) => `${m} minutes of video. hit pause and look away.`,
    (m) => `autoplay got you for ${m} mins. take the remote back.`,
    (m) => `${m} minutes glued to a screen. blink. stretch. leave.`,
  ],
  default: [
    (m) => `${m} minutes on this — maybe switch it up?`,
    (m) => `you've been here ${m} mins straight. take a breather.`,
    (m) => `${m} minutes is a long stretch. time to change gears.`,
  ],
};
