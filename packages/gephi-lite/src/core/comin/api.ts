import Graph from "graphology";

import {
  CominContextGraphResponse,
  cominContextGraphToGraph,
} from "./contextGraph";
import { CominContextPostsGraphResponse } from "./contextPostsGraph";
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


export async function fetchCominContextPostsGraph(
  themeId: string,
): Promise<CominContextPostsGraphResponse> {
  const response = await fetch(
    `/comin-api/graph/contexts/${encodeURIComponent(themeId)}/posts`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Com'In context posts request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as CominContextPostsGraphResponse;

  if (
    data.status !== "ok" ||
    data.graph_version !== "context-posts-graph-v1" ||
    data.theme_id !== themeId ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges)
  ) {
    throw new Error("Invalid Com'In context posts graph response");
  }

  return data;
}
