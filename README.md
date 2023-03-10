# 🌐 Vector Tile Studio

## 📝 Intent

Most map styling tools rely on existing tiles on a server, so if you aren't using a layer after, say zoom 6, there's no way to communicate back to the tile making process not to use it.  Vector Tile Studio aims to provide a development environment for base maps that includes both the tile generation process as well as the styling. This is similar to the days of [Mapbox Studio Classic](https://github.com/mapbox/mapbox-studio-classic) and the data config follows that process. But we've moved on from [CartoCSS](https://github.com/mapbox/carto).

## 💻 Usage
Vector Tile Studio uses [Next.JS](https://nextjs.org/) to run both the frontend and backend.
You should be able to start it by
```shell
git clone https://github.com/jimmyrocks/vector-tile-studio.git
cd ./vector-tile-studio
npm install
npm run start
```
And navigate to [http://localhost:3000](https://localhost:3000).

## ⚙️ Configuration Files

### 🗃️ Data Config

Vector Tile Studio uses a JSON file inspired by [Mapbox Studio Classic](https://github.com/mapbox/mapbox-studio-classic) with a few changes in the `_prefs` section to provide information for the [tilejson-spec version 3.0.0](https://github.com/mapbox/tilejson-spec/tree/master/3.0.0). It also includes a place to store a favicon for the layer.

```typescript
  _prefs?: {
    /* Base64-encoded SVG image for the layer's favicon, will be resized to 16x16, 32x32, 64x64, 128x128, and 256x256 */
    favicon?: string;
    /* HTML representation of the layer's legend */
    legend?: string;
    /* Mustache template to be used to format data from grids for interaction */
    template?: string;
    /* The version of the layer */
    version?: string;
  };
  /* Attribution for the layer */
  attribution: string;
  /* The bounding box for the layer in the format [minX, minY, maxX, maxY]. The bounds must be in EPSG:4326. */
  bounds?: [number, number, number, number];
  /* The center of the layer in the format [longitude, latitude, zoom level] */
  center: [number, number, number];
  /* The description of the layer */
  description: string;
  /* The layers in the configuration */
  Layer: {
    id: string;
    /* The datasource for the layer */
    Datasource: {
      /* The name of the key field for the layer */
      key_field: string;
      /* The name of the Postgres database for the layer, use env var PG_DBNAME instead */
      dbname: string;
      /* The name of the Postgres user for the layer, use env var PG_USER instead */
      user: string;
      /* The password for the Postgres user for the layer, use env var PG_PASSWORD instead */
      password: string;
      /* The host of the Postgres database for the layer, use env var PG_HOST instead */
      host: string;
      /* The port of the Postgres database for the layer, use env var PG_PORT instead */
      port: string;
      /* The name of the geometry field for the layer */
      geometry_field: string;
      /* The extent of the layer in the format [minX, minY, maxX, maxY]. The extent must be in the SRS defined below. */
      extent: [number, number, number, number];
      /* The name of the table or view to retrieve data from */
      table: string;
    };
    /* The description of the layer */
    description: string;
    /* The field names and types for the layer */
    fields: { [key: string]: 'String' | 'Number' | 'Boolean' | 'JSON' };
    /* Tippecanoe properties for the layer */
    properties: { [key: string]: number | string };
    /* The SRS of the layer. Only EPSG:4326 and EPSG:3857 are supported. */
    srs: '4326' | '3857';
  }[];
  /* The maximum zoom level for the layer */
  maxzoom: number;
  /* The minimum zoom level for the layer */
  minzoom: number;
  /* The name of the layer */
  name: string;
```

## 🎨 Style Config

The style config uses the [Maplibre Style Spec](https://maplibre.org/maplibre-gl-js-docs/style-spec/).
