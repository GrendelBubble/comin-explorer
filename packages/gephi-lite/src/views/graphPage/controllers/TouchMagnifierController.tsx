import { useSigma } from "@react-sigma/core";
import {
  FC,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useSigmaActions,
} from "../../../core/context/dataContexts";
import { COMIN_UI } from "../../../core/comin/uiPreset";

const LONG_PRESS_MS = 220;
const START_MOVE_TOLERANCE = 8;

const LENS_SIZE = 112;
const LENS_ZOOM = 2.2;

// Zone de détection volontairement beaucoup plus grande
// que les petites pastilles affichées.
const TOUCH_HIT_RADIUS = 30;

type TouchState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  active: boolean;
};

export const TouchMagnifierController: FC = () => {
  const sigma = useSigma();

  const {
    setHoveredNode,
    resetHoveredNode,
  } = useSigmaActions();

  const lensRef =
    useRef<HTMLCanvasElement | null>(null);

  const touchRef =
    useRef<TouchState | null>(null);

  const timerRef =
    useRef<number | null>(null);

  const touchHoveredNodeRef =
    useRef<string | null>(null);

  const [lensPosition, setLensPosition] =
    useState<{
      left: number;
      top: number;
    } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const setTouchHoveredNode = useCallback(
    (nodeId: string | null) => {
      if (
        touchHoveredNodeRef.current ===
        nodeId
      ) {
        return;
      }

      touchHoveredNodeRef.current =
        nodeId;

      if (nodeId) {
        setHoveredNode(nodeId);
      } else {
        resetHoveredNode();
      }
    },
    [
      resetHoveredNode,
      setHoveredNode,
    ],
  );

  const pickNearestNode = useCallback(
    (
      clientX: number,
      clientY: number,
    ) => {
      const container =
        sigma.getContainer();

      const rect =
        container.getBoundingClientRect();

      const pointerX =
        clientX - rect.left;

      const pointerY =
        clientY - rect.top;

      const graph = sigma.getGraph();

      let bestNode: string | null = null;
      let bestDistance = Infinity;

      graph.forEachNode((nodeId) => {
        const displayData =
          sigma.getNodeDisplayData(nodeId);

        // Ne pas sélectionner un nœud actuellement
        // masqué par les reducers.
        if (
          !displayData ||
          displayData.hidden
        ) {
          return;
        }

        const attributes =
          graph.getNodeAttributes(nodeId);

        const x = Number(attributes.x);
        const y = Number(attributes.y);

        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y)
        ) {
          return;
        }

        const viewport =
          sigma.graphToViewport({
            x,
            y,
          });

        const dx =
          viewport.x - pointerX;

        const dy =
          viewport.y - pointerY;

        const distance =
          Math.hypot(dx, dy);

        if (
          distance <= TOUCH_HIT_RADIUS &&
          distance < bestDistance
        ) {
          bestDistance = distance;
          bestNode = nodeId;
        }
      });

      return bestNode;
    },
    [sigma],
  );

  const positionLens = useCallback(
    (
      clientX: number,
      clientY: number,
    ) => {
      const rect =
        sigma
          .getContainer()
          .getBoundingClientRect();

      const half =
        LENS_SIZE / 2;

      const margin = 8;

      const localX =
        clientX - rect.left;

      const localY =
        clientY - rect.top;

      const clamp = (
        value: number,
        min: number,
        max: number,
      ) =>
        Math.max(
          min,
          Math.min(max, value),
        );

      const left = clamp(
        localX,
        half + margin,
        rect.width - half - margin,
      );

      // La loupe est normalement placée au-dessus
      // du doigt pour que celui-ci ne la masque pas.
      let top =
        localY -
        half -
        46;

      // Si nous sommes trop près du haut,
      // l'afficher sous le doigt.
      if (
        top - half <
        margin
      ) {
        top =
          localY +
          half +
          46;
      }

      top = clamp(
        top,
        half + margin,
        rect.height - half - margin,
      );

      setLensPosition({
        left,
        top,
      });
    },
    [sigma],
  );

  const drawLens = useCallback(
    (
      clientX: number,
      clientY: number,
    ) => {
      const lens =
        lensRef.current;

      if (!lens) return;

      const dpr =
        window.devicePixelRatio || 1;

      const pixelSize =
        Math.round(
          LENS_SIZE * dpr,
        );

      if (
        lens.width !== pixelSize ||
        lens.height !== pixelSize
      ) {
        lens.width = pixelSize;
        lens.height = pixelSize;
      }

      const context =
        lens.getContext("2d");

      if (!context) return;

      context.setTransform(
        1,
        0,
        0,
        1,
        0,
        0,
      );

      context.clearRect(
        0,
        0,
        lens.width,
        lens.height,
      );

      context.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0,
      );

      context.save();

      context.beginPath();
      context.arc(
        LENS_SIZE / 2,
        LENS_SIZE / 2,
        LENS_SIZE / 2 - 2,
        0,
        Math.PI * 2,
      );
      context.clip();

      context.fillStyle =
        COMIN_UI.background;

      context.fillRect(
        0,
        0,
        LENS_SIZE,
        LENS_SIZE,
      );

      const sourceSize =
        LENS_SIZE / LENS_ZOOM;

      const canvases = Array.from(
        sigma
          .getContainer()
          .querySelectorAll<HTMLCanvasElement>(
            "canvas",
          ),
      ).filter(
        (canvas) =>
          canvas !== lens &&
          canvas.width > 0 &&
          canvas.height > 0,
      );

      canvases.forEach((canvas) => {
        const rect =
          canvas.getBoundingClientRect();

        if (
          !rect.width ||
          !rect.height
        ) {
          return;
        }

        const scaleX =
          canvas.width /
          rect.width;

        const scaleY =
          canvas.height /
          rect.height;

        const localX =
          clientX - rect.left;

        const localY =
          clientY - rect.top;

        const sx =
          (
            localX -
            sourceSize / 2
          ) * scaleX;

        const sy =
          (
            localY -
            sourceSize / 2
          ) * scaleY;

        const sw =
          sourceSize * scaleX;

        const sh =
          sourceSize * scaleY;

        context.drawImage(
          canvas,
          sx,
          sy,
          sw,
          sh,
          0,
          0,
          LENS_SIZE,
          LENS_SIZE,
        );
      });

      context.restore();

      // Cerclage de la lentille.
      context.beginPath();

      context.arc(
        LENS_SIZE / 2,
        LENS_SIZE / 2,
        LENS_SIZE / 2 - 2,
        0,
        Math.PI * 2,
      );

      context.strokeStyle =
        "#1F3442";

      context.lineWidth = 2;

      context.stroke();
    },
    [sigma],
  );

  const exploreAt = useCallback(
    (
      clientX: number,
      clientY: number,
    ) => {
      positionLens(
        clientX,
        clientY,
      );

      drawLens(
        clientX,
        clientY,
      );

      const nodeId =
        pickNearestNode(
          clientX,
          clientY,
        );

      setTouchHoveredNode(nodeId);

      // Le changement de hover peut modifier
      // visuellement le nœud. Actualiser ensuite
      // la loupe sur la frame suivante.
      requestAnimationFrame(() => {
        drawLens(
          clientX,
          clientY,
        );
      });
    },
    [
      drawLens,
      pickNearestNode,
      positionLens,
      setTouchHoveredNode,
    ],
  );

  useEffect(() => {
    const container =
      sigma.getContainer();

    const coarsePointer =
      window.matchMedia(
        "(hover: none), (pointer: coarse)",
      );

    const stopExploration = (
      suppressTap: boolean,
    ) => {
      clearTimer();

      const state =
        touchRef.current;

      if (state?.active) {
        sigma
          .getCamera()
          .enable();

        if (suppressTap) {
          // Empêche le relâchement d'un appui long
          // d'être interprété ensuite comme un tap
          // sur le post, la source ou le container.
          container.dataset.cominSuppressTapUntil =
            String(
              Date.now() + 500,
            );
        }
      }

      touchRef.current = null;

      setLensPosition(null);
      setTouchHoveredNode(null);
    };

    const onPointerDown = (
      event: PointerEvent,
    ) => {
      if (
        !coarsePointer.matches ||
        event.pointerType === "mouse"
      ) {
        return;
      }

      // Un deuxième doigt annule le mode loupe
      // pour laisser les gestes multi-touch normaux.
      if (!event.isPrimary) {
        stopExploration(false);
        return;
      }

      clearTimer();

      touchRef.current = {
        pointerId:
          event.pointerId,
        startX:
          event.clientX,
        startY:
          event.clientY,
        lastX:
          event.clientX,
        lastY:
          event.clientY,
        active: false,
      };

      timerRef.current =
        window.setTimeout(() => {
          const state =
            touchRef.current;

          if (!state) return;

          state.active = true;

          // Le graphe ne doit plus bouger tant
          // que le doigt utilise la loupe.
          sigma
            .getCamera()
            .disable();

          exploreAt(
            state.lastX,
            state.lastY,
          );
        }, LONG_PRESS_MS);
    };

    const onPointerMove = (
      event: PointerEvent,
    ) => {
      const state =
        touchRef.current;

      if (
        !state ||
        state.pointerId !==
          event.pointerId
      ) {
        return;
      }

      state.lastX =
        event.clientX;

      state.lastY =
        event.clientY;

      if (!state.active) {
        const distance =
          Math.hypot(
            event.clientX -
              state.startX,
            event.clientY -
              state.startY,
          );

        // Le geste a commencé comme un balayage :
        // conserver le pan Sigma standard.
        if (
          distance >
          START_MOVE_TOLERANCE
        ) {
          clearTimer();
          touchRef.current = null;
        }

        return;
      }

      // Une fois la loupe activée,
      // le mouvement appartient à l'exploration.
      event.preventDefault();
      event.stopPropagation();

      exploreAt(
        event.clientX,
        event.clientY,
      );
    };

    const onPointerUp = (
      event: PointerEvent,
    ) => {
      const state =
        touchRef.current;

      if (
        !state ||
        state.pointerId !==
          event.pointerId
      ) {
        return;
      }

      stopExploration(
        state.active,
      );
    };

    const onPointerCancel = (
      event: PointerEvent,
    ) => {
      const state =
        touchRef.current;

      if (
        !state ||
        state.pointerId !==
          event.pointerId
      ) {
        return;
      }

      stopExploration(
        state.active,
      );
    };

    const onContextMenu = (
      event: MouseEvent,
    ) => {
      if (
        touchRef.current?.active
      ) {
        event.preventDefault();
      }
    };

    container.addEventListener(
      "pointerdown",
      onPointerDown,
      true,
    );

    container.addEventListener(
      "pointermove",
      onPointerMove,
      {
        capture: true,
        passive: false,
      },
    );

    container.addEventListener(
      "pointerup",
      onPointerUp,
      true,
    );

    container.addEventListener(
      "pointercancel",
      onPointerCancel,
      true,
    );

    container.addEventListener(
      "contextmenu",
      onContextMenu,
      true,
    );

    return () => {
      clearTimer();

      sigma
        .getCamera()
        .enable();

      container.removeEventListener(
        "pointerdown",
        onPointerDown,
        true,
      );

      container.removeEventListener(
        "pointermove",
        onPointerMove,
        true,
      );

      container.removeEventListener(
        "pointerup",
        onPointerUp,
        true,
      );

      container.removeEventListener(
        "pointercancel",
        onPointerCancel,
        true,
      );

      container.removeEventListener(
        "contextmenu",
        onContextMenu,
        true,
      );
    };
  }, [
    clearTimer,
    exploreAt,
    setTouchHoveredNode,
    sigma,
  ]);

  return (
    <canvas
      ref={lensRef}
      aria-hidden="true"
      className="position-absolute"
      style={{
        left:
          lensPosition?.left ?? 0,
        top:
          lensPosition?.top ?? 0,
        width: LENS_SIZE,
        height: LENS_SIZE,
        transform:
          "translate(-50%, -50%)",
        borderRadius: "50%",
        opacity:
          lensPosition ? 1 : 0,
        pointerEvents: "none",
        zIndex: 25,
        boxShadow:
          "0 4px 14px rgba(0,0,0,0.22)",
      }}
    />
  );
};
