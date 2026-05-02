"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { NewBookingModal, type NewBookingDraft } from "@/components/schedules/new-booking-modal";
import {
  formatBookedTimeLabel,
  type BookedShoot,
  type ShootKind,
  KIND_META,
  SHOOT_KINDS_ORDER,
  timeSortMinutes,
} from "@/components/schedules/booking-types";
import {
  apiColorToDotClass,
  apiShootTypeToKind,
  getBookingsMeta,
  getBookingsWeekSummary,
  kindToApiShootType,
  listBookings,
  mapApiBookingToBookedShoot,
  createBooking,
  formatHmToApi12h,
  type BookingShootTypeMeta,
} from "@/lib/bookings-api";
import { ApiError } from "@/lib/clients-api";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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

function shootDotClass(s: BookedShoot): string {
  return apiColorToDotClass(s.shootColor) ?? KIND_META[s.kind].dot;
}

export default function SchedulesPage() {
  const { showToast } = useToast();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [kindFilter, setKindFilter] = useState<ShootKind | "all">("all");

  const [bookings, setBookings] = useState<BookedShoot[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [shootTypesMeta, setShootTypesMeta] = useState<BookingShootTypeMeta[]>([]);
  const [legendMeta, setLegendMeta] = useState<BookingShootTypeMeta[]>([]);
  const [weekBookedCount, setWeekBookedCount] = useState<number | null>(null);

  const filterKeys = useMemo((): readonly (ShootKind | "all")[] => {
    if (shootTypesMeta.length > 0) {
      const kinds: ShootKind[] = [];
      for (const t of shootTypesMeta) {
        const k = apiShootTypeToKind(t.id);
        if (!kinds.includes(k)) kinds.push(k);
      }
      return ["all", ...kinds];
    }
    return ["all", ...SHOOT_KINDS_ORDER];
  }, [shootTypesMeta]);

  const loadMonth = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const typeParam =
        kindFilter === "all" ? "" : kindToApiShootType(kindFilter);
      const res = await listBookings({
        year: viewYear,
        month: viewMonth + 1,
        type: typeParam,
      });
      setBookings(res.bookings.map(mapApiBookingToBookedShoot));
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not load bookings.";
      showToast(msg, "error");
      setBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }, [viewYear, viewMonth, kindFilter, showToast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const meta = await getBookingsMeta();
        if (cancelled) return;
        setShootTypesMeta(meta.shootTypes);
        setLegendMeta(meta.legend.length > 0 ? meta.legend : meta.shootTypes);
      } catch (e) {
        if (!cancelled) {
          showToast(e instanceof Error ? e.message : "Could not load booking types.", "error");
          setShootTypesMeta([]);
          setLegendMeta([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const w = await getBookingsWeekSummary();
        if (!cancelled) setWeekBookedCount(w.bookedCount);
      } catch {
        if (!cancelled) setWeekBookedCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  const shoots = useMemo(() => {
    return bookings.filter((b) => {
      const { y, m } = parseIso(b.date);
      return y === viewYear && m === viewMonth;
    });
  }, [bookings, viewYear, viewMonth]);

  const byDate = useMemo(() => {
    const map = new Map<string, BookedShoot[]>();
    for (const s of shoots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => timeSortMinutes(a.startTime) - timeSortMinutes(b.startTime));
    }
    return map;
  }, [shoots]);

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

  const modalDefaultDate =
    selectedIso ??
    toIso(today.getFullYear(), today.getMonth(), today.getDate());

  const upcomingSorted = useMemo(() => {
    return [...shoots].sort((a, b) => {
      const c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      return timeSortMinutes(a.startTime) - timeSortMinutes(b.startTime);
    });
  }, [shoots]);

  async function handleSaveBooking(draft: NewBookingDraft) {
    const { booking } = await createBooking({
      title: draft.title,
      clientId: draft.clientId,
      date: draft.date,
      shootType: kindToApiShootType(draft.kind),
      start: formatHmToApi12h(draft.startTime),
      end: draft.endTime ? formatHmToApi12h(draft.endTime) : "",
      location: draft.location?.trim() ?? "",
      description: draft.description?.trim() ?? "",
    });
    const mapped = mapApiBookingToBookedShoot(booking);
    setBookings((prev) => {
      const rest = prev.filter((b) => b.id !== mapped.id);
      return [...rest, mapped];
    });
    const { y, m, d } = parseIso(draft.date);
    setViewYear(y);
    setViewMonth(m);
    setSelectedDay(d);
    showToast("Booking saved.", "success");
    void (async () => {
      try {
        const w = await getBookingsWeekSummary();
        setWeekBookedCount(w.bookedCount);
      } catch {
        /* ignore */
      }
    })();
  }

  function filterChipLabel(k: ShootKind | "all"): string {
    if (k === "all") return "All";
    if (shootTypesMeta.length > 0) {
      const hit = shootTypesMeta.find((t) => apiShootTypeToKind(t.id) === k);
      if (hit) return hit.label;
    }
    return KIND_META[k].label;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Schedules
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setBookingModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New booking
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterKeys.map((k) => {
          const active = kindFilter === k;
          const label = filterChipLabel(k);
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

          {bookingsLoading ? (
            <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading bookings…</p>
          ) : null}

          <div className={cn("mt-4 grid grid-cols-7 gap-px rounded-xl bg-zinc-200 dark:bg-zinc-800", bookingsLoading && "opacity-50")}>
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
                        title={`${s.title} · ${formatBookedTimeLabel(s.startTime)}`}
                        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", shootDotClass(s))}
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
            {legendMeta.length > 0
              ? legendMeta.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        apiColorToDotClass(t.color) ?? "bg-zinc-400",
                      )}
                    />
                    {t.label}
                  </div>
                ))
              : SHOOT_KINDS_ORDER.map((k) => (
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
              {weekBookedCount ?? "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Booked shoots</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {selectedIso
                  ? new Date(selectedIso + "T12:00:00").toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : "Pick a day"}
              </h3>
              <button
                type="button"
                onClick={() => setBookingModalOpen(true)}
                className="shrink-0 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Add
              </button>
            </div>
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
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{s.clientName}</p>
                      <div className="mt-2 flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {formatBookedTimeLabel(s.startTime)}
                          {s.endTime ? ` – ${formatBookedTimeLabel(s.endTime)}` : ""}
                        </span>
                        {s.location ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {s.location}
                          </span>
                        ) : null}
                        {s.description ? (
                          <p className="mt-1 border-t border-zinc-200/80 pt-2 text-[11px] leading-snug text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                            {s.description}
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
                          shootDotClass(s),
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                          {s.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-zinc-500">
                          {when} · {formatBookedTimeLabel(s.startTime)}
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

      <NewBookingModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        defaultDate={modalDefaultDate}
        shootTypes={shootTypesMeta}
        onSave={handleSaveBooking}
      />
    </div>
  );
}
