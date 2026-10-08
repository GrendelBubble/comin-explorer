import { useRegisterEvents, useSigma } from "@react-sigma/core";
import { fitViewportToNodes } from "@sigma/utils";
import { mapValues, pick } from "lodash";
import { FC, useEffect, useRef } from "react";
import { Coordinates, MouseCoords } from "sigma/types";

import {
  useGraphDataset,
  useGraphDatasetActions,
  useSelection,
  useSelectionActions,
  useSigmaActions,
} from "../../../core/context/dataContexts";
import { EVENTS, useEventsContext } from "../../../core/context/eventsContext";
import { GephiLiteSigma } from "../../../core/graph/types";
import { LayoutMapping } from "../../../core/layouts/types";
import {
  fetchCominContextChildrenGraph,
  fetchCominPostSourcesGraph,
} from "../../../core/comin/api";
import {
  CominContextChildPostNode,
  CominContextSemanticNode,
} from "../../../core/comin/contextChildrenGraph";
import {
  CominPostSourceNode,
  CominPostSourcesGraphResponse,
} from "../../../core/comin/postSourcesGraph";
import type { CominDeepSearchTarget } from "../../../core/comin/deepSearch";
import { bindUpHandler } from "../../../utils/events";

const DRAG_EVENTS_TOLERANCE = 3;

// Les sources restent accolées au post.
// Elles prolongent localement l'axe contexte -> post.
const POST_SOURCE_DISTANCE = 24;

// Un container ouvert déploie ses enfants dans une petite grille,
// pas dans un nouvel éventail radial.
const CONTAINER_CHILD_COLUMNS = 6;
const CONTAINER_CHILD_FORWARD_DISTANCE = 24;
const CONTAINER_CHILD_ROW_GAP = 18;
const CONTAINER_CHILD_LATERAL_GAP = 18;

interface EventsControllerProps {
  onOpenContextSemantic: (
    item: CominContextSemanticNode,
  ) => void;
  onOpenPostNote: (
    item: CominContextChildPostNode,
  ) => void;
  onCloseTransientPanels: () => void;
  onNodeActivatorReady: (
    activator:
      | ((nodeId: string) => void)
      | null,
  ) => void;
  onExpandedThemeChange: (
    themeId: string | null,
  ) => void;
}

export const EventsController: FC<EventsControllerProps> = ({
  onOpenContextSemantic,
  onOpenPostNote,
  onCloseTransientPanels,
  onNodeActivatorReady,
  onExpandedThemeChange,
}) => {
  const sigma: GephiLiteSigma = useSigma();
  const registerEvents = useRegisterEvents();
  const { emitter: globalEmitter } = useEventsContext();

  const selection = useSelection();
  const graphDataset = useGraphDataset();
  const { createNode, createEdge, deleteItems, setNodePositions } = useGraphDatasetActions();
  const { select, toggle, emptySelection } = useSelectionActions();
  const { setHoveredNode, resetHoveredNode, setHoveredEdge, resetHoveredEdge } = useSigmaActions();

  const dragStateRef = useRef<
    | { type: "idle" }
    | {
        type: "dragging" | "downing";
        initialMousePosition: Coordinates;
        initialNodesPosition: Record<string, Coordinates>;
      }
  >({ type: "idle" });
  const dragEventsCountRef = useRef(0);
  const expandedThemesRef = useRef(new Set<string>());
  const expandedPostsRef = useRef(new Set<number>());
  const expandedContainersRef = useRef(new Set<string>());
  const postSourcesCacheRef = useRef(
    new Map<number, CominPostSourcesGraphResponse>(),
  );

  /**
   * Handle interaction events:
   */
  useEffect(() => {
    const collapseSourceChildren = (
      parentNodeId: string,
    ) => {
      const graph = graphDataset.fullGraph;

      if (!graph.hasNode(parentNodeId)) return;

      const childEdges = graph
        .edges(parentNodeId)
        .filter(
          (edgeId) =>
            graphDataset.edgeData[edgeId]?.type ===
              "contains_source" &&
            graph.source(edgeId) === parentNodeId,
        );

      childEdges.forEach((edgeId) => {
        const childId = graph.target(edgeId);

        collapseSourceChildren(childId);

        expandedContainersRef.current.delete(childId);

        if (graph.hasEdge(edgeId)) {
          deleteItems("edges", [edgeId]);
        }

        if (graph.hasNode(childId)) {
          deleteItems("nodes", [childId]);
        }
      });

      expandedContainersRef.current.delete(parentNodeId);
    };

    const collapsePostSources = (
      postNodeId: string,
      postId: number,
    ) => {
      const graph = graphDataset.fullGraph;

      if (!graph.hasNode(postNodeId)) return;

      const rootEdges = graph
        .edges(postNodeId)
        .filter(
          (edgeId) =>
            graphDataset.edgeData[edgeId]?.type ===
              "has_source" &&
            graph.source(edgeId) === postNodeId,
        );

      rootEdges.forEach((edgeId) => {
        const rootId = graph.target(edgeId);

        collapseSourceChildren(rootId);

        expandedContainersRef.current.delete(rootId);

        if (graph.hasEdge(edgeId)) {
          deleteItems("edges", [edgeId]);
        }

        if (graph.hasNode(rootId)) {
          deleteItems("nodes", [rootId]);
        }
      });

      expandedPostsRef.current.delete(postId);

      if (sigma.getGraph().hasNode(postNodeId)) {
        sigma.getGraph().setNodeAttribute(
          postNodeId,
          "cominSourcesExpanded",
          false,
        );
      }
    };

    const placeChildren = (
      parentNodeId: string,
      children: CominPostSourceNode[],
      postId: number,
    ) => {
      if (!children.length) return;

      const graph = sigma.getGraph();
      const parent =
        graph.getNodeAttributes(parentNodeId);

      const postEntry = Object.entries(
        graphDataset.nodeData,
      ).find(
        ([, data]) =>
          data?.type === "post" &&
          data.post_id === postId,
      );

      const postPosition =
        postEntry && graph.hasNode(postEntry[0])
          ? graph.getNodeAttributes(postEntry[0])
          : { x: parent.x - 1, y: parent.y };

      // Axe post -> container : direction vers l'extérieur.
      const direction = Math.atan2(
        parent.y - postPosition.y,
        parent.x - postPosition.x,
      );

      const forwardX = Math.cos(direction);
      const forwardY = Math.sin(direction);

      // Axe perpendiculaire pour constituer les rangées.
      const lateralX = -forwardY;
      const lateralY = forwardX;

      children.forEach((child, index) => {
        const row = Math.floor(
          index / CONTAINER_CHILD_COLUMNS,
        );

        const column =
          index % CONTAINER_CHILD_COLUMNS;

        const rowStart =
          row * CONTAINER_CHILD_COLUMNS;

        const countInRow = Math.min(
          CONTAINER_CHILD_COLUMNS,
          children.length - rowStart,
        );

        // Centrer chaque rangée autour de l'axe du container.
        const centeredColumn =
          column - (countInRow - 1) / 2;

        const forwardDistance =
          CONTAINER_CHILD_FORWARD_DISTANCE +
          row * CONTAINER_CHILD_ROW_GAP;

        const lateralDistance =
          centeredColumn *
          CONTAINER_CHILD_LATERAL_GAP;

        if (
          !graphDataset.fullGraph.hasNode(
            child.id,
          )
        ) {
          createNode(child.id, {
            ...child,
            cominPostId: postId,
            x:
              parent.x +
              forwardX * forwardDistance +
              lateralX * lateralDistance,
            y:
              parent.y +
              forwardY * forwardDistance +
              lateralY * lateralDistance,
          });
        }
      });
    };

    const expandPostSources = async (
      postNodeId: string,
      postId: number,
    ) => {
      const graph = sigma.getGraph();

      let sourceGraph =
        postSourcesCacheRef.current.get(postId);

      if (!sourceGraph) {
        sourceGraph =
          await fetchCominPostSourcesGraph(postId);

        postSourcesCacheRef.current.set(
          postId,
          sourceGraph,
        );
      }

      // Lors d'une réouverture, les sources viennent du cache
      // beaucoup plus vite que Sigma ne resynchronise les posts.
      // Attendre explicitement que le post existe dans le graphe rendu.
      for (let frame = 0; frame < 30; frame++) {
        if (graph.hasNode(postNodeId)) break;

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      }

      if (!graph.hasNode(postNodeId)) {
        return;
      }

      // Toutes les racines PRIMARY du post, pas uniquement la première.
      const rootEdges = sourceGraph.edges.filter(
        (edge) =>
          edge.type === "has_source" &&
          edge.source === postNodeId,
      );

      const roots = rootEdges
        .map((edge) => ({
          edge,
          node: sourceGraph!.nodes.find(
            (item) => item.id === edge.target,
          ),
        }))
        .filter(
          (
            item,
          ): item is {
            edge: (typeof rootEdges)[number];
            node: CominPostSourceNode;
          } => item.node !== undefined,
        );

      if (!roots.length) {
        expandedPostsRef.current.delete(postId);

        graph.setNodeAttribute(
          postNodeId,
          "cominSourcesExpanded",
          false,
        );

        return;
      }

      // Retrouver l'axe contexte -> post.
      const supportingEdgeId = graph
        .edges(postNodeId)
        .find(
          (edgeId) =>
            graphDataset.edgeData[edgeId]?.type ===
              "supported_by_post" &&
            graph.target(edgeId) === postNodeId,
        );

      const postPosition =
        graph.getNodeAttributes(postNodeId);

      let radialAngle = 0;

      if (supportingEdgeId) {
        const contextNodeId =
          graph.source(supportingEdgeId);

        if (graph.hasNode(contextNodeId)) {
          const contextPosition =
            graph.getNodeAttributes(contextNodeId);

          radialAngle = Math.atan2(
            postPosition.y - contextPosition.y,
            postPosition.x - contextPosition.x,
          );
        }
      }

      // La source reste dans le prolongement immédiat du post.
      const branchAngle = radialAngle;

      const perRing = 8;

      roots.forEach(({ edge, node: root }, index) => {
        const ring = Math.floor(index / perRing);
        const indexInRing = index % perRing;

        const countInRing = Math.min(
          perRing,
          roots.length - ring * perRing,
        );

        const span =
          countInRing <= 1
            ? 0
            : Math.min(
                Math.PI / 12,
                (countInRing - 1) * 0.08,
              );

        const angle =
          countInRing <= 1
            ? branchAngle
            : branchAngle -
              span / 2 +
              (span * indexInRing) /
                (countInRing - 1);

        const radius =
          POST_SOURCE_DISTANCE +
          ring * 10;

        if (!graph.hasNode(root.id)) {
          createNode(root.id, {
            ...root,
            cominPostId: postId,
            x:
              postPosition.x +
              Math.cos(angle) * radius,
            y:
              postPosition.y +
              Math.sin(angle) * radius,
          });
        }

        if (!graph.hasEdge(edge.id)) {
          createEdge(
            edge.id,
            {
              type: edge.type,
              relation_type:
                edge.relation_type,
              source_path:
                edge.source_path,
            },
            edge.source,
            edge.target,
            false,
          );
        }
      });

      expandedPostsRef.current.add(postId);

      graph.setNodeAttribute(
        postNodeId,
        "cominSourcesExpanded",
        true,
      );
    };

    const toggleContainer = async (
      containerNodeId: string,
      postId: number,
    ) => {
      // Clic sur le container déjà ouvert : on le referme.
      if (
        expandedContainersRef.current.has(
          containerNodeId,
        )
      ) {
        collapseSourceChildren(containerNodeId);
        return;
      }

      // Un seul container développé à la fois.
      // Fermer tous les autres avant d'ouvrir celui-ci.
      Array.from(
        expandedContainersRef.current,
      ).forEach((expandedContainerId) => {
        if (
          expandedContainerId ===
          containerNodeId
        ) {
          return;
        }

        collapseSourceChildren(
          expandedContainerId,
        );
      });

      expandedContainersRef.current.clear();

      let sourceGraph =
        postSourcesCacheRef.current.get(postId);

      if (!sourceGraph) {
        sourceGraph =
          await fetchCominPostSourcesGraph(postId);
        postSourcesCacheRef.current.set(
          postId,
          sourceGraph,
        );
      }

      const childEdges = sourceGraph.edges.filter(
        (edge) =>
          edge.type === "contains_source" &&
          edge.source === containerNodeId,
      );

      const children = childEdges
        .map((edge) =>
          sourceGraph.nodes.find(
            (node) => node.id === edge.target,
          ),
        )
        .filter(
          (
            node,
          ): node is CominPostSourceNode =>
            node !== undefined,
        );

      placeChildren(
        containerNodeId,
        children,
        postId,
      );

      childEdges.forEach((edge) => {
        if (!graphDataset.fullGraph.hasEdge(edge.id)) {
          createEdge(
            edge.id,
            {
              type: edge.type,
              position: edge.position,
            },
            edge.source,
            edge.target,
            false,
          );
        }
      });

      expandedContainersRef.current.add(
        containerNodeId,
      );
    };

    const collapseContext = (
      contextNodeId: string,
      themeId: string,
    ) => {
      const incidentEdgeIds =
        graphDataset.fullGraph.edges(contextNodeId);

      const supportingEdgeIds =
        incidentEdgeIds.filter(
          (edgeId) =>
            graphDataset.edgeData[edgeId]?.type ===
            "supported_by_post",
        );

      const semanticEdgeIds =
        incidentEdgeIds.filter(
          (edgeId) =>
            graphDataset.edgeData[edgeId]?.type ===
            "has_context_child",
        );

      const postIds = supportingEdgeIds.map(
        (edgeId) =>
          graphDataset.fullGraph.opposite(
            contextNodeId,
            edgeId,
          ),
      );

      const semanticNodeIds =
        semanticEdgeIds.map(
          (edgeId) =>
            graphDataset.fullGraph.opposite(
              contextNodeId,
              edgeId,
            ),
        );

      postIds.forEach((postNodeId) => {
        const postId =
          graphDataset.nodeData[postNodeId]
            ?.post_id;

        if (
          typeof postId === "number" &&
          expandedPostsRef.current.has(postId)
        ) {
          collapsePostSources(
            postNodeId,
            postId,
          );
        }
      });

      const removablePostIds = postIds.filter(
        (postId) => {
          const otherSupportingEdges =
            graphDataset.fullGraph
              .edges(postId)
              .filter(
                (edgeId) =>
                  !supportingEdgeIds.includes(
                    edgeId,
                  ) &&
                  graphDataset.edgeData[edgeId]
                    ?.type ===
                    "supported_by_post",
              );

          return (
            otherSupportingEdges.length === 0
          );
        },
      );

      const edgeIds = [
        ...supportingEdgeIds,
        ...semanticEdgeIds,
      ];

      if (edgeIds.length) {
        deleteItems("edges", edgeIds);
      }

      const nodeIds = [
        ...removablePostIds,
        ...semanticNodeIds,
      ];

      if (nodeIds.length) {
        deleteItems("nodes", nodeIds);
      }

      expandedThemesRef.current.delete(themeId);
      onExpandedThemeChange(null);

      if (
        sigma
          .getGraph()
          .hasNode(contextNodeId)
      ) {
        sigma.getGraph().setNodeAttribute(
          contextNodeId,
          "cominExpanded",
          false,
        );
      }
    };

    const suppressTouchTap = () => {
      const until = Number(
        sigma.getContainer().dataset
          .cominSuppressTapUntil ?? 0,
      );

      return until > Date.now();
    };

    const closeMagnifier = () => {
      sigma
        .getContainer()
        .dispatchEvent(
          new CustomEvent(
            "comin-close-magnifier",
          ),
        );
    };

    const activateNode = async (
      node: string,
      ctrlKey = false,
    ) => {
        if (suppressTouchTap()) return;
        if (dragEventsCountRef.current >= DRAG_EVENTS_TOLERANCE) return;

        const nodeData = graphDataset.nodeData[node];

        if (nodeData?.type === "context_semantic") {
          closeMagnifier();

          onOpenContextSemantic(
            nodeData as unknown as CominContextSemanticNode,
          );
          return;
        }

        if (
          nodeData?.type === "source" &&
          typeof nodeData.url === "string" &&
          nodeData.url
        ) {
          closeMagnifier();

          window.open(
            nodeData.url,
            "_blank",
            "noopener,noreferrer",
          );
          return;
        }

        if (
          nodeData?.type === "container"
        ) {
          const postId = Number(
            (
              nodeData as unknown as {
                cominPostId?: number;
              }
            ).cominPostId,
          );

          if (postId > 0) {
            await toggleContainer(
              node,
              postId,
            );
          }

          return;
        }

        if (ctrlKey) {
          toggle({
            type: "nodes",
            item: node,
          });
        } else if (
          selection.type === "nodes" &&
          selection.items.has(node) &&
          selection.items.size === 1
        ) {
          emptySelection();
        } else {
          select({ type: "nodes", items: new Set([node]), replace: true });
        }

        if (ctrlKey) return;

        if (
          nodeData?.type === "post" &&
          typeof nodeData.post_id === "number"
        ) {
          const clickedPostId = nodeData.post_id;

          Array.from(
            expandedContainersRef.current,
          ).forEach((containerId) => {
            const containerPostId = Number(
              (
                graphDataset.nodeData[
                  containerId
                ] as
                  | {
                      cominPostId?: number;
                    }
                  | undefined
              )?.cominPostId,
            );

            if (
              containerPostId !== clickedPostId
            ) {
              collapseSourceChildren(
                containerId,
              );

              expandedContainersRef.current.delete(
                containerId,
              );
            }
          });

          closeMagnifier();

          onOpenPostNote(
            nodeData as unknown as CominContextChildPostNode,
          );

          return;
        }

        if (nodeData?.type !== "context") return;

        const themeId = nodeData.theme_id;
        if (typeof themeId !== "string") return;
        if (
          expandedThemesRef.current.has(themeId)
        ) {
          collapseContext(node, themeId);
          return;
        }

        // Un seul contexte peut être développé.
        // Fermer tout contexte précédemment ouvert
        // avant d'ouvrir le nouveau.
        Array.from(
          expandedThemesRef.current,
        ).forEach((expandedThemeId) => {
          const previousContextEntry =
            Object.entries(
              graphDataset.nodeData,
            ).find(
              ([, data]) =>
                data?.type === "context" &&
                data.theme_id ===
                  expandedThemeId,
            );

          if (!previousContextEntry) return;

          collapseContext(
            previousContextEntry[0],
            expandedThemeId,
          );
        });

        expandedThemesRef.current.add(themeId);
        onExpandedThemeChange(themeId);

        sigma.getGraph().setNodeAttribute(
          node,
          "cominExpanded",
          true,
        );

        try {
          const postGraph =
            await fetchCominContextChildrenGraph(themeId);

          const center =
            sigma.getGraph().getNodeAttributes(node);

          const posts = postGraph.nodes.filter(
            (item) => item.type === "post",
          );

          const contextPositions = Object.entries(
            graphDataset.nodeData,
          )
            .filter(
              ([, data]) => data?.type === "context",
            )
            .map(([contextId]) =>
              sigma
                .getGraph()
                .getNodeAttributes(contextId),
            )
            .filter(
              ({ x, y }) =>
                Number.isFinite(x) &&
                Number.isFinite(y),
            );

          const contextsCenter =
            contextPositions.length > 0
              ? {
                  x:
                    contextPositions.reduce(
                      (sum, position) =>
                        sum + position.x,
                      0,
                    ) /
                    contextPositions.length,
                  y:
                    contextPositions.reduce(
                      (sum, position) =>
                        sum + position.y,
                      0,
                    ) /
                    contextPositions.length,
                }
              : { x: 0, y: 0 };

          const outwardAngle = Math.atan2(
            center.y - contextsCenter.y,
            center.x - contextsCenter.x,
          );

          // Les nœuds sémantiques se développent vers
          // le centre du cercle des contextes, tandis
          // que les posts restent à l'extérieur.
          const inwardAngle = outwardAngle + Math.PI;

          const semanticChildren = postGraph.nodes
            .filter(
              (item) => item.type === "context_semantic",
            )
            .sort((a, b) => {
              const order = {
                synthese: 0,
                tensions_limites: 1,
                questions_ouvertes: 2,
              } as const;

              return (
                order[a.semantic_kind] -
                order[b.semantic_kind]
              );
            });

          const semanticRadii = [70, 115, 160];

          semanticChildren.forEach(
            (semanticChild, index) => {
              if (
                !graphDataset.fullGraph.hasNode(
                  semanticChild.id,
                )
              ) {
                const radius =
                  semanticRadii[index] ??
                  70 + index * 45;

                createNode(semanticChild.id, {
                  ...semanticChild,
                  x:
                    center.x +
                    Math.cos(inwardAngle) *
                      radius,
                  y:
                    center.y +
                    Math.sin(inwardAngle) *
                      radius,
                });
              }

              const edge = postGraph.edges.find(
                (candidate) =>
                  candidate.type ===
                    "has_context_child" &&
                  candidate.target ===
                    semanticChild.id,
              );

              if (
                edge &&
                !graphDataset.fullGraph.hasEdge(
                  edge.id,
                )
              ) {
                createEdge(
                  edge.id,
                  {
                    type: edge.type,
                  },
                  edge.source,
                  edge.target,
                  false,
                );
              }
            },
          );

	  posts.forEach((post, index) => {
            if (!graphDataset.fullGraph.hasNode(post.id)) {
              const postsPerRing = 12;
              const ringIndex =
                Math.floor(index / postsPerRing);
              const indexInRing =
                index % postsPerRing;

              const itemsInRing = Math.min(
                postsPerRing,
                posts.length -
                  ringIndex * postsPerRing,
              );

              // Les posts restent toujours dans le
              // demi-plan extérieur du contexte.
              const fanSpan =
                itemsInRing <= 1
                  ? 0
                  : Math.min(
                      Math.PI * 0.78,
                      Math.max(
                        Math.PI / 3,
                        (itemsInRing - 1) * 0.22,
                      ),
                    );

              const angle =
                itemsInRing <= 1
                  ? outwardAngle
                  : outwardAngle -
                    fanSpan / 2 +
                    (fanSpan * indexInRing) /
                      (itemsInRing - 1);

              const radius =
                230 + ringIndex * 100;

              createNode(post.id, {
                ...post,
                x:
                  center.x +
                  Math.cos(angle) * radius,
                y:
                  center.y +
                  Math.sin(angle) * radius,
              });
            }

            const edge = postGraph.edges.find(
              (candidate) =>
                candidate.type === "supported_by_post" &&
                candidate.target === post.id,
            );

            if (
              edge &&
              edge.type === "supported_by_post" &&
              !graphDataset.fullGraph.hasEdge(edge.id)
            ) {
              createEdge(
                edge.id,
                {
                  type: edge.type,
                  supporting_contribution_ids:
                    edge.supporting_contribution_ids,
                  supporting_contribution_count:
                    edge.supporting_contribution_count,
                },
                edge.source,
                edge.target,
                false,
              );
            }
          });

          /*
           * Chaque post affiche sa ou ses racines documentaires.
           * expandPostSources réutilise le cache mais recrée les
           * nœuds/arêtes après une fermeture/réouverture du contexte.
           * Leur placement reste local, court et décalé de +/-45°.
           */
          await Promise.all(
            posts.map(async (post) => {
              try {
                await expandPostSources(
                  post.id,
                  post.post_id,
                );
              } catch {
                // Un post sans source exploitable reste affiché seul.
              }
            }),
          );
        } catch (error) {
          expandedThemesRef.current.delete(themeId);
          onExpandedThemeChange(null);

          sigma.getGraph().setNodeAttribute(
            node,
            "cominExpanded",
            false,
          );
          throw error;
        }
    };

    registerEvents({
      enterEdge({ edge }) {
        if (dragStateRef.current.type !== "idle") return;
        setHoveredEdge(edge);
      },
      leaveEdge() {
        if (dragStateRef.current.type !== "idle") return;
        resetHoveredEdge();
      },
      enterNode({ node }) {
        if (dragStateRef.current.type !== "idle") return;
        setHoveredNode(node);
      },
      leaveNode() {
        if (dragStateRef.current.type !== "idle") return;
        resetHoveredNode();
      },
      async clickNode({ node, event }) {
        await activateNode(
          node,
          event.original.ctrlKey,
        );
      },

      clickEdge({ edge, event }) {
        if (suppressTouchTap()) return;

        if (event.original.ctrlKey) {
          toggle({
            type: "edges",
            item: edge,
          });
        } else if (selection.type === "edges" && selection.items.has(edge) && selection.items.size === 1) {
          emptySelection();
        } else {
          select({ type: "edges", items: new Set([edge]), replace: true });
        }
      },
      doubleClick(event: MouseCoords) {
        event.preventSigmaDefault();
      },
      downNode: ({ node, event }) => {
        const graph = sigma.getGraph();
        const nodes = selection.type === "nodes" && selection.items.has(node) ? Array.from(selection.items) : [node];
        const { x, y } = sigma.viewportToGraph(event);

        const initialNodesPosition: LayoutMapping = {};
        nodes.forEach((node) => {
          // I think the fixed  attribute is a failed tryout to solve the drag during layout issue https://github.com/gephi/gephi-lite/issues/138
          graph.setNodeAttribute(node, "fixed", true);
          const { x, y } = graph.getNodeAttributes(node);
          initialNodesPosition[node] = { x, y };
        });

        dragEventsCountRef.current = 0;
        dragStateRef.current = {
          type: "downing",
          initialNodesPosition,
          initialMousePosition: { x, y },
        };
      },
      clickStage(e) {
        if (suppressTouchTap()) return;

        // Ctrl reste réservé à la sélection multiple.
        if (e.event.original.ctrlKey) return;

        /*
         * Un clic dans le vide replie tout ce qui
         * a été développé depuis les contextes :
         *
         * - posts
         * - sous-contextes sémantiques
         * - sources
         * - containers
         *
         * Les nœuds contexte eux-mêmes restent présents.
         */
        Array.from(
          expandedThemesRef.current,
        ).forEach((themeId) => {
          const contextEntry =
            Object.entries(
              graphDataset.nodeData,
            ).find(
              ([, data]) =>
                data?.type === "context" &&
                data.theme_id === themeId,
            );

          if (!contextEntry) return;

          collapseContext(
            contextEntry[0],
            themeId,
          );
        });

        onCloseTransientPanels();

        emptySelection();
        resetHoveredNode();
        resetHoveredEdge();
      },
      moveBody: (e) => {
        const dragState = dragStateRef.current;
        if (dragState.type === "downing" || dragState.type === "dragging") {
          if (dragState.type === "downing") dragStateRef.current = { ...dragState, type: "dragging" };
          dragEventsCountRef.current++;
          const graph = sigma.getGraph();

          // Set new positions for nodes:
          const newPosition = sigma.viewportToGraph(e.event);
          const delta = {
            x: newPosition.x - dragState.initialMousePosition.x,
            y: newPosition.y - dragState.initialMousePosition.y,
          };

          for (const node in dragState.initialNodesPosition) {
            const initialPosition = dragState.initialNodesPosition[node];
            graph.setNodeAttribute(node, "x", initialPosition.x + delta.x);
            graph.setNodeAttribute(node, "y", initialPosition.y + delta.y);
          }
          globalEmitter.emit(EVENTS.nodesDragged);

          // Prevent sigma to move camera:
          e.preventSigmaDefault();
          e.event.original.preventDefault();
        }
      },
    });

    const activateNodeFromLabel = (
      nodeId: string,
    ) => {
      if (
        !graphDataset.fullGraph.hasNode(
          nodeId,
        )
      ) {
        return;
      }

      /*
       * Même fonction que clickNode.
       * L'appel reste directement dans la chaîne du clic DOM,
       * ce qui permet aussi window.open() pour une source.
       */
      dragEventsCountRef.current = 0;
      void activateNode(nodeId, false);
    };

    onNodeActivatorReady(
      activateNodeFromLabel,
    );

    /*
     * Navigation pilotée par la recherche profonde.
     *
     * Elle matérialise uniquement ce qui est nécessaire
     * pour atteindre l'objet recherché.
     */
    const waitForRenderedNode =
      async (
        nodeId: string,
      ) => {
        /*
         * graph.hasNode() ne suffit pas :
         * createNode alimente Graphology avant que Sigma
         * ait produit les coordonnées de rendu du nœud.
         *
         * C'est particulièrement visible avec les sources
         * matérialisées à la volée par la recherche.
         */
        for (
          let frame = 0;
          frame < 90;
          frame++
        ) {
          const graph =
            sigma.getGraph();

          if (
            graph.hasNode(nodeId)
          ) {
            const displayData =
              sigma.getNodeDisplayData(
                nodeId,
              );

            if (
              displayData &&
              Number.isFinite(
                displayData.x,
              ) &&
              Number.isFinite(
                displayData.y,
              )
            ) {
              return true;
            }

            /*
             * Demander explicitement une synchronisation
             * du renderer lorsque le nœud existe déjà.
             */
            sigma.refresh();
          }

          await new Promise<void>(
            (resolve) => {
              requestAnimationFrame(
                () =>
                  resolve(),
              );
            },
          );
        }

        return false;
      };

    const selectAndFocusNode =
      async (
        nodeId: string,
      ) => {
        if (
          !await waitForRenderedNode(
            nodeId,
          )
        ) {
          return;
        }

        select({
          type: "nodes",
          items:
            new Set([
              nodeId,
            ]),
          replace: true,
        });

        /*
         * Le cartouche doit être alimenté immédiatement,
         * indépendamment du temps nécessaire au déplacement
         * de la caméra.
         */
        setHoveredNode(
          nodeId,
        );

        sigma.refresh();

        /*
         * Laisser une frame à Sigma après la sélection :
         * AppearanceController peut modifier le rendu et
         * les dimensions du nœud sélectionné.
         */
        await new Promise<void>(
          (resolve) => {
            requestAnimationFrame(
              () =>
                resolve(),
            );
          },
        );

        /*
         * Vérifier une seconde fois que le nœud possède
         * toujours des données de rendu avant le focus.
         */
        if (
          !await waitForRenderedNode(
            nodeId,
          )
        ) {
          return;
        }

        await fitViewportToNodes(
          sigma,
          [nodeId],
          {
            animate: true,
          },
        );

        /*
         * L'animation peut provoquer des rafraîchissements
         * Sigma ; réaffirmer la cible à son terme.
         */
        setHoveredNode(
          nodeId,
        );
      };

    const ensureSearchContext =
      async (
        themeId: string,
      ) => {
        const contextNodeId =
          `context:${themeId}`;

        if (
          !sigma
            .getGraph()
            .hasNode(
              contextNodeId,
            )
        ) {
          return false;
        }

        if (
          !expandedThemesRef.current.has(
            themeId,
          )
        ) {
          dragEventsCountRef.current =
            0;

          await activateNode(
            contextNodeId,
            false,
          );
        }

        return true;
      };

    const expandSearchContainer =
      async (
        containerNodeId: string,
        postId: number,
        sourceGraph:
          CominPostSourcesGraphResponse,
      ) => {
        if (
          !await waitForRenderedNode(
            containerNodeId,
          )
        ) {
          return;
        }

        const childEdges =
          sourceGraph.edges.filter(
            (edge) =>
              edge.type ===
                "contains_source" &&
              edge.source ===
                containerNodeId,
          );

        const children =
          childEdges
            .map((edge) =>
              sourceGraph.nodes.find(
                (node) =>
                  node.id ===
                  edge.target,
              ),
            )
            .filter(
              (
                node,
              ): node is
                CominPostSourceNode =>
                node !==
                undefined,
            );

        placeChildren(
          containerNodeId,
          children,
          postId,
        );

        /*
         * Attendre la matérialisation avant
         * de poser les liens.
         */
        await new Promise<void>(
          (resolve) => {
            requestAnimationFrame(
              () =>
                resolve(),
            );
          },
        );

        childEdges.forEach(
          (edge) => {
            if (
              !graphDataset.fullGraph.hasEdge(
                edge.id,
              )
            ) {
              createEdge(
                edge.id,
                {
                  type:
                    edge.type,
                  position:
                    edge.position,
                },
                edge.source,
                edge.target,
                false,
              );
            }
          },
        );

        expandedContainersRef.current.add(
          containerNodeId,
        );
      };

    const revealSearchTarget =
      async (
        target:
          CominDeepSearchTarget,
      ) => {
        resetHoveredNode();

        if (
          target.type ===
          "context"
        ) {
          if (
            !target.themeId
          ) {
            return;
          }

          /*
           * Si la recherche précédente avait déplié
           * un autre contexte pour atteindre un post
           * ou une source, le replier complètement
           * avant de sélectionner le nouveau contexte.
           *
           * Cela remet le graphe dans son état macro
           * cohérent avant le recentrage.
           */
          Array.from(
            expandedThemesRef.current,
          ).forEach(
            (expandedThemeId) => {
              if (
                expandedThemeId ===
                target.themeId
              ) {
                return;
              }

              const contextEntry =
                Object.entries(
                  graphDataset.nodeData,
                ).find(
                  ([, data]) =>
                    data?.type ===
                      "context" &&
                    data.theme_id ===
                      expandedThemeId,
                );

              if (!contextEntry) {
                return;
              }

              collapseContext(
                contextEntry[0],
                expandedThemeId,
              );
            },
          );

          /*
           * Laisser Sigma intégrer les suppressions
           * de posts/sources avant de déplacer la caméra.
           */
          await new Promise<void>(
            (resolve) => {
              requestAnimationFrame(
                () => resolve(),
              );
            },
          );

          await selectAndFocusNode(
            `context:${target.themeId}`,
          );

          return;
        }

        if (
          !target.themeId
        ) {
          return;
        }

        const contextReady =
          await ensureSearchContext(
            target.themeId,
          );

        if (!contextReady) {
          return;
        }

        if (
          target.type ===
          "post"
        ) {
          if (
            !target.postId
          ) {
            return;
          }

          await selectAndFocusNode(
            `post:${target.postId}`,
          );

          return;
        }

        if (
          target.type !==
            "source" ||
          !target.sourceId ||
          !target.postId
        ) {
          return;
        }

        const postNodeId =
          `post:${target.postId}`;

        if (
          !await waitForRenderedNode(
            postNodeId,
          )
        ) {
          return;
        }

        let sourceGraph =
          postSourcesCacheRef.current.get(
            target.postId,
          );

        if (!sourceGraph) {
          sourceGraph =
            await fetchCominPostSourcesGraph(
              target.postId,
            );

          postSourcesCacheRef.current.set(
            target.postId,
            sourceGraph,
          );
        }

        /*
         * Matérialise les racines documentaires du post.
         */
        await expandPostSources(
          postNodeId,
          target.postId,
        );

        const targetNode =
          sourceGraph.nodes.find(
            (node) =>
              node.source_id ===
                target.sourceId,
          );

        if (!targetNode) {
          return;
        }

        /*
         * Construire le chemin :
         *
         * racine -> container -> ... -> source cible
         */
        const path: string[] =
          [];

        let currentId =
          targetNode.id;

        for (
          let depth = 0;
          depth < 30;
          depth++
        ) {
          const parentEdge =
            sourceGraph.edges.find(
              (edge) =>
                edge.type ===
                  "contains_source" &&
                edge.target ===
                  currentId,
            );

          if (!parentEdge) {
            break;
          }

          path.unshift(
            parentEdge.source,
          );

          currentId =
            parentEdge.source;
        }

        /*
         * Déplier successivement chacun des
         * containers du chemin.
         *
         * Chaque container affiche tous ses enfants,
         * exactement comme lors d'une ouverture normale.
         */
        for (
          const containerId
          of path
        ) {
          const container =
            sourceGraph.nodes.find(
              (node) =>
                node.id ===
                  containerId &&
                node.type ===
                  "container",
            );

          if (!container) {
            continue;
          }

          await expandSearchContainer(
            containerId,
            target.postId,
            sourceGraph,
          );
        }

        await selectAndFocusNode(
          targetNode.id,
        );
      };

    const revealSearchTargetFromUi:
      EventListener = (
        event,
      ) => {
        const customEvent =
          event as CustomEvent<
            CominDeepSearchTarget
          >;

        if (
          !customEvent.detail
        ) {
          return;
        }

        void revealSearchTarget(
          customEvent.detail,
        );
      };

    window.addEventListener(
      "comin-reveal-search-target",
      revealSearchTargetFromUi,
    );

    const upHandler = () => {
      const dragState = dragStateRef.current;
      if (dragState.type === "downing" || dragState.type === "dragging") {
        const graph = sigma.getGraph();
        if (dragState.type === "dragging") {
          // Save new positions in graph dataset:
          const positions = mapValues(dragState.initialNodesPosition, (_initialPosition, id) =>
            pick(graph.getNodeAttributes(id), ["x", "y"]),
          );
          setNodePositions(positions);

          resetHoveredNode();
          resetHoveredEdge();
        }
        // I think the fixed  attribute is a failed tryout to solve the drag during layout issue https://github.com/gephi/gephi-lite/issues/138
        graph.forEachNode((node) => graph.setNodeAttribute(node, "fixed", false));
        dragStateRef.current = { type: "idle" };
      }
    };

    const unbind = bindUpHandler(upHandler);
    return () => {
      unbind();

      window.removeEventListener(
        "comin-reveal-search-target",
        revealSearchTargetFromUi,
      );

      onNodeActivatorReady(null);
    };
  }, [
    registerEvents,
    createEdge,
    createNode,
    deleteItems,
    emptySelection,
    graphDataset,
    resetHoveredEdge,
    resetHoveredNode,
    select,
    selection,
    setHoveredEdge,
    setHoveredNode,
    sigma,
    toggle,
    setNodePositions,
    globalEmitter,
    onOpenContextSemantic,
    onOpenPostNote,
    onCloseTransientPanels,
    onNodeActivatorReady,
    onExpandedThemeChange,
  ]);

  // DOM events not handled by sigma:
  useEffect(() => {
    const leaveHandle = () => {
      if (dragStateRef.current.type !== "idle") return;

      resetHoveredNode();
      resetHoveredEdge();
    };

    const container = sigma.getContainer();
    container.addEventListener("mouseleave", leaveHandle);
    return () => {
      container.removeEventListener("mouseleave", leaveHandle);
    };
  }, [resetHoveredEdge, resetHoveredNode, sigma]);

  // Custom Gephi Lite events:
  useEffect(() => {
    // Handle focus events:
    const focusNodesHandle = async ({ nodes }: { nodes: Set<string> }) => {
      await fitViewportToNodes(sigma, Array.from(nodes), {
        animate: true,
      });
    };

    globalEmitter.on(EVENTS.focusNodes, focusNodesHandle);
    return () => {
      globalEmitter.off(EVENTS.focusNodes, focusNodesHandle);
    };
  }, [globalEmitter, sigma]);

  // Broadcast "sigmaMounted" event on mount:
  useEffect(() => {
    globalEmitter.emit(EVENTS.sigmaMounted);
  }, [globalEmitter]);

  return null;
};
