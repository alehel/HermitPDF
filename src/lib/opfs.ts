/**
 * OPFS-backed storage helpers for raw PDF bytes.
 *
 * Each browser tab claims a unique session subdir under `/docs/<sessionId>/`
 * and acquires a Web Lock named `hermitpdf-session-<sessionId>` which it
 * holds for its entire lifetime via a never-resolving promise. The lock
 * is released by the browser when the tab dies — close, crash, discard,
 * even after long freezes — so a frozen-then-resumed tab keeps its lock
 * while a fully-killed tab loses it.
 *
 * On boot, dirs whose session ID isn't backed by an active lock get wiped.
 * That covers refresh, normal close, and crashed tabs uniformly. Multi-tab
 * is safe because each tab holds its own lock and queries see all of them.
 */

const DOCS_DIR = "docs";
const LOCK_PREFIX = "hermitpdf-session-";

let _sessionId: string | null = null;
function sessionId(): string {
  if (_sessionId === null) _sessionId = crypto.randomUUID();
  return _sessionId;
}

let sessionDirPromise: Promise<FileSystemDirectoryHandle> | null = null;

async function initSessionDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const docsDir = await root.getDirectoryHandle(DOCS_DIR, { create: true });
  // Acquire the lock before cleanup so a concurrent boot in another tab can
  // see ours via `query()` and won't wipe our session.
  await acquireSessionLock();
  await cleanupDeadSessions(docsDir);
  return docsDir.getDirectoryHandle(sessionId(), { create: true });
}

export function getDocsDir(): Promise<FileSystemDirectoryHandle> {
  if (!sessionDirPromise) sessionDirPromise = initSessionDir();
  return sessionDirPromise;
}

let lockAcquired = false;
function acquireSessionLock(): Promise<void> {
  if (lockAcquired) return Promise.resolve();
  lockAcquired = true;
  return new Promise<void>((resolveOuter) => {
    void navigator.locks.request(
      LOCK_PREFIX + sessionId(),
      { mode: "exclusive" },
      () => {
        resolveOuter();
        // Inner promise never resolves — lock is held until the tab dies.
        return new Promise<void>(() => {});
      }
    );
  });
}

async function cleanupDeadSessions(
  docsDir: FileSystemDirectoryHandle
): Promise<void> {
  const result = await navigator.locks.query();
  const active = new Set<string>([sessionId()]);
  for (const entry of [...(result.held ?? []), ...(result.pending ?? [])]) {
    if (entry.name?.startsWith(LOCK_PREFIX)) {
      active.add(entry.name.slice(LOCK_PREFIX.length));
    }
  }

  const stale: string[] = [];
  const iter = (
    docsDir as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    }
  ).entries();
  for await (const [name, handle] of iter) {
    if (handle.kind !== "directory") {
      // Stray top-level file (e.g., from an earlier non-namespaced version).
      stale.push(name);
      continue;
    }
    if (!active.has(name)) stale.push(name);
  }

  await Promise.all(
    stale.map((name) =>
      (
        docsDir as unknown as {
          removeEntry(
            name: string,
            opts?: { recursive?: boolean }
          ): Promise<void>;
        }
      )
        .removeEntry(name, { recursive: true })
        .catch(() => {
          // best-effort
        })
    )
  );
}
