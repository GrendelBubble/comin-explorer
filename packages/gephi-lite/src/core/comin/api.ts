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
