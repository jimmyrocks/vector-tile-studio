var fs = require('fs');

module.exports = function (path, name, options) {
  return new Promise(function (resolve, reject) {
    fs.readFile(path, 'utf8', function (error, data) {
      var json;
      if (error) {
        reject(error);
      } else {
        try {
          json = JSON.parse(data.toString());
          if (name && json[name]) {
            resolve(json[name]);
          } else {
            reject('No config found for ' + name);
          }
        } catch (e) {
          reject(e);
        }
      }
    });
  });
};
