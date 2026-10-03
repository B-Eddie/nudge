import { useLayoutEffect, useRef } from "react";

/** Keep keyboard interaction inside the active panel, then restore its trigger. */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  onClose?: () => void,
  initialFocusSelector?: string,
) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const initial = initialFocusSelector
      ? dialog.querySelector<HTMLElement>(initialFocusSelector) : dialog;
    (initial ?? dialog).focus({ preventScroll: true });

    const controls = () => [...dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]',
    )].filter(element => element.tabIndex >= 0 && !element.closest('[hidden], [aria-hidden="true"]')
      && element.getClientRects().length > 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && closeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const items = controls();
        const first = items[0];
        const last = items[items.length - 1];
        const activeIsControl = items.includes(document.activeElement as HTMLElement);
        if (!first) {
          event.preventDefault();
          dialog.focus({ preventScroll: true });
        } else if (event.shiftKey && (document.activeElement === first || !activeIsControl)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !activeIsControl)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener("keydown", onKeyDown, true);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [initialFocusSelector]);

  return dialogRef;
}
