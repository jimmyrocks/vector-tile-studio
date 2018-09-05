// The formula can be explained by this equation:
// a = 559082264.028/Math.pow(2, Math.log(559082264.028/a) / Math.log(2))
var scaleDenominator = 559082264.028;

module.exports = {
  toDenominator: function (scale) {
    return scaleDenominator / Math.pow(2, scale);
  },
  toScale: function (denominator) {
    return Math.round(Math.log(scaleDenominator / denominator) / Math.log(2));
  }
};
