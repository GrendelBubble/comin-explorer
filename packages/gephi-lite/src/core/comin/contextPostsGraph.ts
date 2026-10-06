export interface CominContextPostsContextNode {
  id: string;
  type: "context";
  theme_id: string;
  label: string;
}

export interface CominContextPostNode {
  id: string;
  type: "post";
  post_id: number;
  post_type: string;
  post_type_color: string | null;
  label: string;
  composition_method: string;
  has_note: true;
  supporting_contribution_ids: string[];
  supporting_contribution_count: number;
}

export type CominContextPostsGraphNode =
  | CominContextPostsContextNode
  | CominContextPostNode;

export interface CominContextPostsGraphEdge {
  id: string;
  type: "supported_by_post";
  source: string;
  target: string;
  supporting_contribution_ids: string[];
  supporting_contribution_count: number;
}

export interface CominContextPostsGraphResponse {
  status: "ok";
  graph_version: "context-posts-graph-v1";
  build_id: string;
  generated_at_utc: string | null;
  theme_id: string;
  node_count: number;
  edge_count: number;
  nodes: CominContextPostsGraphNode[];
  edges: CominContextPostsGraphEdge[];
}
