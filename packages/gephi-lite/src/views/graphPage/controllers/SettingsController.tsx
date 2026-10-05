import { useSigma } from "@react-sigma/core";
import { FC, useEffect, useRef } from "react";
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

  const lineWidths = lines.map(
    (wrappedLine) => context.measureText(wrappedLine).width,
  );

  context.restore();

  const cominData = data as typeof data & {
    cominRadialLabel?: boolean;
    cominLabelPlacement?:
      | "left"
      | "right"
      | "top"
      | "bottom";
    cominLabelLaneIndex?: number;
    cominLabelLaneCount?: number;
  };

  const radial =
    cominData.cominRadialLabel === true;

  const lineHeight =
    settings.labelSize * COMIN_LABEL_LINE_HEIGHT;

  const centeredOffset =
    ((lines.length - 1) * lineHeight) / 2;

  const placement =
    radial
      ? cominData.cominLabelPlacement || "right"
      : "right";

  const laneIndex =
    cominData.cominLabelLaneIndex ?? 0;

  const laneCount =
    cominData.cominLabelLaneCount ?? 1;

  const discOffset = data.size + 3;
  const verticalGap = 8;

  lines.forEach((wrappedLine, index) => {
    const width = lineWidths[index];

    let x = data.x;
    let y =
      data.y -
      centeredOffset +
      index * lineHeight;

    // Les titres latéraux utilisent des couloirs verticaux
    // stables pour éviter les collisions.
    if (
      (placement === "left" ||
        placement === "right") &&
      laneCount > 1
    ) {
      const laneMargin = Math.max(
        90,
        context.canvas.height * 0.16,
      );

      const usableHeight =
        context.canvas.height -
        2 * laneMargin;

      const laneY =
        laneMargin +
        (laneIndex / (laneCount - 1)) *
          usableHeight;

      y =
        laneY -
        centeredOffset +
        index * lineHeight;
    }

    if (placement === "left") {
      x =
        data.x -
        2 * discOffset -
        width;
    }

    if (placement === "top") {
      x =
        data.x -
        width / 2 -
        discOffset;

      y =
        data.y -
        data.size -
        verticalGap -
        (lines.length - index) * lineHeight;
    }

    if (placement === "bottom") {
      x =
        data.x -
        width / 2 -
        discOffset;

      y =
        data.y +
        data.size +
        verticalGap +
        index * lineHeight;
    }

    drawDiscNodeLabel(
      context,
      {
        ...data,
        x,
        y,
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
  const initialCameraReadyRef = useRef(false);

  useEffect(() => {
    sigmaAtom.set(sigma);

    if (initialCameraReadyRef.current) return;
    if (!Object.keys(graphDataset.nodeData).length) return;

    const isCominGraph = Object.values(
      graphDataset.nodeData,
    ).some(
      (data) =>
        data?.type === "context" ||
        data?.type === "context_unit" ||
        data?.type === "post" ||
        data?.type === "source",
    );

    resetCamera({
      forceRefresh: true,
      padding: isCominGraph ? 0.28 : 0,
    });

    initialCameraReadyRef.current = true;
  }, [graphDataset.nodeData, sigma]);

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
