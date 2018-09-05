// {
//   "type": "Feature",
//   "properties": {},
//   "geometry": {
//     "type": "Point",
//     "coordinates": [
//       lon,
//       lat
//     ]
//   }
// }

module.exports = function(results, geometryField, layerName) {
  // Takes the database output and converts it to geojson (must already have geojson rows)

  var geojson = {
    'type': 'FeatureCollection',
    'features': []
  };

  var featureTemplate = {
    'type': 'Feature',
    'properties': {},
    'geometry': {}
  };
  geojson.features = results.rows.map(function(row) {
    var feature = JSON.parse(JSON.stringify(featureTemplate));
    feature.properties.layerName = layerName;
    try {
      feature.geometry = JSON.parse(row[geometryField + '_geojson']);
    } catch (e) {
      throw new Error(e);
    }
    for (var property in row) {
      if ([geometryField, geometryField + '_geojson'].indexOf(property) === -1) {
        feature.properties[property] = row[property];
      }
    }
    return feature;
  });
  return geojson;
};
