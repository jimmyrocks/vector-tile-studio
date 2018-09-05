var yaml = require('js-yaml');
var fs = require('fs');

module.exports = function (path, options) {
  console.log(path);
  return new Promise(function (resolve, reject) {
    fs.readFile(path, 'utf8', function (error, data) {
      var doc;
      if (!error) {
        try {
          doc = yaml.safeLoad(data);
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
