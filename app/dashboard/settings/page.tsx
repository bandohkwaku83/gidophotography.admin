"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, logout } from "@/lib/auth-demo";
import { useToast } from "@/components/toast-provider";
import {
  getSettings,
  getSettingsDefaultCoverUrl,
  updateSettings,
  type ApiSettings,
} from "@/lib/settings-api";
import { SettingsWorkflowSkeleton } from "@/components/ui/skeletons";

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition disabled:opacity-50 ${
          checked ? "bg-brand" : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${
            checked ? "left-[25px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const auth = useMemo(() => getAuth(), []);

  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingWatermark, setSavingWatermark] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await getSettings();
      setSettings(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load settings.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const coverUrl = settings ? getSettingsDefaultCoverUrl(settings) : null;
  const accountEmail = auth?.user?.email ?? auth?.email ?? "—";

  async function onWatermarkChange(next: boolean) {
    if (!settings || savingWatermark) return;
    setSavingWatermark(true);
    try {
      const data = await updateSettings({ watermarkPreviewImages: next });
      setSettings(data);
      showToast("Settings saved.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to save watermark option.",
        "error",
      );
    } finally {
      setSavingWatermark(false);
    }
  }

  async function onCoverImageUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file.", "error");
      return;
    }
    setUploadingCover(true);
    try {
      const data = await updateSettings({
        defaultCoverImage: file,
        watermarkPreviewImages: settings?.watermarkPreviewImages,
      });
      setSettings(data);
      showToast("Default cover image updated.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to upload cover image.",
        "error",
      );
    } finally {
      setUploadingCover(false);
    }
  }

  async function resetFromServer() {
    if (reloading) return;
    setReloading(true);
    try {
      const data = await getSettings();
      setSettings(data);
      showToast("Reloaded settings from server.", "info");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not reload settings.",
        "error",
      );
    } finally {
      setReloading(false);
    }
  }

  async function signOut() {
    await logout();
    showToast("Signed out successfully.", "success");
    router.replace("/login");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage workflow behavior and account actions.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
          <button
            type="button"
            className="ml-3 font-semibold underline"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Workflow</h2>
        </div>

        {loading ? (
          <SettingsWorkflowSkeleton />
        ) : settings ? (
          <div className="space-y-3">
            <Toggle
              checked={settings.watermarkPreviewImages}
              onChange={onWatermarkChange}
              disabled={savingWatermark}
              label="Watermark preview images"
              hint="Applies watermark to gallery previews only (not final edits)."
            />

            <div className="rounded-xl border border-zinc-200 px-4 py-4 dark:border-zinc-800">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Default cover image
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                This image is used as the default gallery cover when none is chosen.
              </p>

              {coverUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverUrl}
                    alt="Default cover preview"
                    className="h-40 w-full object-cover"
                  />
                </div>
              ) : (
                <div className="mt-3 flex h-24 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  No default cover on the server yet
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label
                  className={`inline-flex cursor-pointer items-center rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-hover ${
                    uploadingCover ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  {uploadingCover ? "Uploading…" : "Upload cover image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploadingCover}
                    onChange={(e) => {
                      void onCoverImageUpload(e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Account</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Signed in as <span className="font-medium">{accountEmail}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void resetFromServer()}
            disabled={reloading || loading}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {reloading ? "Reloading…" : "Reload from server"}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}
