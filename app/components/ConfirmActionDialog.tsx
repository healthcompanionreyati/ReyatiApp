"use client";

type ConfirmActionDialogProps = {
  open: boolean;
  title: string;
  description: string;
  consequence: string;
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmActionDialog({
  open, title, description, consequence, confirmLabel, busyLabel, busy = false, onCancel, onConfirm,
}: ConfirmActionDialogProps) {
  if (!open) return null;
  return <div className="confirm-action-layer" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
    <section className="confirm-action-dialog">
      <button className="drawer-close" disabled={busy} onClick={onCancel} aria-label="Close confirmation">×</button>
      <span className="confirm-action-mark" aria-hidden="true">!</span>
      <p>CONFIRM SENSITIVE ACTION</p>
      <h2>{title}</h2>
      <div className="confirm-action-copy"><p>{description}</p><strong>{consequence}</strong></div>
      <div className="confirm-action-buttons">
        <button type="button" disabled={busy} onClick={onCancel}>Go back</button>
        <button type="button" className="danger-action" disabled={busy} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</button>
      </div>
    </section>
  </div>;
}
