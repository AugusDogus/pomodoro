# Pomodoro

A calm to-do list and Pomodoro timer for focused study. Built with Astro, React, and shadcn/ui-style local components.

## Run locally

```sh
bun install
bun run dev
```

## Verify

```sh
bun test
bun run build
```

The production build includes a web app manifest and service worker. After the first visit, the app, tasks, timer UI, and bundled fonts remain available offline. Tasks and preferences are stored locally first and sync to Turso after Discord sign-in.

Discord OAuth needs the full callback path in the Discord developer portal, not just the origin:

```
http://localhost:4321/api/auth/callback/discord
https://pomodoro-drab-eta.vercel.app/api/auth/callback/discord
https://pomodoro-augies-projects.vercel.app/api/auth/callback/discord
```

Third-party asset licenses are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
