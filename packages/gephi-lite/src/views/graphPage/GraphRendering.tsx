import { SigmaContainer } from "@react-sigma/core";
import { createNodeImageProgram } from "@sigma/node-image";
import cx from "classnames";
import { FC, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "sigma/settings";

import GraphCaption from "../../components/GraphCaption";
import {
  ExitFullScreenIcon,
  FullScreenIcon,
  GraphSelectionModeIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ZoomResetIcon,
} from "../../components/common-icons";
import {
  useAppearance,
  useGraphDataset,
  useLayoutState,
  useSelection,
  useSelectionActions,
  useSigmaAtom,
  useSigmaGraph,
  useSigmaState,
} from "../../core/context/dataContexts";
import {
  CominContextChildPostNode,
  CominContextSemanticNode,
} from "../../core/comin/contextChildrenGraph";
import { fetchCominContextChildrenGraph } from "../../core/comin/api";
import type { CominDeepSearchTarget } from "../../core/comin/deepSearch";
import { COMIN_UI } from "../../core/comin/uiPreset";
import { GRAPH_SELECTION_MODES } from "../../core/selection/types";
import { resetCamera } from "../../core/sigma";
import NodeProgramBorder from "../../utils/bordered-node-program";
import NodeProgramDiamond from "../../utils/diamond-node-program";
import { AppearanceController } from "./controllers/AppearanceController";
import { EventsController } from "./controllers/EventsController";
import { GridController } from "./controllers/GridController";
import { SelectionController } from "./controllers/SelectionController";
import { SettingsController } from "./controllers/SettingsController";
import { TouchMagnifierController } from "./controllers/TouchMagnifierController";
import { ContextSemanticReader } from "./ContextSemanticReader";
import { RelationNoteReader, type RelationNoteItem } from "./RelationNoteReader";
import {
  PostNoteReader,
  PostNoteReaderItem,
} from "./PostNoteReader";

function useFullScreen(): { toggle: () => void; isFullScreen: boolean } {
  const [isFullScreen, setFullScreen] = useState<boolean>(false);
  const container = document.body;

  useEffect(() => {
    const toggleState = () => setFullScreen((v) => !v);
    document.addEventListener("fullscreenchange", toggleState);
    return () => document.removeEventListener("fullscreenchange", toggleState);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement !== container) {
      container.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [container]);

  return {
    toggle,
    isFullScreen,
  };
}

const InteractionsController: FC = () => {
  const { t } = useTranslation();
  const { setMode } = useSelectionActions();
  const { graphSelectionMode } = useSelection();
  const { isFullScreen, toggle } = useFullScreen();
  const sigma = useSigmaAtom();

  const btnClassName = "gl-btn gl-btn-icon gl-btn-outline bg-body";
  const zoomOptions = { duration: 200, factor: 1.5 };

  return (
    <div className="position-absolute d-flex flex-column sigma-controls gl-gap-1" style={{ right: 10, bottom: 10 }}>
      {GRAPH_SELECTION_MODES.map((mode) => (
        <button
          key={mode}
          className={cx("gl-btn gl-btn-icon", mode === graphSelectionMode ? "gl-btn-fill" : "gl-btn-outline bg-body")}
          onClick={() => setMode(mode)}
          title={t(`selection.${mode}`)}
        >
          <GraphSelectionModeIcon mode={mode} fill={mode === graphSelectionMode} />
        </button>
      ))}

      <br className="mb-2" />

      <button
        className={btnClassName}
        onClick={() => sigma.getCamera().animatedZoom(zoomOptions)}
        title={t("graph.control.zoomIn")}
      >
        <ZoomInIcon />
      </button>
      <button
        className={btnClassName}
        onClick={() => sigma.getCamera().animatedUnzoom(zoomOptions)}
        title={t("graph.control.zoomOut")}
      >
        <ZoomOutIcon />
      </button>
      <button
        className={btnClassName}
        onClick={() => resetCamera({ forceRefresh: true, source: "sigma" })}
        title={t("graph.control.zoomReset")}
      >
        <ZoomResetIcon />
      </button>
      {document.fullscreenEnabled && (
        <button
          className={btnClassName}
          onClick={() => toggle()}
          title={isFullScreen ? t("graph.control.fullscreenExit") : t("graph.control.fullscreenEnter")}
        >
          {isFullScreen ? <ExitFullScreenIcon /> : <FullScreenIcon />}
        </button>
      )}
    </div>
  );
};

const GraphCaptionLayer: FC = () => {
  return (
    <div className="position-absolute sigma-controls" style={{ left: 10, bottom: 10, marginRight: "4em" }}>
      <GraphCaption minimal />
    </div>
  );
};

interface CominHoverLabelProps {
  onActivateNode: (
    nodeId: string,
  ) => void;
  searchPreviewItem:
    CominDeepSearchTarget | null;
}

const CominHoverLabel: FC<CominHoverLabelProps> = ({
  onActivateNode,
  searchPreviewItem,
}) => {
  const { nodeData } = useGraphDataset();
  const { hoveredNode } = useSigmaState();

  /*
   * Le cartouche reste brièvement affiché lorsque le pointeur
   * quitte le nœud afin qu'il soit réellement atteignable.
   */
  const [displayedNode, setDisplayedNode] =
    useState<string | null>(null);
  const [labelHovered, setLabelHovered] =
    useState(false);

  useEffect(() => {
    if (hoveredNode) {
      setDisplayedNode(hoveredNode);
      return;
    }

    if (labelHovered) return;

    const timeout = window.setTimeout(
      () => setDisplayedNode(null),
      2000,
    );

    return () => window.clearTimeout(timeout);
  }, [hoveredNode, labelHovered]);

  const data =
    displayedNode
      ? nodeData[
          displayedNode
        ]
      : undefined;

  if (
    !searchPreviewItem &&
    !data
  ) {
    return null;
  }

  /*
   * Un objet réellement survolé dans le graphe est prioritaire
   * sur la dernière sélection issue de la recherche.
   *
   * displayedNode reste brièvement mémorisé après la sortie
   * du nœud afin de permettre d'atteindre le cartouche.
   */
  const rawLabel =
    data?.label ??
    searchPreviewItem?.label;

  const label =
    typeof rawLabel === "string"
      ? rawLabel.trim()
      : "";

  if (!label) return null;

  const itemType =
    data?.type ??
    searchPreviewItem?.type;

  let borderColor: string =
    COMIN_UI.nodes.post.borderColor;

  if (itemType === "context") {
    borderColor =
      COMIN_UI.nodes.context.color;
  } else if (
    itemType === "context_semantic" ||
    itemType === "context_unit"
  ) {
    borderColor =
      COMIN_UI.nodes.contextSemantic.color;
  } else if (itemType === "post") {
    borderColor =
      typeof data?.post_type_color === "string" &&
      data.post_type_color.trim()
        ? data.post_type_color
        : COMIN_UI.nodes.post.color;
  } else if (itemType === "source") {
    borderColor =
      COMIN_UI.nodes.source.color;
  } else if (itemType === "container") {
    borderColor =
      COMIN_UI.nodes.structuralSource.borderColor;
  }

  const activateNode = () => {
    /*
     * Le cartouche doit également agir sur ce qu'il affiche :
     * un nœud survolé passe avant la sélection de recherche.
     */
    if (
      displayedNode &&
      data
    ) {
      onActivateNode(
        displayedNode,
      );
      return;
    }

    if (searchPreviewItem) {
      window.dispatchEvent(
        new CustomEvent(
          "comin-reveal-search-target",
          {
            detail:
              searchPreviewItem,
          },
        ),
      );
    }
  };

  return (
    <button
      type="button"
      className="position-fixed"
      onMouseEnter={() => setLabelHovered(true)}
      onMouseLeave={() => setLabelHovered(false)}
      onPointerDown={(event) =>
        event.stopPropagation()
      }
      onMouseDown={(event) =>
        event.stopPropagation()
      }
      onClick={(event) => {
        event.stopPropagation();
        activateNode();
      }}
      onDoubleClick={(event) =>
        event.stopPropagation()
      }
      style={{
        left: "50%",
        top: 12,
        transform: "translateX(-50%)",
        maxWidth: "70%",
        padding: "7px 12px",
        backgroundColor: COMIN_UI.background,
        color: "inherit",
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        fontSize: 14,
        fontFamily: "inherit",
        lineHeight: 1.3,
        fontWeight: 500,
        textAlign: "center",
        pointerEvents: "auto",
        cursor: "pointer",
        zIndex: 150,
        boxShadow:
          "0 2px 8px rgba(0, 0, 0, 0.08)",
      }}
    >
      {label}
    </button>
  );
};

const NodeImageProgram = createNodeImageProgram({
  size: {
    mode: "max",
    value: 256,
  },
});
const sigmaSettings: Partial<Settings> = {
  labelFont: "'DM Sans', sans-serif",
  edgeLabelFont: "'DM Sans', sans-serif",
  enableEdgeEvents: true,
  renderEdgeLabels: true,
  zIndex: true,
  minEdgeThickness: 0.3,
  itemSizesReference: "positions",
  zoomToSizeRatioFunction: (x) => x,
  defaultNodeType: "image",
  nodeProgramClasses: {
    image: NodeImageProgram,
    bordered: NodeProgramBorder,
    diamond: NodeProgramDiamond,
  },
  allowInvalidContainer: true,
};
interface GraphRenderingProps {
  searchPreviewItem:
    CominDeepSearchTarget | null;
}

export const GraphRendering: FC<
  GraphRenderingProps
> = ({
  searchPreviewItem,
}) => {
  const [contextSemanticItem, setContextSemanticItem] =
    useState<CominContextSemanticNode | null>(null);
  const [postNoteItem, setPostNoteItem] =
    useState<PostNoteReaderItem | null>(null);
  const [relationNoteItem, setRelationNoteItem] = useState<RelationNoteItem | null>(null);
  const [expandedThemeId, setExpandedThemeId] =
    useState<string | null>(null);
  const [isMobileTouch, setIsMobileTouch] = useState(
    () => window.matchMedia("(pointer: coarse)").matches,
  );
  const [mobileReadError, setMobileReadError] =
    useState<string | null>(null);

  useEffect(() => {
    const markTouch = () => setIsMobileTouch(true);
    window.addEventListener("touchstart", markTouch, { passive: true });
    return () => window.removeEventListener("touchstart", markTouch);
  }, []);

  const nodeActivatorRef = useRef<
    ((nodeId: string) => void) | null
  >(null);

  const registerNodeActivator = useCallback(
    (
      activator:
        | ((nodeId: string) => void)
        | null,
    ) => {
      nodeActivatorRef.current = activator;
    },
    [],
  );

  const activateNodeFromLabel = useCallback(
    (nodeId: string) => {
      if (isMobileTouch) {
        window.dispatchEvent(
          new CustomEvent("comin-mobile-activate-node", {
            detail: { nodeId },
          }),
        );
      } else {
        nodeActivatorRef.current?.(nodeId);
      }
    },
    [isMobileTouch],
  );
  const { backgroundColor, layoutGridColor } = useAppearance();
  const { nodeData, edgeData, fullGraph } = useGraphDataset();
  const selection = useSelection();
  const sigmaGraph = useSigmaGraph();

  const isCominGraph = Object.values(nodeData).some(
    (data) =>
      data?.type === "context" ||
      data?.type === "post" ||
      data?.type === "source" ||
      data?.type === "container",
  );
  const { quality } = useLayoutState();
  const { hoveredNode, hoveredEdge, customCursor } = useSigmaState();
  const [isReady, setIsReady] = useState(false);
  const setReady = useCallback(() => {
    setIsReady(true);
  }, [setIsReady]);

  const selectedId =
    selection.items.size === 1
      ? Array.from(selection.items)[0]
      : null;

  const selectedNode =
    selection.type === "nodes" && selectedId
      ? nodeData[selectedId]
      : null;

  const selectedEdge =
    selection.type === "edges" && selectedId
      ? edgeData[selectedId]
      : null;

  const relationEndpoints =
    selectedEdge?.type === "related" &&
    selectedId &&
    fullGraph.hasEdge(selectedId)
      ? {
          source: nodeData[fullGraph.source(selectedId)],
          target: nodeData[fullGraph.target(selectedId)],
        }
      : null;

  const validRelation =
    relationEndpoints?.source?.type === "context" &&
    relationEndpoints?.target?.type === "context";

  const readableNode =
    selectedNode &&
    typeof selectedNode.type === "string" &&
    [
      "context",
      "context_semantic",
      "post",
      "source",
      "container",
    ].includes(selectedNode.type);

  const selectedLabel = selectedNode
    ? String(selectedNode.label ?? "")
    : validRelation && relationEndpoints
      ? `${relationEndpoints.source.label} ↔ ${relationEndpoints.target.label}`
      : "";

  const readMobileSelection = async () => {
    setMobileReadError(null);

    if (selectedNode?.type === "context") {
      const themeId = selectedNode.theme_id;
      if (typeof themeId !== "string") return;

      try {
        const data = await fetchCominContextChildrenGraph(themeId);
        const synthesis = data.nodes.find(
          (node): node is CominContextSemanticNode =>
            node.type === "context_semantic" &&
            node.semantic_kind === "synthese",
        );
        if (!synthesis) throw new Error("Synthèse indisponible.");

        setPostNoteItem(null);
        setRelationNoteItem(null);
        setContextSemanticItem(synthesis);
      } catch {
        setMobileReadError("Impossible de charger la synthèse.");
      }
      return;
    }

    if (selectedNode?.type === "context_semantic") {
      setPostNoteItem(null);
      setRelationNoteItem(null);
      setContextSemanticItem(
        selectedNode as unknown as CominContextSemanticNode,
      );
      return;
    }

    if (
      selectedNode?.type === "post" &&
      typeof selectedNode.post_id === "number"
    ) {
      setContextSemanticItem(null);
      setRelationNoteItem(null);
      setPostNoteItem({
        postId: selectedNode.post_id,
        label: String(selectedNode.label ?? ""),
        url: typeof selectedNode.url === "string"
          ? selectedNode.url : undefined,
      });
      return;
    }

    if (
      selectedNode?.type === "source" ||
      selectedNode?.type === "container"
    ) {
      const postId = Number(
        (selectedNode as { cominPostId?: unknown }).cominPostId,
      );
      if (postId > 0) {
        setContextSemanticItem(null);
        setRelationNoteItem(null);
        setPostNoteItem({
          postId,
          label: String(selectedNode.label ?? ""),
          url: typeof selectedNode.url === "string"
            ? selectedNode.url : undefined,
          sourceId: selectedNode.type === "source"
            ? Number(selectedNode.source_id) : undefined,
          isContainer: selectedNode.type === "container",
        });
      } else {
        setMobileReadError("Note de cette source indisponible.");
      }
      return;
    }

    if (
      validRelation &&
      relationEndpoints &&
      typeof relationEndpoints.source.theme_id === "string" &&
      typeof relationEndpoints.target.theme_id === "string"
    ) {
      setContextSemanticItem(null);
      setPostNoteItem(null);
      setRelationNoteItem({
        source: {
          themeId: relationEndpoints.source.theme_id,
          label: String(relationEndpoints.source.label),
        },
        target: {
          themeId: relationEndpoints.target.theme_id,
          label: String(relationEndpoints.target.label),
        },
        reciprocal: selectedEdge?.reciprocal === true,
      });
    }
  };

  const closeTransientPanels = useCallback(() => {
    setContextSemanticItem(null);
    setPostNoteItem(null);
    setRelationNoteItem(null);
  }, []);

  return (
    <>
      <SigmaContainer
        className={cx(
          !isReady && "visually-hidden",
          customCursor ? `cursor-${customCursor}` : (hoveredNode || hoveredEdge) && "cursor-pointer",
        )}
        style={{
          backgroundColor: isCominGraph
            ? COMIN_UI.background
            : backgroundColor,
        }}
        graph={sigmaGraph}
        settings={{
          ...sigmaSettings,
          minEdgeThickness: 0.3,
        }}
      >
        <EventsController
          onOpenContextSemantic={(item) => {
            setRelationNoteItem(null);
            setPostNoteItem(null);
            setContextSemanticItem(item);
          }}
          onOpenPostNote={(post: CominContextChildPostNode) => {
            setRelationNoteItem(null);
            setContextSemanticItem(null);
            setPostNoteItem({
              postId: post.post_id,
              label: post.label,
              url: post.url,
            });
          }}
          onOpenSourceNote={(source, postId) => {
            setRelationNoteItem(null);
            setContextSemanticItem(null);
            setPostNoteItem({
              postId,
              label: source.label,
              url: source.url,
              sourceId: source.source_id,
              isContainer: source.type === "container",
            });
          }}
          onOpenRelationNote={(relation) => {
            setContextSemanticItem(null);
            setPostNoteItem(null);
            setRelationNoteItem(relation);
          }}
          onCloseTransientPanels={closeTransientPanels}
          onNodeActivatorReady={registerNodeActivator}
          onExpandedThemeChange={setExpandedThemeId}
        />
        <AppearanceController
          expandedThemeId={expandedThemeId}
        />
        <SettingsController setIsReady={setReady} />
        <TouchMagnifierController />
        <div className="sigma-layers">
          {quality.enabled && quality.showGrid && quality.metric?.deltaMax && (
            <GridController
              size={quality.metric.deltaMax}
              opacity={quality.metric?.cMax || 0}
              color={layoutGridColor}
            />
          )}
          <SelectionController />
        </div>
        <InteractionsController />
        <GraphCaptionLayer />
      </SigmaContainer>

      {isCominGraph && (
        <CominHoverLabel
          onActivateNode={
            activateNodeFromLabel
          }
          searchPreviewItem={
            searchPreviewItem
          }
        />
      )}

      {isMobileTouch &&
        selectedId &&
        (readableNode || validRelation) &&
        !contextSemanticItem &&
        !postNoteItem &&
        !relationNoteItem && (
          <div
            role="region"
            aria-label="Objet sélectionné"
            className="position-fixed bg-body border rounded shadow p-2"
            style={{
              left: 8,
              bottom: "calc(76px + env(safe-area-inset-bottom))",
              maxWidth: "min(350px, calc(100vw - 85px))",
              zIndex: 180,
            }}
          >
            <div className="small fw-bold mb-2">
              {selectedLabel}
            </div>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => { void readMobileSelection(); }}
              >
                Lire la note
              </button>
              {selectedNode?.type === "post" &&
                typeof selectedNode.url === "string" && (
                  <a
                    href={selectedNode.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="small"
                  >
                    Voir sur Com’In
                  </a>
                )}
            </div>
            {mobileReadError && (
              <p className="small text-danger mt-2 mb-0">
                {mobileReadError}
              </p>
            )}
          </div>
        )}

      <RelationNoteReader
        item={relationNoteItem}
        onClose={() => setRelationNoteItem(null)}
        onOpenContext={(item) => {
          setRelationNoteItem(null);
          setPostNoteItem(null);
          setContextSemanticItem(item);
        }}
        onOpenPost={(item) => {
          setRelationNoteItem(null);
          setContextSemanticItem(null);
          setPostNoteItem({
            postId: item.post_id,
            label: item.label,
            url: item.url,
          });
        }}
      />
      <ContextSemanticReader
        item={contextSemanticItem}
        onClose={() => setContextSemanticItem(null)}
        onOpenPost={(post) => {
          setPostNoteItem({
            postId: post.post_id,
            label: post.label,
            url: post.url,
            returnContext: contextSemanticItem ?? undefined,
          });
          setContextSemanticItem(null);
        }}
      />
      <PostNoteReader
        item={postNoteItem}
        onClose={() => setPostNoteItem(null)}
        onReturnToContext={(context) => {
          setPostNoteItem(null);
          setContextSemanticItem(context);
        }}
      />
    </>
  );
};
