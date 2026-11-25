/** The cast. Four original characters who believe resting is a martial art. Everything that is
 * said in the app comes from one of them, in their own voice. */
import type { CompanionId } from "../types/appearance";

export interface CastMember {
  name: string;
  epithet: string;
  /** One line for the picker. */
  bio: string;
  hello: string;
  /** Headline of a nudge, fresh to desperate. */
  ask: string[];
  /** What they say when told "not yet". */
  snoozed: string[];
  resting: (minutes: string) => string;
  rested: string[];
  /** Tried to expand with nothing left. */
  spent: string[];
  /** Passing thoughts: rested, flagging, finished. */
  fresh: string[];
  tired: string[];
  done: string[];
}

export const CAST: Record<CompanionId, CastMember> = {
  cat: {
    name: "Mika", epithet: "the strongest, allegedly",
    bio: "Wears a sleep mask. Says it's to hold back the power. It's for naps.",
    hello: "i'm Mika. you may admire me. quietly.",
    ask: ["sit. i'm bored of your work.", "we're napping. i've decided.", "i can't see. is it naptime?"],
    snoozed: ["fine. i wasn't asking.", "i'll be here. obviously.", "your loss."],
    resting: m => `${m}. don't speak to me.`,
    rested: ["there. i'm perfect again.", "back at full power. you may look.", "that was one of my nine lives. worth it."],
    spent: ["…i meant to do that.", "i was holding back. obviously."],
    fresh: ["i've won eleven fights today. all lying down.", "the mask stays on. it's for your safety.", "you type so loudly for someone so weak.", "i could end this tab. i choose not to."],
    tired: ["my eyes are getting wide. that's not good.", "this is beneath both of us.", "i've stopped blinking. have you?"],
    done: ["if i fall off this screen, i jumped.", "tell no one you saw me like this.", "the strongest… needs… five minutes."],
  },
  panda: {
    name: "Goro", epithet: "monk of the second lunch",
    bio: "Took a vow of stillness. Breaks it only for bamboo.",
    hello: "I'm Goro. I brought snacks. They're mine.",
    ask: ["Break? I finished my stalk.", "I'm out of bamboo. That's a sign.", "No bamboo. No thoughts. Please."],
    snoozed: ["okay. I'll chew slower.", "patience is also a snack.", "mm. soon, though."],
    resting: m => `${m} of sitting. I trained my whole life for this.`,
    rested: ["the stalk grew back. so did I.", "full belly. full power.", "that was a very good nothing."],
    spent: ["I ran out of bamboo. and void.", "the void is empty. wrong kind of empty."],
    fresh: ["my master sat for nine years. legs fell asleep. legend.", "a full stalk. a quiet day.", "I don't have a hidden form. this is it.", "breathe in. breathe out. crunch."],
    tired: ["the stalk is getting short.", "I've been rationing. it's going badly.", "a hungry monk is just a bear."],
    done: ["I can see through the bamboo. there is no bamboo.", "I started chewing on your cursor.", "bury me sitting up."],
  },
  capybara: {
    name: "Yuzu", epithet: "grandmaster, retired",
    bio: "Undefeated. Nobody has ever managed to make it care.",
    hello: "oh. hi. I'm Yuzu. no rush.",
    ask: ["bath's warm, if you want.", "I dropped a yuzu. must be break time.", "last yuzu. get in the water."],
    snoozed: ["sure.", "the water will wait.", "mm. okay."],
    resting: m => `${m}. shoulders under the water.`,
    rested: ["ahh.", "warm all the way through.", "see? nothing happened. it was great."],
    spent: ["oh. it's gone cold.", "nothing came out. that's fine."],
    fresh: ["I fought someone once. they fell asleep.", "that deadline looks stressed.", "I've balanced worse than this.", "no thoughts. only citrus."],
    tired: ["two yuzu left. just mentioning it.", "you're holding your breath again.", "even the pond goes still sometimes."],
    done: ["I have become soup.", "I'm not upset. I'm just underwater.", "no yuzu. it's over. it's fine."],
  },
  crab: {
    name: "Hasami", epithet: "everyone's self-appointed rival",
    bio: "Trains harder at resting than anyone alive. Has told you about it.",
    hello: "I AM HASAMI. I challenge you. To sit down.",
    ask: ["REST WITH ME, COWARD.", "My claw grows. You know what that means.", "It's too heavy. PLEASE. Sit."],
    snoozed: ["So. You flee.", "I will wait. DRAMATICALLY.", "I'd have said yes by now."],
    resting: m => `${m}! OUR FINEST TRAINING YET!`,
    rested: ["AGAIN! ...in half an hour.", "I have never been this relaxed. I WON.", "My claw is normal. My pride is not."],
    spent: ["IMPOSSIBLE. I was so well rehearsed.", "My technique! ...I forgot to nap."],
    fresh: ["I walked sideways for this job.", "I do ten thousand lie-downs a day.", "One day I'll defeat the cat. At sleeping.", "Your posture is an insult to my shell."],
    tired: ["The claw. It's getting ideas.", "I'm not tired. I'm CHARGING.", "A true rival knows when to sit."],
    done: ["Is this… my last arc?", "Tell the cat… I was… ahead on points.", "I can't lift it. Leave me. RUN. …Or sit. Sitting is good."],
  },
};

const pick = (lines: string[], random = Math.random()) => lines[Math.min(lines.length - 1, Math.floor(random * lines.length))];
export type Moment = "snoozed" | "rested" | "spent";
export const castSays = (id: CompanionId, moment: Moment, random?: number) => pick(CAST[id][moment], random);
/** A passing thought that suits how tired they are. */
export const castThought = (id: CompanionId, energy: number, random?: number) =>
  pick(CAST[id][energy >= 4 ? "fresh" : energy >= 2 ? "tired" : "done"], random);
export const castAsk = (id: CompanionId, energy: number) => CAST[id].ask[energy >= 4 ? 0 : energy >= 2 ? 1 : 2];

/** A full expansion takes rest energy. Below this, all that comes out is a small tantrum. */
export const EXPANSION_ENERGY = 3;
export const canExpand = (energy: number) => energy >= EXPANSION_ENERGY;
