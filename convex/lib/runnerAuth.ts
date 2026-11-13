export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export function authorizeRunner(
  request: Request,
  env: NodeJS.ProcessEnv | { PATCH_RUNNER_SECRET?: string } = process.env,
) {
  const secret = env.PATCH_RUNNER_SECRET?.trim();
  if (!secret) {
    return { ok: false as const, response: new Response("Runner secret is not configured", { status: 503 }) };
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim() ?? "";
  if (!token || !timingSafeEqual(token, secret)) {
    return { ok: false as const, response: new Response("Unauthorized", { status: 401 }) };
  }
  return { ok: true as const };
}
