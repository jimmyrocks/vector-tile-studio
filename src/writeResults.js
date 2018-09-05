var report = function (type, message) {
  console.log(type.toUpperCase() + ':', message);
};

module.exports = {
  'failure': function (message) {
    throw message;
    return report('failure', message);
  },
  'success': function (message) {
    return report('success', '', JSON.stringify(message, null, 2));
  }
};
