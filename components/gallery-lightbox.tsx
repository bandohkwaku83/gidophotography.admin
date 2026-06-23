"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const LIGHTBOX_MIN_ZOOM = 1;
export const LIGHTBOX_MAX_ZOOM = 3;
const LIGHTBOX_ZOOM_STEP = 0.25;
const UI_IDLE_MS = 3200;
const DRAG_THRESHOLD_PX = 4;

type Pan = { x: number; y: number };

export function lightboxZoomIn(zoom: number): number {
  return Math.min(LIGHTBOX_MAX_ZOOM, Math.round((zoom + LIGHTBOX_ZOOM_STEP) * 100) / 100);
}

export function lightboxZoomOut(zoom: number): number {
  return Math.max(LIGHTBOX_MIN_ZOOM, Math.round((zoom - LIGHTBOX_ZOOM_STEP) * 100) / 100);
}

export function lightboxToggleZoom(zoom: number): number {
  return zoom > 1 ? LIGHTBOX_MIN_ZOOM : 2;
}

function lightboxChromeBtnClass(disabled = false): string {
  return cn(
    "inline-flex h-10 w-10 items-center justify-center rounded-full",
    "border border-white/20 bg-black/40 text-white backdrop-blur-md",
    "transition hover:border-white/35 hover:bg-white/15",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
    disabled && "pointer-events-none opacity-25",
  );
}

function clampPan(pan: Pan, zoom: number, stageEl: HTMLElement, mediaEl: HTMLElement): Pan {
  if (zoom <= 1) return { x: 0, y: 0 };

  const stageW = stageEl.clientWidth;
  const stageH = stageEl.clientHeight;
  const baseW = mediaEl.offsetWidth;
  const baseH = mediaEl.offsetHeight;
  const scaledW = baseW * zoom;
  const scaledH = baseH * zoom;
  const maxX = Math.max(0, (scaledW - stageW) / 2);
  const maxY = Math.max(0, (scaledH - stageH) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

type GalleryLightboxProps = {
  onClose: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  ariaLabel?: string;
  counter?: string;
  title?: string;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  footer?: ReactNode;
  zoomable?: boolean;
  children: ReactNode;
};

export function GalleryLightbox({
  onClose,
  zoom,
  onZoomChange,
  ariaLabel = "Image preview",
  counter,
  title,
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,
  footer,
  zoomable = true,
  children,
}: GalleryLightboxProps) {
  const [uiVisible, setUiVisible] = useState(true);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mediaWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const showNav = Boolean(onPrev || onNext);

  const revealUi = useCallback(() => {
    setUiVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setUiVisible(false);
    }, UI_IDLE_MS);
  }, []);

  const applyPan = useCallback(
    (next: Pan) => {
      const stage = stageRef.current;
      const wrap = mediaWrapRef.current;
      const media = wrap?.querySelector("img, video") as HTMLElement | null;
      if (!stage || !media || zoom <= 1) {
        setPan({ x: 0, y: 0 });
        return;
      }
      setPan(clampPan(next, zoom, stage, media));
    },
    [zoom],
  );

  useEffect(() => {
    revealUi();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [revealUi, zoom, counter, title, footer]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [counter, title]);

  useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 });
      return;
    }
    setPan((current) => {
      const stage = stageRef.current;
      const wrap = mediaWrapRef.current;
      const media = wrap?.querySelector("img, video") as HTMLElement | null;
      if (!stage || !media) return { x: 0, y: 0 };
      return clampPan(current, zoom, stage, media);
    });
  }, [zoom]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node || !zoomable) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      revealUi();
      if (event.deltaY < 0) {
        onZoomChange(lightboxZoomIn(zoom));
      } else if (event.deltaY > 0) {
        onZoomChange(lightboxZoomOut(zoom));
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoom, zoomable, onZoomChange, revealUi]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!zoomable) return;
      if (zoom > 1) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          panX: pan.x,
          panY: pan.y,
          moved: false,
        };
        setDragging(true);
        revealUi();
        return;
      }
      if (event.button !== 0) return;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: 0,
        panY: 0,
        moved: false,
      };
    },
    [zoom, zoomable, pan.x, pan.y, revealUi],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
      }

      if (zoom > 1 && drag.moved) {
        event.preventDefault();
        applyPan({ x: drag.panX + dx, y: drag.panY + dy });
      }
    },
    [zoom, applyPan],
  );

  const endPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const moved = drag.moved;
      dragRef.current = null;
      setDragging(false);

      if (!zoomable || moved) return;
      onZoomChange(lightboxToggleZoom(zoom));
      revealUi();
    },
    [zoom, zoomable, onZoomChange, revealUi],
  );

  const zoomPct = Math.round(zoom * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onMouseMove={revealUi}
      onTouchStart={revealUi}
      onKeyDown={revealUi}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close preview"
        onClick={onClose}
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-4",
          "transition-opacity duration-300",
          uiVisible ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto min-w-0">
          {counter ? (
            <span className="inline-flex items-center rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-medium text-white/95 backdrop-blur-md">
              {counter}
            </span>
          ) : null}
          {title ? (
            <p className="mt-2 max-w-[min(70vw,20rem)] truncate text-xs text-white/75" title={title}>
              {title}
            </p>
          ) : null}
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-black/45 p-1.5 backdrop-blur-md shadow-lg">
          {zoomable ? (
            <>
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= LIGHTBOX_MIN_ZOOM}
                onClick={() => onZoomChange(lightboxZoomOut(zoom))}
                className={lightboxChromeBtnClass(zoom <= LIGHTBOX_MIN_ZOOM)}
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="min-w-[2.75rem] text-center text-[11px] font-medium tabular-nums text-white/90">
                {zoomPct}%
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= LIGHTBOX_MAX_ZOOM}
                onClick={() => onZoomChange(lightboxZoomIn(zoom))}
                className={lightboxChromeBtnClass(zoom >= LIGHTBOX_MAX_ZOOM)}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
              <span className="mx-0.5 h-5 w-px bg-white/20" aria-hidden />
            </>
          ) : null}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(lightboxChromeBtnClass(), "bg-white/90 text-zinc-900 hover:bg-white")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {showNav ? (
        <>
          <button
            type="button"
            aria-label="Previous image"
            disabled={!hasPrev}
            onClick={onPrev}
            className={cn(
              "pointer-events-auto absolute left-2 top-1/2 z-20 -translate-y-1/2 sm:left-4",
              lightboxChromeBtnClass(!hasPrev),
              "h-11 w-11 transition-opacity duration-300",
              uiVisible ? "opacity-100" : "opacity-0",
            )}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next image"
            disabled={!hasNext}
            onClick={onNext}
            className={cn(
              "pointer-events-auto absolute right-2 top-1/2 z-20 -translate-y-1/2 sm:right-4",
              lightboxChromeBtnClass(!hasNext),
              "h-11 w-11 transition-opacity duration-300",
              uiVisible ? "opacity-100" : "opacity-0",
            )}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </>
      ) : null}

      <div
        ref={contentRef}
        className="relative z-10 flex max-h-[92vh] w-full max-w-[min(96vw,72rem)] flex-col items-center justify-center px-12 py-16 sm:px-16"
      >
        <div
          ref={stageRef}
          className={cn(
            "flex max-h-[calc(92vh-6rem)] w-full items-center justify-center overflow-hidden touch-none select-none",
            zoomable && zoom <= 1 && !dragging && "cursor-zoom-in",
            zoomable && zoom > 1 && !dragging && "cursor-grab",
            dragging && "cursor-grabbing",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <div
            ref={mediaWrapRef}
            className={cn(
              "will-change-transform",
              !dragging && "transition-transform duration-200 ease-out",
            )}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>

      {footer ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-4",
            "transition-opacity duration-300",
            uiVisible ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="pointer-events-auto mx-auto flex max-w-3xl justify-center">
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}
