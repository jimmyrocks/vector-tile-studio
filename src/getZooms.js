/* eslint-env node */
/* global Promise */
/* eslint no-console: ["error", { allow: ["warn", "error", "log", "time", "timeEnd"] }] */

var pg = require('pg');
var sqlite3 = require('sqlite3');
var toGeojson = require('./toGeojson');
var zoomToDenominator = require('./zoomToDenominator');
var geojsonvt = require('./geojson-vt-dev');
var vtpbf = require('vt-pbf');
var iterateTasksLight = require('jm-tools').iterateTasksLight;
var crypto = require('crypto');
var zlib = require('zlib');

function toID (z, x, y) {
  return (((Math.pow(2, z) * y) + x) * 32) + z;
}

function yToRowID (z, y) {
  return Math.pow(2, z) - 1 - y;
}

var TaskQueue = function () {
  var tasks = 1;
  var res;
  var p = new Promise(function (resolve) {
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

var auditTiles = function (outDb, db) {
  outDb.database.all('SELECT zoom_level, tile_column, tile_row, layer_count FROM tiles_temp', function (e, r) {
    db.database.all('SELECT id, count(*) as count from tiles group by id', function (ee, rr) {
      var store = {};
      var bad = {};
      console.log('e', e);
      r.forEach(function (row) {
        var tileId = toID(row.zoom_level, row.tile_column, yToRowID(row.zoom_level, row.tile_row));
        store[tileId] = {
          new: row.layer_count,
          orig: 0
        };
        bad[tileId] = 'new';
      });
      rr.forEach(function (orow) {
        if (store[orow.id]) {
          store[orow.id].orig = orow.count;
          delete bad[orow.id];
        } else {
          store[orow.id] = {
            new: 0,
            orig: orow.count
          };
          bad[orow.id] = 'orig';
        }
      });
      console.log('bad', bad);
    });
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
        console.log(e.stack);
        throw new Error(e);
      }).then(function () {
        console.log('done 2');
        db.close();
        console.timeEnd('total time');
      });
    });
  });
};

var buildMBTiles = function (config) {
  // var vectorLayers = [];
  // config.Layer.forEach(function (layer) {
  //   var layerObj = {};
  //   layerObj['id'] = layer.id;
  //   layerObj['description'] = layer.description;
  //   layerObj['fields'] = layer.fields;
  //   vectorLayers.push(JSON.parse(JSON.stringify(layerObj)));
  // });
  // var jsonObj = JSON.stringify({
  //   'vector_layers': vectorLayers
  // });
  return [
    'CREATE TABLE metadata (name TEXT, value TEXT)',
    'CREATE TABLE images (tile_data BLOB, tile_id text)',
    'CREATE TABLE map (zoom_level INT, tile_column INT, tile_row INT, tile_id TEXT, grid_id TEXT)',
    'CREATE TABLE tiles_temp (tile_data BLOB, tile_id text, zoom_level INT, tile_column INT, tile_row INT, layer_count INT)',
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
    'INSERT INTO metadata VALUES (\'description\', \'' + config.description + '\')',
    'INSERT INTO metadata VALUES (\'format\', \'pbf\')',
    'INSERT INTO metadata VALUES (\'maxzoom\', \'' + config.maxzoom + '\')',
    'INSERT INTO metadata VALUES (\'minzoom\', \'' + config.minzoom + '\')',
    'INSERT INTO metadata VALUES (\'name\', \'' + config.name + '\')' //,
    // 'INSERT INTO metadata VALUES (\'json\', \'' + jsonObj + '\')'
  ];
};

var merge = function (db, outDbPath, config) {
  // Create the 'JSON' metadata
  // We are going to check it to see if any new fields come in from the GeoJSON
  // You can set the fields in the YML, but if that changes, mapbox won't pick up the fields for styling
  var vectorLayers = [];
  config.Layer.forEach(function (layer) {
    var layerObj = {};
    layerObj['id'] = layer.id;
    layerObj['description'] = layer.description;
    layerObj['fields'] = layer.fields;
    vectorLayers.push(JSON.parse(JSON.stringify(layerObj)));
  });

  return new Promise(function (resolve, reject) {
    new SqliteDb(outDbPath, false, buildMBTiles(config)).catch(function (e) {
      console.log(e.stack);
      throw new Error(e);
    }).then(function (outDb) {
      var queue = new TaskQueue();
      console.time('merge time');
      console.time('write time');
      console.log('');

      var writeLine = function (line) {
        if (process && process.stdout && process.stdout.clearLine) {
          // This doesn't work when being piped to a file
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          process.stdout.write(line);
        } else {
          console.log(line);
        }
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
          [compressed, tileId, metadata.z, metadata.x, yToRowID(metadata.z, metadata.y), metadata.layerCount],
          function (e) {
            e && console.log('e', e, '\n\n');
            removed = queue.remove();
            writeLine('Removed: ' + removed);
          }
        );
      };

      console.timeEnd('merge time');

      outDb.database.run('BEGIN TRANSACTION');
      var lastId, buildRecord, metadata, layerCount;
      var insertCommand = outDb.database.prepare('INSERT INTO tiles_temp (tile_data, tile_id, zoom_level, tile_column, tile_row, layer_count) VALUES (?, ?, ?, ?, ?, ?)');
      outDb.database.parallelize(function () {
        db.database.each('SELECT id, z, y, x, layer_name, tile FROM tiles ORDER BY id', function (e, r) {
          var layerFields = {};
          var layerIdx = -1;

          if (r.id !== lastId) {
            if (lastId) {
              // WRITE OUT
              writeOut(insertCommand, buildRecord, metadata);
            }
            buildRecord = {};
            layerCount = 0;
          }
          // Add to build record
          if (buildRecord[r.layer_name]) {
            throw new Error('MISSING DATA z:' + r.z + ' x:' + r.x + ' y:' + r.y);
          }
          buildRecord[r.layer_name] = JSON.parse(zlib.inflateSync(r.tile));
          if (config.removeNulls) {
            layerFields = {};
            layerIdx = -1;
            for (var i = 0; i < vectorLayers.length; i++) {
              if (vectorLayers[i].id === r.layer_name) {
                layerIdx = i;
                layerFields = vectorLayers[i].fields;
              }
            }
            if (layerIdx === -1) {
              layerIdx = vectorLayers.push({'id': r.layer_name, 'fields': layerFields}) - 1;
            }
            buildRecord[r.layer_name] = removeNulls(buildRecord[r.layer_name], layerFields);
            vectorLayers[layerIdx].fields = layerFields;
          }
          metadata = {
            id: r.id,
            z: r.z,
            y: r.y,
            x: r.x,
            layerCount: ++layerCount
          };
          lastId = r.id;
        }, function () {
          // WRITE OUT
          writeOut(insertCommand, buildRecord, metadata);
          queue.remove();
        });
      });
      queue.promise.then(function (r) {
        var jsonObj = JSON.stringify({
          'vector_layers': vectorLayers
        });

        insertCommand.finalize();
        outDb.database.serialize(function () {
          outDb.database.run('INSERT INTO images SELECT MAX(tile_data) AS tile_data, tile_id FROM tiles_temp GROUP BY tile_id');
          outDb.database.run('INSERT INTO map SELECT zoom_level, tile_column, tile_row, tile_id, null FROM tiles_temp');
          outDb.database.run('INSERT INTO metadata VALUES (\'json\', \'' + jsonObj + '\')');
          if (config.audit) {
            auditTiles(outDb, db);
          }
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

var removeNulls = function (layer, layerFields) {
  var tags = {};
  if (layer.features) {
    for (var j = 0; j < layer.features.length; j++) {
      if (layer.features[j].tags) {
        tags = Object.keys(layer.features[j].tags);
        for (var k = 0; k < tags.length; k++) {

          // Remove Nulls
          if (layer.features[j].tags[tags[k]] === null) {
            delete layer.features[j].tags[tags[k]];
          } else {
            // This is in the else, because we're not going to bother adding "nulls" to our metadata
            // verify fields (this only checks the type of the first occurrence, we may want to change that 
            if (tags[k] !== 'layerName' && layerFields[tags[k]] === undefined) {
              layerFields[tags[k]] = Object.prototype.toString.call(layer.features[j].tags[tags[k]]).slice(8, -1);
            }
          }
        }
      }
    }
  }
  return layer;
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
      maxZoom: layer.properties.maxzoom || config.maxzoom,
      minZoom: layer.properties.minzoom || config.minzoom,
      tolerance: layer.properties.tolerance || config.tolerance || 3,
      extent:  layer.properties.extent|| config.tolerance || 4096,
      buffer: layer.properties['buffer-size'] || 48,
      debug: layer.properties.debug || 1,
      promoteId: datasource.key_field,
      indexMaxZoom: layer.properties.maxzoom || config.maxzoom,
      indexMaxPoints: 0
    };
    query = query.replace(/!bbox!/g, extent);
    var byZoom = !!query.match(/!scale_denominator!/g);
    query = query.replace(/!scale_denominator!/g, '$1');
    query = 'SELECT ST_AsGeoJson(ST_Transform("' + geometryField + '",4326)) "' + geometryField + '_geojson", * FROM ' + query + ' WHERE "' + geometryField + '" IS NOT NULL';
    var pool = createConnection(connectionString);

    for (var zoom = vectorSettings.minZoom; zoom <= (byZoom ? vectorSettings.maxZoom : vectorSettings.minZoom); zoom++) {
      zoomTasks.push({
        'name': 'zoom: ' + zoom + ' for ' + layer.id,
        'description': 'Queries the layer at a specific zoom',
        'task': getZoom,
        'params': [vectorSettings, query, geometryField, layerName, byZoom ? zoom : null, pool, db]
      });
    }

    return iterateTasksLight(zoomTasks, 'Zooms ' + vectorSettings.minZoom + ' to ' + vectorSettings.maxZoom + ' for: ' + layerName).then(function (r) {
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
      .then(function () {
        db.query('SELECT count(*) as total_tiles, count(distinct id) as unique_tiles FROM tiles').then(function (r) {
          console.log('tile count', r);
          resolve();
        }).catch(reject);
      }).catch(reject);
  });
};
