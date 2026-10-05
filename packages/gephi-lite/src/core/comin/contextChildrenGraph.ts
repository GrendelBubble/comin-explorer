export interface CominContextChildrenContextNode {
  id: string;
  type: "context";
  theme_id: string;
  label: string;
}

export interface CominContextChildUnit {
  unit_id: string;
  text: string;
  support_mode: "all" | "any";
  supporting_contribution_ids: string[];
}

export interface CominContextSemanticNode {
  id: string;
  type: "context_semantic";
  semantic_kind:
    | "synthese"
    | "tensions_limites"
    | "questions_ouvertes";
  source_section: string;
  theme_id: string;
  label: string;
  unit_count: number;
  units: CominContextChildUnit[];
}

export interface CominContextChildPostNode {
  id: string;
  type: "post";
  post_id: number;
  post_type: string;
  label: string;
  composition_method: string;
  has_note: true;
  url: string;
  supporting_contribution_ids: string[];
  supporting_contribution_count: number;
}

export type CominContextChildrenGraphNode =
  | CominContextChildrenContextNode
  | CominContextSemanticNode
  | CominContextChildPostNode;

export interface CominContextChildEdge {
  id: string;
  type: "has_context_child";
  source: string;
  target: string;
}

export interface CominContextSupportedByPostEdge {
  id: string;
  type: "supported_by_post";
  source: string;
  target: string;
  supporting_contribution_ids: string[];
  supporting_contribution_count: number;
}

export type CominContextChildrenGraphEdge =
  | CominContextChildEdge
  | CominContextSupportedByPostEdge;

export interface CominContextChildrenGraphResponse {
  status: "ok";
  graph_version: "context-children-graph-v1";
  build_id: string;
  generated_at_utc: string | null;
  theme_id: string;
  node_count: number;
  edge_count: number;
  nodes: CominContextChildrenGraphNode[];
  edges: CominContextChildrenGraphEdge[];
}
