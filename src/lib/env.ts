function required(name: string, value: string | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is missing. Add it to .env.`);
  }
  return value;
}

export const env = {
  discordClientId: required("DISCORD_CLIENT_ID", process.env.DISCORD_CLIENT_ID ?? import.meta.env.DISCORD_CLIENT_ID),
  discordClientSecret: required(
    "DISCORD_CLIENT_SECRET",
    process.env.DISCORD_CLIENT_SECRET ?? import.meta.env.DISCORD_CLIENT_SECRET,
  ),
  tursoDbUrl: required("TURSO_DB_URL", process.env.TURSO_DB_URL ?? import.meta.env.TURSO_DB_URL),
  tursoDbToken: required("TURSO_DB_TOKEN", process.env.TURSO_DB_TOKEN ?? import.meta.env.TURSO_DB_TOKEN),
  betterAuthSecret: required("BETTER_AUTH_SECRET", process.env.BETTER_AUTH_SECRET ?? import.meta.env.BETTER_AUTH_SECRET),
  betterAuthUrl: optional(process.env.BETTER_AUTH_URL ?? import.meta.env.BETTER_AUTH_URL),
} as const;

function optional(value: string | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
