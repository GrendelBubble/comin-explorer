import { NoteReaderFrame } from "./NoteReaderFrame";
import { FC, useEffect, useState } from "react";

import { fetchCominContextChildrenGraph } from "../../core/comin/api";
import { CominContextSemanticNode, CominContextChildPostNode } from "../../core/comin/contextChildrenGraph";

interface ContextSemanticReaderProps {
  item: CominContextSemanticNode | null;
  onClose: () => void;
  onOpenPost: (post: CominContextChildPostNode) => void;
}

export const ContextSemanticReader: FC<
  ContextSemanticReaderProps
> = ({ item, onClose, onOpenPost }) => {
  const [current, setCurrent] = useState<CominContextSemanticNode | null>(null);
  const [sections, setSections] = useState<CominContextSemanticNode[]>([]);
  const [contextTitle, setContextTitle] = useState<string | null>(null);

  const [posts, setPosts] = useState<CominContextChildPostNode[]>([]);
  const [postsReady, setPostsReady] = useState(false);
  const [postsError, setPostsError] = useState(false);

  useEffect(() => {
    setCurrent(item);
    setSections([]);
    setContextTitle(null);
    setPosts([]);
    setPostsReady(false);
    setPostsError(false);
    if (!item) return;
    let active = true;
    fetchCominContextChildrenGraph(item.theme_id)
      .then((data) => {
        if (!active) return;

        const context = data.nodes.find(
          (node) =>
            node.type === "context" &&
            node.theme_id === item.theme_id,
        );

        setContextTitle(context?.label ?? null);

        setSections(data.nodes.filter(
          (node): node is CominContextSemanticNode =>
            node.type === "context_semantic",
        ));
        setPosts(data.nodes.filter(
          (node): node is CominContextChildPostNode =>
            node.type === "post",
        ).sort((a, b) =>
          b.supporting_contribution_count - a.supporting_contribution_count ||
          a.label.localeCompare(b.label, "fr")
        ));
        setPostsReady(true);
      })
      .catch(() => {
        if (active) {
          setPostsError(true);
          setPostsReady(true);
        }
      });
    return () => { active = false; };
  }, [item]);

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

  const rawUnits: unknown = current?.units ?? item.units;
  let units: CominContextSemanticNode["units"] = [];

  if (Array.isArray(rawUnits)) {
    units = rawUnits as CominContextSemanticNode["units"];
  } else if (typeof rawUnits === "string") {
    try {
      const parsed = JSON.parse(rawUnits);

      if (Array.isArray(parsed)) {
        units =
          parsed as CominContextSemanticNode["units"];
      }
    } catch {
      units = [];
    }
  }

  return (
    <NoteReaderFrame
      label={contextTitle
        ? `${contextTitle} — ${current?.label ?? item.label}`
        : current?.label ?? item.label}
      onClose={onClose}
    >
        {contextTitle && (
          <>
            <p className="small text-muted mb-2">CONTEXTE</p>
            <h1 className="mb-3">{contextTitle}</h1>
          </>
        )}
        <h2>{current?.label ?? item.label}</h2>
        <nav aria-label="Autres notes du contexte" className="d-flex flex-wrap gap-3 mt-3">
          {sections
            .filter((section) => section.semantic_kind !== (current?.semantic_kind ?? item.semantic_kind))
            .map((section) => (
              <button
                key={section.semantic_kind}
                type="button"
                className="btn btn-link p-0"
                onClick={() => {
                  setCurrent(section);
                  document.querySelector("[aria-modal=true] article")?.scrollTo({ top: 0 });
                }}
              >
                {section.label}
              </button>
            ))}
        </nav>

        <div className="d-flex flex-column gl-gap-4 mt-4">
          {units.map((unit) => (
            <p key={unit.unit_id} className="m-0">
              {unit.text}
            </p>
          ))}
        </div>

        {(current?.semantic_kind ?? item.semantic_kind) === "synthese" && (
          <section className="mt-5">
            <h2>Publications contribuant à ce contexte</h2>

            {!postsReady && <p>Chargement des publications…</p>}
            {postsError && <p>Liste des publications indisponible.</p>}

            {postsReady && !postsError && (
              <>
                <p>{posts.length} publication(s)</p>
                {posts.length > 0 && (
                  <details open>
                    <summary>Afficher ou masquer la liste</summary>
                    <ul className="mt-3">
                      {posts.map((post) => (
                        <li key={post.post_id} className="mb-3">
                          <button
                            type="button"
                            className="btn btn-link p-0 text-start"
                            onClick={() => onOpenPost(post)}
                          >
                            {post.label}
                          </button>
                          <div className="small text-muted">
                            {post.supporting_contribution_count}
                            {" contribution(s) au contexte"}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>
        )}
    </NoteReaderFrame>
  );
};
