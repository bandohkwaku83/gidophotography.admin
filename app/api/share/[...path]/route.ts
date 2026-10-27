import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function backendBase(): string {
  return (
    process.env.BACKEND_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "https://api.gidophotography.com"
  ).replace(/\/$/, "");
}

/** Headers worth forwarding from upstream (caching + conditional GETs + binary downloads). */
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "content-disposition",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
] as const;

/** Headers worth forwarding from the inbound browser request. */
const FORWARD_REQUEST_HEADERS = [
  "range",
  "if-none-match",
  "if-modified-since",
  "accept",
  "accept-encoding",
  "cookie",
] as const;

function pickRequestHeaders(req: NextRequest, contentType: string | null): HeadersInit {
  const out = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) out.set(h, v);
  }
  if (contentType) out.set("content-type", contentType);
  return out;
}

/**
 * Server-side proxy for public client gallery APIs (`/api/share/...`).
 *
 * Streams the upstream body (`res.body` passthrough) instead of buffering everything in
 * memory — important for selection ZIP downloads and large JSON payloads. Forwards
 * conditional / range headers so clients can resume / scrub.
 */
async function forward(
  request: NextRequest,
  segments: string[],
  method: string,
): Promise<NextResponse> {
  if (segments.length === 0) {
    return NextResponse.json({ message: "Missing share path." }, { status: 404 });
  }

  const joined = segments.map((s) => encodeURIComponent(s)).join("/");
  const target = `${backendBase()}/api/share/${joined}${request.nextUrl.search}`;

  const init: RequestInit = {
    method,
    cache: "no-store",
  };

  const contentType = request.headers.get("content-type");
  init.headers = pickRequestHeaders(request, method !== "GET" && method !== "HEAD" ? contentType : null);

  if (method !== "GET" && method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength) init.body = body;
  }

  let res: Response;
  try {
    res = await fetch(target, init);
  } catch {
    return NextResponse.json(
      { message: "Could not reach the gallery service. Is the API running?" },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = res.headers.get(h);
    if (v) outHeaders.set(h, v);
  }
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const cookie of setCookies) {
    outHeaders.append("set-cookie", cookie);
  }

  return new NextResponse(res.body, {
    status: res.status,
    headers: outHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, path ?? [], "GET");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, path ?? [], "POST");
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, path ?? [], "DELETE");
}
