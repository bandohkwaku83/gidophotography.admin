"use client";

import { useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import {
  masonryColumnListClass,
  masonryGalleryListClass,
  packStableMasonryColumns,
} from "@/components/client/share-gallery-bits";

export function useMasonryColumnCount(): number {
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setColumnCount(mq.matches ? 4 : 2);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return columnCount;
}

type ShareGalleryMasonryListProps<T extends { id: string }> = {
  items: T[];
  columnCount: number;
  /** When this changes, column assignments reset (tab, collection, share token). */
  resetKey: string;
  children: (item: T, index: number) => ReactNode;
};

export function ShareGalleryMasonryList<T extends { id: string }>({
  items,
  columnCount,
  resetKey,
  children,
}: ShareGalleryMasonryListProps<T>) {
  const assignmentsRef = useRef(new Map<string, number>());
  const resetKeyRef = useRef(resetKey);
  const columnCountRef = useRef(columnCount);

  if (resetKeyRef.current !== resetKey) {
    assignmentsRef.current.clear();
    resetKeyRef.current = resetKey;
  }

  if (columnCountRef.current !== columnCount) {
    assignmentsRef.current.clear();
    columnCountRef.current = columnCount;
  }

  const columns = useMemo(
    () => packStableMasonryColumns(items, columnCount, assignmentsRef.current),
    [items, columnCount, resetKey],
  );

  let index = 0;

  return (
    <div className={masonryGalleryListClass()}>
      {columns.map((columnItems, columnIndex) => (
        <ul key={columnIndex} className={masonryColumnListClass()}>
          {columnItems.map((item) => {
            const node = children(item, index);
            index += 1;
            return node;
          })}
        </ul>
      ))}
    </div>
  );
}
