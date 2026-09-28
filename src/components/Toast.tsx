import { useEffect } from "react";
import { LuTrophy } from "react-icons/lu";
import "./Toast.css";

export interface ToastData {
  id: number;
  title: string;
  body: string;
}

interface ToastsProps {
  toasts: ToastData[];
  onDone: (id: number) => void;
}

function ToastCard({
  toast,
  onDone,
}: {
  toast: ToastData;
  onDone: (id: number) => void;
}) {
  useEffect(() => {
    const id = setTimeout(() => onDone(toast.id), 4500);
    return () => clearTimeout(id);
  }, [toast.id, onDone]);

  return (
    <div className="toast-card" role="status">
      <span className="toast-badge" aria-hidden>
        <LuTrophy size={16} />
      </span>
      <span className="toast-text">
        <strong className="toast-title">{toast.title}</strong>
        <span className="toast-body">{toast.body}</span>
      </span>
    </div>
  );
}

export function Toasts({ toasts, onDone }: ToastsProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDone={onDone} />
      ))}
    </div>
  );
}
