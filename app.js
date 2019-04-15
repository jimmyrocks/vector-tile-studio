// This will:
// 1. Read the YML File
// 2. Download all the layers from the database into GeoJSON Formar
// 3. Create Vector Tiles from that download
// 4. Add them to a sqlite file
// In the Future:
// 5. Detect changes since the last run and only update affected tiles

var iterateTasksLight = require('jm-tools').iterateTasksLight;
var readYml = require('./src/readYml');
var readJson = require('./src/readJson');
var getZooms = require('./src/getZooms');
var mainConfigFile = __dirname + '/configs.json';
var write = require('./src/writeResults');

var taskList = [{
  'name': 'jsonConfigFile',
  'description': 'Loads the JSON file that drives the changes',
  'task': readJson,
  'params': [mainConfigFile, 0]
},{
  'name': 'ymlConfigFile',
  'description': 'Loads the mapbox studio YML file into JSON',
  'task': readYml,
  'params': ['{{jsonConfigFile.path}}']
},{
  'name': 'getZooms',
  'description': 'Builds the tiles',
  'task': getZooms,
  'params': ['{{ymlConfigFile}}']
}];

iterateTasksLight(taskList, 'Run vt-config')
  .then(write.success)
  .catch(write.failure);
