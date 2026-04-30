"use client";

import { Skeleton } from "antd";
import { cn } from "@/lib/utils";

const darkSkeleton =
  "[&_.ant-skeleton-content_.ant-skeleton-title]:rounded-md [&_.ant-skeleton-content_.ant-skeleton-paragraph>li]:rounded-md dark:[&_.ant-skeleton-content_.ant-skeleton-title]:!bg-zinc-700 dark:[&_.ant-skeleton-content_.ant-skeleton-paragraph>li]:!bg-zinc-700";

/** Gallery card placeholder (dashboard + galleries grid). */
export function GalleryCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
        darkSkeleton,
        className,
      )}
    >
      <div className="aspect-[5/3] w-full overflow-hidden">
        <Skeleton.Image
          active
          className="!flex !h-full !min-h-[140px] !w-full !items-center !justify-center !rounded-none"
        />
      </div>
      <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
        <Skeleton active title={{ width: "68%" }} paragraph={{ rows: 2, width: ["52%", "36%"] }} />
      </div>
    </div>
  );
}

/** Stat card number area while loading. */
export function StatValueSkeleton() {
  return (
    <div className={cn("mt-4", darkSkeleton)}>
      <Skeleton active title={{ width: 56, style: { height: 36, marginTop: 0 } }} paragraph={false} />
    </div>
  );
}

/** Full folder detail page initial load. */
export function FolderDetailPageSkeleton() {
  return (
    <div className={cn("mx-auto max-w-6xl space-y-6", darkSkeleton)}>
      <Skeleton active title={{ width: 220 }} paragraph={false} />
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
        <Skeleton.Image active className="!h-[200px] !w-full md:!h-[240px]" />
      </div>
      <Skeleton active title={false} paragraph={{ rows: 1, width: "100%", style: { height: 160 } }} />
      <Skeleton active title={false} paragraph={{ rows: 1, width: "100%", style: { height: 56 } }} />
      <Skeleton active title={false} paragraph={{ rows: 1, width: "100%", style: { height: 288 } }} />
    </div>
  );
}

/** Client share gallery full-screen load. */
export function ClientGalleryPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <div className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950 lg:px-8">
        <Skeleton.Input active size="large" style={{ width: 160, height: 32 }} />
      </div>
      <div className={cn("mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 lg:px-8", darkSkeleton)}>
        <Skeleton active title={{ width: "40%" }} paragraph={{ rows: 2, width: ["100%", "70%"] }} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded-lg">
              <Skeleton.Image active className="!flex !h-full !min-h-[120px] !w-full !items-center !justify-center" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Clients table area (initial / empty fetch). */
export function ClientsTableSkeleton() {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950", darkSkeleton)}>
      <Skeleton active title={{ width: "28%" }} paragraph={{ rows: 10, width: ["100%", "100%", "100%", "100%", "100%", "100%", "100%", "100%", "100%", "72%"] }} />
    </div>
  );
}

/** Settings workflow block. */
export function SettingsWorkflowSkeleton() {
  return (
    <div className={cn("space-y-4", darkSkeleton)}>
      <Skeleton active title={{ width: "50%" }} paragraph={{ rows: 1, width: ["100%"] }} />
      <Skeleton active title={false} paragraph={{ rows: 4, width: ["100%", "100%", "80%", "60%"] }} />
    </div>
  );
}

/** Small square for icon-sized loading (e.g. delete in progress). */
export function InlineActionSkeleton({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center", darkSkeleton, className)} aria-hidden>
      <Skeleton.Avatar active size={16} shape="square" />
    </span>
  );
}

/** Indeterminate segment inside an existing progress track (parent sets height/radius). */
export function UploadIndeterminateBarSkeleton() {
  return (
    <div className={cn("h-full w-full", darkSkeleton)}>
      <Skeleton active title={{ width: "100%", style: { height: 8, margin: 0 } }} paragraph={false} />
    </div>
  );
}

/** Compact row for “list refreshing” hints (e.g. under a grid). */
export function ListRefreshSkeleton() {
  return (
    <div className={cn("mx-auto flex max-w-xs justify-center py-1", darkSkeleton)}>
      <Skeleton active title={false} paragraph={{ rows: 1, width: "100%" }} />
    </div>
  );
}

/** Header / banner “activity” indicator while a request runs (replaces spinners). */
export function InlineStatusSkeleton({ size = 16 }: { size?: number }) {
  return (
    <span className={cn("inline-flex shrink-0", darkSkeleton)} aria-hidden>
      <Skeleton.Avatar active size={size} shape="circle" />
    </span>
  );
}

/** Dashboard activity sidebar while data is loading. */
export function ActivityFeedSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className={cn("mt-4 space-y-0", darkSkeleton)}>
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex gap-3 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800/80"
        >
          <Skeleton.Avatar active size={32} shape="square" className="!rounded-lg" />
          <div className="min-w-0 flex-1 pt-0.5">
            <Skeleton active title={{ width: "78%" }} paragraph={{ rows: 1, width: "36%" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
