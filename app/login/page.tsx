"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAuthSession, type AuthUser } from "@/lib/auth-demo";
import { apiUrl } from "@/lib/api";

type LoginResponse = {
  message?: string;
  token: string;
  user: AuthUser;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  function openForgot() {
    setForgotEmail(email.trim());
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setForgotError(null);
    setForgotSuccess(null);
    setForgotOpen(true);
  }

  function closeForgot() {
    if (forgotSubmitting) return;
    setForgotOpen(false);
  }

  async function submitForgot() {
    if (forgotSubmitting) return;
    setForgotError(null);
    setForgotSuccess(null);

    const trimmedEmail = forgotEmail.trim();
    if (!trimmedEmail || !forgotNewPassword || !forgotConfirmPassword) {
      setForgotError("Please fill in all fields.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError("Passwords do not match.");
      return;
    }

    setForgotSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          newPassword: forgotNewPassword,
          confirmPassword: forgotConfirmPassword,
        }),
      });

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      console.log("[forgot-password] response", { status: res.status, ok: res.ok, body });

      if (!res.ok) {
        const message =
          body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
            ? (body as { message: string }).message
            : `Request failed (${res.status})`;
        setForgotError(message);
        return;
      }

      const successMessage =
        body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
          ? (body as { message: string }).message
          : "Password updated. You can now log in.";
      setForgotSuccess(successMessage);
      setForgotNewPassword("");
      setForgotConfirmPassword("");
      setEmail(trimmedEmail);
    } catch (err) {
      setForgotError(
        err instanceof Error && err.message
          ? err.message
          : "Could not reach the server. Please try again.",
      );
    } finally {
      setForgotSubmitting(false);
    }
  }

  async function submit() {
    if (submitting) return;
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      console.log("[login] response", { status: res.status, ok: res.ok, body });

      if (!res.ok) {
        const message =
          (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
            ? (body as { message: string }).message
            : null) ?? `Login failed (${res.status})`;
        setError(message);
        return;
      }

      const data = body as LoginResponse;
      if (!data?.token || !data?.user) {
        setError("Unexpected response from server.");
        return;
      }

      setAuthSession(
        {
          email: data.user.email,
          token: data.token,
          user: data.user,
        },
        remember,
      );
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not reach the server. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") submit();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F5F5F5] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,245,245,0.8),transparent_45%),radial-gradient(circle_at_85%_20%,_rgba(245,245,245,0.6),transparent_40%),radial-gradient(circle_at_10%_80%,_rgba(245,245,245,0.5),transparent_35%)] blur-2xl" />
      <div className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-2xl shadow-black/30 backdrop-blur-xl lg:grid-cols-2">
        <section className="hidden border-r border-white/10 bg-black lg:flex lg:items-center">
          <Image
            src="/images/GIDO98297.JPG"
            alt="Photographer session"
            width={1600}
            height={1067}
            priority
            className="h-auto w-full object-contain"
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
        </section>

        <section className="bg-white/95 p-7 sm:p-10 dark:bg-zinc-950/95">
          <div className="mx-auto w-full max-w-md">
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="text-sm font-medium text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 lg:hidden"
              >
                ← Home
              </Link>
              <p className="flex items-center text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                <Image
                  src="/images/gido_logo.png"
                  alt="Gido logo"
                  width={154}
                  height={154}
                  // className="h-16 w-16 rounded object-contain"
                />
              </p>
            </div>

            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Welcome back
            </h2>

            <div className="mt-8 space-y-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition ring-brand/35 placeholder:text-zinc-400 focus:border-brand-on-dark focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-brand/40"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={submitting}
                  placeholder="doe@gmail.com"
                />
              </label>

              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  className="mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition ring-brand/35 placeholder:text-zinc-400 focus:border-brand-on-dark focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-brand/40"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={submitting}
                  placeholder="••••••••"
                />
              </label>

              {error ? (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  {error}
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-between gap-8 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-brand focus:ring-brand"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={openForgot}
                  className="font-medium text-brand-hover underline-offset-4 transition hover:underline dark:text-brand-on-dark"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                aria-busy={submitting}
                className="mt-8 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-brand to-sky-500 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Logging in…" : "Log in"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {forgotOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeForgot}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Reset password
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Enter your email and a new password.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition ring-brand/35 placeholder:text-zinc-400 focus:border-brand-on-dark focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  disabled={forgotSubmitting}
                  placeholder="doe@gmail.com"
                />
              </label>

              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition ring-brand/35 placeholder:text-zinc-400 focus:border-brand-on-dark focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                  disabled={forgotSubmitting}
                  placeholder="••••••••"
                />
              </label>

              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition ring-brand/35 placeholder:text-zinc-400 focus:border-brand-on-dark focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
                  value={forgotConfirmPassword}
                  onChange={(e) => setForgotConfirmPassword(e.target.value)}
                  disabled={forgotSubmitting}
                  placeholder="••••••••"
                />
              </label>

              {forgotError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  {forgotError}
                </div>
              ) : null}

              {forgotSuccess ? (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  {forgotSuccess}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForgot}
                disabled={forgotSubmitting}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {forgotSuccess ? "Close" : "Cancel"}
              </button>
              {!forgotSuccess ? (
                <button
                  type="button"
                  onClick={submitForgot}
                  disabled={forgotSubmitting}
                  aria-busy={forgotSubmitting}
                  className="rounded-xl bg-gradient-to-r from-brand to-sky-500 px-3 py-2 text-sm font-semibold text-white shadow hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {forgotSubmitting ? "Updating…" : "Update password"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
