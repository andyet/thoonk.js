var EventEmitter = require('events').EventEmitter;
var Subscription = require('./subscription');


var ThoonkBaseInterface = function (thoonk) {
    EventEmitter.call(this);
    this.thoonk = thoonk;
    this.redis = this.thoonk.redis;
};

ThoonkBaseInterface.prototype = Object.create(EventEmitter.prototype);
ThoonkBaseInterface.constructor = ThoonkBaseInterface;

(function () {

    this.handleEvent = function (channel, msg) {
        // Override this function in your object
    };

    this.getEmitter = function (instance, eventHandler, cb) {
        var emitter = new Subscription(this, instance, eventHandler, function _subscribed(result) {
            cb(false, result);
        });

        return emitter;
    };

    this.runScript = function (scriptName, args, cb) {
        var self = this;

        cb = cb || function () {};

        this.thoonk._runScriptSingle(this.objtype, scriptName, args, function (err, results) {
            if (err) {
                self.thoonk.logger.error(scriptName, err);
                cb(err);
            } else {
                cb.apply(null, results);
            }
        });
    };

}).call(ThoonkBaseInterface.prototype);


module.exports = ThoonkBaseInterface;
