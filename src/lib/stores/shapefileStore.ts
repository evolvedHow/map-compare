import { writable } from 'svelte/store';
import type { ShapefileEntry, ShapefileMetadata } from '../types';
import {
  getAllShapefiles,
  saveShapefile,
  deleteShapefile,
  updateShapefileMetadata
} from '../utils/db';

function createShapefileStore() {
  const { subscribe, set, update } = writable<ShapefileEntry[]>([]);

  return {
    subscribe,

    async load() {
      const entries = await getAllShapefiles();
      set(entries);
    },

    async add(entry: ShapefileEntry) {
      await saveShapefile(entry);
      update(entries => [...entries, entry]);
    },

    async remove(id: string) {
      await deleteShapefile(id);
      update(entries => entries.filter(e => e.metadata.id !== id));
    },

    async updateMeta(id: string, patch: Partial<ShapefileMetadata>) {
      await updateShapefileMetadata(id, patch);
      update(entries =>
        entries.map(e =>
          e.metadata.id === id
            ? { ...e, metadata: { ...e.metadata, ...patch } }
            : e
        )
      );
    }
  };
}

export const shapefiles = createShapefileStore();
export const stateFips = writable<string>('13');
export const darkMode = writable<boolean>(false);
