// shpjs default export
declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson';
  function shp(data: string | ArrayBuffer): Promise<FeatureCollection | FeatureCollection[]>;
  export = shp;
}
