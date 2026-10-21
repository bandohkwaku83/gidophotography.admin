"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { ApiGalleryMark, GalleryMarkPosition } from "@/lib/folders/types";
import { cn } from "@/lib/utils";

export type { GalleryMarkPosition };

/**
 * Photographer preview of the gallery mark. The admin finals grid draws this
 * with CSS on the clean photo. Saving sends the logo file and settings with
 * the folder update; the server stamps them onto the client copy.
 * `size` and `inset` are a percent of the shorter side, so portrait and
 * landscape match.
 */

export type GalleryMark = {
  enabled: boolean;
  src: string | null;
  name: string | null;
  position: GalleryMarkPosition;
  /** Width as a percent of the photo's shorter side. */
  size: number;
  /** 0–100 */
  opacity: number;
  /** Distance from the chosen edge, as a percent of the shorter side. */
  inset: number;
  /** Soft white chip so a dark logo still reads on dark photos. */
  plate: boolean;
};

export const DEFAULT_GALLERY_MARK: GalleryMark = {
  enabled: false,
  src: null,
  name: null,
  position: "bottom-right",
  size: 18,
  opacity: 90,
  inset: 5,
  plate: true,
};

export const GALLERY_MARK_POSITIONS: { id: GalleryMarkPosition; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-center", label: "Top center" },
  { id: "top-right", label: "Top right" },
  { id: "middle-left", label: "Middle left" },
  { id: "center", label: "Center" },
  { id: "middle-right", label: "Middle right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-center", label: "Bottom center" },
  { id: "bottom-right", label: "Bottom right" },
];

const MAX_LOGO_BYTES = 1_200_000;

/** Fill the panel from the folder. `logoUrl` is the preview src. */
export function markFromApi(api?: ApiGalleryMark | null): GalleryMark {
  if (!api?.logoUrl) return DEFAULT_GALLERY_MARK;
  return {
    enabled: api.enabled,
    src: api.logoUrl,
    name: api.name || null,
    position: api.position,
    size: api.size,
    opacity: api.opacity,
    inset: api.inset,
    plate: api.plate,
  };
}

export function galleryMarkOverlayStyle(mark: GalleryMark): CSSProperties {
  // Shorter side of the photo, so a portrait and a landscape share one scale.
  const edge = `${mark.inset}cqmin`;
  const plate = mark.plate !== false;
  const base: CSSProperties = {
    position: "absolute",
    width: `${mark.size}cqmin`,
    maxHeight: "46cqmin",
    height: "auto",
    opacity: mark.opacity / 100,
    pointerEvents: "none",
    zIndex: 2,
    objectFit: "contain",
    filter: plate
      ? "drop-shadow(0 2px 8px rgba(0,0,0,0.28))"
      : "drop-shadow(0 0 0.6px rgba(255,255,255,0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.55))",
    ...(plate
      ? {
          padding: "0.7cqmin",
          background: "rgba(255,255,255,0.92)",
          borderRadius: 6,
          lineHeight: 0,
          boxSizing: "border-box",
        }
      : {}),
  };

  switch (mark.position) {
    case "top-left":
      return { ...base, top: edge, left: edge };
    case "top-center":
      return { ...base, top: edge, left: "50%", transform: "translateX(-50%)" };
    case "top-right":
      return { ...base, top: edge, right: edge };
    case "middle-left":
      return { ...base, left: edge, top: "50%", transform: "translateY(-50%)" };
    case "center":
      return { ...base, left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
    case "middle-right":
      return { ...base, right: edge, top: "50%", transform: "translateY(-50%)" };
    case "bottom-left":
      return { ...base, bottom: edge, left: edge };
    case "bottom-center":
      return { ...base, bottom: edge, left: "50%", transform: "translateX(-50%)" };
    case "bottom-right":
      return { ...base, bottom: edge, right: edge };
  }
}

export function GalleryMarkOverlay({ mark }: { mark: GalleryMark }) {
  if (!mark.enabled || !mark.src) return null;
  return (
    <span className="pointer-events-none absolute inset-0 [container-type:size]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mark.src}
        alt=""
        aria-hidden
        draggable={false}
        className="block h-auto max-w-none"
        style={galleryMarkOverlayStyle(mark)}
      />
    </span>
  );
}

function MarkFrame({
  coverSrc,
  mark,
  aspectClass,
  label,
  showHint = false,
}: {
  coverSrc: string;
  mark: GalleryMark;
  aspectClass: string;
  label: string;
  showHint?: boolean;
}) {
  return (
    <figure className="min-w-0">
      <div className={cn("relative overflow-hidden rounded-xl bg-studio-ink", aspectClass)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <GalleryMarkOverlay mark={{ ...mark, enabled: Boolean(mark.src) }} />
        {showHint ? (
          <p className="absolute inset-x-2 bottom-2 text-center text-[10px] leading-tight tracking-wide text-white/80">
            Your mark will appear here
          </p>
        ) : null}
      </div>
      <figcaption className="mt-1.5 text-center text-[10px] font-medium tracking-[0.16em] text-studio-taupe uppercase">
        {label}
      </figcaption>
    </figure>
  );
}

function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose a PNG, SVG, WebP, or JPG."));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error("Use a logo under 1 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function GalleryMarkPanel({
  coverSrc,
  mark,
  onChange,
  onError,
  saving = false,
}: {
  coverSrc: string;
  mark: GalleryMark;
  onChange: (next: GalleryMark, file?: File | null) => void;
  onError?: (message: string) => void;
  saving?: boolean;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function takeFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      const src = await readLogoFile(file);
      onChange({ ...mark, src, name: file.name, enabled: true }, file);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not use that file.");
    } finally {
      setReading(false);
    }
  }

  return (
    <section
      id="gallery-mark"
      className="scroll-mt-24 rounded-2xl border border-studio-line bg-white p-4 shadow-[0_1px_2px_rgba(26,22,18,0.04)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.22em] text-studio-gold-deep uppercase">
            On finals
          </p>
          <h2 className="mt-1 font-display text-[1.65rem] leading-none text-studio-ink">Gallery mark</h2>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mark.enabled}
          disabled={!mark.src}
          onClick={() => onChange({ ...mark, enabled: !mark.enabled })}
          className={cn(
            "relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40",
            mark.enabled ? "bg-studio-ink" : "bg-[#e7e0d4]",
          )}
        >
          <span className="sr-only">{mark.enabled ? "Hide gallery mark" : "Show gallery mark"}</span>
          <span
            className={cn(
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-[left]",
              mark.enabled ? "left-[1.35rem]" : "left-0.5",
            )}
            aria-hidden
          />
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-studio-taupe">
        Stamp a logo or icon on every final. It sits on the photo itself, in portrait or landscape.
      </p>
      {saving ? (
        <p className="mt-2 text-[12px] font-medium text-studio-gold-deep" role="status">
          Saving mark…
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.72fr)] items-end gap-2">
        <MarkFrame
          coverSrc={coverSrc}
          mark={mark}
          aspectClass="aspect-[3/2]"
          label="Landscape"
          showHint={!mark.src}
        />
        <MarkFrame coverSrc={coverSrc} mark={mark} aspectClass="aspect-[3/4]" label="Portrait" />
      </div>

      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="image/png,image/svg+xml,image/webp,image/jpeg,image/gif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void takeFile(file);
        }}
      />

      {mark.src ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-studio-line bg-studio-cream/70 px-2.5 py-2">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(45deg,#ece7df_25%,transparent_25%),linear-gradient(-45deg,#ece7df_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ece7df_75%),linear-gradient(-45deg,transparent_75%,#ece7df_75%)] bg-[length:10px_10px] bg-[position:0_0,0_5px,5px_-5px,-5px_0] ring-1 ring-studio-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mark.src} alt="" className="max-h-9 max-w-9 object-contain" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-studio-ink">{mark.name || "Logo"}</p>
            <p className="text-[11px] text-studio-taupe">
              {mark.enabled ? "Showing on finals" : "Hidden for now"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={reading}
            className="rounded-lg px-2 py-1 text-[12px] font-medium text-studio-ink transition hover:bg-white"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...mark, src: null, name: null, enabled: false }, null)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-studio-burgundy transition hover:bg-[#F8F1F1]"
            aria-label="Remove logo"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={reading}
          onClick={() => fileRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void takeFile(event.dataTransfer.files?.[0]);
          }}
          className="mt-3 flex w-full flex-col items-center rounded-xl border border-dashed border-studio-line bg-studio-cream/50 px-4 py-5 text-center transition hover:border-studio-gold hover:bg-white"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-studio-ink shadow-sm ring-1 ring-studio-line">
            <ImagePlus className="h-4 w-4" aria-hidden />
          </span>
          <span className="mt-2 text-[13px] font-medium text-studio-ink">
            {reading ? "Reading logo…" : "Add a logo or icon"}
          </span>
          <span className="mt-0.5 text-[11px] text-studio-taupe">PNG or SVG with a clear background works best</span>
        </button>
      )}

      <div className="mt-4">
        <p className="text-[11px] font-medium tracking-wide text-studio-taupe uppercase">Position</p>
        <div
          className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl bg-[#f6f3ee] p-1.5"
          role="group"
          aria-label="Mark position"
        >
          {GALLERY_MARK_POSITIONS.map((pos) => {
            const active = mark.position === pos.id;
            return (
              <button
                key={pos.id}
                type="button"
                aria-label={pos.label}
                aria-pressed={active}
                title={pos.label}
                onClick={() => onChange({ ...mark, position: pos.id })}
                className={cn(
                  "flex h-9 items-center justify-center rounded-lg transition",
                  active ? "bg-white shadow-sm ring-1 ring-studio-line" : "hover:bg-white/70",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    active ? "bg-studio-gold-deep" : "bg-[#cfc6b8]",
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[12px] text-studio-ink">
            {GALLERY_MARK_POSITIONS.find((p) => p.id === mark.position)?.label}
          </p>
          <button
            type="button"
            aria-pressed={mark.plate !== false}
            onClick={() => onChange({ ...mark, plate: mark.plate === false })}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
              mark.plate !== false
                ? "bg-studio-ink text-white"
                : "bg-[#f6f3ee] text-studio-taupe hover:text-studio-ink",
            )}
          >
            Light plate
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <MarkSlider
          label="Size"
          value={mark.size}
          min={8}
          max={36}
          display={`${mark.size}%`}
          onChange={(size) => onChange({ ...mark, size })}
        />
        <MarkSlider
          label="Opacity"
          value={mark.opacity}
          min={15}
          max={100}
          display={`${mark.opacity}%`}
          onChange={(opacity) => onChange({ ...mark, opacity })}
        />
        <MarkSlider
          label="Margin"
          value={mark.inset}
          min={2}
          max={16}
          display={`${mark.inset}%`}
          onChange={(inset) => onChange({ ...mark, inset })}
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-studio-taupe">
        Size and margin follow the shorter side, so portrait and landscape stay in proportion. Clients receive each final with this logo stamped on it.
      </p>
    </section>
  );
}

function MarkSlider({
  label,
  value,
  min,
  max,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[12px] text-studio-ink">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-studio-taupe">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-[#e7e0d4] accent-studio-ink"
      />
    </label>
  );
}
