"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getAuth } from "@/lib/auth-demo";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getAuth() ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-black">
      Redirecting…
    </div>
  );
}
