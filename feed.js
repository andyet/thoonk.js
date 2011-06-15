var EventEmitter = require("events").EventEmitter,
    uuid = require("node-uuid");

/**
 * Feed object
 *
 * @param thoonk: instance of thoonk
 * @param name: name of the feed
 * @param config: configuration object
 * @param type: used interally
 */
function Feed(thoonk, name, config, type) {
    EventEmitter.call(this);
    this.thoonk = thoonk;

    //local references
    this.mredis = this.thoonk.mredis;
    this.lredis = this.thoonk.lredis;
    this.bredis = this.thoonk.bredis;

    this.name = name;
    this.subscribed = false;
    this.thoonk.once("ready:" + name, this.ready.bind(this));
    this.thoonk.exists(name,
        //exists
        function(reply) {
            if(!config) { 
                thoonk.update_config(this.name, this.ready.bind(this));
            } else {
                if(!type) { type = 'feed' }
                if(!config.hasOwnProperty('type')) { config.type = type; }
                this.thoonk.set_config(this.name, config);
            }
        }.bind(this),
        //doesn't
        function(reply) {
            thoonk.create(name, config);
        }.bind(this)
    );

    this.publish = this.thoonk.lock.require(feedPublish, this);
    this.retract = this.thoonk.lock.require(feedRetract, this);
}

function feedReady() {
    this.lredis.once('idle', function() { 
        this.emit('ready');
    }.bind(this));
    setTimeout(function() {
        this.emit('ready');
    }.bind(this), 100);
    this.lredis.subscribe("feed.publish:" + this.name);
    this.lredis.subscribe("feed.edit:" + this.name);
    this.lredis.subscribe("feed.retract:" + this.name);
    this.subscribed = true;
}

function feedPublish(item, id, callback) {
    if(id == null) {
        id = uuid();
    }
    var max_length = this.thoonk.feeds[this.name]['max_length'];
    var pmulti = this.mredis.multi();
    if(max_length) {
        //attempt to publish, so long as feed.ids doesn't change
        var publish_attempt = function() {
            this.mredis.watch('feed.ids:' + this.name);
            this.mredis.zrange('feed.ids:' + this.name, 0, -max_length, function (err, reply) {
                var delete_ids = reply;
                delete_ids.forEach(function (delete_id, idx) {
                    pmulti.zrem('feed.ids:' + this.name, delete_id);
                    pmulti.hdel('feed.items:' + this.name, delete_id);
                    pmulti.publish('feed.retract:' + this.name, delete_id);
                }.bind(this));
                pmulti.zadd('feed.ids:' + this.name, Date.now(), id);
                pmulti.incr('feed.publishes:' + this.name);
                pmulti.hset('feed.items:' + this.name, id, item);
                pmulti.exec(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(!reply) { 
                        publish_attempt();
                    } else {
                        if(reply.slice(-3,-2)[0]) {
                            this.mredis.publish('feed.publish:' + this.name, id + "\x00" + item);
                        } else {
                            this.mredis.publish('feed.edit:' + this.name, id + "\x00" + item);
                        }
                        if(callback !== undefined) { callback(item, id); }
                    }
                }.bind(this));
            }.bind(this));
        }.bind(this);
        publish_attempt();
    } else {
        pmulti.zadd('feed.ids:' + this.name, Date.now(), id);
        pmulti.incr('feed.publishes:' + this.name);
        pmulti.hset('feed.items:' + this.name, id, item);
        pmulti.exec(function(err,reply) {
            this.thoonk.lock.unlock();
            if(reply.slice(-3,-2)[0]) {
                this.mredis.publish('feed.publish:' + this.name, id + "\x00" + item);
            } else {
                this.mredis.publish('feed.edit:' + this.name, id + "\x00" + item);
            }
            if(callback !== undefined) { callback(item, id); }
        }.bind(this));
    }
}

function feedRetract(id, callback) {
    this.mredis.watch('feed.ids:' + this.name, function(err, reply) {
        this.mredis.zrank('feed.ids:' + this.name, function(err, reply) {
            if(reply) {
                var rmulti = this.mredis.multi();
                rmulti.zrem('feed.ids:' + this.name, id);
                rmulti.hdel('feed.items:' + this.name, id); 
                rmulti.publish('feed.retract:' + this.name, id);
                rmulti.exec(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(!reply) {
                        process.nextTick(function() {
                            this.retract(id, callback);
                        }.bind(this));
                    } else {
                        if(callback) { callback(id); }
                    }
                }.bind(this));
            } else {
                this.thoonk.lock.unlock();
                this.mredis.unwatch('feed.ids:' + this.name);
            }
        }.bind(this));
    }.bind(this));
}


function feedGetIds(callback) {
    return this.mredis.zrange("feed.ids:" + this.name, 0, -1, callback);
}

function feedGetItem(id, callback) {
    return this.mredis.hget("feed.items:" + this.name, id, callback);
}

function feedSubscribe(publish_callback, edit_callback, retract_callback, done_callback) {
    this.thoonk.on('publish:' + this.name, publish_callback);
    this.thoonk.on('edit:' + this.name, edit_callback);
    this.thoonk.on('retract:' + this.name, retract_callback);
    if(!this.subscribed) {
        this.lredis.once('idle', done_callback);
        this.lredis.subscribe("feed.publish:" + this.name);
        this.lredis.subscribe("feed.edit:" + this.name);
        this.lredis.subscribe("feed.retract:" + this.name);
        this.subscribed = true;
    } else {
        done_callback();
    }
}

//extend Feed with EventEmitter
Feed.super_ = EventEmitter;
Feed.prototype = Object.create(EventEmitter.prototype, {
    constructor: {
        value: Feed,
        enumerable: false
    }
});

Feed.prototype.publish = feedPublish;
Feed.prototype.retract = feedRetract;
Feed.prototype.getIds = feedGetIds;
Feed.prototype.getItem = feedGetItem;
Feed.prototype.subscribe = feedSubscribe;
Feed.prototype.ready = feedReady;

exports.Feed = Feed;
