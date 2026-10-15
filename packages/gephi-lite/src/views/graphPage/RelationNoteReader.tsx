import { useEffect, useState } from "react";
import { fetchCominContextChildrenGraph } from "../../core/comin/api";
import type {
  CominContextChildrenGraphResponse as ContextData,
  CominContextSemanticNode,
  CominContextChildPostNode,
} from "../../core/comin/contextChildrenGraph";
import { NoteReaderFrame } from "./NoteReaderFrame";

export interface RelationNoteItem {
  source: { themeId: string; label: string };
  target: { themeId: string; label: string };
  reciprocal: boolean;
}

const sections = (data: ContextData) =>
  data.nodes.filter(
    (n): n is CominContextSemanticNode =>
      n.type === "context_semantic",
  );

const posts = (data: ContextData) =>
  data.nodes.filter(
    (n): n is CominContextChildPostNode => n.type === "post",
  );

const units = (data: ContextData) =>
  sections(data).flatMap((section) =>
    section.units.map((unit) => ({
      ...unit,
      section: section.label,
    })),
  );

export function RelationNoteReader({
  item, onClose, onOpenContext, onOpenPost,
}: {
  item: RelationNoteItem | null;
  onClose: () => void;
  onOpenContext: (n: CominContextSemanticNode) => void;
  onOpenPost: (n: CominContextChildPostNode) => void;
}) {
  const [data, setData] =
    useState<[ContextData, ContextData] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!item) return;
    let active = true;

    Promise.all([
      fetchCominContextChildrenGraph(item.source.themeId),
      fetchCominContextChildrenGraph(item.target.themeId),
    ]).then((result) => {
      if (active) setData(result);
    }).catch(() => {
      if (active) setError("Contextes indisponibles.");
    });

    return () => { active = false; };
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [item, onClose]);

  if (!item) return null;

  const a = data ? units(data[0]) : [];
  const b = data ? units(data[1]) : [];
  const idsB = new Set(
    b.flatMap((u) => u.supporting_contribution_ids),
  );
  const common = Array.from(new Set(
    a.flatMap((u) => u.supporting_contribution_ids),
  )).filter((id) => idsB.has(id)).sort();
  const commonSet = new Set(common);

  const postsB = new Set(
    data ? posts(data[1]).map((p) => p.post_id) : [],
  );
  const sharedPosts = data
    ? posts(data[0]).filter((p) => postsB.has(p.post_id))
    : [];

  return (
    <NoteReaderFrame label="Relation entre contextes" onClose={onClose}>
      <p className="text-muted">RELATION ENTRE CONTEXTES</p>
      <h1>{item.source.label} ↔ {item.target.label}</h1>
      <p>
        {item.reciprocal
          ? "Relation déclarée par les deux contextes."
          : "Relation déclarée par un seul contexte."}
      </p>
      <p className="text-muted">
        Une relation déclarée ne constitue pas en soi
        une justification de son articulation conceptuelle.
      </p>

      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Chargement…</p>}

      {data && (
        <>
          <h2>Contributions communes ({common.length})</h2>
          {common.length
            ? <p>{common.join(" · ")}</p>
            : <p>Aucune contribution commune identifiée.</p>}

          {data.map((context, index) => {
            const matched = units(context).filter((unit) =>
              unit.supporting_contribution_ids.some(
                (id) => commonSet.has(id),
              ),
            );
            const synthesis = sections(context).find(
              (n) => n.semantic_kind === "synthese",
            );

            return (
              <section key={context.theme_id} className="mt-4">
                <h2>
                  {index === 0
                    ? item.source.label
                    : item.target.label}
                </h2>
                {matched.map((unit) => (
                  <div key={unit.unit_id} className="mb-3">
                    <small className="text-muted">
                      {unit.section}
                    </small>
                    <p>{unit.text}</p>
                  </div>
                ))}
                {!matched.length && (
                  <p>Aucune unité appuyée sur une contribution commune.</p>
                )}
                {synthesis && (
                  <button
                    className="btn btn-link p-0"
                    onClick={() => onOpenContext(synthesis)}
                  >
                    Lire la synthèse du contexte
                  </button>
                )}
              </section>
            );
          })}

          <h2 className="mt-4">
            Publications communes ({sharedPosts.length})
          </h2>
          {sharedPosts.length ? (
            <ul>
              {sharedPosts.map((post) => (
                <li key={post.post_id}>
                  <button
                    className="btn btn-link p-0"
                    onClick={() => onOpenPost(post)}
                  >
                    {post.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucune publication commune identifiée.</p>
          )}
          <p className="text-muted">
            Ces rapprochements documentaires ne suffisent pas
            à démontrer la nature de la relation conceptuelle.
          </p>
        </>
      )}
    </NoteReaderFrame>
  );
}
