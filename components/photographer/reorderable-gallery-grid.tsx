"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderCard } from "@/components/photographer/folder-card";
import { moveGalleryCards, sameGalleryOrder } from "@/lib/gallery-card-order";
import {
  folderCoverObjectPositionStyle,
  getFolderClientName,
  getFolderCoverUrl,
  type ApiFolder,
} from "@/lib/folders-api";
import { cn } from "@/lib/utils";

type ReorderableGalleryGridProps = {
  folders: ApiFolder[];
  selectedIds: ReadonlySet<string>;
  clientNameById?: Map<string, string>;
  pendingDeleteId?: string | null;
  onToggleSelect: (folder: ApiFolder, shiftKey: boolean) => void;
  onReorder: (ordered: ApiFolder[]) => void;
  onEdit: (folder: ApiFolder) => void;
  onDelete: (folder: ApiFolder) => void | Promise<void>;
};

function SortableGalleryCard({
  folder,
  selected,
  companion,
  clientNameById,
  pendingDeleteId,
  suppressClickRef,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  folder: ApiFolder;
  selected: boolean;
  companion: boolean;
  clientNameById?: Map<string, string>;
  pendingDeleteId?: string | null;
  suppressClickRef: MutableRefObject<boolean>;
  onToggleSelect: (folder: ApiFolder, shiftKey: boolean) => void;
  onEdit: (folder: ApiFolder) => void;
  onDelete: (folder: ApiFolder) => void | Promise<void>;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: folder._id,
    disabled: pendingDeleteId === folder._id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "min-w-0 cursor-grab touch-manipulation active:cursor-grabbing",
        (isDragging || companion) && "opacity-40",
      )}
      {...listeners}
    >
      <FolderCard
        folder={folder}
        clientNameById={clientNameById}
        busy={pendingDeleteId === folder._id}
        selected={selected}
        selectable
        suppressClickRef={suppressClickRef}
        onToggleSelect={onToggleSelect}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

function DragPreview({
  folder,
  clientNameById,
  width,
  count,
}: {
  folder: ApiFolder;
  clientNameById?: Map<string, string>;
  width: number;
  count: number;
}) {
  const cover = getFolderCoverUrl(folder);
  const title = folder.eventName?.trim() || "Untitled gallery";
  const clientName = getFolderClientName(folder, clientNameById);

  return (
    <div className="relative" style={{ width }}>
      {count > 1 ? (
        <>
          <div className="absolute inset-x-3 top-3 bottom-0 rounded-[22px] bg-[#d9d0c2] shadow-lg" />
          <div className="absolute inset-x-1.5 top-1.5 bottom-0 rounded-[22px] bg-[#efe6d8] shadow-lg" />
        </>
      ) : null}
      <article className="relative overflow-hidden rounded-[22px] bg-[#e6ddd0] shadow-2xl ring-2 ring-studio-ink/50">
        <div className="relative aspect-[3/4]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={folderCoverObjectPositionStyle(folder)}
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,#f8f3ea,transparent_42%),linear-gradient(165deg,#cfc3b0_0%,#efe6d8_46%,#b7ab9a_100%)]" />
          )}
          <div className="absolute inset-x-3.5 bottom-3.5 rounded-2xl bg-white/95 px-4 py-3 shadow-[0_14px_34px_rgba(26,22,18,0.1)]">
            <h2 className="font-display line-clamp-2 text-[1.2rem] leading-tight tracking-tight text-studio-ink">
              {title}
            </h2>
            <p className="mt-1 truncate text-[13px] text-studio-charcoal">{clientName}</p>
          </div>
        </div>
      </article>
      {count > 1 ? (
        <span className="absolute -top-2 -right-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-studio-ink px-2 text-xs font-semibold text-white shadow-md">
          {count}
        </span>
      ) : null}
    </div>
  );
}

export function ReorderableGalleryGrid({
  folders,
  selectedIds,
  clientNameById,
  pendingDeleteId,
  onToggleSelect,
  onReorder,
  onEdit,
  onDelete,
}: ReorderableGalleryGridProps) {
  const [ordered, setOrdered] = useState(folders);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeWidth, setActiveWidth] = useState(240);
  const orderedRef = useRef(folders);
  const dragStartOrder = useRef<ApiFolder[] | null>(null);
  const selectedRef = useRef(selectedIds);
  const suppressClickRef = useRef(false);
  selectedRef.current = selectedIds;

  const itemsKey = folders.map((folder) => folder._id).join("\0");

  useEffect(() => {
    if (dragStartOrder.current) return;
    orderedRef.current = folders;
    setOrdered(folders);
  }, [itemsKey, folders]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const ids = useMemo(() => ordered.map((folder) => folder._id), [ordered]);
  const activeFolder = activeId ? ordered.find((folder) => folder._id === activeId) ?? null : null;
  const dragCount = useMemo(() => {
    if (!activeId) return 0;
    if (!selectedIds.has(activeId)) return 1;
    const visibleSelected = ordered.filter((folder) => selectedIds.has(folder._id)).length;
    return Math.max(1, visibleSelected);
  }, [activeId, ordered, selectedIds]);

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    setActiveWidth(event.active.rect.current.initial?.width ?? 240);
    dragStartOrder.current = orderedRef.current.slice();
    suppressClickRef.current = true;
  }

  function onDragOver(event: DragOverEvent) {
    const overId = event.over ? String(event.over.id) : "";
    const currentId = String(event.active.id);
    if (!overId) return;
    const next = moveGalleryCards(orderedRef.current, currentId, overId, selectedRef.current);
    if (sameGalleryOrder(next, orderedRef.current)) return;
    orderedRef.current = next;
    setOrdered(next);
  }

  function finishDrag(commit: boolean) {
    setActiveId(null);
    const start = dragStartOrder.current;
    const end = orderedRef.current;
    dragStartOrder.current = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 180);
    if (!commit || !start || sameGalleryOrder(start, end)) return;
    onReorder(end);
  }

  function onDragEnd(_event: DragEndEvent) {
    finishDrag(true);
  }

  function onDragCancel() {
    if (dragStartOrder.current) {
      orderedRef.current = dragStartOrder.current;
      setOrdered(dragStartOrder.current);
    }
    finishDrag(false);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div
          className={cn(
            "grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-4",
            activeId && "touch-none",
          )}
        >
          {ordered.map((folder) => (
            <SortableGalleryCard
              key={folder._id}
              folder={folder}
              selected={selectedIds.has(folder._id)}
              companion={
                activeId != null &&
                activeId !== folder._id &&
                selectedIds.has(activeId) &&
                selectedIds.has(folder._id) &&
                dragCount > 1
              }
              clientNameById={clientNameById}
              pendingDeleteId={pendingDeleteId}
              suppressClickRef={suppressClickRef}
              onToggleSelect={onToggleSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {activeFolder ? (
          <DragPreview
            folder={activeFolder}
            clientNameById={clientNameById}
            width={activeWidth}
            count={dragCount}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
