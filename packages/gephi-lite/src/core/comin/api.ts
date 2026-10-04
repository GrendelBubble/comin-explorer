import Graph from "graphology";

import {
  CominContextGraphResponse,
  cominContextGraphToGraph,
} from "./contextGraph";

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
