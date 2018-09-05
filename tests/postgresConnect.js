var Connect = require('../src/postgresConnect.js');

var pool = new Connect({
  'user': 'postgres',
  'host': 'localhost',
  'password': 'postgres',
  'dbname': 'places_boundaries_v2'
});

pool.query('SELECT ST_ASGEOJSON(ST_TRANSFORM(geom_label, 4326)) AS the_geom FROM parks_label WHERE unit_id = $1', [269], (err, res) => {
  console.log(err ? err.stack : res.rows[0]); // Hello World!
  pool.end();
});
