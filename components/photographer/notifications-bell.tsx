"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/clients-api";
import {
  formatNotificationWhen,
  getNotificationsUnreadCount,
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

const POLL_MS = 45_000;
const PANEL_LIMIT = 15;

export function NotificationsBell() {
  const router = useRouter();
  const { showToast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const n = await getNotificationsUnreadCount();
      setUnreadCount(n);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      /* quiet refresh */
    }
  }, []);

  useEffect(() => {
    void refreshUnread();
    const t = window.setInterval(() => void refreshUnread(), POLL_MS);
    return () => window.clearInterval(t);
  }, [refreshUnread]);

  useEffect(() => {
    function onFocus() {
      void refreshUnread();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUnread]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPanel(true);
    void (async () => {
      try {
        const res = await listNotifications({ limit: PANEL_LIMIT, skip: 0, unreadOnly: false });
        if (!cancelled) setItems(res.notifications);
      } catch (e) {
        if (!cancelled) {
          const msg =
            e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not load notifications.";
          showToast(msg, "error");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoadingPanel(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, showToast]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  async function onRowActivate(n: ApiNotification) {
    const id = notificationRecordId(n);
    if (!id) return;
    const href = notificationTargetHref(n);
    try {
      if (isNotificationUnread(n)) {
        await markNotificationRead(id);
        setUnreadCount((c) => Math.max(0, c - 1));
        setItems((prev) =>
          prev.map((row) => (notificationRecordId(row) === id ? { ...row, readAt: new Date().toISOString() } : row)),
        );
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not update notification.";
      showToast(msg, "error");
    }
    setOpen(false);
    if (href) router.push(href);
  }

  async function onMarkAllRead() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setItems((prev) => prev.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
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
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50",
          "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
          open && "ring-2 ring-brand/35 dark:ring-brand/40",
        )}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-[min(calc(100vw-2rem),380px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Notifications</p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void onMarkAllRead()}
                  disabled={markingAll}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-brand/10 disabled:opacity-50 dark:text-brand-on-dark dark:hover:bg-brand/15"
                >
                  {markingAll ? "…" : "Mark all read"}
                </button>
              ) : null}
              <Link
                href="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                View all
              </Link>
            </div>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {loadingPanel ? (
              <div className="flex items-center justify-center py-12 text-zinc-500">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((n) => {
                  const id = notificationRecordId(n);
                  const unread = isNotificationUnread(n);
                  const when = formatNotificationWhen(n.createdAt ?? n.updatedAt);
                  return (
                    <li key={id || `${notificationTitle(n)}-${when}`}>
                      <button
                        type="button"
                        onClick={() => void onRowActivate(n)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/80",
                          unread && "bg-blue-50/80 dark:bg-blue-950/25",
                        )}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className={cn("text-sm font-semibold", unread ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-200")}>
                            {notificationTitle(n)}
                          </span>
                          {when ? (
                            <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">{when}</span>
                          ) : null}
                        </span>
                        {notificationBody(n) ? (
                          <span className="line-clamp-2 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
                            {notificationBody(n)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
