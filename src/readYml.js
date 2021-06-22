var yaml = require('js-yaml');
var fandlebars = require('fandlebars');
var fs = require('fs');

var envVariables = process.env;
envVariables['PGPORT'] = parseInt(envVariables['PGPORT'], 10);

module.exports = function (path, options) {
  console.log(path);
  return new Promise(function (resolve, reject) {
    fs.readFile(path, 'utf8', function (error, data) {
      var doc;
      if (!error) {
        try {
          doc = yaml.load(data);
          // Replace the system variables
          doc = fandlebars.obj(doc, envVariables);
          resolve(doc);
        } catch (e) {
          reject(e);
        }
      } else {
        reject(error);
      }
    });
  });
};
