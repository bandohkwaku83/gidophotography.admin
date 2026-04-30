"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock3,
  FolderOpen,
  MessageSquare,
  Plus,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import {
  activityItemToLabel,
  dashboardRecentGalleryToApiFolder,
  DashboardApiError,
  fetchDashboard,
  type DashboardStats,
} from "@/lib/dashboard-api";
import { getAuth, getAuthToken } from "@/lib/auth-demo";
import { CreateClientModal } from "@/components/photographer/create-client-modal";
import { CreateFolderModal } from "@/components/photographer/create-folder-modal";
import { GalleryPreviewCard } from "@/components/photographer/gallery-preview-card";
import {
  apiFolderStatusToUi,
  getFolderClientName,
  listFolders,
  type ApiFolder,
} from "@/lib/folders-api";
import { listClients } from "@/lib/clients-api";
import { cn } from "@/lib/utils";
import {
  ActivityFeedSkeleton,
  GalleryCardSkeleton,
  StatValueSkeleton,
} from "@/components/ui/skeletons";

function firstWordFromName(name: string): string {
  const t = name.trim();
  if (!t) return "";
  const first = t.split(/\s+/)[0];
  return first ?? t;
}

function firstNameFromAuth(): string {
  if (typeof window === "undefined") return "there";
  const a = getAuth();
  const n = a?.user?.name?.trim();
  if (n) {
    const first = n.split(/\s+/)[0];
    if (first) return first;
  }
  const email = a?.email?.trim();
  if (email) {
    const local = email.split("@")[0];
    if (local) return local;
  }
  return "there";
}

type QuickItem = {
  href: string;
  label: string;
  sub: string;
  icon: typeof FolderOpen;
};

type ActivityRow = {
  title: string;
  when: string;
  galleryId?: string;
};

const QUICK_LINKS: QuickItem[] = [
  {
    href: "/dashboard/galleries",
    label: "Galleries",
    sub: "Browse & manage",
    icon: FolderOpen,
  },
  {
    href: "/dashboard/clients",
    label: "Clients",
    sub: "Directory",
    icon: Users,
  },
  {
    href: "/dashboard/sms",
    label: "SMS",
    sub: "Texts to clients & contacts",
    icon: MessageSquare,
  },
];

export default function DashboardPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [folders, setFolders] = useState<ApiFolder[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("there");
  const [clientNameById, setClientNameById] = useState<Map<string, string>>(
    new Map(),
  );
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [serverDateIso, setServerDateIso] = useState<string | null>(null);
  const [dashboardActivity, setDashboardActivity] = useState<ActivityRow[]>([]);

  useEffect(() => {
    setGreeting(firstNameFromAuth());
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const token = getAuthToken();
      if (token && API_BASE_URL) {
        try {
          const d = await fetchDashboard();
          setStats(d.stats);
          setServerDateIso(d.serverDate);
          const fromUser = firstWordFromName(d.user.name);
          setGreeting(fromUser || firstNameFromAuth());
          setFolders(d.recentGalleries.map(dashboardRecentGalleryToApiFolder));
          setClientCount(d.stats.totalClients);
          setClientNameById(new Map());
          setDashboardActivity(
            d.activity.map((a) => ({
              title: activityItemToLabel(a),
              when: a.at,
              galleryId: a.galleryId,
            })),
          );
          return;
        } catch (e) {
          if (e instanceof DashboardApiError && e.status === 401) return;
          console.warn("[dashboard] GET /api/dashboard failed, using folder/client lists", e);
        }
      }

      setStats(null);
      setServerDateIso(null);
      setDashboardActivity([]);
      const [foldersList, clientsRes] = await Promise.all([
        listFolders().catch(() => [] as ApiFolder[]),
        listClients().catch(() => ({ count: 0, clients: [] as { _id: string; name: string }[] })),
      ]);
      setFolders(foldersList);
      setClientCount(clientsRes.count ?? clientsRes.clients.length);
      const map = new Map<string, string>();
      for (const c of clientsRes.clients) map.set(c._id, c.name);
      setClientNameById(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function handleSaved(_saved?: ApiFolder) {
    void refresh();
  }

  const pipeline = useMemo(() => {
    let draft = 0;
    let selectionPending = 0;
    let completed = 0;
    for (const f of folders) {
      const s = apiFolderStatusToUi(f.status);
      if (s === "COMPLETED") completed += 1;
      else if (s === "SELECTION_PENDING") selectionPending += 1;
      else draft += 1;
    }
    const inProgress = draft + selectionPending;
    return { draft, selectionPending, completed, inProgress };
  }, [folders]);

  const displayStats = useMemo(() => {
    if (stats) return stats;
    return {
      totalClients: clientCount,
      totalGalleries: folders.length,
      inProgressGalleries: pipeline.inProgress,
      completedGalleries: pipeline.completed,
    };
  }, [stats, clientCount, folders.length, pipeline]);

  const recentGalleries = useMemo(() => {
    if (stats) return folders;
    return [...folders]
      .sort((a, b) => {
        const ta = a.updatedAt ?? a.createdAt ?? "";
        const tb = b.updatedAt ?? b.createdAt ?? "";
        return tb.localeCompare(ta);
      })
      .slice(0, 3);
  }, [stats, folders]);

  const derivedActivity = useMemo(() => {
    return [...folders]
      .map((f) => {
        const displayName = f.eventName?.trim() || getFolderClientName(f, clientNameById);
        const created = f.createdAt ?? "";
        const updated = f.updatedAt ?? "";
        const when = updated || created;
        const isLikelyNew =
          created &&
          (!updated || updated === created || new Date(updated).getTime() - new Date(created).getTime() < 120000);
        return {
          title: isLikelyNew ? `New gallery · ${displayName}` : `Updated · ${displayName}`,
          when,
          galleryId: f._id,
        };
      })
      .filter((a) => a.when)
      .sort((a, b) => b.when.localeCompare(a.when))
      .slice(0, 8);
  }, [folders, clientNameById]);

  const recentActivity = stats ? dashboardActivity : derivedActivity;

  const compact = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return String(n);
  };

  const todayLabel = useMemo(() => {
    if (serverDateIso) {
      try {
        const d = new Date(serverDateIso);
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          });
        }
      } catch {
        /* ignore */
      }
    }
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [serverDateIso]);

  const statCards = [
    {
      label: "Clients",
      value: compact(displayStats.totalClients),
      hint: "In your directory",
      icon: Users,
      glow: "from-slate-500/15 to-slate-600/5",
      iconClass: "text-slate-700 dark:text-slate-300",
      iconBg: "bg-slate-100 dark:bg-slate-800/50",
    },
    {
      label: "Galleries",
      value: compact(displayStats.totalGalleries),
      hint: "Total projects",
      icon: FolderOpen,
      glow: "from-brand/20 to-brand/5",
      iconClass: "text-brand dark:text-brand-on-dark",
      iconBg: "bg-brand/10 dark:bg-brand/20",
    },
    {
      label: "In progress",
      value: compact(displayStats.inProgressGalleries),
      hint: "Draft or selecting",
      icon: Clock3,
      glow: "from-amber-500/20 to-amber-600/5",
      iconClass: "text-amber-600 dark:text-amber-300",
      iconBg: "bg-amber-100 dark:bg-amber-950/50",
    },
    {
      label: "Completed",
      value: compact(displayStats.completedGalleries),
      hint: "Delivered",
      icon: CheckCircle2,
      glow: "from-emerald-500/20 to-emerald-600/5",
      iconClass: "text-emerald-600 dark:text-emerald-300",
      iconBg: "bg-emerald-100 dark:bg-emerald-950/50",
    },
  ] as const;

  function formatRelativeTime(iso: string) {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    const diffMs = Date.now() - t;
    if (!Number.isFinite(diffMs)) return new Date(iso).toLocaleDateString();
    if (diffMs < 0) return new Date(iso).toLocaleDateString();

    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;

    const hours = Math.floor(diffMs / 3600000);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(diffMs / 86400000);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;

    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year:
        new Date(iso).getFullYear() === new Date().getFullYear()
          ? undefined
          : "numeric",
    });
  }

  return (
    <div className="relative mx-auto max-w-6xl space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#2F3E46] px-4 py-4 shadow-md shadow-black/20 sm:px-5 sm:py-5 dark:border-white/10">
        <div className="relative text-center lg:text-left">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/95 shadow-sm backdrop-blur-sm sm:text-xs">
              <Calendar className="h-3 w-3 shrink-0 text-white/80 sm:h-3.5 sm:w-3.5" aria-hidden />
              <span className="tracking-wide">{todayLabel}</span>
            </div>
            <h1 className="mt-2.5 text-balance text-2xl font-semibold tracking-tight sm:text-3xl sm:leading-snug">
              <span className="text-white/90">Hi, </span>
              <span className="text-white">{greeting}</span>
            </h1>
            <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-brand shadow-md shadow-black/10 transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#2F3E46]"
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                New gallery
              </button>
              <button
                type="button"
                onClick={() => setAddClientOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/40 bg-transparent px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/10"
              >
                <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                Add client
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((c) => (
          <div
            key={c.label}
            className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div
              className={cn(
                "pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br opacity-70 blur-2xl",
                c.glow,
              )}
              aria-hidden
            />
            <div className="relative">
              <div
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-xl",
                  c.iconBg,
                )}
              >
                <c.icon className={cn("h-5 w-5", c.iconClass)} aria-hidden="true" />
              </div>
              {loading ? (
                <StatValueSkeleton />
              ) : (
                <p className="mt-4 text-3xl font-semibold tabular-nums leading-none text-zinc-900 dark:text-zinc-50">
                  {c.value}
                </p>
              )}
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.label}</p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">{c.hint}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition hover:border-brand/25 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-brand/40"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 transition group-hover:bg-brand/10 group-hover:text-brand dark:bg-zinc-800/80 dark:text-zinc-300 dark:group-hover:bg-brand/20 dark:group-hover:text-brand-on-dark">
              <q.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{q.label}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">{q.sub}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-brand dark:text-zinc-600 dark:group-hover:text-brand-on-dark" />
          </Link>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent galleries</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Last updated, newest first</p>
            </div>
            <Link
              href="/dashboard/galleries"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand transition hover:text-brand-hover dark:text-brand-on-dark dark:hover:text-white"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          {loading && recentGalleries.length === 0 ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <GalleryCardSkeleton key={i} />
              ))}
            </div>
          ) : recentGalleries.length === 0 ? (
            <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/20">
              <Sparkles className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">No galleries yet</p>
              <p className="mt-1 max-w-sm text-xs text-zinc-500">Create a gallery to start uploading and sharing with clients.</p>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-sm hover:bg-brand-hover"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New gallery
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentGalleries.map((g) => (
                <GalleryPreviewCard
                  key={g._id}
                  folder={g}
                  clientNameById={clientNameById}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Activity</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Latest changes to your galleries</p>
          {loading && recentActivity.length === 0 ? (
            <ActivityFeedSkeleton rows={5} />
          ) : recentActivity.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500">No activity yet.</p>
          ) : (
            <ul className="mt-4 space-y-0">
              {recentActivity.map((a, idx) => {
                const key = `${a.title}-${a.when}-${idx}`;
                const body = (
                  <>
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-on-dark">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">{a.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{formatRelativeTime(a.when)}</p>
                    </div>
                  </>
                );
                if (a.galleryId) {
                  return (
                    <li key={key} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80">
                      <Link
                        href={`/dashboard/folder/${a.galleryId}`}
                        className="flex gap-3 py-3 transition hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                      >
                        {body}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li
                    key={key}
                    className="flex gap-3 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800/80"
                  >
                    {body}
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/dashboard/galleries"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
          >
            Open galleries
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <CreateFolderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={handleSaved}
      />
      <CreateClientModal
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onSaved={() => {
          void refresh();
        }}
      />
    </div>
  );
}
