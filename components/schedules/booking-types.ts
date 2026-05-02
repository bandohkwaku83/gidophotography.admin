import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Cake,
  Camera,
  CircleDot,
  GraduationCap,
  Heart,
  Trees,
} from "lucide-react";

export type ShootKind =
  | "wedding"
  | "outdoor"
  | "birthday"
  | "graduation"
  | "portraits"
  | "commercial"
  | "other";

export type BookedShoot = {
  id: string;
  title: string;
  /** Selected client id (from `/api/clients`). */
  clientId: string;
  /** Display name snapshot for lists and calendar. */
  clientName: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** "HH:mm" 24h preferred; legacy strings with AM/PM still render */
  startTime: string;
  endTime?: string;
  location?: string;
  kind: ShootKind;
  /** API-only notes field. */
  description?: string;
  /** API legend color key (`red`, `sky`, …) for dots when present. */
  shootColor?: string;
};

export const KIND_META: Record<
  ShootKind,
  { label: string; dot: string; chip: string; Icon: LucideIcon }
> = {
  wedding: {
    label: "Wedding",
    dot: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-800 ring-rose-500/25 dark:text-rose-200 dark:ring-rose-500/30",
    Icon: Heart,
  },
  outdoor: {
    label: "Outdoor",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-900 ring-emerald-500/25 dark:text-emerald-100 dark:ring-emerald-500/35",
    Icon: Trees,
  },
  birthday: {
    label: "Birthday",
    dot: "bg-fuchsia-500",
    chip: "bg-fuchsia-500/15 text-fuchsia-900 ring-fuchsia-500/25 dark:text-fuchsia-100 dark:ring-fuchsia-500/35",
    Icon: Cake,
  },
  graduation: {
    label: "Graduation",
    dot: "bg-indigo-500",
    chip: "bg-indigo-500/15 text-indigo-900 ring-indigo-500/25 dark:text-indigo-100 dark:ring-indigo-500/35",
    Icon: GraduationCap,
  },
  portraits: {
    label: "Portraits",
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

/** Display / dropdown order for shoot types */
export const SHOOT_KINDS_ORDER: ShootKind[] = [
  "wedding",
  "portraits",
  "outdoor",
  "birthday",
  "graduation",
  "commercial",
  "other",
];

/** Filter chips: all + each kind in {@link SHOOT_KINDS_ORDER} */
export const SCHEDULE_KIND_FILTER_KEYS: readonly ("all" | ShootKind)[] = [
  "all",
  ...SHOOT_KINDS_ORDER,
];

/** Normalize time for list labels (accepts HH:mm or legacy "3:00 PM"). */
export function formatBookedTimeLabel(t: string): string {
  const s = t.trim();
  if (/am|pm/i.test(s)) return s;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return s;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return s;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Sort key minutes from midnight; fallback string compare */
export function timeSortMinutes(t: string): number {
  const s = t.trim();
  const legacy = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(s);
  if (legacy && legacy[3]) {
    const d = new Date(`1970-01-01 ${s}`);
    return Number.isNaN(d.getTime()) ? 0 : d.getHours() * 60 + d.getMinutes();
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}
