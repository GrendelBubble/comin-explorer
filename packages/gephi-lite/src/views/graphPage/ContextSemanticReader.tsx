import { FC, useEffect } from "react";

import { CominContextSemanticNode } from "../../core/comin/contextChildrenGraph";

interface ContextSemanticReaderProps {
  item: CominContextSemanticNode | null;
  onClose: () => void;
}

export const ContextSemanticReader: FC<
  ContextSemanticReaderProps
> = ({ item, onClose }) => {
  useEffect(() => {
    if (item === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [item, onClose]);

  if (item === null) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.label}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "3vh 3vw",
        background: "rgba(35, 39, 42, 0.42)",
      }}
    >
      <article
        className="gl-container-highest-bg"
        style={{
          position: "relative",
          width: "min(900px, 94vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: "48px 56px 56px",
          borderRadius: "8px",
          boxShadow:
            "0 18px 60px rgba(0, 0, 0, 0.28)",
        }}
      >
        <button
          type="button"
          className="gl-btn gl-btn-icon"
          onClick={onClose}
          aria-label="Fermer"
          title="Fermer"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            fontSize: "24px",
          }}
        >
          ×
        </button>

        <h1>{item.label}</h1>

        <div className="d-flex flex-column gl-gap-4 mt-4">
          {item.units.map((unit) => (
            <p key={unit.unit_id} className="m-0">
              {unit.text}
            </p>
          ))}
        </div>
      </article>
    </div>
  );
};
