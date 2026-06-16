
export type Category =
  | "Developer Tools"
  | "Productivity"
  | "Social Networking"
  | "Games"
  | "Music"
  | "Unknown";

type Tier = 1 | 2 | 3 | 4 | 5;

type PhraseTable = {
  [tier in Tier]: {
    [cat in Category]: ((timePassed: number) => string)[];
  };
};

const phraseTemplates: PhraseTable = {
  1: {
    "Developer Tools": [
      () => "squashing them bugs",
      () => "please work",
      () => "it worked on my machine",
      () => "committing and praying",
      () => "who wrote this garbage (it was me)",
      () => "exit vim how",
    ],
    "Productivity": [
      () => "hmm...",
      () => "locking in (i'm distracted)",
      () => "staring at a blank doc",
      () => "manifesting motivation",
      () => "tomorrow's problem",
    ],
    "Social Networking": [
      () => "hehe",
      () => "what does bro mean by that",
      () => "let him cook",
      () => "sent this to the group chat",
      () => "i'm just a bystander",
      () => "real",
    ],
    "Games": [
      () => "bro lock in",
      () => "yall are trash",
      () => "we win these",
      () => "he's literally one hp",
      () => "my team is holding me back",
      () => "gg well played (it was not)",
    ],
    "Music": [
      () => "queueing up the focus beats",
      () => "vibe check passed",
      () => "music in, world out",
      () => "what's the move for today's soundtrack",
      () => "skipping songs instead of working",
    ],
    "Unknown": [
      () => "what am i even doing right now",
      () => "just wandering around",
      () => "clueless",
      () => "lost in the sauce",
      () => "idle animations playing",
    ],
  },
  2: {
    "Developer Tools": [
      () => "why is it still breaking",
      () => "i have 40 tabs open",
      (timePassed) => "staring at the same line for " + Math.round(timePassed / 60) + " mins",
      () => "one eternity later",
      () => "losing my sanity",
      () => "maybe if i restart my computer",
    ],
    "Productivity": [
      () => "i have achieved nothing",
      (timePassed) => "blinked and " + Math.round(timePassed / 60) + " mins passed",
      () => "brain is officially fried",
      () => "procrastinating at peak efficiency",
      () => "deep in the rabbit hole",
      () => "focus mode is a myth",
    ],
    "Social Networking": [
      () => "how did i get to this side of the app",
      () => "refreshing for the 50th time",
      () => "i am chronically online",
      () => "scrolling away my life",
      () => "my eyes are burning",
      () => "okay i need to close this app",
    ],
    "Games": [
      () => "on a massive losing streak",
      () => "just one more game",
      () => "i've been tilted for 45 minutes",
      () => "my chair is permanently molded now",
      () => "i forgot to blink",
      () => "surely the next lobby is better",
    ],
    "Music": [
      (timePassed) => "listening to the same song on repeat for " + Math.round(timePassed / 60) + " minutes",
      () => "lofi beats to completely lose track of time to",
      () => "head nodding but brain is off",
      () => "i am trapped in this playlist",
      () => "making a playlist instead of doing my tasks",
    ],
    "Unknown": [
      () => "i've been staring at the desktop wallpaper for way too long",
      (timePassed) => Math.round(timePassed / 60) + " minutes of pure aimless clicking",
      () => "where did the time go",
      () => "running on autopilot",
      () => "just floating through cyberspace",
    ],
  },
  3: {
    "Developer Tools": [
      () => "i am going to rewrite the whole thing",
      () => "accepted defeat",
      () => "my spine is a question mark",
      () => "the code is winning",
      () => "it's 2 am how did this happen",
      () => "delirious coding hits different",
    ],
    "Productivity": [
      () => "giving up and trying again tomorrow",
      (timePassed) => Math.round(timePassed / 60) + " minutes of pure existential dread",
      () => "i have successfully wasted half my day",
      () => "entering the seventh stage of grief",
      () => "time is an illusion",
      () => "closing all tabs in defeat",
    ],
    "Social Networking": [
      () => "i have reached the end of the internet",
      () => "unlocked a new level of doomscrolling",
      () => "why am i still looking at this screen",
      () => "i don't even know who these people are",
      () => "somebody take my phone away",
      () => "absorbed by the algorithm",
    ],
    "Games": [
      () => "i hate this game (requeues immediately)",
      () => "my joints are clicking",
      () => "completely desensitized to losing now",
      () => "i have officially tanked my rank",
      () => "hallucinating enemy footsteps",
      () => "log off button looking real good right now",
    ],
    "Music": [
      () => "the bassline is vibrating my remaining brain cells",
      () => "i don't even like this song why am i still listening",
      (timePassed) => "drowning out reality for " + Math.round(timePassed / 60) + " straight minutes",
      () => "music is the only thing keeping my soul inside my body",
      () => "the audio cue that it's time to log off was 1 hour ago",
    ],
    "Unknown": [
      () => "i think i forgot how to move my legs",
      () => "clicking things just to feel something",
      (timePassed) => "staring into the digital abyss for " + Math.round(timePassed / 60) + " minutes",
      () => "my brain has completely left the chat",
      () => "what was my goal today again",
    ],
  },
  4: {
    "Developer Tools": [
      () => "i am talking to a rubber duck now",
      () => "if i delete this folder will it all go away",
      () => "the bugs have won the war",
      () => "i no longer understand English or code",
      () => "is it too late to choose a new career",
      () => "accepting my fate as a broken shell of a person",
    ],
    "Productivity": [
      () => "the to-do list is mocking me",
      () => "i have achieved a state of total brain stagnation",
      () => "staring into the void and the void is staring back",
      (timePassed) => Math.round(timePassed / 60) + " minutes of absolutely nothing to show for it",
      () => "shutting down my brain for the rest of the day",
      () => "i am the definition of unproductivity",
    ],
    "Social Networking": [
      () => "i am reading comments from 6 years ago",
      () => "fully detached from reality at this point",
      () => "the screen glare is my only source of light",
      () => "how deep does this rabbit hole even go",
      () => "i have successfully scrolled to the bottom of the feed",
      () => "my thumb is actually cramping from scrolling",
    ],
    "Games": [
      () => "i have forgotten what the sun looks like",
      () => "my soul has left my body",
      () => "i'm not even mad anymore just empty",
      () => "playing purely on muscle memory and regret",
      () => "uninstalled and reinstalling as we speak",
      (timePassed) => Math.round(timePassed / 60) + " minutes of losing points i will never get back",
    ],
    "Music": [
      () => "ear drums are screaming for mercy",
      () => "the lyrics are starting to sound like Simlish",
      (timePassed) => "lost in the auditory void for " + Math.round(timePassed / 60) + " minutes",
      () => "i have merged with the soundwaves",
      () => "my neighbors are about to file a noise complaint",
    ],
    "Unknown": [
      () => "i've lost all track of space and time",
      (timePassed) => Math.round(timePassed / 60) + " minutes of absolute nothingness",
      () => "i'm just interacting with pixels at this point",
      () => "existential crisis mode fully activated",
      () => "am i even awake right now",
    ],
  },
  5: {
    "Developer Tools": [
      () => "tell my family i loved them",
      () => "the screen is blurring",
      () => "i see the light and it's a syntax error",
      () => "system failure",
    ],
    "Productivity": [
      () => "flatlining",
      () => "brain activity has ceased",
      () => "fade to black",
      () => "my ghost will finish this doc",
    ],
    "Social Networking": [
      () => "the algorithm claimed me",
      () => "buried alive in the feed",
      () => "my thumb has deceased",
      () => "goodbye cruel timeline",
    ],
    "Games": [
      () => "spectating my own life now",
      () => "gg real life",
      () => "respawn point not found",
      () => "wasted",
    ],
    "Music": [
      () => "the music has stopped but i still hear the ringing",
      () => "deafened by the silence of my own thoughts",
      () => "the final outro track is playing",
      () => "dancing with the grim reaper",
    ],
    "Unknown": [
      () => "lost in the void forever",
      () => "404: presence not found",
      () => "fading out of reality",
      () => "end of the line",
    ],
  },
};

// picks random phrase
export function pickPhrase(tier: number, category: string, timePassed: number): string {
  const t = Math.min(5, Math.max(1, Math.round(tier))) as Tier;
  const c = (category in phraseTemplates[t]
    ? (category as Category)
    : "Unknown") as Category;
  const arr = phraseTemplates[t][c];
  if (!arr.length) return "";
  const phraseFn = arr[Math.floor(Math.random() * arr.length)];
  return phraseFn(timePassed);
}