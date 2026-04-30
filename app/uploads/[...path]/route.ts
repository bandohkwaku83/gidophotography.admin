import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function backendBase(): string {
  return (
    process.env.BACKEND_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "https://api.gidophotography.com"
  ).replace(/\/$/, "");
}

/**
 * Same-origin proxy for `/uploads/*` static files. Keeps `<img src>` on the app origin
 * and forwards to BACKEND_API_URL (more reliable than relying only on next.config rewrites
 * for binary responses in some dev setups).
 */
async function forward(
  request: NextRequest,
  segments: string[],
  method: string,
): Promise<NextResponse> {
  if (segments.length === 0) {
    return NextResponse.json({ message: "Missing uploads path." }, { status: 404 });
  }

  const joined = segments.map((s) => encodeURIComponent(s)).join("/");
  const target = `${backendBase()}/uploads/${joined}${request.nextUrl.search}`;

  let res: Response;
  try {
    res = await fetch(target, { method, cache: "no-store" });
  } catch {
    return NextResponse.json(
      { message: "Could not reach the storage service. Is the API running?" },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) outHeaders.set("content-type", ct);
  const cc = res.headers.get("cache-control");
  if (cc) outHeaders.set("cache-control", cc);

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
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

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, path ?? [], "HEAD");
}
