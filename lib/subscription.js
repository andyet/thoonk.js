var async = require('async');
var EventEmitter = require('events').EventEmitter;


var Subscription = function (thoonkObject, instance, eventHandler, cb) {
    EventEmitter.call(this);
    this.setMaxListeners(100);
    
    cb = cb || function () {};

    this.thoonk = thoonkObject.thoonk;
    this.instance = instance;
    this.objtype = thoonkObject.objtype;
    this.thoonkObject = thoonkObject;

    this.id = this.objtype + '::' + this.instance;

    this.subscribables = thoonkObject.subscribables || [];
    this.initialized = false;

    this.initialize(eventHandler, cb);
};

Subscription.prototype = Object.create(EventEmitter.prototype);
Subscription.prototype.constructor = Subscription;

(function () {

    this._buildEvent = function (eventType) {
        if (this.instance) {
            return 'event.' + this.objtype + '.' + eventType + ':' + this.instance;
        } else {
            return 'event.' + this.objtype + '.' + eventType;
        }
    };

    this._parseChannel = function (channel) {
        if (this.instance) {
            return channel.split(':')[0].split('.')[2];
        } else {
            return channel.split('.')[2];
        }
    };
    
    this.initialize = function (eventHandler, cb) {
        var self = this;

        if (!this.thoonk.subscriptions.hasOwnProperty(this.sub)) {
            this.thoonk.subscriptions[this.id] = this.subscribables;
            this.thoonk.subCounts[this.id] = 1;

            async.each(this.subscribables, function (name, next) {
                var eventName = self._buildEvent(name);
                if (!self.thoonk.lredis.subscription_set['sub ' + eventName]) {
                    self.thoonk.lredis.subscribe(eventName);
                }
                next();
            }, function () {
                self.emit('subscribeReady');
                process.nextTick(function () {
                    cb(self);
                });
            });
        } else {
            this.thoonk.subCounts[this.id]++;
            this.emit('subscribeReady');
            process.nextTick(function () {
                cb(self);
            });
        }

        if (!this.initialized) {
            async.each(this.subscribables, function (name, next) {
                var eventName = self._buildEvent(name);
                if (eventHandler) {
                    self.thoonk.on(eventName, eventHandler);
                }
                self.thoonk.on(eventName, self.handleEvent.bind(self));
                next();
            }, function () {
                self.initialized = true;
            });
        }
    };
    
    this.handleEvent = function (channel, msg) {
        if (this.thoonkObject.handleEvent) {
            this.thoonkObject.handleEvent.apply(this, arguments);
        }
        this.emit(this._parseChannel(channel), msg);
        this.emit('all', this._parseChannel(channel), msg);
    };

    this.quit = function (eventHandler) {
        var self = this;

        this.thoonk.unsubscribeInstance(this.id);
        this.removeAllListeners();

        async.each(this.subscribables, function (name, next) {
            var eventName = self._buildEvent(name);
            if (eventHandler) {
                self.thoonk.removeListener(eventName, eventHandler);
            }
            self.thoonk.removeListener(eventName, self.handleEvent.bind(self));
        });
    };

}).call(Subscription.prototype);


module.exports = Subscription;
