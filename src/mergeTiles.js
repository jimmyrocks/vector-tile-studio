var template = {
  features: [],
  numPoints: 0,
  numSimplified: 0,
  numFeatures: 0,
  source: null,
  x: 0,
  y: 0,
  z: 0,
  transformed: false,
  minX: 2,
  minY: 1,
  maxX: -1,
  maxY: 0
};

var deepCopy = function (obj) {
  return JSON.parse(JSON.stringify(obj));
};

var addTileToTemplate = function (tile, base) {
  if (tile.features) {
    base.features = base.features === null ? tile.features : [].concat.apply(base.features, tile.features);
  }
  if (tile.source) {
    base.source = base.source === null ? tile.source : [].concat.apply(base.source, tile.source);
  }
  base.numPoints += (tile.numPoints || template.numPoints);
  base.numSimplified += (tile.numSimplified || template.numSimplified);
  base.numFeatures += (tile.numFeatures || template.numFeatures);
  base.minX = tile.minX < base.minX ? tile.minX : base.minX;
  base.minY = tile.minY < base.minY ? tile.minY : base.minY;
  base.maxX = tile.maxX > base.maxX ? tile.maxX : base.maxX;
  base.maxY = tile.maxY > base.maxY ? tile.maxY : base.maxY;
  return base;
};

module.exports = function (tileA, tileB) {
  // Tile A and B need to have the same x, y, and z or bad this will happen
  // Maybe we should check for this?
  // var tile = deepCopy(template);
  // tile.x = tileA.x;
  // tile.y = tileA.y;
  // tile.z = tileA.z;
  // addTileToTemplate(tileA, tile);
  // addTileToTemplate(tileB, tile);
  var tile = {};
  if (tileB) {
    tile[tileB.layerName] = tileB;
  }
  if (tileA) {
    tile[tileA.layerName] = tileA;
  }
  return tile;
};
