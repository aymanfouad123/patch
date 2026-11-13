async function handle(request: Request) {
  if (process.env.PATCH_PREVIEW_MODE === "1") return new Response(null, { status: 404 });
  const { handler } = await import("@/lib/auth-server");
  return request.method === "GET" ? handler.GET(request) : handler.POST(request);
}
export const GET = handle;
export const POST = handle;
