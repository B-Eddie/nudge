import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { useDialogFocus } from "../hooks/useDialogFocus";
import "./SettingsPanel.css";
import "./PanelShell.css";

/** The frame every companion panel shares: heading, close button, scrolling body, footer. */
export function PanelShell({ title, eyebrow, closeLabel, onClose, children, footer, focus = ".settings-close" }: {
  title: string; eyebrow?: string; closeLabel: string; onClose: () => void; children: ReactNode; footer?: ReactNode; focus?: string;
}) {
  const ref = useDialogFocus(onClose, focus);
  return (
    <div className="settings-backdrop interactive" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabIndex={-1}>
        <header className="settings-header">
          <div>
            {eyebrow && <p className="panel-eyebrow">{eyebrow}</p>}
            <h2 id="panel-title">{title}</h2>
          </div>
          <button type="button" className="settings-close" onClick={onClose} aria-label={closeLabel}><LuX size={15} /></button>
        </header>
        <div className="settings-body">{children}</div>
        {footer && <footer className="settings-footer">{footer}</footer>}
      </div>
    </div>
  );
}

/** Roving-focus tabs, shared by the garden and Settings. */
export function PanelTabs<T extends string>({ tabs, value, onChange, label, idPrefix }: {
  tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string; idPrefix: string;
}) {
  return (
    <div className="panel-tabs" role="tablist" aria-label={label} onKeyDown={e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const current = tabs.findIndex(tab => tab.id === value);
      const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1
        : (current + (e.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
      onChange(tabs[next].id);
      e.currentTarget.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${tabs[next].id}`)?.focus();
    }}>
      {tabs.map(tab => (
        <button key={tab.id} type="button" role="tab" id={`${idPrefix}-tab-${tab.id}`} aria-controls={`${idPrefix}-panel-${tab.id}`}
          aria-selected={value === tab.id} tabIndex={value === tab.id ? 0 : -1} onClick={() => onChange(tab.id)}>{tab.label}</button>
      ))}
    </div>
  );
}
