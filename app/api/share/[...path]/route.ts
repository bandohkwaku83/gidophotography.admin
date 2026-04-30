import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function backendBase(): string {
  return (
    process.env.BACKEND_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8000"
  ).replace(/\/$/, "");
}

/**
 * Server-side proxy for public client gallery APIs.
 * Browser requests stay same-origin (`/api/share/...`); this handler forwards to
 * the real API. Relying only on `next.config` rewrites for client `fetch` is unreliable
 * in some Next.js / Turbopack setups.
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

  if (method !== "GET" && method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength) init.body = body;
    const ct = request.headers.get("content-type");
    init.headers = ct ? { "content-type": ct } : undefined;
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
  const ct = res.headers.get("content-type");
  if (ct) outHeaders.set("content-type", ct);

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
