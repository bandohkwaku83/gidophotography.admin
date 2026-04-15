"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAuth } from "@/lib/auth-demo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [forgotOpen, setForgotOpen] = useState(false);

  function submit() {
    const em = email.trim().toLowerCase() || "demo@gidostudio.com";
    setAuth(em, remember);
    router.replace("/dashboard");
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
                  className="mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition ring-indigo-300 placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-indigo-500/40"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.com"
                />
              </label>

              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  className="mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition ring-indigo-300 placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-indigo-500/40"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>

              <div className="mt-6 flex items-center justify-between gap-8 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="font-medium text-indigo-700 underline-offset-4 transition hover:underline dark:text-indigo-300"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="button"
                onClick={submit}
                className="mt-8 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-105"
              >
                Log in
              </button>
            </div>
          </div>
        </section>
      </div>

     
    </div>
  );
}
