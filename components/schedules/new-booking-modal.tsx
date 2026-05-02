"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { CreateClientModal } from "@/components/photographer/create-client-modal";
import type { BookedShoot, ShootKind } from "@/components/schedules/booking-types";
import { KIND_META, SHOOT_KINDS_ORDER } from "@/components/schedules/booking-types";
import type { BookingShootTypeMeta } from "@/lib/bookings-api";
import { apiShootTypeToKind } from "@/lib/bookings-api";
import { listClients, type ApiClient } from "@/lib/clients-api";

export type NewBookingDraft = Omit<BookedShoot, "id">;

type Props = {
  open: boolean;
  onClose: () => void;
  /** ISO date YYYY-MM-DD */
  defaultDate: string;
  /** From `GET /api/bookings/meta` `shootTypes`; when empty, local defaults are used. */
  shootTypes?: BookingShootTypeMeta[];
  onSave: (draft: NewBookingDraft) => void | Promise<void>;
};

function defaultKindFromShootTypes(shootTypes: BookingShootTypeMeta[] | undefined): ShootKind {
  if (shootTypes && shootTypes.length > 0) {
    return apiShootTypeToKind(shootTypes[0].id);
  }
  return "portraits";
}

export function NewBookingModal({ open, onClose, defaultDate, shootTypes, onSave }: Props) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [kind, setKind] = useState<ShootKind>("portraits");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  const [clients, setClients] = useState<ApiClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const typeOptions = useMemo(() => {
    if (shootTypes && shootTypes.length > 0) {
      return shootTypes.map((t) => ({
        value: apiShootTypeToKind(t.id),
        label: t.label,
      }));
    }
    return SHOOT_KINDS_ORDER.map((k) => ({ value: k, label: KIND_META[k].label }));
  }, [shootTypes]);

  useEffect(() => {
    if (!open) return;
    setDate(defaultDate);
    setTitle("");
    setClientId("");
    setStartTime("09:00");
    setEndTime("");
    setKind(defaultKindFromShootTypes(shootTypes));
    setLocation("");
    setDescription("");
    setAddClientOpen(false);
    setSubmitting(false);

    let cancelled = false;
    setClientsLoading(true);
    void (async () => {
      try {
        const res = await listClients("");
        if (!cancelled) setClients(res.clients);
      } catch (e) {
        if (!cancelled) {
          showToast(e instanceof Error ? e.message : "Could not load clients.", "error");
          setClients([]);
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, defaultDate, showToast]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || !clientId || submitting) return;
    const client = clients.find((c) => c._id === clientId);
    const name = client?.name?.trim() ?? "";
    if (!name) {
      showToast("Select a valid client.", "error");
      return;
    }
    setSubmitting(true);
    try {
      await onSave({
        title: t,
        clientId,
        clientName: name,
        date,
        startTime,
        endTime: endTime.trim() || undefined,
        location: location.trim() || undefined,
        kind,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not save booking.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewClientSaved(c: ApiClient) {
    if (!c?._id) return;
    setClients((prev) => {
      const without = prev.filter((x) => x._id !== c._id);
      return [...without, c];
    });
    setClientId(c._id);
    setAddClientOpen(false);
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand/25 focus:border-brand focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          aria-label="Close"
          onClick={() => {
            if (!submitting) onClose();
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-booking-title"
          className="relative z-10 max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 id="new-booking-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              New booking
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-5 py-5">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <span className="text-red-500">*</span> Shoot title
              </label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Smith wedding — ceremony"
                className={inputClass}
                disabled={submitting}
              />
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <span className="text-red-500">*</span> Client
              </span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <select
                  required
                  id="new-booking-client"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={clientsLoading || submitting}
                  className={`min-w-0 flex-1 ${inputClass} disabled:opacity-60`}
                >
                  <option value="" disabled>
                    {clientsLoading ? "Loading clients…" : "Select a client"}
                  </option>
                  {sortedClients.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setAddClientOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
                  Add client
                </button>
              </div>
              {!clientsLoading && clients.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  No clients yet. Use <span className="font-semibold">Add client</span> to create one.
                </p>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  <span className="text-red-500">*</span> Date
                </label>
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-2">
                <label
                  htmlFor="new-booking-shoot-type"
                  className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                >
                  Shoot type
                </label>
                <select
                  id="new-booking-shoot-type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ShootKind)}
                  className={inputClass}
                  disabled={submitting}
                >
                  {typeOptions.map((o) => (
                    <option key={`${o.value}-${o.label}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  <span className="text-red-500">*</span> Start
                </label>
                <input
                  required
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={inputClass}
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">End</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputClass}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Venue or address"
                className={inputClass}
                disabled={submitting}
              />
            </div>

            {/* <div className="grid gap-2">
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional notes for this booking…"
                className={`${inputClass} min-h-[72px] resize-y`}
                disabled={submitting}
              />
            </div> */}

            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!clientId || clientsLoading || submitting}
                className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save booking"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CreateClientModal
        open={addClientOpen}
        client={null}
        onClose={() => setAddClientOpen(false)}
        onSaved={handleNewClientSaved}
      />
    </>
  );
}
