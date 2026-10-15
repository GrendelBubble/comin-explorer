import { FC, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [sourceNote, setSourceNote] = useState<{ title: string; markdown: string; url: string } | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  useEffect(() => {
    if (item === null) {
      setNote(null);
      setError(null);
      return;
    }

    let cancelled = false;

    setNote(null);
    setSourceId(null);
    setSourceNote(null);
    setSourceError(null);
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

  useEffect(() => {
    if (!item || sourceId === null) return;
    let active = true;
    setSourceNote(null);
    setSourceError(null);
    fetch(`/comin-api/graph/posts/${item.postId}/sources/${sourceId}/note`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { if (active) setSourceNote(data); })
      .catch(e => { if (active) setSourceError(String(e)); });
    return () => { active = false; };
  }, [item, sourceId]);

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

        <h1>{sourceNote?.title || note?.title || item.label}</h1>

        {sourceId === null && item.url && (
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

        {sourceId !== null && (
          <div className="mt-4">
            <button type="button" onClick={() => { setSourceId(null); setSourceNote(null); setSourceError(null); }}>
              ← Retour à la note du post
            </button>
            {!sourceNote && !sourceError && <p>Chargement…</p>}
            {sourceError && <p>{sourceError}</p>}
            {sourceNote && (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sourceNote.markdown}
              </ReactMarkdown>
            )}
          </div>
        )}

        {sourceId === null && note && (
          <div className="mt-4">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, href, ...props }) => (
                  <a
                    href={href}
                    onClick={(event) => {
                      const match = /^#comin-source-note-([0-9]+)$/.exec(href || "");
                      if (match) {
                        event.preventDefault();
                        setSourceId(Number(match[1]));
                      }
                    }}
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
