import type { AdventureKind, AdventurePhase } from "../hooks/usePetLife";

const DETAILS: Record<AdventureKind, { label: string; hint: string }> = {
  garden: { label: "Water the flower", hint: "Tending a tiny garden" },
  ball: { label: "Roll the ball", hint: "A little game of catch" },
  butterfly: { label: "Flutter the butterfly", hint: "A curious visitor" },
  bubbles: { label: "Pop a bubble", hint: "Tiny bubbles, big curiosity" },
  leaf: { label: "Toss the leaf", hint: "Look what blew in" },
  snack: { label: "Offer another nibble", hint: "A well-earned treat" },
  tea: { label: "Make a little steam", hint: "Taking a quiet tea break" },
  stargaze: { label: "Twinkle the stars", hint: "A moment to daydream" },
  exercise: { label: "Cheer on the stretch", hint: "A big little stretch" },
  nap: { label: "Wake up gently", hint: "Just resting my eyes" },
  peek: { label: "Play peekaboo", hint: "Where did you go?" },
};
export function PetPlaything({ kind, phase, touches, responding, onInteract }: { kind: AdventureKind; phase: AdventurePhase; touches: number; responding: boolean; onInteract: () => void }) {
  const detail = DETAILS[kind];
  return <button type="button" className={`pet-plaything plaything-${kind} phase-${phase} interactive ${responding ? "plaything-touched" : ""}`}
    title={detail.hint} aria-label={detail.label} onClick={e => { e.stopPropagation(); onInteract(); }}>
    <span key={touches} className="plaything-art" data-touches={touches}>
      <svg viewBox="0 0 24 24" shapeRendering="crispEdges" aria-hidden="true">
        {kind === "garden" && <>
          <path d="M11 10H13V23H11ZM5 17H11V19H8V18H5ZM13 15H19V17H16V18H13Z" fill="#6b8855"/>
          <path d="M10 1H14V3H17V6H19V10H17V13H14V15H10V13H7V10H5V6H7V3H10Z" fill="#e9a896"/>
          <path d="M9 6H15V11H9Z" fill="#eed384"/>
          {responding && <path d="M2 7H4V10H2ZM20 10H22V13H20Z" fill="#86b6c2"/>}
        </>}
        {kind === "ball" && <><path d="M7 6H17V8H20V11H22V17H20V20H17V22H7V20H4V17H2V11H4V8H7Z" fill="#ae7666"/><path d="M7 8H12V10H7ZM5 10H7V14H5Z" fill="#f0c1a1"/><path d="M14 6H17V8H16V12H14V16H12V20H10V22H7V20H9V16H11V12H13V8H14Z" fill="#e9d391"/></>}
        {kind === "butterfly" && <><path d="M2 4H7V6H10V10H11V18H8V20H3V18H1V12H3V10H1V6H2ZM22 4H17V6H14V10H13V18H16V20H21V18H23V12H21V10H23V6H22Z" fill="#e2b27f"/><path d="M3 7H7V10H3ZM17 7H21V10H17ZM4 14H8V17H4ZM16 14H20V17H16Z" fill="#b9868b"/><path d="M11 8H13V19H11ZM9 5H11V8H9ZM13 5H15V8H13Z" fill="#596452"/></>}
        {kind === "bubbles" && <><path d="M4 2H10V4H12V10H10V12H4V10H2V4H4ZM15 13H21V15H23V21H21V23H15V21H13V15H15Z" fill="#9cbfc5"/><path d="M4 4H10V10H4ZM15 15H21V21H15Z" fill="#ddebe2"/><path d="M4 4H6V6H4ZM15 15H17V17H15Z" fill="#fff5df"/></>}
        {kind === "leaf" && <><path d="M19 2H23V7H21V11H19V15H15V18H11V20H5V17H3V11H5V7H9V5H15V3H19Z" fill="#a5ae6e"/><path d="M19 5H21V7H19V9H17V11H15V13H13V15H11V17H9V19H7V21H5V23H3V21H5V19H7V17H9V15H11V13H13V11H15V9H17V7H19Z" fill="#6c8057"/></>}
        {kind === "snack" && <><path d="M5 6H19V8H21V19H19V22H5V19H3V8H5Z" fill="#b18456"/><path d="M6 8H18V19H6Z" fill="#e3ba7c"/><path d="M8 10H10V12H8ZM14 13H17V15H14ZM9 17H11V19H9Z" fill="#856443"/>{phase === "interact" && <path d="M17 5H23V12H19V10H17Z" fill="var(--panel-bg)"/>}</>}
        {kind === "tea" && <><path d="M3 11H17V21H5V19H3ZM17 13H22V19H17Z" fill="#93a58b"/><path d="M5 13H15V19H5ZM18 15H20V17H18Z" fill="#e9dfc5"/><path d="M2 22H21V24H2Z" fill="#a0a77e"/><path className="tea-steam" d="M6 1H8V5H6V8H4V5H6ZM12 2H14V6H12V9H10V6H12Z" fill="#bac3af"/></>}
        {kind === "stargaze" && <><path d="M5 1H7V4H10V6H7V9H5V6H2V4H5ZM16 11H18V14H21V16H18V19H16V16H13V14H16Z" fill="#d7b975"/><path d="M16 1H18V3H16ZM4 18H6V20H4Z" fill="#c4b4d8"/></>}
        {kind === "exercise" && <><path d="M2 18H22V23H2Z" fill="#a6b19b"/><path d="M4 19H20V21H4Z" fill="#d4d9bc"/><path d="M5 4H7V8H5ZM17 4H19V8H17Z" fill="#ddbd81"/></>}
        {kind === "nap" && <><path d="M2 13H22V22H2Z" fill="#c0a19a"/><path d="M4 15H20V20H4Z" fill="#e4c5ab"/><path d="M14 1H21V3H19V5H17V7H21V9H14V7H16V5H18V3H14Z" fill="#a5af9f"/></>}
        {kind === "peek" && <><path d="M1 9H23V23H1Z" fill="#b88b5a"/><path d="M3 11H11V21H3ZM13 11H21V21H13Z" fill="#d7ad78"/><path d="M1 6H10V9H1ZM14 6H23V9H14Z" fill="#e5c99c"/></>}
      </svg>
    </span>
    {responding && <span key={`spark-${touches}`} className="plaything-spark" aria-hidden="true">✦</span>}
  </button>;
}
