var Client = require('pg');

//
//  pool.query('SELECT $1::text as message', ['Hello world!'], (err, res) => {
//   console.log(err ? err.stack : res.rows[0].message); // Hello World!
//   pool.end();
// });

var Connect = function(datasource) {

  if (datasource.type != 'postgis') {
    // We only support postgis layers
    // error out or something
  }

  var pool = new Client.Pool({
    user: datasource.user,
    host: datasource.host,
    database: datasource.dbname,
    password: datasource.password,
    port: datasource.port
  });

  // var query = datasource.table;
  // var bbox = 'ST_MAKEENVELOPE(' + datasource.extent +')';
  // var scaleDenominator = '25000000'; //zoomToDenominator;

  return pool;

};

module.exports = function(datasource) {
  return new Connect(datasource);
};
