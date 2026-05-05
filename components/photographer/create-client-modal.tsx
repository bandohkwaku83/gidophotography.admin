"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast-provider";
import {
  createClient,
  updateClient,
  type ApiClient,
} from "@/lib/clients-api";

type Props = {
  open: boolean;
  onClose: () => void;
  /** When provided, the modal switches to edit mode. */
  client?: ApiClient | null;
  /** Called after a successful create or update. */
  onSaved?: (client: ApiClient) => void;
};

export function CreateClientModal({ open, onClose, client, onSaved }: Props) {
  const { showToast } = useToast();

  const isEdit = Boolean(client?._id);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(client?.name ?? "");
    setEmail(client?.email ?? "");
    setContact(client?.contact ?? "");
    setLocation(client?.location ?? "");
    setBusy(false);
  }, [open, client]);

  if (!open) return null;

  function handleClose() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    if (busy) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedContact = contact.trim();
    const trimmedLocation = location.trim();

    if (!trimmedName) {
      showToast("Please enter a client name.", "error");
      return;
    }
    if (!trimmedContact) {
      showToast("Please enter a contact number.", "error");
      return;
    }
    if (!trimmedLocation) {
      showToast("Please enter a location.", "error");
      return;
    }
    if (trimmedEmail && !trimmedEmail.includes("@")) {
      showToast("Please enter a valid email.", "error");
      return;
    }

    setBusy(true);
    try {
      const saved = isEdit
        ? await updateClient(client!._id, {
            name: trimmedName,
            contact: trimmedContact,
            location: trimmedLocation,
          })
        : await createClient({
            name: trimmedName,
            email: trimmedEmail,
            contact: trimmedContact,
            location: trimmedLocation,
          });

      showToast(isEdit ? "Client updated." : "Client created.", "success");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : isEdit
            ? "Failed to update client."
            : "Failed to create client.";
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {isEdit ? "Edit client" : "Add new client"}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {isEdit
            ? "Update this client's details."
            : "Register client details. Galleries are created later."}
        </p>

        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              Client name
            </span>
            <input
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-black"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Studios"
              disabled={busy}
              autoFocus
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              Email
            </span>
            <input
              type="email"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-black"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@acme.com"
              disabled={busy || isEdit}
            />
            {isEdit ? (
              <span className="mt-1 block text-xs text-zinc-500">
                Email cannot be changed.
              </span>
            ) : null}
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              Contact number
            </span>
            <input
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-black"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="+233200000000"
              disabled={busy}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              Location
            </span>
            <input
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-black"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Accra, Ghana"
              disabled={busy}
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            aria-busy={busy}
            className="rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
          >
            {busy
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save changes"
                : "Create client"}
          </button>
        </div>
      </div>
    </div>
  );
}
