"use client";

import type { ReactNode } from "react";
import { useCallback, useRef } from "react";
import { Move } from "lucide-react";
import { cn } from "@/lib/utils";

function clampFocal(n: number): number {
  return Math.min(100, Math.max(0, n));
}

type Props = {
  imageUrl: string;
  focalX: number;
  focalY: number;
  onFocalChange: (x: number, y: number) => void;
  disabled?: boolean;
  /** Override frame sizing (e.g. wide strip on folder detail). */
  frameClassName?: string;
  /** e.g. remove-cover control, positioned top-right inside the frame */
  topRight?: ReactNode;
  /** Glass drawer on dark hero — light borders / footer copy. */
  embeddedDark?: boolean;
  /** Single-line footer (e.g. next to actions in drawer). */
  compactFooter?: boolean;
};

/**
 * Drag-to-pan preview for folder cover `object-position` (focal point %).
 * Matches how the client hero uses object-cover + object-position.
 */
export function CoverFocalPreview({
  imageUrl,
  focalX,
  focalY,
  onFocalChange,
  disabled,
  frameClassName,
  topRight,
  embeddedDark,
  compactFooter,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startFx: number;
    startFy: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      const el = wrapRef.current;
      if (!el) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startFx: focalX,
        startFy: focalY,
      };
    },
    [disabled, focalX, focalY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      const el = wrapRef.current;
      if (!d || !el || disabled) return;
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const scale = 42;
      const nx = clampFocal(d.startFx - (dx / w) * scale);
      const ny = clampFocal(d.startFy - (dy / h) * scale);
      onFocalChange(nx, ny);
    },
    [disabled, onFocalChange],
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (el?.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }, []);

  return (
    <div className={cn("space-y-2", embeddedDark && "space-y-3.5")}>
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "relative overflow-hidden rounded-2xl bg-zinc-900 shadow-inner transition-shadow duration-300",
          embeddedDark
            ? "border border-white/15 shadow-lg shadow-black/30 ring-1 ring-white/10"
            : "border border-zinc-200 dark:border-zinc-700",
          !disabled &&
            !embeddedDark &&
            "hover:shadow-md hover:ring-2 hover:ring-brand/20 dark:hover:ring-brand/25",
          !disabled && embeddedDark && "hover:ring-2 hover:ring-white/25",
          frameClassName ??
            "aspect-[4/3] w-full sm:h-36 sm:w-44 sm:shrink-0",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-grab touch-none active:cursor-grabbing",
        )}
        role="presentation"
        aria-label="Cover framing preview — drag to reposition"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="h-full w-full select-none object-cover transition-[object-position] duration-200 ease-out motion-reduce:transition-none"
          style={{ objectPosition: `${clampFocal(focalX)}% ${clampFocal(focalY)}%` }}
        />
        <div
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10"
          aria-hidden
        />
        {topRight ? <div className="absolute right-2 top-2 z-10">{topRight}</div> : null}
        {!disabled ? (
          <div
            className={cn(
              "pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-md transition-opacity duration-200",
              embeddedDark
                ? "bg-black/50 text-white/95 ring-1 ring-white/15"
                : "bg-black/55 text-white/90",
            )}
          >
            <Move className="h-3 w-3" aria-hidden />
            Drag to pan
          </div>
        ) : null}
      </div>
      {compactFooter ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onFocalChange(50, 50)}
            className={cn(
              "text-xs font-semibold transition-colors duration-200 hover:underline disabled:opacity-40",
              embeddedDark
                ? "text-white/75 hover:text-white"
                : "text-brand dark:text-brand-on-dark",
            )}
          >
            Reset to center
          </button>
          {!embeddedDark ? (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Matches client full-screen cover.
            </span>
          ) : (
            <span className="text-[11px] text-white/45">Live on banner above</span>
          )}
        </div>
      ) : (
        <div className="flex max-w-sm flex-col gap-2 sm:max-w-[11rem]">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onFocalChange(50, 50)}
            className="w-fit text-xs font-semibold text-brand transition-colors hover:underline disabled:opacity-40 dark:text-brand-on-dark"
          >
            Reset framing
          </button>
          <span className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            Clients see the cover full-screen; drag to set the focal area.
          </span>
        </div>
      )}
    </div>
  );
}
