// Single-scheduler guard: hold an exclusive SQLite lock on a separate file for the whole
// process lifetime. The OS releases it if the process dies, so there are no stale locks.
// history.db is not involved.
import { DatabaseSync } from 'node:sqlite';

/** Returns { release() } if this process got the lock, or null if another process holds it. */
export function acquireSchedulerLock(file) {
  const db = new DatabaseSync(file, { timeout: 0 });
  try {
    db.exec('PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE;');
  } catch (err) {
    db.close();
    if (/locked|busy/i.test(err.message)) return null;
    throw err;
  }
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      try { db.exec('ROLLBACK'); } catch { /* nothing to undo */ }
      db.close();
    },
  };
}
