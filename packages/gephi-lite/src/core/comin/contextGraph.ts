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

  contexts.forEach((node, index) => {
    const angle = startAngle + index * angleStep;

    graph.addNode(node.id, {
      label: node.label,
      type: node.type,
      theme_id: node.theme_id,
      cominRadialLabel: true,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });

  data.edges.forEach((edge) => {
    graph.addUndirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      type: edge.type,
      declarations: edge.declarations,
      reciprocal: edge.reciprocal,
    });
  });

  return graph;
}
