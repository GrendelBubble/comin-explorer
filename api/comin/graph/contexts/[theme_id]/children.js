module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const graphUrl = process.env.COMIN_CONTEXT_GRAPH_URL;
  const apiKey = process.env.COMIN_API_KEY;
  const rawThemeId = request.query.theme_id;
  const themeId = Array.isArray(rawThemeId) ? rawThemeId[0] : rawThemeId;

  if (!graphUrl || !apiKey) {
    return response.status(500).json({
      error: "Com'In backend configuration is missing",
    });
  }

  if (!themeId || !/^[A-Za-z0-9_-]+$/.test(themeId)) {
    return response.status(400).json({
      error: "Invalid Com'In theme id",
    });
  }

  const baseUrl = graphUrl.replace(/\/graph\/contexts\/?$/, "");

  if (baseUrl === graphUrl) {
    return response.status(500).json({
      error: "Invalid Com'In graph backend configuration",
    });
  }

  const backendUrl =
    `${baseUrl}/graph/contexts/${encodeURIComponent(themeId)}/children`;

  try {
    const upstream = await fetch(backendUrl, {
      headers: {
        Accept: "application/json",
        "X-ComIn-API-Key": apiKey,
      },
    });

    const body = await upstream.text();

    response.status(upstream.status);
    response.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json",
    );
    response.setHeader("Cache-Control", "no-store, max-age=0");

    return response.send(body);
  } catch {
    return response.status(502).json({
      error: "Unable to reach Com'In backend",
    });
  }
};
