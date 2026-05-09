"use client";

import { useEffect, useState } from "react";
import { isLikelyEmbeddedSocialWebViewUa } from "@/lib/in-app-browser";

function canProbablyShareSingleImageFile(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  if (typeof navigator.canShare !== "function") return true;
  try {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]); // JPEG SOI
    const file = new File([bytes], "probe.jpg", { type: "image/jpeg" });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ShareSaveHints = {
  /** Heuristic UA match — many iOS WKWebViews still read as Safari. */
  inAppSocialWebView: boolean;
  /** Navigator likely supports Share with image files — user often gets picker (Photos / Files / …). */
  likelyWebShareImage: boolean;
};

export function useShareSaveHints(): ShareSaveHints {
  const [state, setState] = useState<ShareSaveHints>({
    inAppSocialWebView: false,
    likelyWebShareImage: false,
  });
  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    setState({
      inAppSocialWebView: ua.length > 0 && isLikelyEmbeddedSocialWebViewUa(ua),
      likelyWebShareImage: canProbablyShareSingleImageFile(),
    });
  }, []);
  return state;
}
