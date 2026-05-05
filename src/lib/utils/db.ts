import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ShapefileEntry, ShapefileMetadata } from '../types';
import type { DistrictCompactness } from './compactnessMetrics';

export interface PlanCache {
  filename: string; // key
  compactness: Record<string, DistrictCompactness>;
  countySplits: number | null;
  cachedAt: string;
}

interface MapCompareSchema extends DBSchema {
  shapefiles: {
    key: string;
    value: ShapefileEntry;
    indexes: { 'by-name': string };
  };
  planCache: {
    key: string;
    value: PlanCache;
  };
}

const DB_NAME = 'map-compare';
const DB_VERSION = 2;

let _db: IDBPDatabase<MapCompareSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<MapCompareSchema>> {
  if (!_db) {
    _db = await openDB<MapCompareSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('shapefiles', { keyPath: 'metadata.id' });
          store.createIndex('by-name', 'metadata.name');
        }
        if (oldVersion < 2) {
          db.createObjectStore('planCache', { keyPath: 'filename' });
        }
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

// ── Per-plan computation cache (compactness + county splits) ──────────────────

export async function getPlanCache(filename: string): Promise<PlanCache | undefined> {
  const db = await getDB();
  return db.get('planCache', filename);
}

export async function savePlanCache(entry: PlanCache): Promise<void> {
  const db = await getDB();
  await db.put('planCache', entry);
}
