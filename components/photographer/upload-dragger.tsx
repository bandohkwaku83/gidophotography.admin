"use client";

import { useCallback, useState } from "react";

type Props = {
  label?: string;
  hint?: string;
  accept?: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
};

export function UploadDragger({
  label = "Drag & drop images here",
  hint = "or click to browse — JPG, PNG, WebP, GIF",
  accept = "image/jpeg,image/png,image/webp,image/gif",
  disabled,
  onFiles,
}: Props) {
  const [over, setOver] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length || disabled) return;
      onFiles(Array.from(list));
    },
    [disabled, onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (e.target as HTMLElement).querySelector("input")?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget === e.target) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`relative rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
        disabled
          ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
          : over
            ? "cursor-pointer border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
            : "cursor-pointer border-zinc-300 bg-zinc-50/80 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-500"
      }`}
    >
      <input
        type="file"
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        accept={accept}
        multiple
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{label}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}
