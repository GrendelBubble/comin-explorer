export interface CominContextUnitsContextNode {
  id: string;
  type: "context";
  theme_id: string;
  label: string;
}

export interface CominContextUnitNode {
  id: string;
  type: "context_unit";
  unit_id: string;
  theme_id: string;
  section: string;
  label: string;
  text: string;
  support_mode: "all" | "any";
  supporting_contribution_ids: string[];
  active_supporting_contribution_ids: string[];
}

export type CominContextUnitsGraphNode =
  | CominContextUnitsContextNode
  | CominContextUnitNode;

export interface CominContextUnitsGraphEdge {
  id: string;
  type: "contains";
  source: string;
  target: string;
}

export interface CominContextUnitsGraphResponse {
  status: "ok";
  graph_version: string;
  build_id: string;
  generated_at_utc: string;
  theme_id: string;
  node_count: number;
  edge_count: number;
  nodes: CominContextUnitsGraphNode[];
  edges: CominContextUnitsGraphEdge[];
}
