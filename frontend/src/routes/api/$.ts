// Single catch-all API route: every /api/* endpoint is dispatched from
// here to the plain handlers in /server/handlers.
//
// Why: Vercel's Hobby plan allows max 12 serverless functions per
// deployment. With the nitro "vercel" preset the whole SSR app is ONE
// function, and routing /api through TanStack Start keeps the API inside
// that same function instead of one function per endpoint file.
//
// The handlers were written for Vercel's Node (req, res) signature, so
// this file adapts the web-standard Request/Response to that shape.
import { createFileRoute } from "@tanstack/react-router";

type NodeStyleHandler = (req: unknown, res: unknown) => unknown | Promise<unknown>;

const routes: Record<string, () => Promise<{ default: NodeStyleHandler }>> = {
  activity: () => import("../../../server/handlers/activity.js"),
  announcements: () => import("../../../server/handlers/announcements.js"),
  stats: () => import("../../../server/handlers/stats.js"),
  health: () => import("../../../server/handlers/health.js"),
  "admin/migrate": () => import("../../../server/handlers/admin/migrate.js"),
  "auth/google-callback": () => import("../../../server/handlers/auth/google-callback.js"),
  "auth/google": () => import("../../../server/handlers/auth/google.js"),
  "auth/login": () => import("../../../server/handlers/auth/login.js"),
  "auth/logout": () => import("../../../server/handlers/auth/logout.js"),
  "auth/me": () => import("../../../server/handlers/auth/me.js"),
  "auth/register": () => import("../../../server/handlers/auth/register.js"),
  "auth/resend-code": () => import("../../../server/handlers/auth/resend-code.js"),
  "auth/verify-email": () => import("../../../server/handlers/auth/verify-email.js"),
};

// Minimal Node-style req/res shim over a web Request. Handlers only use:
// req.method, req.url, req.headers, req.body (absent), async iteration,
// req.socket?.remoteAddress — and res.statusCode, res.setHeader,
// res.headersSent, res.end.
function adapt(request: Request) {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const req = {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    body: undefined,
    socket: { remoteAddress: headers["x-forwarded-for"]?.split(",")[0]?.trim() },
    // Lets `for await (const chunk of req)` read the body.
    async *[Symbol.asyncIterator]() {
      const buf = await request.arrayBuffer();
      if (buf.byteLength > 0) yield Buffer.from(buf);
    },
  };

  let statusCode = 200;
  const responseHeaders = new Headers();
  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(value: number) {
      statusCode = value;
    },
    get headersSent() {
      return false;
    },
    setHeader(name: string, value: string) {
      responseHeaders.set(name, value);
    },
    end(body?: string | Buffer) {
      // captured by the promise below
      finish(body);
    },
  };

  let resolveResponse!: (r: Response) => void;
  const responsePromise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  function finish(body?: string | Buffer) {
    resolveResponse(
      new Response(body ?? null, { status: statusCode, headers: responseHeaders }),
    );
  }

  return { req, res, responsePromise };
}

async function dispatch(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const key = pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const load = Object.hasOwn(routes, key) ? routes[key] : null;
  if (!load) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const { req, res, responsePromise } = adapt(request);
  try {
    const mod = await load();
    await mod.default(req, res);
    return await responsePromise;
  } catch (err) {
    console.error(`[api/${key}]`, err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => dispatch(request),
      POST: ({ request }) => dispatch(request),
      PUT: ({ request }) => dispatch(request),
      PATCH: ({ request }) => dispatch(request),
      DELETE: ({ request }) => dispatch(request),
      OPTIONS: ({ request }) => dispatch(request),
    },
  },
});
