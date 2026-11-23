import type { ReactNode } from "react";
import "./PetCard.css";

export interface CardAction { label: string; onClick: () => void; kind?: "primary" | "quiet" }

/** A small card that speaks for the companion, beside it on the desktop. */
export function PetCard({ position, eyebrow, title, titleId = "pet-card-title", children, actions, later }: {
  position: string; eyebrow: string; title: string; titleId?: string; children?: ReactNode; actions: CardAction[]; later?: CardAction[];
}) {
  return (
    <section className={`reminder-prompt reminder-prompt--${position || "bl"} pet-card interactive`} data-pet-popover aria-labelledby={titleId}>
      <span className="reminder-prompt-eyebrow">{eyebrow}</span>
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="reminder-prompt-actions">
        {actions.map(action => <button key={action.label} type="button" onClick={action.onClick}
          className={`${action.kind === "primary" ? "reminder-prompt-primary" : "reminder-prompt-later"} interactive`}>{action.label}</button>)}
      </div>
      {later && <div className="pet-card-later" role="group" aria-label="Ask me later">
        <span>Later</span>
        {later.map(action => <button key={action.label} type="button" className="interactive" onClick={action.onClick}>{action.label}</button>)}
      </div>}
    </section>
  );
}
