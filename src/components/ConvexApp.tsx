import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convex } from "../lib/convex";
import FocusApp from "./FocusApp";

export default function ConvexApp() {
  return (
    <ConvexAuthProvider client={convex}>
      <FocusApp />
    </ConvexAuthProvider>
  );
}
