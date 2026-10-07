import { useSigma } from "@react-sigma/core";
import {
  FC,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TouchCoords } from "sigma/types";

import {
  useSigmaActions,
} from "../../../core/context/dataContexts";
import { COMIN_UI } from "../../../core/comin/uiPreset";

const LONG_PRESS_MS = 220;

// Tant que le doigt reste dans ce rayon,
// on considère qu'il attend éventuellement la loupe.
// Au-delà, le geste redevient immédiatement un pan normal.
const START_MOVE_TOLERANCE = 8;

const LENS_SIZE = 112;
const LENS_ZOOM = 2.2;

// Zone tactile volontairement plus large
// que la pastille réellement affichée.
const TOUCH_HIT_RADIUS = 30;

type TouchState = {
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
      window.clearTimeout(
        timerRef.current,
      );

      timerRef.current = null;
    }
  }, []);

  const setTouchHoveredNode =
    useCallback(
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

  /**
   * Recherche le nœud le plus proche du doigt.
   *
   * x/y sont déjà exprimés dans le repère viewport
   * du container Sigma.
   */
  const pickNearestNode = useCallback(
    (
      x: number,
      y: number,
    ) => {
      const graph =
        sigma.getGraph();

      let bestNode: string | null =
        null;

      let bestDistance =
        Infinity;

      graph.forEachNode((nodeId) => {
        const displayData =
          sigma.getNodeDisplayData(
            nodeId,
          );

        if (
          !displayData ||
          displayData.hidden
        ) {
          return;
        }

        const attributes =
          graph.getNodeAttributes(
            nodeId,
          );

        const graphX =
          Number(attributes.x);

        const graphY =
          Number(attributes.y);

        if (
          !Number.isFinite(graphX) ||
          !Number.isFinite(graphY)
        ) {
          return;
        }

        const viewport =
          sigma.graphToViewport({
            x: graphX,
            y: graphY,
          });

        const distance =
          Math.hypot(
            viewport.x - x,
            viewport.y - y,
          );

        if (
          distance <=
            TOUCH_HIT_RADIUS &&
          distance < bestDistance
        ) {
          bestDistance =
            distance;

          bestNode =
            nodeId;
        }
      });

      return bestNode;
    },
    [sigma],
  );

  const positionLens =
    useCallback(
      (
        x: number,
        y: number,
      ) => {
        const rect =
          sigma
            .getContainer()
            .getBoundingClientRect();

        const half =
          LENS_SIZE / 2;

        const margin = 8;

        const clamp = (
          value: number,
          min: number,
          max: number,
        ) =>
          Math.max(
            min,
            Math.min(
              max,
              value,
            ),
          );

        const left = clamp(
          x,
          half + margin,
          rect.width -
            half -
            margin,
        );

        // Afficher normalement la loupe
        // au-dessus du doigt.
        let top =
          y -
          half -
          46;

        // Si nous sommes trop près du haut,
        // la placer sous le doigt.
        if (
          top - half <
          margin
        ) {
          top =
            y +
            half +
            46;
        }

        top = clamp(
          top,
          half + margin,
          rect.height -
            half -
            margin,
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
      x: number,
      y: number,
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
        lens.width !==
          pixelSize ||
        lens.height !==
          pixelSize
      ) {
        lens.width =
          pixelSize;

        lens.height =
          pixelSize;
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
        LENS_SIZE /
        LENS_ZOOM;

      const container =
        sigma.getContainer();

      const containerRect =
        container.getBoundingClientRect();

      const canvases =
        Array.from(
          container.querySelectorAll<HTMLCanvasElement>(
            "canvas",
          ),
        ).filter(
          (canvas) =>
            canvas !== lens &&
            canvas.width > 0 &&
            canvas.height > 0,
        );

      canvases.forEach(
        (canvas) => {
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

          // x/y sont relatifs au container Sigma.
          // Les convertir dans le repère du canvas.
          const canvasX =
            x +
            containerRect.left -
            rect.left;

          const canvasY =
            y +
            containerRect.top -
            rect.top;

          const sx =
            (
              canvasX -
              sourceSize / 2
            ) *
            scaleX;

          const sy =
            (
              canvasY -
              sourceSize / 2
            ) *
            scaleY;

          const sw =
            sourceSize *
            scaleX;

          const sh =
            sourceSize *
            scaleY;

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
        },
      );

      context.restore();

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
      x: number,
      y: number,
    ) => {
      positionLens(x, y);

      drawLens(x, y);

      const nodeId =
        pickNearestNode(
          x,
          y,
        );

      setTouchHoveredNode(
        nodeId,
      );

      // Le hover modifie éventuellement
      // le rendu du nœud. Redessiner la loupe
      // juste après ce rafraîchissement.
      requestAnimationFrame(() => {
        drawLens(x, y);
      });
    },
    [
      drawLens,
      pickNearestNode,
      positionLens,
      setTouchHoveredNode,
    ],
  );

  const stopExploration =
    useCallback(
      (
        suppressTap: boolean,
      ) => {
        clearTimer();

        const state =
          touchRef.current;

        if (
          state?.active &&
          suppressTap
        ) {
          sigma.getContainer().dataset
            .cominSuppressTapUntil =
            String(
              Date.now() + 500,
            );
        }

        touchRef.current =
          null;

        setLensPosition(null);

        setTouchHoveredNode(null);
      },
      [
        clearTimer,
        setTouchHoveredNode,
        sigma,
      ],
    );

  useEffect(() => {
    const coarsePointer =
      window.matchMedia(
        "(hover: none), (pointer: coarse)",
      );

    if (!coarsePointer.matches) {
      return;
    }

    /*
     * IMPORTANT :
     *
     * Nous utilisons directement le TouchCaptor Sigma.
     *
     * Son événement touchmove est émis AVANT que Sigma
     * ne déplace sa caméra.
     *
     * appeler event.preventSigmaDefault() ici empêche donc
     * réellement le pan du graphe.
     */
    const touchCaptor =
      sigma.getTouchCaptor();

    const onTouchDown = (
      event: TouchCoords,
    ) => {
      // Le pinch à deux doigts reste entièrement
      // géré par Sigma.
      if (
        event.touches.length !== 1
      ) {
        stopExploration(false);
        return;
      }

      const point =
        event.touches[0];

      if (!point) return;

      clearTimer();

      touchRef.current = {
        startX: point.x,
        startY: point.y,
        lastX: point.x,
        lastY: point.y,
        active: false,
      };

      timerRef.current =
        window.setTimeout(() => {
          const state =
            touchRef.current;

          if (!state) return;

          state.active = true;

          /*
           * À partir de maintenant, tout touchmove
           * sera détourné en "survol tactile".
           */
          exploreAt(
            state.lastX,
            state.lastY,
          );
        }, LONG_PRESS_MS);
    };

    const onTouchMove = (
      event: TouchCoords,
    ) => {
      const state =
        touchRef.current;

      if (!state) return;

      if (
        event.touches.length !== 1
      ) {
        stopExploration(false);
        return;
      }

      const point =
        event.touches[0];

      if (!point) return;

      state.lastX =
        point.x;

      state.lastY =
        point.y;

      if (!state.active) {
        const distance =
          Math.hypot(
            point.x -
              state.startX,
            point.y -
              state.startY,
          );

        if (
          distance >
          START_MOVE_TOLERANCE
        ) {
          /*
           * Geste suffisamment franc :
           * ce n'est pas une exploration.
           *
           * On annule le timer et on laisse
           * Sigma poursuivre son pan normal.
           */
          clearTimer();

          touchRef.current =
            null;

          return;
        }

        /*
         * Petits mouvements pendant les 220 ms :
         * on bloque le graphe afin qu'il ne dérive
         * pas avant l'activation de la loupe.
         */
        event.preventSigmaDefault();

        return;
      }

      /*
       * MODE LOUPE ACTIF
       *
       * Cette ligne est le point essentiel :
       * le TouchCaptor de Sigma ne déplacera
       * PAS la caméra pour ce mouvement.
       */
      event.preventSigmaDefault();

      exploreAt(
        point.x,
        point.y,
      );
    };

    const onTouchUp = (
      _event: TouchCoords,
    ) => {
      const wasActive =
        touchRef.current
          ?.active === true;

      stopExploration(
        wasActive,
      );
    };

    touchCaptor.on(
      "touchdown",
      onTouchDown,
    );

    touchCaptor.on(
      "touchmove",
      onTouchMove,
    );

    touchCaptor.on(
      "touchup",
      onTouchUp,
    );

    return () => {
      clearTimer();

      touchCaptor.off(
        "touchdown",
        onTouchDown,
      );

      touchCaptor.off(
        "touchmove",
        onTouchMove,
      );

      touchCaptor.off(
        "touchup",
        onTouchUp,
      );

      stopExploration(false);
    };
  }, [
    clearTimer,
    exploreAt,
    sigma,
    stopExploration,
  ]);

  return (
    <canvas
      ref={lensRef}
      aria-hidden="true"
      className="position-absolute"
      style={{
        left:
          lensPosition?.left ??
          0,
        top:
          lensPosition?.top ??
          0,
        width:
          LENS_SIZE,
        height:
          LENS_SIZE,
        transform:
          "translate(-50%, -50%)",
        borderRadius:
          "50%",
        opacity:
          lensPosition
            ? 1
            : 0,
        pointerEvents:
          "none",
        zIndex: 25,
        boxShadow:
          "0 4px 14px rgba(0,0,0,0.22)",
      }}
    />
  );
};
