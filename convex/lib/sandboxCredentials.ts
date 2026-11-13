export type SandboxCredentials = {
  token: string;
  teamId: string;
  projectId: string;
};

export function readSandboxCredentials(
  env: NodeJS.ProcessEnv = process.env,
): SandboxCredentials {
  const token = env.VERCEL_TOKEN?.trim();
  const teamId = env.VERCEL_TEAM_ID?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();

  if (!token || !teamId || !projectId) {
    throw new Error(
      "Missing Vercel sandbox credentials. Set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID on the Convex deployment.",
    );
  }

  return { token, teamId, projectId };
}
