exports.Thoonk = require('./lib/thoonk');
exports.Subscription = require('./lib/subscription');
exports.ThoonkBaseObject = require('./lib/baseObject');
exports.ThoonkBaseInterface = require('./lib/baseInterface');

exports.createClient = function (config) {
    return new exports.Thoonk(config || {});
};
