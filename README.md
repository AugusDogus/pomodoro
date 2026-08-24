# Pomodoro

A calm to-do list and Pomodoro timer for focused study. Built with Astro, React, and Convex.

## Run locally

```sh
bun install
bunx convex dev --once
bun run dev
```

Copy `.env.example` to `.env` and set `PUBLIC_CONVEX_URL` to the Convex cloud URL from `npx convex dev`.

## Verify

```sh
bun test
bun run build
```

The production build includes a web app manifest and service worker. After the first visit, the app, tasks, timer UI, and bundled fonts remain available offline. Tasks and preferences are stored locally first. Automerge merges edits from every device, including ones that were offline, and Convex syncs those changes live.

Discord OAuth needs the full Convex callback path in the Discord developer portal, not just the origin:

```
https://marvelous-perch-2.convex.site/api/auth/callback/discord
https://fine-frog-635.convex.site/api/auth/callback/discord
```

Third-party asset licenses are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
