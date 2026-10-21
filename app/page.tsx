"use client";

import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { STUDIO_LOGO_SRC } from "@/lib/branding";
import { getAuth } from "@/lib/auth-demo";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getAuth() ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-white px-6"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <div className="flex max-w-sm flex-col items-center gap-7 text-center">
        <Image
          src={STUDIO_LOGO_SRC}
          alt="Gido Photography"
          width={640}
          height={160}
          className="h-9 w-auto object-contain"
          priority
        />
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-studio-gold" aria-hidden />
          <div>
            <p className="font-display text-xl tracking-tight text-studio-ink">Preparing your studio</p>
            <p className="mt-1.5 text-xs leading-relaxed text-studio-taupe">
              Opening your workspace…
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
