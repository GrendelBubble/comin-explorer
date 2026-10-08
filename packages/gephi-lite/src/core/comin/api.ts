import Graph from "graphology";

import {
  CominContextGraphResponse,
  cominContextGraphToGraph,
} from "./contextGraph";
import { CominContextChildrenGraphResponse } from "./contextChildrenGraph";
import { CominContextUnitsGraphResponse } from "./contextUnitsGraph";

const CONTEXT_GRAPH_ENDPOINT = "/comin-api/graph/contexts";

export async function fetchCominContextGraph(): Promise<Graph> {
  const response = await fetch(CONTEXT_GRAPH_ENDPOINT, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Com'In context graph request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as CominContextGraphResponse;

  if (
    data.status !== "ok" ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges)
  ) {
    throw new Error("Invalid Com'In context graph response");
  }

  return cominContextGraphToGraph(data);
}


export async function fetchCominContextUnitsGraph(
  themeId: string,
): Promise<CominContextUnitsGraphResponse> {
  const response = await fetch(
    `/comin-api/graph/contexts/${encodeURIComponent(themeId)}/units`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Com'In context units request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as CominContextUnitsGraphResponse;

  if (
    data.status !== "ok" ||
    data.theme_id !== themeId ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges)
  ) {
    throw new Error("Invalid Com'In context units graph response");
  }

  return data;
}


export async function fetchCominContextChildrenGraph(
  themeId: string,
): Promise<CominContextChildrenGraphResponse> {
  const response = await fetch(
    `/comin-api/graph/contexts/${encodeURIComponent(themeId)}/children`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Com'In context children request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as CominContextChildrenGraphResponse;

  if (
    data.status !== "ok" ||
    data.graph_version !== "context-children-graph-v1" ||
    data.theme_id !== themeId ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges)
  ) {
    throw new Error("Invalid Com'In context children graph response");
  }

  return data;
}


export interface CominPostNoteResponse {
  status: "ok";
  post_id: number;
  title: string;
  note_hash: string;
  markdown: string;
}

export async function fetchCominPostNote(
  postId: number,
): Promise<CominPostNoteResponse> {
  const response = await fetch(
    `/comin-api/graph/posts/${encodeURIComponent(String(postId))}/note`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Fiche de lecture indisponible : ${response.status}`,
    );
  }

  const data =
    (await response.json()) as CominPostNoteResponse;

  if (
    data.status !== "ok" ||
    data.post_id !== postId ||
    typeof data.markdown !== "string"
  ) {
    throw new Error("Fiche de lecture invalide.");
  }

  return data;
}

import type { CominPostSourcesGraphResponse } from "./postSourcesGraph";

export async function fetchCominPostSourcesGraph(
  postId: number,
): Promise<CominPostSourcesGraphResponse> {
  const response = await fetch(
    `/comin-api/graph/posts/${encodeURIComponent(String(postId))}/sources`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Sources du post indisponibles : ${response.status}`,
    );
  }

  const data =
    (await response.json()) as CominPostSourcesGraphResponse;

  if (
    data.status !== "ok" ||
    data.graph_version !== "post-sources-graph-v1" ||
    data.post_id !== postId ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges)
  ) {
    throw new Error("Graphe des sources invalide.");
  }

  return data;
}

export interface CominContextSearchResult {
  theme_id: string;
  title: string;
  score: number;
  post_ids: number[];
}

export interface CominContextSearchResponse {
  status: "ok";
  result_count: number;
  results: CominContextSearchResult[];
}

export interface CominContributionSearchPost {
  post_id: number;
  source_ids: number[];
  title: string;
  post_type: string;
}

export interface CominContributionSearchResult {
  contribution_id: number;
  source_id: number;
  text: string;
  keywords: string;
  score: number;
  source: {
    title: string;
    url: string;
    source_type: string;
  };
}

export interface CominContributionSearchResponse {
  status: "ok";
  result_count: number;
  posts?: CominContributionSearchPost[];
  results: CominContributionSearchResult[];
}

export async function searchCominContexts(
  query: string,
): Promise<CominContextSearchResponse> {
  const response = await fetch(
    `/comin-api/search/contexts?query=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Recherche des contextes indisponible : ${response.status}`,
    );
  }

  return (await response.json()) as CominContextSearchResponse;
}

export async function searchCominContributions(
  query: string,
): Promise<CominContributionSearchResponse> {
  const response = await fetch(
    `/comin-api/search/contributions?query=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Recherche profonde indisponible : ${response.status}`,
    );
  }

  return (await response.json()) as CominContributionSearchResponse;
}
