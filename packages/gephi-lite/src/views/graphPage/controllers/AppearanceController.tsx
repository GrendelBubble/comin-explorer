import {
  CustomEdgeDisplayData,
  CustomNodeDisplayData,
  DEFAULT_EDGE_COLOR,
  DEFAULT_EDGE_SIZE,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_SIZE,
} from "@gephi/gephi-lite-sdk";
import { useSigma } from "@react-sigma/core";
import { FC, useEffect } from "react";

import {
  useAppearance,
  useGraphDataset,
  usePreferences,
  useSelection,
  useSigmaState,
} from "../../../core/context/dataContexts";
import { COMIN_UI } from "../../../core/comin/uiPreset";
import { GephiLiteSigma } from "../../../core/graph/types";
import { getAppliedTheme } from "../../../core/preferences/utils";
import {
  isValidColor,
  memoizedBrighten,
  memoizedDarken,
} from "../../../utils/colors";

export const AppearanceController: FC = () => {
  const sigma: GephiLiteSigma = useSigma();
  const selection = useSelection();
  const { showEdges } = useAppearance();
  const { fullGraph, nodeData, edgeData } = useGraphDataset();
  const { theme } = usePreferences();
  const { emphasizedNodes, emphasizedEdges, hoveredNode, highlightedNodes } = useSigmaState();

  // Reducers:
  useEffect(() => {
    const graph = sigma.getGraph();
    const mode = getAppliedTheme(theme);
    const isCominGraph = Object.values(nodeData).some(
      (data) =>
        data?.type === "context" ||
        data?.type === "context_semantic" ||
        data?.type === "context_unit" ||
        data?.type === "post" ||
        data?.type === "source" ||
        data?.type === "container",
    );

    // what we've got in the state,
    //  or
    //    the node selection,
    //    the hover node plus its neighbor
    const allEmphasizedNodes =
      emphasizedNodes ||
      new Set([
        ...(selection.type === "nodes" ? Array.from(selection.items) : []),
        ...(hoveredNode ? [hoveredNode, ...graph.neighbors(hoveredNode)] : []),
      ]);

    // What we've got in state
    //  or edges linked to an emphasizedNodes
    //  or
    //    edges in selection
    //    edges hovered
    //    edges in neighbor of the node hovered
    const allEmphasizedEdges = emphasizedNodes
      ? new Set(
          graph.filterEdges(
            (_edge, _attr, source, target) => emphasizedNodes.has(source) && emphasizedNodes.has(target),
          ),
        )
      : emphasizedEdges ||
        new Set([
          ...(selection.type === "edges" ? Array.from(selection.items) : []),
          ...(hoveredNode ? graph.edges(hoveredNode) : []),
        ]);
    const hasEmphasizedNodes = !!allEmphasizedNodes.size;
    const hasEmphasizedEdges = !!allEmphasizedEdges.size;

    type CominLabelBox = {
      left: number;
      right: number;
      top: number;
      bottom: number;
    };

    const labelBoxesOverlap = (
      a: CominLabelBox,
      b: CominLabelBox,
    ) => {
      const gap = 8;

      return !(
        a.right + gap < b.left ||
        a.left > b.right + gap ||
        a.bottom + gap < b.top ||
        a.top > b.bottom + gap
      );
    };

    const estimateLabelSize = (label: string) => {
      const maxCharsPerLine = 38;
      const charWidth = 7.2;
      const lineHeight = 18;

      const words = label.trim().split(/\s+/);
      const lines: string[] = [];
      let line = "";

      words.forEach((word) => {
        const candidate = line
          ? `${line} ${word}`
          : word;

        if (
          line &&
          candidate.length > maxCharsPerLine
        ) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });

      if (line) lines.push(line);

      const width = Math.min(
        280,
        Math.max(
          80,
          ...lines.map(
            (value) => value.length * charWidth,
          ),
        ),
      );

      return {
        width,
        height:
          Math.max(lines.length, 1) *
          lineHeight,
      };
    };

    const getCollisionFreeContextLabels = () => {
      const acceptedBoxes: CominLabelBox[] = [];
      const acceptedIds = new Set<string>();

      const selectedNodeIds =
        selection.type === "nodes"
          ? selection.items
          : new Set<string>();

      const contextIds = graph
        .nodes()
        .filter(
          (nodeId) =>
            nodeData[nodeId]?.type === "context",
        )
        .sort((a, b) => {
          const score = (nodeId: string) => {
            const attributes =
              graph.getNodeAttributes(nodeId);

            const placement =
              nodeData[nodeId]
                ?.cominLabelPlacement;

            return (
              (nodeId === hoveredNode ? 1000 : 0) +
              (selectedNodeIds.has(nodeId)
                ? 900
                : 0) +
              (attributes.cominExpanded === true
                ? 800
                : 0) +
              (placement === "top" ||
              placement === "bottom"
                ? 100
                : 0)
            );
          };

          const scoreDiff = score(b) - score(a);

          if (scoreDiff) return scoreDiff;

          return String(
            nodeData[a]?.theme_id ?? a,
          ).localeCompare(
            String(
              nodeData[b]?.theme_id ?? b,
            ),
            undefined,
            { numeric: true },
          );
        });

      contextIds.forEach((nodeId) => {
        const attributes =
          graph.getNodeAttributes(nodeId);

        const x = Number(attributes.x);
        const y = Number(attributes.y);

        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y)
        ) {
          return;
        }

        const viewport =
          sigma.graphToViewport({ x, y });

        const label = String(
          nodeData[nodeId]?.label ??
            attributes.label ??
            "",
        );

        if (!label) return;

        const { width, height } =
          estimateLabelSize(label);

        const placement = (
          nodeData[nodeId]
            ?.cominLabelPlacement ??
          "right"
        ) as
          | "left"
          | "right"
          | "top"
          | "bottom";

        const offset = 28;

        let box: CominLabelBox;

        if (placement === "left") {
          box = {
            left:
              viewport.x -
              offset -
              width,
            right: viewport.x - offset,
            top:
              viewport.y -
              height / 2,
            bottom:
              viewport.y +
              height / 2,
          };
        } else if (placement === "top") {
          box = {
            left:
              viewport.x -
              width / 2,
            right:
              viewport.x +
              width / 2,
            top:
              viewport.y -
              offset -
              height,
            bottom:
              viewport.y - offset,
          };
        } else if (
          placement === "bottom"
        ) {
          box = {
            left:
              viewport.x -
              width / 2,
            right:
              viewport.x +
              width / 2,
            top:
              viewport.y + offset,
            bottom:
              viewport.y +
              offset +
              height,
          };
        } else {
          box = {
            left: viewport.x + offset,
            right:
              viewport.x +
              offset +
              width,
            top:
              viewport.y -
              height / 2,
            bottom:
              viewport.y +
              height / 2,
          };
        }

        const collides =
          acceptedBoxes.some(
            (acceptedBox) =>
              labelBoxesOverlap(
                box,
                acceptedBox,
              ),
          );

        if (!collides) {
          acceptedBoxes.push(box);
          acceptedIds.add(nodeId);
        }
      });

      return acceptedIds;
    };

    const hasExpandedContexts = () =>
      graph.someNode(
        (_node, attributes) =>
          attributes.cominExpanded === true,
      );

    type CominContainerMask = {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      protectedNodes: Set<string>;
    };

    const getExpandedContainerMask =
      (): CominContainerMask | null => {
        // Il ne peut y avoir qu'un seul container développé.
        // Un container développé possède au moins une arête
        // contains_source actuellement présente dans le graphe.
        const containerId = graph
          .nodes()
          .find((nodeId) => {
            if (
              nodeData[nodeId]?.type !==
              "container"
            ) {
              return false;
            }

            return graph
              .edges(nodeId)
              .some(
                (edgeId) =>
                  edgeData[edgeId]?.type ===
                    "contains_source" &&
                  graph.source(edgeId) === nodeId,
              );
          });

        if (!containerId) return null;

        const protectedNodes =
          new Set<string>([containerId]);

        const contentNodeIds: string[] = [];
        const queue = [containerId];

        // Inclure aussi les descendants éventuels
        // d'un container imbriqué.
        while (queue.length) {
          const parentId = queue.shift();

          if (!parentId) continue;

          graph.edges(parentId).forEach(
            (edgeId) => {
              if (
                edgeData[edgeId]?.type !==
                  "contains_source" ||
                graph.source(edgeId) !==
                  parentId
              ) {
                return;
              }

              const childId =
                graph.target(edgeId);

              if (
                protectedNodes.has(childId)
              ) {
                return;
              }

              protectedNodes.add(childId);
              contentNodeIds.push(childId);

              if (
                nodeData[childId]?.type ===
                "container"
              ) {
                queue.push(childId);
              }
            },
          );
        }

        if (!contentNodeIds.length) {
          return null;
        }

        const positions = contentNodeIds
          .filter((nodeId) =>
            graph.hasNode(nodeId),
          )
          .map((nodeId) => {
            const attributes =
              graph.getNodeAttributes(nodeId);

            return {
              x: Number(attributes.x),
              y: Number(attributes.y),
            };
          })
          .filter(
            ({ x, y }) =>
              Number.isFinite(x) &&
              Number.isFinite(y),
          );

        if (!positions.length) {
          return null;
        }

        // Marge autour des points de la grille :
        // elle crée une véritable zone de lecture.
        const margin = 12;

        return {
          minX:
            Math.min(
              ...positions.map(({ x }) => x),
            ) - margin,
          maxX:
            Math.max(
              ...positions.map(({ x }) => x),
            ) + margin,
          minY:
            Math.min(
              ...positions.map(({ y }) => y),
            ) - margin,
          maxY:
            Math.max(
              ...positions.map(({ y }) => y),
            ) + margin,
          protectedNodes,
        };
      };

    const containerMask =
      getExpandedContainerMask();

    const pointInsideContainerMask = (
      x: number,
      y: number,
    ) =>
      containerMask !== null &&
      x >= containerMask.minX &&
      x <= containerMask.maxX &&
      y >= containerMask.minY &&
      y <= containerMask.maxY;

    // Test d'intersection segment / rectangle.
    // Cela permet aussi d'effacer les liens qui traversent
    // la zone alors que leurs deux extrémités sont à l'extérieur.
    const segmentIntersectsContainerMask = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
    ) => {
      if (!containerMask) return false;

      if (
        pointInsideContainerMask(x1, y1) ||
        pointInsideContainerMask(x2, y2)
      ) {
        return true;
      }

      const dx = x2 - x1;
      const dy = y2 - y1;

      const p = [
        -dx,
        dx,
        -dy,
        dy,
      ];

      const q = [
        x1 - containerMask.minX,
        containerMask.maxX - x1,
        y1 - containerMask.minY,
        containerMask.maxY - y1,
      ];

      let minT = 0;
      let maxT = 1;

      for (let index = 0; index < 4; index++) {
        const pi = p[index];
        const qi = q[index];

        if (pi === 0) {
          if (qi < 0) return false;
          continue;
        }

        const ratio = qi / pi;

        if (pi < 0) {
          if (ratio > maxT) return false;
          minT = Math.max(minT, ratio);
        } else {
          if (ratio < minT) return false;
          maxT = Math.min(maxT, ratio);
        }
      }

      return true;
    };

    sigma.setSetting("nodeReducer", (id, attr) => {
      const contextIsExpanded =
        hasExpandedContexts();
      const res = structuredClone(attr) as Partial<CustomNodeDisplayData> & {
        cominRadialLabel?: boolean;
        cominLabelPlacement?:
          | "left"
          | "right"
          | "top"
          | "bottom";
        cominLabelLaneIndex?: number;
        cominLabelLaneCount?: number;
        cominLabelLaneMinSinGap?: number;
        borderSize?: number;
      };

      const cominNodeData = nodeData[id] as
        | {
            cominRadialLabel?: boolean;
            cominLabelPlacement?:
              | "left"
              | "right"
              | "top"
              | "bottom";
            cominLabelLaneIndex?: number;
            cominLabelLaneCount?: number;
            cominLabelLaneMinSinGap?: number;
          }
        | undefined;

      res.cominRadialLabel =
        cominNodeData?.cominRadialLabel === true;

      res.cominLabelPlacement =
        cominNodeData?.cominLabelPlacement;

      res.cominLabelLaneIndex =
        cominNodeData?.cominLabelLaneIndex;

      res.cominLabelLaneCount =
        cominNodeData?.cominLabelLaneCount;

      res.cominLabelLaneMinSinGap =
        cominNodeData?.cominLabelLaneMinSinGap;

      const isExpandedContext =
        nodeData[id]?.type === "context" &&
        attr.cominExpanded === true;
      res.zIndex = 0;

      if (isCominGraph) {
        const nodeType = nodeData[id]?.type;

        if (nodeType === "context") {
          res.color =
            contextIsExpanded && !isExpandedContext
              ? memoizedBrighten(
                  COMIN_UI.nodes.context.color,
                )
              : COMIN_UI.nodes.context.color;
          res.size = COMIN_UI.nodes.context.size;

          if (
            contextIsExpanded &&
            !isExpandedContext
          ) {
            res.zIndex = -1;
          }
        } else if (nodeType === "context_semantic") {
          res.color = COMIN_UI.nodes.contextSemantic.color;
          res.size = COMIN_UI.nodes.contextSemantic.size;
        } else if (nodeType === "post") {
          const postTypeColor =
            nodeData[id]?.post_type_color;

          res.color =
            typeof postTypeColor === "string" &&
            isValidColor(postTypeColor)
              ? postTypeColor
              : COMIN_UI.nodes.post.color;

          // Les couleurs métier sont volontairement claires :
          // le contour sombre assure leur lisibilité sur le fond.
          res.borderColor =
            COMIN_UI.nodes.post.borderColor;
          res.borderSize = 2.5;
          res.type = "bordered";
          res.size = COMIN_UI.nodes.post.size;
        } else if (nodeType === "source") {
          res.color = COMIN_UI.nodes.source.color;
          res.size = COMIN_UI.nodes.source.size;
        } else if (nodeType === "container") {
          res.color =
            COMIN_UI.nodes.structuralSource.color;
          res.borderColor =
            COMIN_UI.nodes.structuralSource.borderColor;
          res.borderSize = 1.5;
          res.type = "diamond";
          res.size =
            COMIN_UI.nodes.structuralSource.size;
        }
      }

      res.rawSize = res.size || DEFAULT_NODE_SIZE;

      if (isCominGraph && !hoveredNode) {
        const nodeType = nodeData[id]?.type;

        if (
          nodeType === "post" ||
          nodeType === "source" ||
          nodeType === "container"
        ) {
          res.hideLabel = true;
        }

        if (nodeType === "context") {
          if (contextIsExpanded) {
            if (isExpandedContext) {
              res.forceLabel = true;
              res.hideLabel = false;
              res.zIndex = 2;
            } else {
              res.hideLabel = true;
            }
          } else {
            const visibleContextLabels =
              getCollisionFreeContextLabels();

            const showLabel =
              visibleContextLabels.has(id);

            res.forceLabel = showLabel;
            res.hideLabel = !showLabel;
          }
        }
      }

      const isCominPost =
        isCominGraph &&
        nodeData[id]?.type === "post";

      const isExpandedContextChild =
        contextIsExpanded &&
        nodeData[id]?.type === "context_semantic";

      if (
        hasEmphasizedNodes &&
        !allEmphasizedNodes.has(id) &&
        !isCominPost &&
        !isExpandedContextChild
      ) {
        res.hideLabel = true;
        res.borderColor = res.color;
        res.color =
          mode === "dark"
            ? memoizedDarken(res.color || DEFAULT_NODE_COLOR)
            : memoizedBrighten(res.color || DEFAULT_NODE_COLOR);
        res.zIndex = -1;
        res.type = "bordered";
      }

      if (id === hoveredNode || highlightedNodes?.has(id)) res.highlighted = true;

      if (allEmphasizedNodes.has(id)) {
        res.forceLabel = true;
        res.hideLabel = false;
        res.zIndex = 1;
      }

      if (
        isCominGraph &&
        hoveredNode &&
        id !== hoveredNode &&
        !isExpandedContext
      ) {
        res.hideLabel = true;
        res.forceLabel = false;
      }

      // Dans Com'In, seuls les contextes conservent
      // un libellé spatial dans Sigma.
      // Tous les autres types utilisent le cartouche fixe.
      if (
        isCominGraph &&
        nodeData[id]?.type !== "context"
      ) {
        res.hideLabel = true;
        res.forceLabel = false;
      }

      // La zone de contenu du container "efface"
      // les éléments du graphe situés derrière elle.
      // Les nœuds appartenant au container restent visibles.
      if (
        containerMask &&
        !containerMask.protectedNodes.has(id)
      ) {
        const x = Number(attr.x);
        const y = Number(attr.y);

        if (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          pointInsideContainerMask(x, y)
        ) {
          res.hidden = true;
          res.hideLabel = true;
          res.forceLabel = false;
        }
      }

      return res;
    });
    sigma.setSetting(
      "edgeReducer",
      !showEdges.value
        ? () => ({ hidden: true })
        : (id, { weight, ...attr }) => {
            const contextIsExpanded =
              hasExpandedContexts();

            const res = {
              ...attr,
              size: weight,
              type: graph.isDirected(id) ? "arrow" : "line",
            } as Partial<CustomEdgeDisplayData>;
            if (isCominGraph) {
              const edgeType = edgeData[id]?.type;

              if (edgeType === "related") {
                const source = graph.source(id);
                const target = graph.target(id);

                const touchesExpandedContext =
                  graph.getNodeAttribute(
                    source,
                    "cominExpanded",
                  ) === true ||
                  graph.getNodeAttribute(
                    target,
                    "cominExpanded",
                  ) === true;

                res.color =
                  contextIsExpanded &&
                  !touchesExpandedContext
                    ? memoizedBrighten(
                        COMIN_UI.edges.related.color,
                      )
                    : COMIN_UI.edges.related.color;

                res.size = COMIN_UI.edges.related.size;
              } else if (edgeType === "supported_by_post") {
                res.color = COMIN_UI.edges.supportedByPost.color;
                res.size = COMIN_UI.edges.supportedByPost.size;
              } else if (edgeType === "has_context_child") {
                res.color = COMIN_UI.edges.hasContextChild.color;
                res.size = COMIN_UI.edges.hasContextChild.size;
              } else if (edgeType === "has_source") {
                res.color = COMIN_UI.edges.hasSource.color;
                res.size = COMIN_UI.edges.hasSource.size;
              } else if (edgeType === "contains_source") {
                res.color = COMIN_UI.edges.containsSource.color;
                res.size = COMIN_UI.edges.containsSource.size;
              }
            }

            res.zIndex = res.zIndex || 0;
            res.rawSize = res.size || DEFAULT_EDGE_SIZE;

            if (hasEmphasizedEdges && !allEmphasizedEdges.has(id)) {
              res.color =
                mode === "dark"
                  ? memoizedDarken(res.color || DEFAULT_EDGE_COLOR)
                  : memoizedBrighten(res.color || DEFAULT_EDGE_COLOR);
              res.zIndex = -1;
            }

            if (containerMask) {
              const sourceId =
                graph.source(id);

              const targetId =
                graph.target(id);

              const edgeType =
                edgeData[id]?.type;

              // Les liens internes de la grille et le lien
              // post -> container doivent rester visibles.
              const belongsToContainer =
                (
                  edgeType ===
                    "contains_source" &&
                  containerMask.protectedNodes.has(
                    sourceId,
                  ) &&
                  containerMask.protectedNodes.has(
                    targetId,
                  )
                ) ||
                (
                  edgeType === "has_source" &&
                  containerMask.protectedNodes.has(
                    targetId,
                  )
                );

              if (
                !belongsToContainer &&
                graph.hasNode(sourceId) &&
                graph.hasNode(targetId)
              ) {
                const sourceAttributes =
                  graph.getNodeAttributes(
                    sourceId,
                  );

                const targetAttributes =
                  graph.getNodeAttributes(
                    targetId,
                  );

                const x1 = Number(
                  sourceAttributes.x,
                );
                const y1 = Number(
                  sourceAttributes.y,
                );
                const x2 = Number(
                  targetAttributes.x,
                );
                const y2 = Number(
                  targetAttributes.y,
                );

                if (
                  Number.isFinite(x1) &&
                  Number.isFinite(y1) &&
                  Number.isFinite(x2) &&
                  Number.isFinite(y2) &&
                  segmentIntersectsContainerMask(
                    x1,
                    y1,
                    x2,
                    y2,
                  )
                ) {
                  res.hidden = true;
                }
              }
            }

            return res;
          },
    );
  }, [
    emphasizedEdges,
    emphasizedNodes,
    hoveredNode,
    selection,
    showEdges,
    sigma,
    highlightedNodes,
    theme,
    fullGraph.type,
    nodeData,
    edgeData,
  ]);

  return null;
};
