import {
  type FC,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  searchCominContexts,
  searchCominContributions,
} from "../core/comin/api";
import type { CominDeepSearchTarget } from "../core/comin/deepSearch";
import { useGraphDataset } from "../core/context/dataContexts";

interface GraphSearchSelectionProps {
  className?: string;
  onPreviewChange?: (
    target: CominDeepSearchTarget | null,
  ) => void;
}

export const GraphSearchSelection: FC<
  GraphSearchSelectionProps
> = ({
  className,
  onPreviewChange,
}) => {
  const { nodeData } =
    useGraphDataset();

  const [query, setQuery] =
    useState("");

  const [contexts, setContexts] =
    useState<CominDeepSearchTarget[]>([]);

  const [posts, setPosts] =
    useState<CominDeepSearchTarget[]>([]);

  const [sources, setSources] =
    useState<CominDeepSearchTarget[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  /*
   * Le graphe initial connaît maintenant les posts
   * soutenant chaque contexte. On construit donc
   * l'index inverse post -> contexte.
   */
  const postToThemes =
    useMemo(() => {
      const map =
        new Map<number, string[]>();

      Object.values(nodeData).forEach(
        (data) => {
          if (
            data?.type !== "context"
          ) {
            return;
          }

          const themeId =
            data.theme_id;

          if (
            typeof themeId !==
              "string"
          ) {
            return;
          }

          const rawValue =
            (
              data as typeof data & {
                cominPostIds?: unknown;
              }
            ).cominPostIds;

          const raw =
            typeof rawValue === "string"
              ? rawValue
              : "";

          raw
            .split(",")
            .map((value) =>
              Number(value),
            )
            .filter(
              (value) =>
                Number.isInteger(value) &&
                value > 0,
            )
            .forEach((postId) => {
              const themes =
                map.get(postId) ?? [];

              if (
                !themes.includes(
                  themeId,
                )
              ) {
                themes.push(
                  themeId,
                );
              }

              map.set(
                postId,
                themes,
              );
            });
        },
      );

      return map;
    }, [nodeData]);

  useEffect(() => {
    const q =
      query.trim();

    onPreviewChange?.(null);

    if (q.length < 2) {
      setContexts([]);
      setPosts([]);
      setSources([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const timer =
      window.setTimeout(
        async () => {
          setLoading(true);
          setError(null);

          try {
            const [
              contextResponse,
              contributionResponse,
            ] =
              await Promise.all([
                searchCominContexts(q),
                searchCominContributions(q),
              ]);

            if (cancelled) return;

            const contextTargets =
              contextResponse.results
                .slice(0, 8)
                .map((item) => ({
                  type:
                    "context" as const,
                  label:
                    item.title,
                  themeId:
                    item.theme_id,
                  score:
                    item.score,
                }));

            const searchPosts =
              Array.isArray(
                contributionResponse.posts,
              )
                ? contributionResponse.posts
                : [];

            /*
             * On ne présente dans cette première version
             * que les posts qui possèdent un chemin
             * déterministe vers un contexte du graphe.
             */
            const postTargets =
              searchPosts
                .map((post) => {
                  const themeId =
                    postToThemes.get(
                      post.post_id,
                    )?.[0];

                  if (!themeId) {
                    return null;
                  }

                  const scores =
                    contributionResponse.results
                      .filter(
                        (result) =>
                          post.source_ids.includes(
                            result.source_id,
                          ),
                      )
                      .map(
                        (result) =>
                          result.score,
                      );

                  return {
                    type:
                      "post" as const,
                    label:
                      post.title,
                    themeId,
                    postId:
                      post.post_id,
                    score:
                      scores.length
                        ? Math.max(
                            ...scores,
                          )
                        : 0,
                  };
                })
                .filter(
                  (
                    item,
                  ): item is NonNullable<
                    typeof item
                  > =>
                    item !== null,
                )
                .sort(
                  (a, b) =>
                    (b.score ?? 0) -
                    (a.score ?? 0),
                )
                .slice(0, 10);

            /*
             * Une même source peut remonter plusieurs
             * contributions. On conserve son meilleur score.
             */
            const sourceMap =
              new Map<
                number,
                CominDeepSearchTarget
              >();

            contributionResponse.results.forEach(
              (result) => {
                const candidatePosts =
                  searchPosts.filter(
                    (post) =>
                      post.source_ids.includes(
                        result.source_id,
                      ),
                  );

                const presentationPost =
                  candidatePosts.find(
                    (post) =>
                      postToThemes.has(
                        post.post_id,
                      ),
                  );

                if (!presentationPost) {
                  return;
                }

                const themeId =
                  postToThemes.get(
                    presentationPost.post_id,
                  )?.[0];

                if (!themeId) {
                  return;
                }

                const previous =
                  sourceMap.get(
                    result.source_id,
                  );

                if (
                  previous &&
                  (previous.score ?? 0) >=
                    result.score
                ) {
                  return;
                }

                sourceMap.set(
                  result.source_id,
                  {
                    type: "source",
                    label:
                      result.source.title ||
                      result.source.url,
                    themeId,
                    postId:
                      presentationPost.post_id,
                    sourceId:
                      result.source_id,
                    url:
                      result.source.url,
                    excerpt:
                      result.text,
                    score:
                      result.score,
                  },
                );
              },
            );

            const sourceTargets =
              Array.from(
                sourceMap.values(),
              )
                .sort(
                  (a, b) =>
                    (b.score ?? 0) -
                    (a.score ?? 0),
                )
                .slice(0, 15);

            setContexts(
              contextTargets,
            );
            setPosts(
              postTargets,
            );
            setSources(
              sourceTargets,
            );
          } catch (err) {
            if (cancelled) {
              return;
            }

            setError(
              err instanceof Error
                ? err.message
                : "Recherche indisponible.",
            );
          } finally {
            if (!cancelled) {
              setLoading(false);
            }
          }
        },
        250,
      );

    return () => {
      cancelled = true;

      window.clearTimeout(
        timer,
      );
    };
  }, [
    onPreviewChange,
    postToThemes,
    query,
  ]);

  const reveal = (
    target: CominDeepSearchTarget,
  ) => {
    onPreviewChange?.(target);

    window.dispatchEvent(
      new CustomEvent(
        "comin-reveal-search-target",
        {
          detail: target,
        },
      ),
    );
  };

  const renderResult = (
    target: CominDeepSearchTarget,
  ) => (
    <button
      key={[
        target.type,
        target.themeId,
        target.postId,
        target.sourceId,
        target.label,
      ].join(":")}
      type="button"
      className="btn btn-light border w-100 text-start mb-1"
      onMouseEnter={() =>
        onPreviewChange?.(
          target,
        )
      }
      onMouseLeave={() =>
        onPreviewChange?.(
          null,
        )
      }
      onFocus={() =>
        onPreviewChange?.(
          target,
        )
      }
      onBlur={() =>
        onPreviewChange?.(
          null,
        )
      }
      onClick={() =>
        reveal(target)
      }
      style={{
        whiteSpace: "normal",
      }}
    >
      <div
        className="small fw-bold"
      >
        {target.type ===
        "context"
          ? "Contexte"
          : target.type ===
              "post"
            ? "Post"
            : "Source"}
      </div>

      <div>
        {target.label}
      </div>

      {target.excerpt && (
        <div
          className="small text-muted mt-1"
          style={{
            display:
              "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient:
              "vertical",
            overflow: "hidden",
          }}
        >
          {target.excerpt}
        </div>
      )}
    </button>
  );

  return (
    <div
      className={className}
      onMouseLeave={() =>
        onPreviewChange?.(
          null,
        )
      }
    >
      <input
        type="search"
        className="form-control"
        value={query}
        placeholder="Rechercher dans tout le référentiel…"
        onChange={(event) =>
          setQuery(
            event.target.value,
          )
        }
      />

      {loading && (
        <div className="small text-muted mt-2">
          Recherche…
        </div>
      )}

      {error && (
        <div className="small text-danger mt-2">
          {error}
        </div>
      )}

      {!loading &&
        query.trim().length >=
          2 && (
          <div
            className="mt-3"
            style={{
              maxHeight:
                "calc(100dvh - 10rem)",
              overflowY: "auto",
            }}
          >
            {contexts.length >
              0 && (
              <section className="mb-3">
                <div className="small fw-bold mb-1">
                  Contextes
                </div>

                {contexts.map(
                  renderResult,
                )}
              </section>
            )}

            {posts.length >
              0 && (
              <section className="mb-3">
                <div className="small fw-bold mb-1">
                  Posts
                </div>

                {posts.map(
                  renderResult,
                )}
              </section>
            )}

            {sources.length >
              0 && (
              <section>
                <div className="small fw-bold mb-1">
                  Sources
                </div>

                {sources.map(
                  renderResult,
                )}
              </section>
            )}

            {contexts.length ===
              0 &&
              posts.length ===
                0 &&
              sources.length ===
                0 &&
              !error && (
                <div className="small text-muted">
                  Aucun résultat.
                </div>
              )}
          </div>
        )}
    </div>
  );
};
