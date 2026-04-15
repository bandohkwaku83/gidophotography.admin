"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appendExtraProject, createFolderDraft } from "@/lib/demo-data";
import { useToast } from "@/components/toast-provider";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreateFolderModal({ open, onClose }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function submit() {
    const name = clientName.trim();
    if (!name) {
      showToast("Please enter a client name.", "error");
      return;
    }
    if (!eventDate) {
      showToast("Please pick an event date.", "error");
      return;
    }
    setBusy(true);
    const folder = createFolderDraft({
      clientName: name,
      eventDate,
      description: description.trim(),
    });
    appendExtraProject(folder);
    showToast("Folder created.", "success");
    setBusy(false);
    setClientName("");
    setEventDate("");
    setDescription("");
    onClose();
    router.push(`/dashboard/folder/${folder.id}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Create new folder
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Client job folder — stored in this browser session only (demo).
        </p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">Client name</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-black"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Kwaku & Ama"
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">Event date</span>
            <input
              type="date"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-black"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              Description{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </span>
            <textarea
              className="mt-1.5 min-h-[88px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-black"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes for you — not sent to the client in this demo."
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
          >
            Create folder
          </button>
        </div>
      </div>
    </div>
  );
}
