export type OwnerValidationSource = {
  method?: string;
  action?: string;
  oauth?: {
    providerId?: string;
    profile?: Record<string, unknown>;
  };
};

export type AccountLike = {
  providerId?: string;
  accountId?: string;
};

/** Reads PATCH_OWNER_GITHUB_ID. Returns null unless it is a numeric string. */
export function readOwnerGithubId(
  value: string | undefined = process.env.PATCH_OWNER_GITHUB_ID,
): string | null {
  if (value === undefined || value === "") return null;
  if (!/^\d+$/.test(value)) return null;
  return value;
}

/** True when the OAuth source is GitHub and the profile id matches the owner. */
export function isOwnerIdentity(
  source: OwnerValidationSource,
  ownerId: string | null,
): boolean {
  if (!ownerId) return false;
  if (source.method !== "oauth") return false;
  if (source.oauth?.providerId !== "github") return false;
  const profileId = source.oauth.profile?.id;
  if (profileId === undefined || profileId === null) return false;
  return String(profileId) === ownerId;
}

/** True when this account is the owner's GitHub provider account. */
export function assertAccountAllowed(
  account: AccountLike,
  ownerId: string | null,
): boolean {
  if (!ownerId) return false;
  return account.providerId === "github" && account.accountId === ownerId;
}

/**
 * Bootstrap is open only when no users exist yet.
 * Returns false when signup must be rejected (already bootstrapped).
 */
export function assertBootstrapOpen(userCount: number): boolean {
  return userCount === 0;
}
