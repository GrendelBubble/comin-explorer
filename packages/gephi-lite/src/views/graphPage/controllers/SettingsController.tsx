import { useSigma } from "@react-sigma/core";
import { FC, useEffect } from "react";
import { NodeLabelDrawingFunction, drawDiscNodeLabel, drawStraightEdgeLabel } from "sigma/rendering";
import { DEFAULT_SETTINGS, Settings } from "sigma/settings";

import { getDrawEdgeLabel, getDrawNodeLabel } from "../../../core/appearance/utils";
import { useAppearance, useGraphDataset, usePreferences } from "../../../core/context/dataContexts";
import { getAppliedTheme } from "../../../core/preferences/utils";
import { GephiLiteSigma, resetCamera, sigmaAtom } from "../../../core/sigma";
import { drawDiscNodeHover } from "../../../core/sigma/utils";
import { inputToStateThreshold } from "../../../utils/labels";

const COMIN_LABEL_MAX_WIDTH = 280;
const COMIN_LABEL_LINE_HEIGHT = 1.2;

const drawWrappedDiscNodeLabel: NodeLabelDrawingFunction = (
  context,
  data,
  settings,
) => {
  if (!data.label) return;

  context.save();
  context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`;

  const words = data.label.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;

    if (
      line &&
      context.measureText(candidate).width > COMIN_LABEL_MAX_WIDTH
    ) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });

  if (line) lines.push(line);
  context.restore();

  const lineHeight = settings.labelSize * COMIN_LABEL_LINE_HEIGHT;
  const offset = ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((wrappedLine, index) => {
    drawDiscNodeLabel(
      context,
      {
        ...data,
        y: data.y - offset + index * lineHeight,
        label: wrappedLine,
      },
      settings,
    );
  });
};

export const SettingsController: FC<{ setIsReady: () => void }> = ({ setIsReady }) => {
  const sigma = useSigma() as GephiLiteSigma;
  const graphDataset = useGraphDataset();
  const graphAppearance = useAppearance();
  const { theme } = usePreferences();

  useEffect(() => {
    sigmaAtom.set(sigma);
    resetCamera({ forceRefresh: true });
  }, [sigma]);

  useEffect(() => {
    const mode = getAppliedTheme(theme);
    sigma.setSetting("labelColor", { color: mode === "dark" ? "#FFF" : "#000" });
    sigma.setSetting("edgeLabelColor", { color: mode === "dark" ? "#495057" : "#CCC" });
    sigma.setSetting("nodeHoverBackgroundColor" as keyof Settings, mode === "dark" ? "#000" : "#FFF");
    sigma.setSetting("renderEdgeLabels", graphAppearance.edgesLabel.type !== "none");
    sigma.setSetting("zIndex", graphAppearance.edgesZIndex.type !== "none");
    const isCominGraph = Object.values(graphDataset.nodeData).some(
      (data) =>
        data?.type === "context" ||
        data?.type === "context_unit" ||
        data?.type === "post" ||
        data?.type === "source",
    );

    sigma.setSetting(
      "defaultDrawNodeLabel",
      getDrawNodeLabel(
        graphAppearance,
        isCominGraph ? drawWrappedDiscNodeLabel : drawDiscNodeLabel,
      ),
    );
    sigma.setSetting(
      "defaultDrawNodeHover",
      getDrawNodeLabel(
        graphAppearance,
        isCominGraph ? drawWrappedDiscNodeLabel : drawDiscNodeHover,
      ),
    );
    sigma.setSetting("defaultDrawEdgeLabel", getDrawEdgeLabel(graphAppearance, drawStraightEdgeLabel));

    const labelThreshold = inputToStateThreshold(graphAppearance.nodesLabelSize.density);

    if (isCominGraph) {
      sigma.setSetting("labelRenderedSizeThreshold", 0);
      sigma.setSetting("labelDensity", 0.65);
      sigma.setSetting("labelGridCellSize", 140);
    } else {
      const labelDensity =
        labelThreshold === 0
          ? Infinity
          : DEFAULT_SETTINGS.labelDensity;

      sigma.setSetting(
        "labelRenderedSizeThreshold",
        labelThreshold,
      );
      sigma.setSetting("labelDensity", labelDensity);
      sigma.setSetting(
        "labelGridCellSize",
        DEFAULT_SETTINGS.labelGridCellSize,
      );
    }

    setIsReady();
  }, [graphAppearance, graphDataset, setIsReady, sigma, theme]);

  return null;
};
