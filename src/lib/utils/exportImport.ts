import JSZip from 'jszip';
import type { ShapefileEntry } from '../types';

export async function exportRepo(entries: ShapefileEntry[]): Promise<void> {
  const zip = new JSZip();
  for (const entry of entries) {
    const folder = zip.folder(entry.metadata.id)!;
    folder.file('metadata.json', JSON.stringify(entry.metadata, null, 2));
    folder.file('districts.geojson', JSON.stringify(entry.geojson));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, 'shapefile-repo-export.zip');
}

export async function importRepo(file: File): Promise<ShapefileEntry[]> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const entries: ShapefileEntry[] = [];

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (!path.endsWith('/metadata.json')) continue;
    const folder = path.replace('/metadata.json', '');
    const metaText = await zipEntry.async('text');
    const geojsonFile = zip.file(`${folder}/districts.geojson`);
    if (!geojsonFile) continue;
    const geojsonText = await geojsonFile.async('text');
    entries.push({
      metadata: JSON.parse(metaText),
      geojson: JSON.parse(geojsonText)
    });
  }
  return entries;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
