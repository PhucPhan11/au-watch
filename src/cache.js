// In-memory slot store, persisted to a JSON file so restarts keep last known values.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createCache(file) {
  let slots = {};
  return {
    get: (key) => slots[key],
    set: (key, slot) => { slots[key] = slot; },
    all: () => ({ ...slots }),
    async load() {
      if (!file) return;
      try {
        slots = JSON.parse(await readFile(file, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') console.warn(`[cache] could not read ${file}: ${err.message}`);
      }
    },
    async save() {
      if (!file) return;
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(slots, null, 2));
    },
  };
}
