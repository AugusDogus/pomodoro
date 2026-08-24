import { ConvexReactClient } from "convex/react";

function convexUrl(): string {
  const url = import.meta.env.PUBLIC_CONVEX_URL;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("PUBLIC_CONVEX_URL is missing. Add it to .env.");
  }
  return url;
}

export const convex = new ConvexReactClient(convexUrl());
