"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

export type ReorderableItemRenderProps = {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  dragProps: Record<string, unknown>;
  isDragging: boolean;
};

type ReorderableMediaGridProps<T extends { id: string }> = {
  items: T[];
  disabled?: boolean;
  className?: string;
  strategy?: SortingStrategy;
  onOrderChange?: (ordered: T[]) => void;
  /** Set to true while a drag reorder is active; use to suppress lightbox clicks. */
  dragGuardRef?: React.MutableRefObject<boolean>;
  renderItem: (item: T, ctx: ReorderableItemRenderProps) => ReactNode;
  renderOverlay?: (item: T) => ReactNode;
};

function SortableTile<T extends { id: string }>({
  item,
  disabled,
  renderItem,
}: {
  item: T;
  disabled?: boolean;
  renderItem: ReorderableMediaGridProps<T>["renderItem"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 0 : undefined,
  };

  return (
    <>
      {renderItem(item, {
        setNodeRef,
        style,
        dragProps: disabled ? {} : { ...attributes, ...listeners },
        isDragging,
      })}
    </>
  );
}

export function ReorderableMediaGrid<T extends { id: string }>({
  items,
  disabled,
  className,
  strategy = rectSortingStrategy,
  onOrderChange,
  dragGuardRef,
  renderItem,
  renderOverlay,
}: ReorderableMediaGridProps<T>) {
  const [ordered, setOrdered] = useState(items);
  const [activeId, setActiveId] = useState<string | null>(null);
  const wasDraggedRef = useRef(false);
  const dragGuard = dragGuardRef ?? wasDraggedRef;
  const itemsKey = useMemo(() => items.map((item) => item.id).join("\0"), [items]);

  useEffect(() => {
    setOrdered(items);
  }, [itemsKey, items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const ids = useMemo(() => ordered.map((item) => item.id), [ordered]);
  const activeItem = activeId ? ordered.find((item) => item.id === activeId) ?? null : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    dragGuard.current = true;
    window.setTimeout(() => {
      dragGuard.current = false;
    }, 120);

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setOrdered((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id);
      const newIndex = current.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      const next = arrayMove(current, oldIndex, newIndex);
      onOrderChange?.(next);
      return next;
    });
  }

  function onDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={ids} strategy={strategy}>
        <ul className={cn(className, activeId && "touch-none")}>
          {ordered.map((item) => (
            <SortableTile
              key={item.id}
              item={item}
              disabled={disabled}
              renderItem={renderItem}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {activeItem && renderOverlay ? (
          <div className="scale-[1.03] cursor-grabbing rounded-lg shadow-2xl ring-2 ring-brand/50">
            {renderOverlay(activeItem)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
