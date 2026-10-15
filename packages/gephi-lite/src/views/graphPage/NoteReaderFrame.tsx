import { type FC, type PropsWithChildren } from "react";

type Props = PropsWithChildren<{
  label: string;
  onClose: () => void;
}>;

export const NoteReaderFrame: FC<Props> = ({
  label, onClose, children,
}) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label={label}
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
    style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "flex", justifyContent: "center",
      alignItems: "center", padding: "3vh 3vw",
      background: "rgba(35, 39, 42, 0.42)",
    }}
  >
    <article
      className="gl-container-highest-bg"
      style={{
        position: "relative",
        width: "min(1000px, 94vw)",
        maxHeight: "92vh", overflowY: "auto",
        padding: "48px 56px 56px",
        borderRadius: "8px",
        boxShadow: "0 18px 60px rgba(0, 0, 0, 0.28)",
      }}
    >
      <button
        type="button"
        className="gl-btn gl-btn-icon"
        onClick={onClose}
        aria-label="Fermer"
        title="Fermer"
        style={{
          position: "absolute", top: 16,
          right: 16, fontSize: "24px",
        }}
      >
        ×
      </button>
      {children}
    </article>
  </div>
);
