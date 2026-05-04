"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { ApiError } from "@/lib/clients-api";
import {
  formatNotificationWhen,
  isNotificationUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationBody,
  notificationRecordId,
  notificationTargetHref,
  notificationTitle,
  type ApiNotification,
} from "@/lib/notifications-api";
import { cn } from "@/lib/utils";

const PAGE_LIMIT = 30;

export default function NotificationsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [rows, setRows] = useState<ApiNotification[]>([]);
  const [nextSkip, setNextSkip] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const loadPage = useCallback(
    async (skip: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await listNotifications({ limit: PAGE_LIMIT, skip, unreadOnly: false });
        const t = typeof res.total === "number" ? res.total : res.count ?? null;
        setTotal(t);
        setNextSkip(skip + res.notifications.length);
        setRows((prev) => (append ? [...prev, ...res.notifications] : res.notifications));
      } catch (e) {
        const msg =
          e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not load notifications.";
        showToast(msg, "error");
        if (!append) {
          setRows([]);
          setNextSkip(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  const canLoadMore =
    total != null ? rows.length < total : rows.length > 0 && rows.length % PAGE_LIMIT === 0;

  async function onOpenRow(n: ApiNotification) {
    const id = notificationRecordId(n);
    if (!id) return;
    const href = notificationTargetHref(n);
    try {
      if (isNotificationUnread(n)) {
        await markNotificationRead(id);
        setRows((prev) =>
          prev.map((row) => (notificationRecordId(row) === id ? { ...row, readAt: new Date().toISOString() } : row)),
        );
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not update notification.";
      showToast(msg, "error");
    }
    if (href) router.push(href);
  }

  async function onMarkAllRead() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setRows((prev) => prev.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
      showToast("All notifications marked as read.", "success");
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not mark all as read.";
      showToast(msg, "error");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Notifications</h1>
        </div>
        <button
          type="button"
          onClick={() => void onMarkAllRead()}
          disabled={markingAll || rows.length === 0}
          className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          {markingAll ? "Marking…" : "Mark all read"}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          No notifications yet.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {rows.map((n) => {
              const id = notificationRecordId(n);
              const unread = isNotificationUnread(n);
              const when = formatNotificationWhen(n.createdAt ?? n.updatedAt);
              return (
                <li key={id || `${notificationTitle(n)}-${when}`}>
                  <button
                    type="button"
                    onClick={() => void onOpenRow(n)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-5 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/80",
                      unread && "bg-blue-50/70 dark:bg-blue-950/20",
                    )}
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className={cn("text-sm font-semibold", unread ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-200")}>
                        {notificationTitle(n)}
                      </span>
                      {when ? <span className="text-xs text-zinc-500 dark:text-zinc-400">{when}</span> : null}
                    </span>
                    {notificationBody(n) ? (
                      <span className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{notificationBody(n)}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {canLoadMore ? (
            <div className="flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadPage(nextSkip, true)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
