import { FC, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import {
  CominPostNoteResponse,
  fetchCominPostNote,
} from "../../core/comin/api";

export interface PostNoteReaderItem {
  postId: number;
  label: string;
  url?: string;
}

interface PostNoteReaderProps {
  item: PostNoteReaderItem | null;
  onClose: () => void;
}

export const PostNoteReader: FC<PostNoteReaderProps> = ({
  item,
  onClose,
}) => {
  const [note, setNote] =
    useState<CominPostNoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item === null) {
      setNote(null);
      setError(null);
      return;
    }

    let cancelled = false;

    setNote(null);
    setError(null);

    fetchCominPostNote(item.postId)
      .then((result) => {
        if (!cancelled) setNote(result);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Fiche de lecture indisponible.",
          );
        }
      });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelled = true;
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
          width: "min(1000px, 94vw)",
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

        <h1>{note?.title || item.label}</h1>

        {item.url && (
          <p>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Voir le post sur Com’In
            </a>
          </p>
        )}

        {!note && !error && <p>Chargement…</p>}

        {error && <p>{error}</p>}

        {note && (
          <div className="mt-4">
            <ReactMarkdown
              components={{
                a: ({ children, ...props }) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {note.markdown}
            </ReactMarkdown>
          </div>
        )}
      </article>
    </div>
  );
};
