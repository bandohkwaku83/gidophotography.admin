"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAuthSession, type AuthUser } from "@/lib/auth-demo";
import { apiUrl } from "@/lib/api";
import { STUDIO_ADDRESS, STUDIO_LOGO_SRC, STUDIO_TAGLINE } from "@/lib/branding";

type LoginResponse = {
  message?: string;
  token: string;
  user: AuthUser;
};

const fieldClass =
  "mt-2 w-full rounded-lg border border-[#e6e6e6] bg-white px-3.5 py-3 text-[15px] text-black outline-none transition placeholder:text-[#b5b5b5] focus:border-black disabled:opacity-60";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-black lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-black lg:block">
        <Image
          src="/images/GIDO98297.JPG"
          alt="Studio portrait"
          fill
          priority
          className="object-cover object-[center_20%]"
          sizes="58vw"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <p className="font-display text-[34px] leading-none italic">{STUDIO_TAGLINE}</p>
          <p className="mt-4 text-[11px] tracking-[0.22em] text-white/75 uppercase">{STUDIO_ADDRESS}</p>
        </div>
      </aside>

      <main className="flex min-h-screen flex-col">
        <div className="relative h-52 overflow-hidden bg-black sm:h-64 lg:hidden">
          <Image
            src="/images/GIDO98297.JPG"
            alt=""
            fill
            priority
            className="object-cover object-[center_18%]"
            sizes="100vw"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-[380px]">
            <Image
              src={STUDIO_LOGO_SRC}
              alt="Gido Photography"
              width={640}
              height={160}
              priority
              className="object-contain object-left"
              style={{ width: "auto", height: "34px" }}
            />

            <h1 className="font-display mt-10 text-[40px] leading-none font-normal tracking-tight">
              Welcome back
            </h1>
            <p className="mt-3 text-sm text-[#6f6f6f]">Sign in to your studio.</p>

            <form
              className="mt-9"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label className="block text-[13px] font-medium text-black">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  className={fieldClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  placeholder="you@studio.com"
                />
              </label>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="text-[13px] font-medium text-black">
                    Password
                  </label>
                  <button
                    type="button"
                    className="text-[12px] font-medium text-[#6f6f6f] transition hover:text-black"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-controls="login-password"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={fieldClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="••••••••"
                />
              </div>

              {error ? (
                <div
                  role="alert"
                  className="mt-5 rounded-lg border border-[#e7c8c8] bg-[#fdf6f6] px-3.5 py-3 text-sm text-[#6b1e2f]"
                >
                  {error}
                </div>
              ) : null}

              <div className="mt-5 flex items-center justify-between gap-4 text-[13px]">
                <label className="flex cursor-pointer items-center gap-2 text-[#3a3a3a]">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-[#d0d0d0] accent-black"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={openForgot}
                  className="text-black underline decoration-[#d0d0d0] underline-offset-4 transition hover:decoration-black"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-black text-sm font-medium text-white transition hover:bg-[#222] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </main>

      {forgotOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onClick={closeForgot}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            className="w-full max-w-sm rounded-2xl bg-[#f5f5f5] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reset-password-title" className="font-display text-[28px] leading-none">
              Reset password
            </h2>
            <p className="mt-2 text-sm text-[#6f6f6f]">Enter your email and a new password.</p>

            <div className="mt-6 space-y-4">
              <label className="block text-[13px] font-medium text-black">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  className={fieldClass}
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  disabled={forgotSubmitting}
                  placeholder="you@studio.com"
                />
              </label>

              <label className="block text-[13px] font-medium text-black">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  className={fieldClass}
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                  disabled={forgotSubmitting}
                  placeholder="••••••••"
                />
              </label>

              <label className="block text-[13px] font-medium text-black">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  className={fieldClass}
                  value={forgotConfirmPassword}
                  onChange={(e) => setForgotConfirmPassword(e.target.value)}
                  disabled={forgotSubmitting}
                  placeholder="••••••••"
                />
              </label>

              {forgotError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-[#e7c8c8] bg-[#fdf6f6] px-3.5 py-3 text-sm text-[#6b1e2f]"
                >
                  {forgotError}
                </div>
              ) : null}

              {forgotSuccess ? (
                <div
                  role="status"
                  className="rounded-lg border border-[#c9dccb] bg-[#f3f8f4] px-3.5 py-3 text-sm text-[#245338]"
                >
                  {forgotSuccess}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForgot}
                disabled={forgotSubmitting}
                className="rounded-lg px-3.5 py-2.5 text-sm font-medium text-black transition hover:bg-black/5 disabled:opacity-60"
              >
                {forgotSuccess ? "Close" : "Cancel"}
              </button>
              {!forgotSuccess ? (
                <button
                  type="button"
                  onClick={submitForgot}
                  disabled={forgotSubmitting}
                  aria-busy={forgotSubmitting}
                  className="rounded-lg bg-black px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-[#222] disabled:cursor-not-allowed disabled:opacity-60"
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
