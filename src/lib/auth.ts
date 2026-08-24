import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { db } from "../db";
import * as schema from "../db/schema";
import { transferGuestState } from "../db/user-state";
import { env } from "./env";

export const auth = betterAuth({
  baseURL: {
    allowedHosts: [
      "localhost:4321",
      "pomodoro-drab-eta.vercel.app",
      "pomodoro-augies-projects.vercel.app",
      "*.vercel.app",
    ],
    protocol: "auto",
    fallback: env.betterAuthUrl ?? "http://localhost:4321",
  },
  secret: env.betterAuthSecret,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  socialProviders: {
    discord: {
      clientId: env.discordClientId,
      clientSecret: env.discordClientSecret,
    },
  },
  plugins: [
    anonymous({
      generateName: () => "Guest",
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await transferGuestState(anonymousUser.user.id, newUser.user.id);
      },
    }),
  ],
});
