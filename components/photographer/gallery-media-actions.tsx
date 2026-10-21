"use client";

import { useRef, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/*";
const FILE_HINT = "Images (JPG, PNG, WebP, GIF) or video (MP4, MOV, WebM, etc.).";

type Props = {
  disabled?: boolean;
  onCreateCollection: () => void;
  onFiles: (files: File[]) => void;
};

export function GalleryMediaActions({ disabled, onCreateCollection, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function takeFiles(list: FileList | null) {
    if (!list?.length || disabled) return;
    onFiles(Array.from(list));
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:max-w-[34rem]">
      <button
        type="button"
        onClick={onCreateCollection}
        disabled={disabled}
        className="flex h-[7.25rem] flex-col items-start justify-between rounded-2xl bg-[#f3f3f3] px-5 py-4 text-left transition hover:bg-[#ebebeb] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800 dark:hover:bg-zinc-700"
      >
        <FolderPlus className="h-6 w-6 text-zinc-900 dark:text-zinc-50" strokeWidth={1.75} aria-hidden />
        <span className="text-[15px] font-medium tracking-tight text-zinc-950 dark:text-zinc-50">
          Create collection
        </span>
      </button>

      <button
        type="button"
        disabled={disabled}
        title={FILE_HINT}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          takeFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex h-[7.25rem] flex-col items-start justify-between rounded-2xl bg-[#f3f3f3] px-5 py-4 text-left transition hover:bg-[#ebebeb] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800 dark:hover:bg-zinc-700",
          over && "bg-[#e6e6e6] ring-2 ring-zinc-900/15 dark:bg-zinc-700 dark:ring-white/20",
        )}
      >
        <Plus className="h-6 w-6 text-zinc-900 dark:text-zinc-50" strokeWidth={1.75} aria-hidden />
        <span className="text-[15px] font-medium tracking-tight text-zinc-950 dark:text-zinc-50">
          Upload image
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        disabled={disabled}
        className="sr-only"
        aria-label={`Upload image. ${FILE_HINT}`}
        onChange={(e) => {
          takeFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
