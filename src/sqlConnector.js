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

var SqliteDb = function (path, cached, initCommands) {
  // Create the DB
  var db = new sqlite3.Database(path || ':memory:');

  // What will be returned once the table is initialized
  var returnValues = {
    'database': db,

    'closeWhenDone': function () {
      return db.close();
    }
  };

  return new Promise(function (resolve, reject) {
    // Run the init commands (generally make tables)
    (initCommands || []).forEach(function (cmd) {
      db.run(cmd, [], function (e) {
        if (e) {
          reject(e);
        } else {
          resolve(returnValues);
        }
      });
    });
  });
};

