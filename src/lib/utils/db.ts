import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ShapefileEntry, ShapefileMetadata } from '../types';

interface MapCompareSchema extends DBSchema {
  shapefiles: {
    key: string;
    value: ShapefileEntry;
    indexes: { 'by-name': string };
  };
}

const DB_NAME = 'map-compare';
const DB_VERSION = 1;

let _db: IDBPDatabase<MapCompareSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<MapCompareSchema>> {
  if (!_db) {
    _db = await openDB<MapCompareSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('shapefiles', { keyPath: 'metadata.id' });
        store.createIndex('by-name', 'metadata.name');
      }
    });
  }
  return _db;
}

export async function saveShapefile(entry: ShapefileEntry): Promise<void> {
  const db = await getDB();
  await db.put('shapefiles', entry);
}

export async function getAllShapefiles(): Promise<ShapefileEntry[]> {
  const db = await getDB();
  return db.getAll('shapefiles');
}

export async function deleteShapefile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('shapefiles', id);
}

export async function updateShapefileMetadata(
  id: string,
  patch: Partial<ShapefileMetadata>
): Promise<void> {
  const db = await getDB();
  const entry = await db.get('shapefiles', id);
  if (!entry) throw new Error(`Shapefile ${id} not found`);
  await db.put('shapefiles', { ...entry, metadata: { ...entry.metadata, ...patch } });
}
