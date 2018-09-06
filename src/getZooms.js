var pg = require('pg');
var sqlite3 = require('sqlite3');
var toGeojson = require('./toGeojson');
var zoomToDenominator = require('./zoomToDenominator');
var geojsonvt = require('geojson-vt');
var vtpbf = require('vt-pbf');
var iterateTasksLight = require('jm-tools').iterateTasksLight;
var crypto = require('crypto');
var zlib = require('zlib')

function toID (z, x, y) {
  return (((Math.pow(2, z) * y) + x) * 32) + z;
}

function yToRowID (z, y) {
  return Math.pow(2, z) - 1 - y;
}

var TaskQueue = function () {
  var tasks = 1;
  var res;
  var p = new Promise(function (resolve, reject) {
    res = resolve;
  });
  return {
    add: function (r) {
      tasks += 1;
      if (tasks === 0) {
        res(r);
      }
      return tasks;
    },
    remove: function (r) {
      tasks += -1;
      if (tasks === 0) {
        res(r);
      }
      return tasks;
    },
    value: function () {
      return tasks;
    },
    promise: p
  };
};

var createConnection = function (connectionString) {
  var pool = new pg.Pool(connectionString);
  return pool;
};

var queryPool = function (pool, query, params) {
  return new Promise(function (resolve, reject) {
    pool.query(query, params, function (err, res) {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
};

var SqliteDb = function (path, cached, initCommands) {
  // Create the DB
  var db = new (cached ? sqlite3.cached : sqlite3).Database(path || ':memory:');

  // What will be returned once the table is initialized
  var returnValues = {
    'database': db,
    'query': function (query, params) {
      return new Promise(function (resolve, reject) {
        db.all(query, params, function (e, r) {
          if (e) {
            reject(e);
          } else {
            resolve(r);
          }
        });
      });
    },
    'close': function () {
      return db.close();
    }
  };

  return new Promise(function (resolve, reject) {
    // Run the init commands (generally make tables)
    db.serialize(function () {
      (initCommands || []).forEach(function (cmd) {
        db.run(cmd, [], function (e) {
          if (e) {
            reject(e);
          }
        });
      });
    });
    resolve(returnValues);
  });
};

module.exports = function (config) {
  console.time('total time');
  var cacheDb = new SqliteDb(false, false, ['CREATE TABLE tiles (id INT, z INT, y INT, x INT, layer_name TEXT, tile TEXT)']);
  cacheDb.then(function (db) {
    var outpath = config.outpath;
    // Now we have a sqlitedb to hold all our info

    getLayers(config, db).catch(function (e) {
      console.log('done 0');
      db.close();
      console.log(e.stack);
      throw new Error(e);
    }).then(function () {
      console.log('done 1');
      merge(db, outpath, config).catch(function (e) {
        db.close();
        throw new Error(e);
      }).then(function (r) {
        console.log('done 2');
        db.close();
        console.timeEnd('total time');
      });
    });
  });
};

var buildMBTiles = function (config) {
  var vectorLayers = [];
  config.Layer.forEach(function(layer) {
    var layerObj = {};
    layerObj['id'] = layer.id;
    layerObj['description'] = layer.description;
    layerObj['fields'] = layer.fields;
    vectorLayers.push(JSON.parse(JSON.stringify(layerObj)));
  });
  var jsonObj = JSON.stringify({'vector_layers': vectorLayers});
  return [
    'CREATE TABLE metadata (name TEXT, value TEXT)',
    'CREATE TABLE images (tile_data BLOB, tile_id text)',
    'CREATE TABLE map (zoom_level INT, tile_column INT, tile_row INT, tile_id TEXT, grid_id TEXT)',
    'CREATE TABLE tiles_temp (tile_data BLOB, tile_id text, zoom_level INT, tile_column INT, tile_row INT)',
    'CREATE UNIQUE INDEX IF NOT EXISTS images_id ON images (tile_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS map_index ON map (zoom_level, tile_column, tile_row)',
    'CREATE VIEW tiles AS ' +
    '   SELECT ' +
    '       map.zoom_level AS zoom_level,' +
    '       map.tile_column AS tile_column,' +
    '       map.tile_row AS tile_row, ' +
    '       images.tile_data AS tile_data ' +
    '   FROM map ' +
    '   JOIN images ON images.tile_id = map.tile_id;',
    'INSERT INTO metadata VALUES (\'attribution\', \'' + config.attribution + '\')',
    'INSERT INTO metadata VALUES (\'center\', \'' + config.center.join(',') + '\')',
    'INSERT INTO metadata VALUES (\'description\', \'' + config.description  + '\')',
    'INSERT INTO metadata VALUES (\'format\', \'pbf\')',
    'INSERT INTO metadata VALUES (\'maxzoom\', \'' + config.maxzoom + '\')',
    'INSERT INTO metadata VALUES (\'minzoom\', \'' + config.minzoom + '\')',
    'INSERT INTO metadata VALUES (\'name\', \'' + config.name  + '\')',
    'INSERT INTO metadata VALUES (\'json\', \'' + jsonObj  + '\')'
  ];
};

var merge = function (db, outDbPath, config) {
  return new Promise(function (resolve, reject) {
    new SqliteDb(outDbPath, false, buildMBTiles(config)).catch(function (e) {
      throw new Error(e);
      console.log(e.stack);
      reject(e);
    }).then(function (outDb) {
      var queue = new TaskQueue();
      var idList = [];
      var lastTile = {};
      var compiledTile = {};
      mergedTiles = {};
      console.time('merge time');
      console.time('write time');
      console.log('');

      // var mergeLast = function(e,r, insertStatement) {
      //   // console.log(r);
      //   var tileJson = JSON.parse(r.tile);
      //   var layerName, mergedTile, buff;
      //   if (tileJson && tileJson.features && tileJson.features.length) {
      //     layerName = tileJson && tileJson.features && tileJson.features[0] && tileJson.features[0].tags && tileJson.features[0].tags.layerName;
      //     mergedTile = {};
      //     mergedTile[layerName] = tileJson;
      //     buff = vtpbf.fromGeojsonVt(mergedTile);
      //     var queued = queue.add();
      //     process.stdout.clearLine();
      //     process.stdout.cursorTo(0);
      //     process.stdout.write(queued.toString());
      //     insertStatement.run(
      //       [tileJson.z, tileJson.x, yToRowID(tileJson.z, tileJson.y), new Buffer(buff, 'base64')],
      //       function (e, r){
      //         e && console.log('e', e);
      //         // console.log(tileJson.z, tileJson.x, yToRowID(tileJson.z, tileJson.y), tileJson.y);
      //         var remaining = queue.remove();
      //         process.stdout.clearLine();
      //         process.stdout.cursorTo(0);
      //         process.stdout.write(remaining.toString());
      //     });
      //   }
      // };
      var writeLine = function (line) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(line);
      };

      var writeOut = function (insertCommand, record, metadata) {
        var added, removed;
        // console.log('vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv');
        // console.log(metadata);
        // console.log(record);
        // console.log('^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
        var buff = new Buffer(vtpbf.fromGeojsonVt(record));
        added = queue.add();
        writeLine('Added: ' + added);
        var compressed = zlib.deflateSync(buff);
        var tileId = crypto.createHash('md5').update(JSON.stringify(record)).digest('hex');
        insertCommand.run(
          [compressed, tileId, metadata.z, metadata.x, yToRowID(metadata.z, metadata.y)],
          function (e, r) {
            e && console.log('e', e, '\n\n');
            removed = queue.remove();
            writeLine('Removed: ' + removed);
          }
        );
      };

      console.timeEnd('merge time');
      console.log('');

      outDb.database.run('BEGIN TRANSACTION');
      var lastId, buildRecord, metadata;
      var insertCommand = outDb.database.prepare('INSERT INTO tiles_temp (tile_data, tile_id, zoom_level, tile_column, tile_row) VALUES (?, ?, ?, ?, ?)');
      outDb.database.parallelize(function () {
        db.database.each('SELECT id, z, y, x, layer_name, tile FROM tiles ORDER BY id', function (e, r) {
          if (r.id !== lastId) {
            if (lastId) {
              // WRITE OUT
              writeOut(insertCommand, buildRecord, metadata);
            }
            buildRecord = {};
          }
          // Add to build record
          if (buildRecord[r.layer_name]) {
            throw new Error('MISSING DATA z:' + r.z + ' x:' + r.x + ' y:' + r.y);
          }
          buildRecord[r.layer_name] = JSON.parse(zlib.inflateSync(r.tile));
          metadata = {
            id: r.id,
            z: r.z,
            y: r.y,
            x: r.x
          };
          lastId = r.id;
        }, function () {
          // WRITE OUT
          writeOut(insertCommand, buildRecord, metadata);
          queue.remove();
        });
      });
      queue.promise.then(function (r) {
        insertCommand.finalize();
        outDb.database.serialize(function () {
          outDb.database.run('INSERT INTO images SELECT MAX(tile_data) AS tile_data, tile_id FROM tiles_temp GROUP BY tile_id');
          outDb.database.run('INSERT INTO map SELECT zoom_level, tile_column, tile_row, tile_id, null FROM tiles_temp');
          outDb.database.run('DROP TABLE tiles_temp');
          outDb.database.run('COMMIT', function (e) {
            outDb.database.run('VACUUM');
            if (e) {
              reject(e);
            }
            outDb.close();
            console.log('');
            console.timeEnd('write time');
            resolve(r);
          });
        });
      }).catch(reject);
      // resolve('done');

      // var matchedTile;
      // console.log('c', idList, err);
      // db.each('SELECT id FROM tiles WHERE id = ' + idList.id, null, function (err, tileList) {
      //   console.log('d', idList.id, idList.count, tileList);
      //   try {
      //     if (matchedTile) {
      //       matchedTile = JSON.stringify(mergeTiles(JSON.parse(matchedTile), JSON.parse(tileList.tile)));
      //     } else {
      //       matchedTile = tileList.tile;
      //     }
      //   } catch (e) {
      //     console.log('Invalid Tile ' + idList.id);
      //     throw (e);
      //   }
      // });
      // db.run('INSERT INTO tiles (id, z, y, x, layer_name, tile) VALUES (?, ?, ?, ?, ?, ?)', [idList.id, idList.z, idList.y, idList.x, 'vtstudio-merged', matchedTile]);
    });
  });
};

var getZoom = function (vectorSettings, query, geometryField, layerName, zoom, pool, db) {
  return new Promise(function (resolve, reject) {
    console.log('Pulling from the Database (Layer: ' + layerName + (zoom ? (' zoom: ' + zoom) : ' all zooms') + ')');
    queryPool(pool, query, zoom ? [zoomToDenominator.toDenominator(zoom)] : null).then(function (result) {
      console.log('Converting to GeoJSON');
      var geojsonLayer = toGeojson(result, geometryField, layerName);

      // Set the vector tiles for this zoom
      var currVectorSettings = JSON.parse(JSON.stringify(vectorSettings));
      if (zoom) { 
        currVectorSettings.minZoom = zoom;
        currVectorSettings.maxZoom = zoom;
        currVectorSettings.indexMaxZoom = zoom;
      }
      currVectorSettings.tileDb = db.database;
      currVectorSettings.layerName = layerName;

      console.log('Generating The Vector Tiles: min:' + currVectorSettings.minZoom + ' max:' + currVectorSettings.maxZoom + ' idx:' + currVectorSettings.indexMaxZoom);
      geojsonvt(geojsonLayer, currVectorSettings).then(function (r) {
        console.log('done geojsonvt');
        resolve(r);
      }).catch(function (e) {
        reject(e);
      });
    }).catch(function (e) {
      reject(e);
    });
  });
};

var getLayer = function (layer, config, db) {
  return new Promise(function (resolve, reject) {
    var zoomTasks = [];
    var layerName = layer.id;
    var datasource = layer.Datasource;
    var geometryField = datasource.geometry_field;
    var connectionString = {
      'database': datasource.dbname,
      'host': datasource.host,
      'password': datasource.password,
      'port': datasource.port,
      'user': datasource.user
    };
    var extent = 'ST_MAKEENVELOPE(' + datasource.extent + ')'; // )
    var query = datasource.table;
    var vectorSettings = {
      maxZoom: config.maxzoom,
      minZoom: config.minzoom,
      tolerance: 3,
      extent: 4096,
      buffer: layer.properties['buffer-size'],
      debug: 1,
      promoteId: datasource.key_field,
      indexMaxZoom: config.maxzoom,
      indexMaxPoints: 0
    };
    query = query.replace(/!bbox!/g, extent);
    var byZoom = !!query.match(/!scale_denominator!/g);
    query = query.replace(/!scale_denominator!/g, '$1');
    query = 'SELECT ST_AsGeoJson(ST_Transform("' + geometryField + '",4326)) "' + geometryField + '_geojson", * FROM ' + query + ' WHERE "' + geometryField + '" IS NOT NULL';
    var pool = createConnection(connectionString);

    // TODO: change this to MAX zoom (only on minzoom for testing)
    for (var zoom = config.minzoom; zoom <= (byZoom ? config.maxzoom : config.minzoom); zoom++) {
    // for (var zoom = config.minzoom; zoom <= 6; zoom++) {
      zoomTasks.push({
        'name': 'zoom: ' + zoom + ' for ' + layer.id,
        'description': 'Queries the layer at a specific zoom',
        'task': getZoom,
        'params': [vectorSettings, query, geometryField, layerName, byZoom ? zoom : null, pool, db]
      });
    }

    return iterateTasksLight(zoomTasks, 'Zooms ' + config.minzoom + ' to ' + config.minzoom + ' for: ' + layerName).then(function (r) {
      pool.end();
      resolve(r);
    }).catch(reject);
  });
};

var getLayers = function (config, db) {
  return new Promise(function (resolve, reject) {
    var taskList = [];
    config.Layer.forEach(function (layer) {
      taskList.push({
        'name': 'layer ' + layer.id,
        'description': 'Queries the layer and adds the records to the database',
        'task': getLayer,
        'params': [layer, config, db]
      });
    });

    iterateTasksLight(taskList, 'Get Layers')
      .then(function (r) {
        db.query('SELECT count(*) as total_tiles, count(distinct id) as unique_tiles FROM tiles').then(function (r) {
          console.log('tile count', r);
          resolve();
        }).catch(reject);
      }).catch(reject);
  });
};
