var getZooms = require('../src/getZooms');

var yaml = require('js-yaml');
var fs = require('fs');

// Get document, or throw exception on error
try {
  // var config = yaml.safeLoad(fs.readFileSync('../configs/nps-places-boundaries-v2.yml', 'utf8'));
  var config = yaml.safeLoad(fs.readFileSync('../configs/nps_places_data.yml', 'utf8'));
} catch (e) {
  console.log(e);
}

var fakeConfig = {
  minzoom: 4,
  maxzoom: 4,
  'Layer': [{
    'id': 'test',
    'properties': {
      'buffer-size': 64
    },
    'Datasource': {
      'key_field': 'label_id',
      'dbname': 'places_boundaries_v2',
      'user': 'postgres',
      'password': 'postgres',
      'host': 'localhost',
      'port': '5432',
      'geometry_field': 'geom_label',
      'extent': '-20037508.34,-20037508.34,20037508.34,20037508.34',
      'table': '( ' +
        '        SELECT   "parks_label"."label_id",' +
        '                 "parks"."unit_code",' +
        '                 "parks_label"."label_name_short" AS "label_name_short",' +
        '                 "parks_label"."label_name_long" "label_name_long",' +
        '                 "parks_poly"."min_zoom_poly" > z(!scale_denominator!)' +
        '                   AND "parks_label"."label_type" != \'site\'' +
        '                   AND "parks_poly"."simp_type" != \'line\'' +
        '                   AS "show_point",' +
        '                 "parks_label"."min_zoom_label" <= z(!scale_denominator!)  AND ' +
        '                   "parks_label"."max_zoom_label" >= z(!scale_denominator!)' +
        '                   AS "show_label",' +
        '                 "parks_label"."min_zoom_label_long" <= z(!scale_denominator!) AS "label_long",' +
        '                 "parks_label"."min_zoom_label_center" <= z(!scale_denominator!) AS "label_center",' +
        '                 "parks_label"."ldir",' +
        '                 "parks_label"."ldir_enforce",' +
        '                 "parks_label"."label_wrap_width",' +
        '                 "parks_label"."label_small",' +
        '                 "parks_label"."geom_label"' +
        '        FROM     "parks_label" JOIN "parks" ON' +
        '                   "parks_label"."unit_id" = "parks"."unit_id"' +
        '                 LEFT OUTER JOIN "parks_poly" ON' +
        '                   "parks_label"."unit_id" = "parks_poly"."unit_id"' +
        '                 LEFT OUTER JOIN "parks_point" ON' +
        '                   "parks_label"."unit_id" = "parks_point"."unit_id" ' +
        '        WHERE    ' +
        '                  "parks_label"."geom_label" && !bbox! AND' +
        '                  "parks_label"."geom_label" IS NOT NULL AND' +
        '                  "parks_label"."pt_render" != false AND' +
        '                  "parks_point"."pt_render" != false' +
        '        ORDER BY "parks"."unit_area" DESC) as data'
    }
  }]
};

getZooms(config);
