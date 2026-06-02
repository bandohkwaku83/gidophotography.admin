import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardPageSize = "full" | "medium" | "narrow";

const sizeClass: Record<DashboardPageSize, string> = {
  /** Wide but capped so ultra-wide monitors keep modest side margin without max-w-6xl gutters. */
  full: "w-full max-w-[1600px]",
  medium: "w-full max-w-5xl",
  narrow: "w-full max-w-2xl",
};

/** Standard dashboard page width wrapper. Prefer `full` for grids and overview pages. */
export function DashboardPage({
  children,
  className,
  size = "full",
}: {
  children: ReactNode;
  className?: string;
  size?: DashboardPageSize;
}) {
  return <div className={cn("mx-auto", sizeClass[size], className)}>{children}</div>;
}
