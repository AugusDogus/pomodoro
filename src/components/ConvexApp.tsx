import { Repo } from "@automerge/automerge-repo";
import { RepoContext } from "@automerge/automerge-repo-react-hooks";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convex } from "../lib/convex";
import FocusApp from "./FocusApp";

const repo = new Repo({
  network: [],
  storage: new IndexedDBStorageAdapter(),
});

export default function ConvexApp() {
  return (
    <ConvexAuthProvider client={convex}>
      <RepoContext.Provider value={repo}>
        <FocusApp />
      </RepoContext.Provider>
    </ConvexAuthProvider>
  );
}
