"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringFrequency,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type PointerSensorOptions,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
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
  /** Other selected photos traveling with the one under the pointer. */
  isCompanion: boolean;
  /** How many photos this drag is carrying. 1 when a single photo is moving. */
  dragCount: number;
};

type ReorderableMediaGridProps<T extends { id: string }> = {
  items: T[];
  disabled?: boolean;
  className?: string;
  strategy?: SortingStrategy;
  onOrderChange?: (ordered: T[]) => void;
  /** Set to true while a drag reorder is active; use to suppress lightbox clicks. */
  dragGuardRef?: React.MutableRefObject<boolean>;
  /**
   * When set, dragging a selected item moves every selected item together.
   * Omit on lists that only reorder one row at a time.
   */
  selectedIds?: ReadonlySet<string>;
  /** Rubber-band selection. Called with the next selected id set. */
  onSelectionChange?: (ids: Set<string>) => void;
  selectionDisabled?: boolean;
  renderItem: (item: T, ctx: ReorderableItemRenderProps) => ReactNode;
  renderOverlay?: (item: T) => ReactNode;
};

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

type MarqueeBox = { left: number; top: number; width: number; height: number };

type MarqueeSession = {
  pointerId: number;
  x: number;
  y: number;
  additive: boolean;
  base: Set<string>;
  active: boolean;
  clearOnClick: boolean;
};

function sameIdOrder<T extends { id: string }>(left: T[], right: T[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.id === right[index]?.id);
}

function sameIdSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

/**
 * Move one item, or the whole visible selection when the dragged item is part of it.
 * Selected items keep their relative order.
 */
function moveMediaItems<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string,
  selectedIds: ReadonlySet<string>,
): T[] {
  if (!overId || activeId === overId) return items;

  const selectedInList = items.filter((item) => selectedIds.has(item.id));
  const groupMove = selectedIds.has(activeId) && selectedInList.length > 1;
  const moving = groupMove ? selectedInList : items.filter((item) => item.id === activeId);
  if (moving.length === 0) return items;
  if (moving.some((item) => item.id === overId)) return items;

  const movingIds = new Set(moving.map((item) => item.id));
  const dragIndexes = items.reduce<number[]>((indexes, item, index) => {
    if (movingIds.has(item.id)) indexes.push(index);
    return indexes;
  }, []);
  const dropIndex = items.findIndex((item) => item.id === overId);
  const firstDragIndex = dragIndexes[0];
  if (dropIndex < 0 || firstDragIndex === undefined) return items;

  const draggedBeforeDrop = dragIndexes.filter((index) => index < dropIndex).length;
  const insertIndex =
    firstDragIndex < dropIndex ? dropIndex - draggedBeforeDrop + 1 : dropIndex - draggedBeforeDrop;

  const staying = items.filter((item) => !movingIds.has(item.id));
  const next = [...staying];
  next.splice(insertIndex, 0, ...moving);
  return next;
}

function marqueeBlocked(target: EventTarget | null, shiftKey: boolean) {
  if (!(target instanceof Element)) return true;
  if (target.closest("[data-no-marquee], input, label, a, textarea, select")) return true;
  if (target.closest("[data-media-drag]")) return !shiftKey;
  if (target.closest("button")) return true;
  return false;
}

function findScroller(start: HTMLElement | null): HTMLElement | null {
  let node = start?.parentElement ?? null;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

class MediaPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        { nativeEvent }: ReactPointerEvent,
        _options: PointerSensorOptions,
      ) => {
        if (nativeEvent.shiftKey || nativeEvent.button !== 0) return false;
        return true;
      },
    },
  ];
}

const EMPTY_STYLE: CSSProperties = {};

function SortableTile<T extends { id: string }>({
  item,
  disabled,
  isCompanion,
  dragCount,
  renderItem,
}: {
  item: T;
  disabled?: boolean;
  isCompanion: boolean;
  dragCount: number;
  renderItem: ReorderableMediaGridProps<T>["renderItem"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });
  const setNodeRefLatest = useRef(setNodeRef);
  setNodeRefLatest.current = setNodeRef;
  const stableSetNodeRef = useMemo(
    () => (node: HTMLElement | null) => {
      setNodeRefLatest.current(node);
    },
    [],
  );

  const listenerRef = useRef(listeners);
  listenerRef.current = disabled ? undefined : listeners;
  const attributeRef = useRef(attributes);
  attributeRef.current = attributes;

  const dragProps = useMemo(() => {
    if (disabled) return {};
    const forward =
      (name: keyof NonNullable<typeof listeners>) =>
      (event: unknown) => {
        const handler = listenerRef.current?.[name] as ((event: unknown) => void) | undefined;
        handler?.(event);
      };
    return {
      ...(attributeRef.current as DraggableAttributes),
      "data-media-drag": "",
      onPointerDown: forward("onPointerDown"),
      onKeyDown: forward("onKeyDown"),
      onTouchStart: forward("onTouchStart"),
    };
  }, [disabled]);

  const liveStyle = useMemo<CSSProperties>(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition],
  );

  // The photo markup stays cached while the tile slides. Rebuilding every
  // image on each drag step is what made the grid lag behind the pointer.
  const rendered = useMemo(
    () =>
      renderItem(item, {
        setNodeRef: stableSetNodeRef,
        style: EMPTY_STYLE,
        dragProps,
        isDragging,
        isCompanion,
        dragCount,
      }),
    [item, renderItem, dragProps, isDragging, isCompanion, dragCount, stableSetNodeRef],
  );

  if (!isValidElement(rendered)) return rendered;

  return cloneElement(rendered as ReactElement<{ style?: CSSProperties }>, {
    style: liveStyle,
  });
}

export function ReorderableMediaGrid<T extends { id: string }>({
  items,
  disabled,
  className,
  strategy = rectSortingStrategy,
  onOrderChange,
  dragGuardRef,
  selectedIds,
  onSelectionChange,
  selectionDisabled,
  renderItem,
  renderOverlay,
}: ReorderableMediaGridProps<T>) {
  const groupReorder = selectedIds !== undefined;
  const selection = selectedIds ?? EMPTY_SELECTION;
  const [ordered, setOrdered] = useState(items);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeWidth, setActiveWidth] = useState(160);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const wasDraggedRef = useRef(false);
  const dragGuard = dragGuardRef ?? wasDraggedRef;
  const orderedRef = useRef(items);
  const dragStartOrder = useRef<T[] | null>(null);
  const selectionRef = useRef(selection);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const selectionDisabledRef = useRef(selectionDisabled);
  const listRef = useRef<HTMLUListElement>(null);
  const sessionRef = useRef<MarqueeSession | null>(null);
  const marqueeHandlers = useRef({
    move: (_event: PointerEvent) => {},
    end: (_event: PointerEvent) => {},
  });
  selectionRef.current = selection;
  onSelectionChangeRef.current = onSelectionChange;
  selectionDisabledRef.current = selectionDisabled;

  const marqueeBridge = useRef({
    attach: () => {},
    detach: () => {},
  });

  useEffect(() => {
    function move(event: PointerEvent) {
      marqueeHandlers.current.move(event);
    }
    function end(event: PointerEvent) {
      marqueeHandlers.current.end(event);
    }
    let listening = false;
    function attach() {
      if (listening) return;
      listening = true;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    }
    function detach() {
      if (!listening) return;
      listening = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    }
    marqueeBridge.current = { attach, detach };
    return detach;
  }, []);

  const itemsKey = useMemo(() => items.map((item) => item.id).join("\0"), [items]);

  useEffect(() => {
    if (dragStartOrder.current) return;
    orderedRef.current = items;
    setOrdered(items);
  }, [itemsKey, items]);

  const sensors = useSensors(
    useSensor(MediaPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const ids = useMemo(() => ordered.map((item) => item.id), [ordered]);
  const activeItem = activeId ? ordered.find((item) => item.id === activeId) ?? null : null;
  const dragCount = useMemo(() => {
    if (!activeId) return 0;
    if (!selection.has(activeId)) return 1;
    const visibleSelected = ordered.filter((item) => selection.has(item.id)).length;
    return Math.max(1, visibleSelected);
  }, [activeId, ordered, selection]);

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    setActiveWidth(event.active.rect.current.initial?.width ?? 160);
    dragStartOrder.current = orderedRef.current.slice();
    dragGuard.current = true;
  }

  function onDragOver(event: DragOverEvent) {
    const overId = event.over ? String(event.over.id) : "";
    const currentId = String(event.active.id);
    if (!overId) return;
    const current = orderedRef.current;
    let next = current;
    if (groupReorder) {
      next = moveMediaItems(current, currentId, overId, selectionRef.current);
    } else {
      const oldIndex = current.findIndex((item) => item.id === currentId);
      const newIndex = current.findIndex((item) => item.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      next = arrayMove(current, oldIndex, newIndex);
    }
    if (sameIdOrder(next, current)) return;
    orderedRef.current = next;
    setOrdered(next);
  }

  function finishDrag(commit: boolean) {
    setActiveId(null);
    const start = dragStartOrder.current;
    const end = orderedRef.current;
    dragStartOrder.current = null;
    window.setTimeout(() => {
      dragGuard.current = false;
    }, 180);
    if (!commit || !start || sameIdOrder(start, end)) return;
    onOrderChange?.(end);
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

  function idsInClientRect(rect: { left: number; top: number; right: number; bottom: number }) {
    const root = listRef.current;
    if (!root) return [] as string[];
    const hits: string[] = [];
    for (const node of root.querySelectorAll<HTMLElement>("[data-media-id]")) {
      const id = node.dataset.mediaId;
      if (!id) continue;
      const box = node.getBoundingClientRect();
      const overlaps =
        box.left < rect.right &&
        box.right > rect.left &&
        box.top < rect.bottom &&
        box.bottom > rect.top;
      if (overlaps) hits.push(id);
    }
    return hits;
  }

  function publishSelection(next: Set<string>) {
    const notify = onSelectionChangeRef.current;
    if (!notify || sameIdSet(next, selectionRef.current)) return;
    notify(next);
  }

  function onMarqueeMove(event: PointerEvent) {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    const dx = event.clientX - session.x;
    const dy = event.clientY - session.y;
    if (!session.active && Math.hypot(dx, dy) < 5) return;

    if (!session.active) {
      session.active = true;
      dragGuard.current = true;
    }

    const left = Math.min(session.x, event.clientX);
    const top = Math.min(session.y, event.clientY);
    const right = Math.max(session.x, event.clientX);
    const bottom = Math.max(session.y, event.clientY);
    setMarquee({ left, top, width: right - left, height: bottom - top });

    const scroller = findScroller(listRef.current);
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      const edge = 56;
      if (event.clientY < bounds.top + edge) {
        scroller.scrollTop -= Math.ceil(((bounds.top + edge - event.clientY) / edge) * 18);
      } else if (event.clientY > bounds.bottom - edge) {
        scroller.scrollTop += Math.ceil(((event.clientY - (bounds.bottom - edge)) / edge) * 18);
      }
    }

    const next = new Set(session.base);
    for (const id of idsInClientRect({ left, top, right, bottom })) next.add(id);
    publishSelection(next);
  }

  function endMarquee(event: PointerEvent) {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    sessionRef.current = null;
    setMarquee(null);
    marqueeBridge.current.detach();
    if (session.active) {
      window.setTimeout(() => {
        dragGuard.current = false;
      }, 120);
      return;
    }
    if (session.clearOnClick && !session.additive) {
      publishSelection(new Set());
    }
  }

  function onMarqueePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!onSelectionChangeRef.current || selectionDisabledRef.current) return;
    if (event.pointerType === "touch" || event.button !== 0) return;
    if (sessionRef.current) return;
    if (marqueeBlocked(event.target, event.shiftKey)) return;

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const target = event.target;
    sessionRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      additive,
      base: new Set(additive ? selectionRef.current : []),
      active: false,
      clearOnClick:
        target === event.currentTarget || target === listRef.current,
    };
    marqueeBridge.current.attach();
  }

  marqueeHandlers.current.move = onMarqueeMove;
  marqueeHandlers.current.end = endMarquee;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.WhileDragging,
          frequency: MeasuringFrequency.Optimized,
        },
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={ids} strategy={strategy}>
        <div
          className={cn(
            onSelectionChange ? "relative -m-3 select-none p-3" : "contents",
            marquee && "cursor-crosshair",
          )}
          onPointerDown={onSelectionChange ? onMarqueePointerDown : undefined}
        >
          <ul
            ref={listRef}
            className={cn(className, (activeId || marquee) && "touch-none")}
          >
            {ordered.map((item) => (
              <SortableTile
                key={item.id}
                item={item}
                disabled={disabled}
                isCompanion={
                  activeId != null &&
                  activeId !== item.id &&
                  selection.has(activeId) &&
                  selection.has(item.id) &&
                  dragCount > 1
                }
                dragCount={dragCount}
                renderItem={renderItem}
              />
            ))}
          </ul>
          {marquee ? (
            <div
              className="pointer-events-none fixed z-50 border border-brand bg-brand/15"
              style={{
                left: marquee.left,
                top: marquee.top,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          ) : null}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {activeItem && renderOverlay ? (
          <div
            className="relative cursor-grabbing rounded-xl shadow-2xl ring-2 ring-brand/50"
            style={{ width: activeWidth }}
          >
            {renderOverlay(activeItem)}
            {dragCount > 1 ? (
              <span className="absolute -top-2 -right-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-studio-ink px-2 text-xs font-semibold text-white shadow-md">
                {dragCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
