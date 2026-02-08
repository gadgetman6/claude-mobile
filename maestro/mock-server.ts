/**
 * Minimal mock server for Maestro testing.
 * Provides /api/health and a Socket.IO endpoint that echoes back messages.
 * Run with: bun run maestro/mock-server.ts
 */
const PORT = 3333;

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }

    // Sessions list (empty)
    if (url.pathname === "/api/sessions") {
      return Response.json([]);
    }

    if (url.pathname === "/api/codex-sessions") {
      return Response.json([]);
    }

    // Fallback
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Mock server running on http://localhost:${PORT}`);
