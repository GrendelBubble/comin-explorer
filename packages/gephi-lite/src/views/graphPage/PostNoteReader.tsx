import { NoteReaderFrame } from "./NoteReaderFrame";
import { FC, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  CominPostNoteResponse,
  fetchCominPostNote,
  fetchCominPostSourcesGraph,
} from "../../core/comin/api";

import type { CominPostSourceNode } from "../../core/comin/postSourcesGraph";

export interface PostNoteReaderItem {
  postId: number;
  label: string;
  url?: string;
  sourceId?: number;
  isContainer?: boolean;
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
  const [containerChildren, setContainerChildren] = useState<CominPostSourceNode[]>([]);
  const [containerError, setContainerError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  useEffect(() => {
    if (item === null) {
      setNote(null);
      setError(null);
      return;
    }

    let cancelled = false;

    setNote(null);
    setSourceId(item.isContainer ? null : item.sourceId ?? null);
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

  useEffect(() => {
    if (!item?.isContainer || !item.sourceId) return;
    let active = true;
    setContainerChildren([]);
    setContainerError(null);
    fetchCominPostSourcesGraph(item.postId)
      .then((graph) => {
        if (!active) return;
        const found = new Map<string, CominPostSourceNode>();
        const seen = new Set<string>();
        const queue = [`source:${item.sourceId}`];
        while (queue.length) {
          const parent = queue.shift()!;
          if (seen.has(parent)) continue;
          seen.add(parent);
          graph.edges
            .filter((edge) => edge.type === "contains_source" && edge.source === parent)
            .forEach((edge) => {
              const child = graph.nodes.find((node) => node.id === edge.target);
              if (!child) return;
              found.set(child.id, child);
              if (child.type === "container") queue.push(child.id);
            });
        }
        setContainerChildren(Array.from(found.values()));
      })
      .catch(() => { if (active) setContainerError("Sources indisponibles."); });
    return () => { active = false; };
  }, [item]);

  if (item === null) return null;

  return (
    <NoteReaderFrame label={item.label} onClose={onClose}>
        <h1>{sourceId !== null ? sourceNote?.title || item.label : item.isContainer ? item.label : note?.title || item.label}</h1>

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

        {!note && !error && sourceId === null && !item.isContainer && <p>Chargement…</p>}

        {error && sourceId === null && !item.isContainer && <p>{error}</p>}

        {sourceId !== null && (
          <div className="mt-4">
            <button type="button" onClick={() => { setSourceId(null); setSourceNote(null); setSourceError(null); }}>
              ← Retour à {item.isContainer ? "la liste des sources" : "la note du post"}
            </button>
            {!sourceNote && !sourceError && <p>Chargement…</p>}
            {sourceError && <p>{sourceError}</p>}
            {sourceNote && (
              <>
                {sourceNote.url && <p><a href={sourceNote.url} target="_blank" rel="noopener noreferrer">Voir la source originale</a></p>}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sourceNote.markdown}
              </ReactMarkdown></>
            )}
          </div>
        )}

        {item.isContainer && sourceId === null && (
          <section className="mt-4">
            <h2>Sources contenues</h2>
            {containerError && <p>{containerError}</p>}
            {!containerError && !containerChildren.length && <p>Aucune source disponible.</p>}
            <ul>
              {containerChildren.map((source) => (
                <li key={source.id} className="mb-3">
                  <strong>{source.label}</strong>
                  {source.url && <> — <a href={source.url} target="_blank" rel="noopener noreferrer">Source originale</a></>}
                  {source.has_note && source.type === "source" && (
                    <> — <button type="button" className="btn btn-link p-0" onClick={() => setSourceId(source.source_id)}>Lire la note</button></>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {sourceId === null && !item.isContainer && note && (
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
    </NoteReaderFrame>
  );
};
