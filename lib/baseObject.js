var EventEmitter = require('events').EventEmitter;
var Subscription = require('./subscription');


var ThoonkBaseObject = function (name, thoonk) {
    EventEmitter.call(this);
    this.setMaxListeners(1000);

    this.thoonk = thoonk;
    this.redis = this.thoonk.redis;
    this.name = name;
    this.subscription = null;
};

ThoonkBaseObject.prototype = Object.create(EventEmitter.prototype);
ThoonkBaseObject.prototype.constructor = ThoonkBaseObject;
ThoonkBaseObject.prototype.objtype = '';

(function () {

    this.handleEvent = function (channel, msg) {
        // Override this function in your object
    };

    this.subscribe = function (cb) {
        var self = this;
        cb = cb || function () {};

        if (!this.subscription) {
            this.subscription = new Subscription(this, this.name, this.handleEvent.bind(this), function _subscribed() {
                self.emit("subscribeReady");
                cb(false, self.subscription);
            });
        } else {
            this.emit("subscribeReady");
            cb(false, self.subscription);
        }
    };

    this.runScript = function (scriptName, args, cb) {
        var self = this;

        cb = cb || function () {};

        this.thoonk._runScript(this.objtype, scriptName, this.name, args, function (err, results) {
            if (err) {
                self.thoonk.logger.error(scriptName, err);
                cb(err);
            } else {
                cb.apply(null, results);
            }
        });
    };

    this.quit = function () {
        if (this.subscription) {
            this.subscription.quit(this.handleEvent.bind(this));
        }
    };

}).call(ThoonkBaseObject.prototype);


module.exports = ThoonkBaseObject;
