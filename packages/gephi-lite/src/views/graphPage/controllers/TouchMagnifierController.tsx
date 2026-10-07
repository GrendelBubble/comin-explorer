import { useSigma } from "@react-sigma/core";
import {
  FC,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TouchCoords } from "sigma/types";
import { createPortal } from "react-dom";

import {
  useGraphDataset,
  useSigmaActions,
} from "../../../core/context/dataContexts";
import { COMIN_UI } from "../../../core/comin/uiPreset";

const LONG_PRESS_MS = 220;
const START_MOVE_TOLERANCE = 8;

const LENS_SIZE = 120;
const LENS_ZOOM = 2.2;

// Rayon de recherche pendant le "survol tactile".
const TOUCH_HIT_RADIUS = 30;

// Rayon réel utilisé lorsqu'on tape dans la loupe.
// Comme la loupe agrandit 2.2x, cela donne déjà
// une cible tactile confortable.
const LENS_TAP_HIT_RADIUS = 16;

type Position = {
  left: number;
  top: number;
};

type TouchState = {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  active: boolean;
};

export const TouchMagnifierController: FC = () => {
  const sigma = useSigma();
  const { nodeData } = useGraphDataset();

  const {
    setHoveredNode,
    resetHoveredNode,
  } = useSigmaActions();

  const lensRef =
    useRef<HTMLCanvasElement | null>(null);

  const lensPositionRef =
    useRef<Position | null>(null);

  const touchRef =
    useRef<TouchState | null>(null);

  const timerRef =
    useRef<number | null>(null);

  const touchHoveredNodeRef =
    useRef<string | null>(null);

  const lastLensTouchRef =
    useRef(0);

  const [lensPosition, setLensPositionState] =
    useState<Position | null>(null);

  const setLensPosition = useCallback(
    (position: Position | null) => {
      lensPositionRef.current =
        position;

      setLensPositionState(
        position,
      );
    },
    [],
  );

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

  const clearLens = useCallback(() => {
    setLensPosition(null);
    setTouchHoveredNode(null);
  }, [
    setLensPosition,
    setTouchHoveredNode,
  ]);

  const pickNearestNode = useCallback(
    (
      x: number,
      y: number,
      radius = TOUCH_HIT_RADIUS,
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
          distance <= radius &&
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

  /*
   * Le cercle lui-même est désormais le point
   * d'exploration.
   *
   * Il reste centré sous le doigt, sauf au bord
   * de l'écran où on le contraint simplement
   * à rester visible.
   */
  const positionLens = useCallback(
    (
      x: number,
      y: number,
    ): Position => {
      const rect =
        sigma
          .getContainer()
          .getBoundingClientRect();

      const half =
        LENS_SIZE / 2;

      const margin = 6;

      const clamp = (
        value: number,
        min: number,
        max: number,
      ) =>
        Math.max(
          min,
          Math.min(max, value),
        );

      const position = {
        left: clamp(
          x,
          half + margin,
          rect.width -
            half -
            margin,
        ),

        top: clamp(
          y,
          half + margin,
          rect.height -
            half -
            margin,
        ),
      };

      setLensPosition(
        position,
      );

      return position;
    },
    [
      setLensPosition,
      sigma,
    ],
  );

  /*
   * La zone copiée est centrée sur LE CENTRE
   * DE LA LOUPE.
   *
   * La zone agrandie correspond donc réellement
   * à ce qui se trouve sous le cercle.
   */
  const drawLens = useCallback(
    (
      centerX: number,
      centerY: number,
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

      const centerClientX =
        containerRect.left +
        centerX;

      const centerClientY =
        containerRect.top +
        centerY;

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

          const canvasCenterX =
            centerClientX -
            rect.left;

          const canvasCenterY =
            centerClientY -
            rect.top;

          const sx =
            (
              canvasCenterX -
              sourceSize / 2
            ) *
            scaleX;

          const sy =
            (
              canvasCenterY -
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
      const position =
        positionLens(x, y);

      /*
       * Le dessin ET le hit-test utilisent
       * exactement le même centre.
       */
      drawLens(
        position.left,
        position.top,
      );

      const nodeId =
        pickNearestNode(
          position.left,
          position.top,
        );

      setTouchHoveredNode(
        nodeId,
      );

      /*
       * Ne pas redessiner ici au frame suivant :
       * la mise à jour du hover peut provoquer simultanément
       * un refresh des canvases Sigma. On risquerait alors
       * de recopier un canvas momentanément vide.
       *
       * Le dessin effectué juste avant reste la référence
       * visuelle stable jusqu'au prochain déplacement.
       */
    },
    [
      drawLens,
      pickNearestNode,
      positionLens,
      setTouchHoveredNode,
    ],
  );

  /*
   * Convertit un point tapé DANS LA LOUPE
   * vers sa position originale dans le graphe.
   */
  const activateLensPoint =
    useCallback(
      (
        clientX: number,
        clientY: number,
      ) => {
        const lens =
          lensRef.current;

        const lensPosition =
          lensPositionRef.current;

        if (
          !lens ||
          !lensPosition
        ) {
          return;
        }

        const rect =
          lens.getBoundingClientRect();

        const localX =
          clientX -
          rect.left;

        const localY =
          clientY -
          rect.top;

        const dx =
          localX -
          rect.width / 2;

        const dy =
          localY -
          rect.height / 2;

        /*
         * Un déplacement de 22 px dans une
         * loupe à 2.2x représente 10 px
         * dans le graphe original.
         */
        const sourceX =
          lensPosition.left +
          dx / LENS_ZOOM;

        const sourceY =
          lensPosition.top +
          dy / LENS_ZOOM;

        const nodeId =
          pickNearestNode(
            sourceX,
            sourceY,
            LENS_TAP_HIT_RADIUS,
          );

        if (!nodeId) {
          return;
        }

        setTouchHoveredNode(
          nodeId,
        );

        const data =
          nodeData[nodeId];

        /*
         * Pour une source, ouvrir directement
         * depuis le vrai geste utilisateur.
         * Cela évite les bloqueurs de pop-up.
         */
        if (
          data?.type === "source" &&
          typeof data.url ===
            "string" &&
          data.url
        ) {
          window.open(
            data.url,
            "_blank",
            "noopener,noreferrer",
          );

          clearLens();

          return;
        }

        const graph =
          sigma.getGraph();

        if (
          !graph.hasNode(nodeId)
        ) {
          return;
        }

        const attributes =
          graph.getNodeAttributes(
            nodeId,
          );

        const viewport =
          sigma.graphToViewport({
            x: attributes.x,
            y: attributes.y,
          });

        const container =
          sigma.getContainer();

        const containerRect =
          container.getBoundingClientRect();

        /*
         * Le tap d'origine doit rester inhibé,
         * mais le clic explicitement demandé
         * dans la loupe doit passer.
         */
        container.dataset
          .cominSuppressTapUntil = "0";

        /*
         * On réinjecte un clic exactement au
         * centre réel du nœud.
         *
         * EventsController conserve donc toutes
         * les règles normales :
         * - post -> Markdown
         * - container -> ouvrir / fermer
         * - contexte -> développer
         * - contexte sémantique -> lecteur
         */
        const targetClientX =
          containerRect.left +
          viewport.x;

        const targetClientY =
          containerRect.top +
          viewport.y;

        /*
         * La loupe est maintenant au-dessus du graphe.
         * Pour retrouver la vraie couche Sigma située
         * dessous, on la retire momentanément du
         * hit-testing.
         */
        const previousPointerEvents =
          lens.style.pointerEvents;

        lens.style.pointerEvents =
          "none";

        const target =
          document.elementFromPoint(
            targetClientX,
            targetClientY,
          );

        lens.style.pointerEvents =
          previousPointerEvents;

        const clickTarget =
          target instanceof HTMLElement
            ? target
            : container;

        clickTarget.dispatchEvent(
          new MouseEvent(
            "click",
            {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              clientX:
                targetClientX,
              clientY:
                targetClientY,
            },
          ),
        );

        clearLens();
      },
      [
        clearLens,
        nodeData,
        pickNearestNode,
        setTouchHoveredNode,
        sigma,
      ],
    );

  /*
   * Un lecteur Markdown ou une source externe peut demander
   * explicitement la fermeture de la loupe.
   */
  useEffect(() => {
    const container =
      sigma.getContainer();

    const onCloseMagnifier = () => {
      clearTimer();
      touchRef.current = null;
      clearLens();
    };

    container.addEventListener(
      "comin-close-magnifier",
      onCloseMagnifier,
    );

    return () => {
      container.removeEventListener(
        "comin-close-magnifier",
        onCloseMagnifier,
      );
    };
  }, [
    clearLens,
    clearTimer,
    sigma,
  ]);

  /*
   * Interaction tactile avec le graphe.
   *
   * Aucun test "pointer: coarse" :
   * un PC tactile produit lui aussi les
   * événements du TouchCaptor Sigma.
   */
  useEffect(() => {
    const container =
      sigma.getContainer();

    const touchCaptor =
      sigma.getTouchCaptor();

    const onTouchDown = (
      event: TouchCoords,
    ) => {
      if (
        event.touches.length !== 1
      ) {
        clearTimer();
        touchRef.current =
          null;

        return;
      }

      const point =
        event.touches[0];

      if (!point) return;

      clearTimer();

      const resumeExistingLens =
        lensPositionRef.current !== null;

      touchRef.current = {
        startX: point.x,
        startY: point.y,
        lastX: point.x,
        lastY: point.y,
        active: resumeExistingLens,
      };

      /*
       * Loupe déjà ouverte :
       * le nouveau contact reprend immédiatement
       * le balayage sans nouvel appui long.
       */
      if (resumeExistingLens) {
        event.preventSigmaDefault();

        exploreAt(
          point.x,
          point.y,
        );

        return;
      }

      timerRef.current =
        window.setTimeout(() => {
          const state =
            touchRef.current;

          if (!state) return;

          state.active = true;

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
        clearTimer();

        touchRef.current =
          null;

        clearLens();

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
           * Balayage franc :
           * laisser Sigma déplacer le graphe.
           */
          clearTimer();

          touchRef.current =
            null;

          return;
        }

        /*
         * Petit mouvement pendant l'attente :
         * empêcher le graphe de dériver.
         */
        event.preventSigmaDefault();

        return;
      }

      /*
       * LOUPE ACTIVE :
       *
       * neutralise totalement le pan Sigma.
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
      clearTimer();

      const state =
        touchRef.current;

      if (!state) return;

      if (state.active) {
        const now = Date.now();

        /*
         * Neutralise le tap que Sigma générerait
         * éventuellement au relâchement.
         */
        container.dataset
          .cominSuppressTapUntil =
          String(
            now + 500,
          );

        /*
         * Sur mobile, le navigateur peut générer
         * un click synthétique juste après le touchend.
         *
         * Comme la loupe vient précisément d'apparaître
         * sous le doigt, ce click peut sinon tomber sur
         * elle et l'activer immédiatement.
         *
         * On marque donc cette levée comme une interaction
         * tactile déjà consommée.
         */
        lastLensTouchRef.current =
          now;

        /*
         * IMPORTANT :
         * ne PAS supprimer la loupe.
         *
         * Elle devient persistante et cliquable.
         */
        touchRef.current =
          null;

        return;
      }

      touchRef.current =
        null;
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

      touchRef.current =
        null;
    };
  }, [
    clearLens,
    clearTimer,
    exploreAt,
    sigma,
  ]);

  /*
   * Une fois persistante, la loupe constitue
   * sa propre surface d'interaction.
   *
   * PointerEvent fonctionne de façon identique
   * avec souris, tactile Windows et tactile mobile.
   */
  useEffect(() => {
    const lens =
      lensRef.current;

    if (!lens) return;

    let pointerStart:
      | {
          pointerId: number;
          x: number;
          y: number;
          moved: boolean;
        }
      | null = null;

    const onPointerDown = (
      event: PointerEvent,
    ) => {
      if (
        !lensPositionRef.current
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      pointerStart = {
        pointerId:
          event.pointerId,
        x:
          event.clientX,
        y:
          event.clientY,
        moved: false,
      };

      try {
        lens.setPointerCapture(
          event.pointerId,
        );
      } catch {
        // Certains navigateurs peuvent refuser
        // la capture. Le tap reste utilisable.
      }
    };

    const onPointerMove = (
      event: PointerEvent,
    ) => {
      if (
        pointerStart?.pointerId !==
        event.pointerId
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const distance =
        Math.hypot(
          event.clientX -
            pointerStart.x,
          event.clientY -
            pointerStart.y,
        );

      if (
        distance <=
        START_MOVE_TOLERANCE
      ) {
        return;
      }

      pointerStart.moved = true;

      const containerRect =
        sigma
          .getContainer()
          .getBoundingClientRect();

      exploreAt(
        event.clientX -
          containerRect.left,
        event.clientY -
          containerRect.top,
      );
    };

    const onPointerUp = (
      event: PointerEvent,
    ) => {
      if (
        !pointerStart ||
        pointerStart.pointerId !==
          event.pointerId
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const distance =
        Math.hypot(
          event.clientX -
            pointerStart.x,
          event.clientY -
            pointerStart.y,
        );

      const moved =
        pointerStart.moved ||
        distance >
          START_MOVE_TOLERANCE;

      pointerStart = null;

      try {
        lens.releasePointerCapture(
          event.pointerId,
        );
      } catch {
        // Capture éventuellement déjà libérée.
      }

      /*
       * Un PointerEvent tactile peut être suivi
       * d'un click synthétique.
       */
      if (
        event.pointerType !==
        "mouse"
      ) {
        lastLensTouchRef.current =
          Date.now();
      }

      /*
       * Un glissement repositionne simplement
       * la loupe. Seul un véritable tap active
       * le nœud situé dans la loupe.
       */
      if (moved) {
        return;
      }

      activateLensPoint(
        event.clientX,
        event.clientY,
      );
    };

    const onPointerCancel = (
      event: PointerEvent,
    ) => {
      if (
        pointerStart?.pointerId ===
        event.pointerId
      ) {
        pointerStart = null;
      }
    };

    const onClick = (
      event: MouseEvent,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      /*
       * Ignorer le click artificiel qui suit
       * éventuellement un pointerup tactile.
       */
      if (
        Date.now() -
          lastLensTouchRef.current <
        700
      ) {
        return;
      }

      activateLensPoint(
        event.clientX,
        event.clientY,
      );
    };

    lens.addEventListener(
      "pointerdown",
      onPointerDown,
    );

    lens.addEventListener(
      "pointermove",
      onPointerMove,
    );

    lens.addEventListener(
      "pointerup",
      onPointerUp,
    );

    lens.addEventListener(
      "pointercancel",
      onPointerCancel,
    );

    lens.addEventListener(
      "click",
      onClick,
    );

    return () => {
      lens.removeEventListener(
        "pointerdown",
        onPointerDown,
      );

      lens.removeEventListener(
        "pointermove",
        onPointerMove,
      );

      lens.removeEventListener(
        "pointerup",
        onPointerUp,
      );

      lens.removeEventListener(
        "pointercancel",
        onPointerCancel,
      );

      lens.removeEventListener(
        "click",
        onClick,
      );
    };
  }, [
    activateLensPoint,
    exploreAt,
    sigma,
  ]);

  const containerRect =
    sigma
      .getContainer()
      .getBoundingClientRect();

  /*
   * lensPosition est exprimée dans le repère
   * Sigma. Le portal utilise le repère viewport.
   */
  const lensClientLeft =
    lensPosition
      ? containerRect.left +
        lensPosition.left
      : 0;

  const lensClientTop =
    lensPosition
      ? containerRect.top +
        lensPosition.top
      : 0;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: lensClientLeft,
        top: lensClientTop,
        width: LENS_SIZE,
        height: LENS_SIZE,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 10000,
      }}
    >
      <canvas
        ref={lensRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: LENS_SIZE,
          height: LENS_SIZE,
          borderRadius: "50%",
          opacity:
            lensPosition
              ? 1
              : 0,
          pointerEvents:
            lensPosition
              ? "auto"
              : "none",
          touchAction: "none",
          cursor:
            lensPosition
              ? "pointer"
              : "default",
          boxShadow:
            "0 4px 14px rgba(0,0,0,0.22)",
          WebkitTapHighlightColor:
            "transparent",
        }}
      />

      {lensPosition && (
        <button
          type="button"
          aria-label="Fermer la loupe"
          title="Fermer la loupe"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            clearTimer();
            touchRef.current = null;
            clearLens();
          }}
          style={{
            position: "absolute",
            top: -9,
            right: -9,
            width: 28,
            height: 28,
            padding: 0,
            border: "2px solid #1F3442",
            borderRadius: "50%",
            backgroundColor: COMIN_UI.background,
            color: "#1F3442",
            fontSize: 20,
            fontWeight: 700,
            lineHeight: "22px",
            textAlign: "center",
            cursor: "pointer",
            pointerEvents: "auto",
            zIndex: 1,
            boxShadow:
              "0 2px 6px rgba(0,0,0,0.18)",
          }}
        >
          ×
        </button>
      )}
    </div>,
    document.body,
  );

};
