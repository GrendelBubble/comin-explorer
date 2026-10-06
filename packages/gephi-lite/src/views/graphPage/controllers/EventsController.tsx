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
import { bindUpHandler } from "../../../utils/events";

const DRAG_EVENTS_TOLERANCE = 3;

// Les sources forment un micro-arbre local autour du post.
// Elles ne prolongent jamais l'axe radial contexte -> post.
const POST_SOURCE_BRANCH_OFFSET = Math.PI / 4;
const POST_SOURCE_DISTANCE = 34;
const SOURCE_CHILD_DISTANCE = 46;
const SOURCE_CHILD_RING_GAP = 32;
const SOURCE_LOCAL_FAN_MAX = Math.PI / 3;

interface EventsControllerProps {
  onOpenContextSemantic: (
    item: CominContextSemanticNode,
  ) => void;
  onOpenPostNote: (
    item: CominContextChildPostNode,
  ) => void;
}

export const EventsController: FC<EventsControllerProps> = ({
  onOpenContextSemantic,
  onOpenPostNote,
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
      const parent = graph.getNodeAttributes(parentNodeId);

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

      const direction = Math.atan2(
        parent.y - postPosition.y,
        parent.x - postPosition.x,
      );

      const perRing = 8;

      children.forEach((child, index) => {
        const ring = Math.floor(index / perRing);
        const indexInRing = index % perRing;

        const countInRing = Math.min(
          perRing,
          children.length - ring * perRing,
        );

        const span =
          countInRing <= 1
            ? 0
            : Math.min(
                SOURCE_LOCAL_FAN_MAX,
                (countInRing - 1) * 0.16,
              );

        const angle =
          countInRing <= 1
            ? direction
            : direction -
              span / 2 +
              (span * indexInRing) /
                (countInRing - 1);

        const radius =
          SOURCE_CHILD_DISTANCE +
          ring * SOURCE_CHILD_RING_GAP;

        if (!graphDataset.fullGraph.hasNode(child.id)) {
          createNode(child.id, {
            ...child,
            cominPostId: postId,
            x:
              parent.x +
              Math.cos(angle) * radius,
            y:
              parent.y +
              Math.sin(angle) * radius,
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

      // Micro-branche à +/- 45° de l'axe radial.
      const branchSide =
        postId % 2 === 0 ? 1 : -1;

      const branchAngle =
        radialAngle +
        branchSide * POST_SOURCE_BRANCH_OFFSET;

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
                Math.PI / 4,
                (countInRing - 1) * 0.14,
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
          ring * 24;

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
      if (
        expandedContainersRef.current.has(
          containerNodeId,
        )
      ) {
        collapseSourceChildren(containerNodeId);
        return;
      }

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
        if (dragEventsCountRef.current >= DRAG_EVENTS_TOLERANCE) return;

        const nodeData = graphDataset.nodeData[node];

        if (nodeData?.type === "context_semantic") {
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

        if (event.original.ctrlKey) {
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

        if (event.original.ctrlKey) return;

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
          sigma.getGraph().setNodeAttribute(
            node,
            "cominExpanded",
            false,
          );
          throw error;
        }
      },

      clickEdge({ edge, event }) {
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
      async doubleClickNode({ node, event }) {
        event.preventSigmaDefault();

        const nodeData =
          graphDataset.nodeData[node];

        if (
          nodeData?.type === "post" &&
          typeof nodeData.post_id === "number"
        ) {
          await expandPostSources(
            node,
            nodeData.post_id,
          );

          onOpenPostNote(
            nodeData as unknown as CominContextChildPostNode,
          );
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
        // Reset the selection when clicking on the stage
        // except when ctrl is pressed to add node in selection
        // with the marquee selector
        if (!e.event.original.ctrlKey) emptySelection();
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
