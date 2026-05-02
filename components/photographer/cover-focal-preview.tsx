"use client";

import type { ReactNode } from "react";
import { useCallback, useRef } from "react";
import { Move } from "lucide-react";

function clampFocal(n: number): number {
  return Math.min(100, Math.max(0, n));
}

type Props = {
  imageUrl: string;
  focalX: number;
  focalY: number;
  onFocalChange: (x: number, y: number) => void;
  disabled?: boolean;
  /** e.g. remove-cover control, positioned top-right inside the frame */
  topRight?: ReactNode;
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
  topRight,
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
    <div className="space-y-2">
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900 shadow-inner dark:border-zinc-700 sm:h-36 sm:w-44 sm:shrink-0 ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-grab touch-none active:cursor-grabbing"
        }`}
        role="presentation"
        aria-label="Cover framing preview — drag to reposition"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="h-full w-full select-none object-cover"
          style={{ objectPosition: `${clampFocal(focalX)}% ${clampFocal(focalY)}%` }}
        />
        <div
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10"
          aria-hidden
        />
        {topRight ? <div className="absolute right-2 top-2 z-10">{topRight}</div> : null}
        {!disabled ? (
          <div className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm">
            <Move className="h-3 w-3" aria-hidden />
            Drag
          </div>
        ) : null}
      </div>
      <div className="flex max-w-sm flex-col gap-2 sm:max-w-[11rem]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onFocalChange(50, 50)}
          className="w-fit text-xs font-semibold text-brand hover:underline disabled:opacity-40 dark:text-brand-on-dark"
        >
          Reset framing
        </button>
        <span className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          Clients see the cover full-screen; drag to set the focal area.
        </span>
      </div>
    </div>
  );
}
