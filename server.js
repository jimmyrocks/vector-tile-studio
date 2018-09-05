var geojsonvt = require('geojson-vt');
var fs = require('fs');
var vtpbf = require('vt-pbf');
const express = require('express');
const app = express();

var settings = {
	maxZoom: 16,  // max zoom to preserve detail on; can't be higher than 24
	tolerance: 2, // simplification tolerance (higher means simpler)
	extent: 4096, // tile extent (both width and height)
	buffer: 64,   // tile buffer on each side
	debug: 0,     // logging level (0 to disable, 1 or 2)
	lineMetrics: false, // whether to enable line metrics tracking for LineString/MultiLineString features
	promoteId: null,    // name of a feature property to promote to feature.id. Cannot be used with `generateId`
	generateId: true,  // whether to generate feature ids. Cannot be used with `promoteId`
	indexMaxZoom: 2,       // max zoom in the initial tile index
	indexMaxPoints: 100000 // max number of points per tile in the index
};

app.get('/', (req, res) => res.send('Hello World!'));

app.listen(5000, () => console.log('Example app listening on port 5000!'));

// var fileBuffer = fs.readFileSync('./samples/mimi.geojson').toString();
var fileBuffer = fs.readFileSync('./samples/out.json').toString();
var geoJSON = JSON.parse(fileBuffer.toString());

// build an initial index of tiles
var tileIndex = geojsonvt(geoJSON, settings);

// request a particular tile
// var z = 14;
// var x = 3554;
// var y = 5967;
// var features = tileIndex.getTile(z, x, y);

// show an array of tile coordinates created so far
// console.log(JSON.stringify(tileIndex.tileCoords, null, 2)); // [{z: 0, x: 0, y: 0}, ...]
// console.log(JSON.stringify(features, null, 2)); // [{z: 0, x: 0, y: 0}, ...]

// var buff = vtpbf.fromGeojsonVt({'geojsonLayer': tileIndex.getTile(z, x, y)});
// console.log(buff);

app.get('/tile/:z/:x/:y', function (req, res) {
  var z = parseInt(req.params.z,10);
  var x = parseInt(req.params.x,10);
  var y = parseInt(req.params.y,10);
  var rowId = Math.pow(2, z) - 1 - y;
  var buff;

  // z = 14;
  // x = 3554;
  // rowId = 5967;

  var tile = tileIndex.getTile(z, x, y);
  if (tile) {
       buff = vtpbf.fromGeojsonVt({
      'geojsonLayer': tile
    });
    console.log('vvvvvvvvvvvvvvvvvv');
    console.log(buff);
    // console.log(JSON.stringify(new Buffer(buff, 'base64')));
    console.log('^^^^^^^^^^^^^^^^^^');
 
    res.set('Content-Type', 'application/vnd.mapbox-vector-tile');
    res.send(new Buffer(buff, 'base64'));
  } else {
    res.sendStatus(404);
    console.log('v', z, x, y);
    console.log('w', 14, 3554, 5967);
    if (z === 14 && x === 3554 && y === 5967) {
      console.log('hmm?');
    }
  }
});
