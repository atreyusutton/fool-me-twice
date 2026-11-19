export interface Env {
  ANTHROPIC_API_KEY?: string;
  COACH_MODEL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      // Tells the app whether live coaching is possible, without revealing the key.
      return Response.json({ ok: true, coach: Boolean(env.ANTHROPIC_API_KEY), model: env.COACH_MODEL });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
