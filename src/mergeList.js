module.exports = function (list, mergeBy, rowName, dataColumn, dataTransform, insertFunction) {
  var lastId;
  var buildRecord = {};
  var finalList = [];
  insertFunction = insertFunction || function(v) {
    finalList.push(v);
  };
  for (var idx = 0; idx < list.length; idx++) {
    if (list[idx][mergeBy] !== lastId) {
      if (lastId) {
        finalList.push(buildRecord);
      }
      buildRecord = {};
    }
    buildRecord[list[idx][rowName]] = dataTransform ? dataTransform(list[idx][dataColumn]) : list[idx][dataColumn];
    buildRecord[mergeBy] = list[idx][mergeBy];
    lastId = list[idx][mergeBy];
  }
  insertFunction(buildRecord);
  return finalList;
};
