import Graph from "graphology";

export interface CominContextGraphNode {
  id: string;
  type: "context";
  theme_id: string;
  label: string;
}

export interface CominContextGraphEdge {
  id: string;
  type: "related";
  source: string;
  target: string;
  declarations: number;
  reciprocal: boolean;
}

export interface CominContextGraphResponse {
  status: "ok";
  graph_version: string;
  build_id: string;
  generated_at_utc: string;
  node_count: number;
  edge_count: number;
  nodes: CominContextGraphNode[];
  edges: CominContextGraphEdge[];
}

export function cominContextGraphToGraph(data: CominContextGraphResponse): Graph {
  const graph = new Graph({ type: "undirected" });

  graph.setAttribute("title", "Com'In — Contextes");
  graph.setAttribute("description", `Build ${data.build_id}`);

  const contexts = [...data.nodes].sort((a, b) =>
    a.theme_id.localeCompare(b.theme_id, undefined, {
      numeric: true,
    }),
  );

  const contextCount = contexts.length;
  const radius = Math.max(260, contextCount * 24);
  const startAngle = -Math.PI / 2;
  const angleStep =
    (2 * Math.PI) / Math.max(contextCount, 1);

  type CominLabelPlacement =
    | "left"
    | "right"
    | "top"
    | "bottom";

  const positionedContexts = contexts.map((node, index) => {
    const angle = startAngle + index * angleStep;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let cominLabelPlacement: CominLabelPlacement;

    // Réserver top/bottom uniquement aux nœuds réellement
    // proches de l'axe vertical.
    if (Math.abs(sin) >= 0.97) {
      cominLabelPlacement = sin >= 0 ? "top" : "bottom";
    } else {
      cominLabelPlacement = cos >= 0 ? "right" : "left";
    }

    return {
      node,
      cos,
      sin,
      cominLabelPlacement,
    };
  });

  const labelLanes = new Map<
    string,
    {
      index: number;
      count: number;
      minSinGap: number;
    }
  >();

  (["left", "right"] as const).forEach((side) => {
    const sideContexts = positionedContexts
      .filter(
        ({ cominLabelPlacement }) =>
          cominLabelPlacement === side,
      )
      // ordre visuel du haut vers le bas
      .sort((a, b) => b.sin - a.sin);

    const minSinGap =
      sideContexts.length > 1
        ? Math.min(
            ...sideContexts
              .slice(1)
              .map((item, index) =>
                Math.abs(
                  sideContexts[index].sin -
                    item.sin,
                ),
              ),
          )
        : 1;

    sideContexts.forEach(({ node }, index) => {
      labelLanes.set(node.id, {
        index,
        count: sideContexts.length,
        minSinGap,
      });
    });
  });

  positionedContexts.forEach(
    ({
      node,
      cos,
      sin,
      cominLabelPlacement,
    }) => {
      const lane = labelLanes.get(node.id);

      graph.addNode(node.id, {
        label: node.label,
        type: node.type,
        theme_id: node.theme_id,
        cominRadialLabel: true,
        cominLabelPlacement,
        cominLabelLaneIndex: lane?.index ?? 0,
        cominLabelLaneCount: lane?.count ?? 1,
        cominLabelLaneMinSinGap:
          lane?.minSinGap ?? 1,
        x: cos * radius,
        y: sin * radius,
      });
    },
  );

  data.edges.forEach((edge) => {
    graph.addUndirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      type: edge.type,
      declarations: edge.declarations,
      reciprocal: edge.reciprocal,
    });
  });

  return graph;
}
