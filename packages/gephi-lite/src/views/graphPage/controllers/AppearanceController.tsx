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
  const { fullGraph, nodeData } = useGraphDataset();
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

    const overviewLabelNodes = new Set(
      graph
        .nodes()
        .filter((id) => nodeData[id]?.type === "context")
        .sort((a, b) => graph.degree(b) - graph.degree(a))
        .slice(0, 6),
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

    sigma.setSetting("nodeReducer", (id, attr) => {
      const res = structuredClone(attr) as Partial<CustomNodeDisplayData>;
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
          } else if (!overviewLabelNodes.has(id)) {
            res.hideLabel = true;
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
              if (attr.type === "related") {
                res.color = COMIN_UI.edges.related.color;
                res.size = COMIN_UI.edges.related.size;
              } else if (attr.type === "supported_by_post") {
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
  ]);

  return null;
};
