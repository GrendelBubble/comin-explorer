export type CominDeepSearchTargetType =
  | "context"
  | "post"
  | "source";

export interface CominDeepSearchTarget {
  type: CominDeepSearchTargetType;
  label: string;
  themeId?: string;
  postId?: number;
  sourceId?: number;
  url?: string;
  excerpt?: string;
  score?: number;
}
