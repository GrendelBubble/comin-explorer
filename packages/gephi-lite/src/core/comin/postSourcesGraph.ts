export interface CominPostSourceNode {
  id: string;
  type: "source" | "container";
  source_id: number;
  source_type: string;
  label: string;
  url: string;
  status: string;
  has_note: boolean;
}

export interface CominPostSourceEdge {
  id: string;
  type: "has_source" | "contains_source";
  source: string;
  target: string;
  relation_type?: string;
  source_path?: string;
  position?: number;
}

export interface CominPostSourcesGraphResponse {
  status: "ok";
  graph_version: "post-sources-graph-v1";
  post_id: number;
  root_source_ids: number[];
  node_count: number;
  edge_count: number;
  nodes: CominPostSourceNode[];
  edges: CominPostSourceEdge[];
}
