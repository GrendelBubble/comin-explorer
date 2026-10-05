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
import { memoizedBrighten, memoizedDarken } from "../../../utils/colors";

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
        data?.type === "context_unit" ||
        data?.type === "post" ||
        data?.type === "source",
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

    sigma.setSetting("nodeReducer", (id, attr) => {
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
      const hasExpandedContexts = graph.someNode(
        (_node, attributes) =>
          attributes.cominExpanded === true,
      );
      res.zIndex = 0;

      if (isCominGraph) {
        const nodeType = nodeData[id]?.type;

        if (nodeType === "context") {
          res.color = COMIN_UI.nodes.context.color;
          res.size = COMIN_UI.nodes.context.size;
        } else if (nodeType === "post") {
          res.color = COMIN_UI.nodes.post.color;
          res.size = COMIN_UI.nodes.post.size;
        } else if (nodeType === "source") {
          res.color = COMIN_UI.nodes.source.color;
          res.size = COMIN_UI.nodes.source.size;
        }
      }

      res.rawSize = res.size || DEFAULT_NODE_SIZE;

      if (isCominGraph && !hoveredNode) {
        const nodeType = nodeData[id]?.type;

        if (nodeType === "post") {
          res.hideLabel = true;
        }

        if (nodeType === "context") {
          if (hasExpandedContexts) {
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

      if (hasEmphasizedNodes && !allEmphasizedNodes.has(id)) {
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

      return res;
    });
    sigma.setSetting(
      "edgeReducer",
      !showEdges.value
        ? () => ({ hidden: true })
        : (id, { weight, ...attr }) => {
            const res = {
              ...attr,
              size: weight,
              type: graph.isDirected(id) ? "arrow" : "line",
            } as Partial<CustomEdgeDisplayData>;
            if (isCominGraph) {
              const edgeType = edgeData[id]?.type;

              if (edgeType === "related") {
                res.color = COMIN_UI.edges.related.color;
                res.size = COMIN_UI.edges.related.size;
              } else if (edgeType === "supported_by_post") {
                res.color = COMIN_UI.edges.supportedByPost.color;
                res.size = COMIN_UI.edges.supportedByPost.size;
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
