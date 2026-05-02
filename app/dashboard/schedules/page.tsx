"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  Camera,
  Heart,
  Briefcase,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ShootKind = "wedding" | "portrait" | "commercial" | "other";

type BookedShoot = {
  id: string;
  title: string;
  client: string;
  date: string;
  startTime: string;
  endTime?: string;
  location?: string;
  kind: ShootKind;
  notes?: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const KIND_META: Record<
  ShootKind,
  { label: string; dot: string; chip: string; Icon: typeof Heart }
> = {
  wedding: {
    label: "Wedding",
    dot: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-800 ring-rose-500/25 dark:text-rose-200 dark:ring-rose-500/30",
    Icon: Heart,
  },
  portrait: {
    label: "Portrait",
    dot: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-800 ring-violet-500/25 dark:text-violet-200 dark:ring-violet-500/30",
    Icon: Camera,
  },
  commercial: {
    label: "Commercial",
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-900 ring-amber-500/25 dark:text-amber-100 dark:ring-amber-500/35",
    Icon: Briefcase,
  },
  other: {
    label: "Other",
    dot: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-800 ring-sky-500/25 dark:text-sky-200 dark:ring-sky-500/30",
    Icon: CircleDot,
  },
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIso(y: number, m: number, day: number) {
  return `${y}-${pad2(m + 1)}-${pad2(day)}`;
}

function parseIso(iso: string) {
  const [yy, mm, dd] = iso.split("-").map(Number);
  return { y: yy, m: mm - 1, d: dd };
}

/** Demo bookings for the visible month (UI only). */
function mockShootsForMonth(year: number, month: number): BookedShoot[] {
  const iso = (day: number) => toIso(year, month, day);
  return [
    {
      id: "s1",
      title: "Rivera engagement",
      client: "Rivera",
      date: iso(4),
      startTime: "10:00 AM",
      endTime: "12:30 PM",
      location: "Green Park",
      kind: "portrait",
      notes: "Golden hour priority",
    },
    {
      id: "s2",
      title: "Chen wedding — ceremony",
      client: "Chen",
      date: iso(8),
      startTime: "3:00 PM",
      endTime: "6:00 PM",
      location: "St. Mary’s Chapel",
      kind: "wedding",
    },
    {
      id: "s3",
      title: "Brand shoot — spring catalog",
      client: "Northline Co.",
      date: iso(8),
      startTime: "9:00 AM",
      endTime: "4:00 PM",
      location: "Studio B",
      kind: "commercial",
    },
    {
      id: "s4",
      title: "Patel family portraits",
      client: "Patel",
      date: iso(14),
      startTime: "11:00 AM",
      location: "Home session",
      kind: "portrait",
    },
    {
      id: "s5",
      title: "Okonkwo wedding — reception",
      client: "Okonkwo",
      date: iso(21),
      startTime: "6:00 PM",
      location: "Harbor Events",
      kind: "wedding",
    },
    {
      id: "s6",
      title: "Headshots — legal firm",
      client: "Braddock LLP",
      date: iso(26),
      startTime: "1:00 PM",
      endTime: "5:00 PM",
      location: "Office tower — 12th fl",
      kind: "commercial",
    },
    {
      id: "s7",
      title: "Styled editorial",
      client: "Magazine pitch",
      date: iso(29),
      startTime: "8:00 AM",
      location: "Downtown loft",
      kind: "other",
    },
  ];
}

function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows: (number | null)[][] = [];
  let row: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) row.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    row.push(d);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) {
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

function isToday(y: number, m: number, day: number) {
  const t = new Date();
  return t.getFullYear() === y && t.getMonth() === m && t.getDate() === day;
}

export default function SchedulesPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [kindFilter, setKindFilter] = useState<ShootKind | "all">("all");

  const shoots = useMemo(
    () => mockShootsForMonth(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const filteredShoots = useMemo(
    () => (kindFilter === "all" ? shoots : shoots.filter((s) => s.kind === kindFilter)),
    [shoots, kindFilter],
  );

  const byDate = useMemo(() => {
    const m = new Map<string, BookedShoot[]>();
    for (const s of filteredShoots) {
      const list = m.get(s.date) ?? [];
      list.push(s);
      m.set(s.date, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return m;
  }, [filteredShoots]);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  function goPrev() {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }

  function goNext() {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

  function goToday() {
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
    setSelectedDay(n.getDate());
  }

  const selectedIso =
    selectedDay != null ? toIso(viewYear, viewMonth, selectedDay) : null;
  const selectedShoots = selectedIso ? (byDate.get(selectedIso) ?? []) : [];

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    d.setDate(d.getDate() - dow);
    return d;
  }, []);

  const weekEnd = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
  }, [weekStart]);

  const thisWeekCount = useMemo(() => {
    return shoots.filter((s) => {
      const { y, m, d } = parseIso(s.date);
      const dt = new Date(y, m, d);
      return dt >= weekStart && dt <= weekEnd;
    }).length;
  }, [shoots, weekStart, weekEnd]);

  const upcomingSorted = useMemo(() => {
    return [...filteredShoots].sort((a, b) => {
      const c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [filteredShoots]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Schedules
          </h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
            Plan and track booked shoots. Connect a calendar backend later—this page is a layout
            preview with sample bookings.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New booking
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "wedding", "portrait", "commercial", "other"] as const).map((k) => {
          const active = kindFilter === k;
          const label = k === "all" ? "All" : KIND_META[k].label;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-brand bg-brand/10 text-brand-ink ring-2 ring-brand/25 dark:text-brand-on-dark"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-brand dark:text-brand-on-dark" aria-hidden />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{monthTitle}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Today
              </button>
              <button
                type="button"
                onClick={goNext}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-px rounded-xl bg-zinc-200 dark:bg-zinc-800">
            {WEEKDAYS.map((wd) => (
              <div
                key={wd}
                className="bg-zinc-50 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
              >
                {wd}
              </div>
            ))}
            {grid.flat().map((day, idx) => {
              if (day == null) {
                return (
                  <div
                    key={`e-${idx}`}
                    className="min-h-[5.5rem] bg-zinc-50/80 dark:bg-zinc-900/40"
                  />
                );
              }
              const iso = toIso(viewYear, viewMonth, day);
              const dayShoots = byDate.get(iso) ?? [];
              const selected = selectedDay === day;
              const todayCell = isToday(viewYear, viewMonth, day);

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "flex min-h-[5.5rem] flex-col items-stretch border border-transparent bg-white p-1.5 text-left transition hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/80",
                    selected && "ring-2 ring-inset ring-brand dark:ring-brand-on-dark",
                    todayCell && !selected && "ring-1 ring-inset ring-zinc-300 dark:ring-zinc-600",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                      todayCell
                        ? "bg-brand text-white dark:bg-brand-on-dark dark:text-zinc-950"
                        : "text-zinc-800 dark:text-zinc-100",
                    )}
                  >
                    {day}
                  </span>
                  <div className="mt-1 flex min-h-0 flex-1 flex-wrap content-start gap-0.5">
                    {dayShoots.slice(0, 4).map((s) => (
                      <span
                        key={s.id}
                        title={`${s.title} · ${s.startTime}`}
                        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", KIND_META[s.kind].dot)}
                      />
                    ))}
                    {dayShoots.length > 4 ? (
                      <span className="text-[9px] font-medium text-zinc-400">+{dayShoots.length - 4}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            {(Object.keys(KIND_META) as ShootKind[]).map((k) => (
              <div key={k} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span className={cn("h-2 w-2 rounded-full", KIND_META[k].dot)} />
                {KIND_META[k].label}
              </div>
            ))}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">This week</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {thisWeekCount}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Booked shoots (sample data)</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {selectedIso
                ? new Date(selectedIso + "T12:00:00").toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })
                : "Pick a day"}
            </h3>
            {selectedShoots.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No shoots on this day.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {selectedShoots.map((s) => {
                  const meta = KIND_META[s.kind];
                  const Icon = meta.Icon;
                  return (
                    <li
                      key={s.id}
                      className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{s.title}</p>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                            meta.chip,
                          )}
                        >
                          <Icon className="h-3 w-3" aria-hidden />
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{s.client}</p>
                      <div className="mt-2 flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {s.startTime}
                          {s.endTime ? ` – ${s.endTime}` : ""}
                        </span>
                        {s.location ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {s.location}
                          </span>
                        ) : null}
                        {s.notes ? (
                          <p className="mt-1 border-t border-zinc-200/80 pt-2 text-[11px] leading-snug dark:border-zinc-700">
                            {s.notes}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Month overview</h3>
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {upcomingSorted.map((s) => {
                const meta = KIND_META[s.kind];
                const when = new Date(s.date + "T12:00:00").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                });
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const { y, m, d } = parseIso(s.date);
                        setViewYear(y);
                        setViewMonth(m);
                        setSelectedDay(d);
                      }}
                      className="flex w-full items-start gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60"
                    >
                      <span
                        className={cn(
                          "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                          meta.dot,
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                          {s.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-zinc-500">
                          {when} · {s.startTime}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
