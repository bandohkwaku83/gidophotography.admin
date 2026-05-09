/**
 * Rough detection of UA strings from chat/social in-app browsers that often
 * disable pop-ups / downloads / file share APIs. Many iOS WebViews omit the
 * app name; generic “chat browser” copy elsewhere covers those cases.
 */
const IN_APP_BROWSER_SUBSTRINGS = [
  "whatsapp",
  "instagram",
  "twitter",
  "fban",
  "fbav",
  "fb_iab",
  "tiktok",
  "linkedinapp",
  "snapchat",
  " line/", // LINE
  "slack",
  "messenger",
];

export function isLikelyEmbeddedSocialWebViewUa(userAgent: string): boolean {
  const u = userAgent.toLowerCase();
  if (/\bfban\b|\bfbav\b|\bfb_iab\b/.test(u)) return true;
  return IN_APP_BROWSER_SUBSTRINGS.some((needle) => u.includes(needle));
}
