import { Suspense } from "react";
import { SchedulesClient } from "./schedules-client";

export default function SchedulesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Loading schedule…
        </div>
      }
    >
      <SchedulesClient />
    </Suspense>
  );
}
