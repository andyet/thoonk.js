/**
 * Written by Nathan Fritz and Lance Stout. Copyright © 2011 by &yet, LLC. 
 * Released under the terms of the MIT License
 */

var EventEmitter = require("events").EventEmitter,
    uuid = require("node-uuid");

/**
 * A Thoonk feed is a collection of items ordered by publication date.
 *
 * The collection may either be bounded or unbounded in size. A bounded
 * feed is created by adding the field 'max_length' to the configuration
 * with a value greater than 0.
 * 
 * Redis Keys Used:
 *     feed.ids:[feed]       -- A sorted set of item IDs.
 *     feed.items:[feed]     -- A hash table of items keyed by ID.
 *     feed.publish:[feed]   -- A pubsub channel for publication notices.
 *     feed.publishes:[feed] -- A counter for number of published items.
 *     feed.retract:[feed]   -- A pubsub channel for retraction notices.
 *     feed.config:[feed]    -- A JSON string of configuration data.
 *     feed.edit:[feed]      -- A pubsub channel for edit notices.
 *
 * Thoonk Standard API:
 *     get_ids  -- Return the IDs of all items in the feed.
 *     get_item -- Return a single item from the feed given its ID.
 *     get_all  -- Return all items in the feed.
 *     publish  -- Publish a new item to the feed, or edit an existing item.
 *     retract  -- Remove an item from the feed.
 */

/**
 * Create a new Feed object for a given Thoonk feed.
 * 
 * Note: More than one Feed objects may be create for the same
 *       Thoonk feed, and creating a Feed object does not
 *       automatically generate the Thoonk feed itself.
 * 
 * Arguments:
 *     thoonk -- The main Thoonk object.
 *     feed   -- The name of the feed.
 *     config -- Optional dictionary of configuration values.
 *     type   -- Internal use only.
 */
function Feed(thoonk, name, config, type) {
    type || (type = 'feed');
    EventEmitter.call(this);
    this.thoonk = thoonk;

    //local references
    this.mredis = this.thoonk.mredis;
    this.lredis = this.thoonk.lredis;

    this.name = name;
    this.subscribed = false;
    this.thoonk.once("ready:" + name, this.ready.bind(this));
    this.thoonk.exists(name,
        //exists
        function(reply) {
            if(config) { 
                if(!config.hasOwnProperty('type')) { config.type = type; }
                this.thoonk.setConfig(this.name, config);
            } else {
                this.thoonk.emit('ready:' + this.name);
            }
        }.bind(this),
        //doesn't
        function(reply) {
            config || (config = {'type': type});
            if(!config.hasOwnProperty('type')) { config.type = type; }
            thoonk.create(name, config);
        }.bind(this)
    );

    if(type == 'feed') {
        this.publish = this.thoonk.lock.require(feedPublish, this);
        this.edit = this.thoonk.lock.require(feedPublish, this);
        this.retract = this.thoonk.lock.require(feedRetract, this);
    }
}

function feedReady() {
    this.emit('ready');
}

/**
 * Publish an item to the feed, or replace an existing item.
 * 
 * Newly published items will be at the top of the feed, while
 * edited items will remain in their original order.
 * 
 * If the feed has a max length, then the oldest entries will
 * be removed to maintain the maximum length.
 * 
 * Arguments:
 *     item     -- The content of the item to add to the feed.
 *     id       -- Optional ID to use for the item, if the ID already
 *                 exists, the existing item will be replaced.
 *     callback -- Executed upon sucessful publish.
 * 
 * Callback Arguments:
 *     error
 *     item -- The conent of the published item.
 *     id   -- The ID assigned to the published item.
 */
function feedPublish(item, id, callback) {
    if(id == null) {
        id = uuid();
    }
    this.mredis.hget('feed.config:' + this.name, 'max_length', function(err, reply) {
        var max_length = reply;
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
                            if(callback !== undefined) { callback(null, item, id); }
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
                if(callback !== undefined) { callback(null, item, id); }
            }.bind(this));
        }
    }.bind(this));
}

/**
 * Check feed for an id.
 *
 * Arguements:
 *      id          -- The ID value to check for.
 *      callback    -- Executed when answer is retrieved.
 */
function feedHasId(id, callback) {
    this.mredis.hexists('feed.items:' + this.name, id, function(err, reply) {
        callback(err, Boolean(reply));
    });
}

/**
 * Remove an item from the feed.
 * 
 * Arguments:
 *     id       -- The ID value of the item to remove.
 *     callback -- Executed on successful retraction.
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     id -- ID of the removed item. 
 */
function feedRetract(id, callback) {
    this.mredis.watch('feed.ids:' + this.name, function(err, reply) {
        this.mredis.zrank('feed.ids:' + this.name, id, function(err, reply) {
            if(reply >= 0) {
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
                        if(callback) { callback(null, id); }
                    }
                }.bind(this));
            } else {
                this.mredis.unwatch(function(err, reply) {
                    this.thoonk.lock.unlock();
                });
                callback("DoesNotExist", id);
            }
        }.bind(this));
    }.bind(this));
}

/**
 * Return the set of IDs used by items in the feed."""
 *
 * Arguments:
 *     callback -- 
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     reply -- The Redis reply object.
 */
function feedGetIds(callback) {
    return this.mredis.zrange("feed.ids:" + this.name, 0, -1, callback);
}

/**
 * Retrieve a single item from the feed.
 *
 * Arguments:
 *     id       -- The ID of the item to retrieve.
 *     callback -- 
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     reply -- The Redis reply object.
 */
function feedGetItem(id, callback) {
    return this.mredis.hget("feed.items:" + this.name, id, callback);
}

/**
 * Retrieve all items from the feed.
 *
 * Arguments:
 *     callback -- 
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     reply -- The Redis reply object.
 */
function feedGetAll(callback) {
    var multi = this.mredis.multi();
    multi.zrange('feed.ids:' + this.name, 0, -1);
    multi.hgetall('feed.items:' + this.name);
    multi.exec(function(err, reply) {
        var ids, items;
        ids = reply[0];
        items = reply[1];
        var answers =[];
        for(var idx in ids) {
            answers.push({id: ids[idx], item: items[ids[idx]]});
        }
        if(err) {
            callback(err, null);
        } else {
            callback(null, answers);
        }
        this.thoonk.lock.unlock();
    }.bind(this));
}

/**
 * Subscribe to receive events from the feed.
 *
 * Events:
 *     publishes
 *     edits
 *     retractions
 *
 * Object Property Arguments:
 *     publish  -- Executed on an item publish event.
 *     edit     -- Executed on an item edited event.
 *     retract  -- Executed on an item removal event.
 *     position -- Placeholder for sorted feed item placement.
 *     done     -- Executed when subscription is completed.
 *
 * Publish and Edit Callback Arguments:
 *     name -- The name of the feed that changed.
 *     id   -- The ID of the published or edited item.
 *     item -- The content of the published or edited item.
 *     
 * Retract Callback Arguments:
 *     name -- The name of the feed that changed.
 *     id   -- The ID of the retracted item.
 *
 * Done Callback Arguments: None
 */
function feedSubscribe(callbacks) {
    var lastfeed = null;
    if(callbacks['publish']) {
        this.thoonk.on('publish:' + this.name, callbacks['publish']);
        lastfeed = 'publish';
    }
    if(callbacks['edit']) {
        this.thoonk.on('edit:' + this.name, callbacks['edit']);
        lastfeed = 'edit';
    }
    if(callbacks['retract']) {
        this.thoonk.on('retract:' + this.name, callbacks['retract']);
        lastfeed = 'retract';
    }
    if(callbacks['position']) {
        this.thoonk.on('position:' + this.name, callbacks['position']);
        lastfeed = 'position';
    }
    if(!this.subscribed) {
        if(callbacks.hasOwnProperty('done')) {
            this.thoonk.once('subscribe:feed.' + lastfeed + ':' + this.name, callbacks.done);
        }
        this.lredis.subscribe("feed.publish:" + this.name);
        this.lredis.subscribe("feed.edit:" + this.name);
        this.lredis.subscribe("feed.retract:" + this.name);
        this.lredis.subscribe("feed.position:" + this.name);
        this.subscribed = true;
    } else {
        if(callbacks.hasOwnProperty('done')) {
            callbacks.done();
        }
    }
}

/**
 * Unsubscribe from feed events.
 *
 * Object Property Arguments:
 *     publish  -- Executed on an item publish event.
 *     edit     -- Executed on an item edited event.
 *     retract  -- Executed on an item removal event.
 *     position -- Placeholder for sorted feed item placement.
 *     done     -- Executed when subscription is completed.
 *
 * Done Callback Arguments: None
 */
function feedUnsubscribe(callbacks) {
    if(callbacks['publish']) {
        this.thoonk.removeListener('publish:' + this.name, callbacks['publish']);
    }
    if(callbacks['edit']) {
        this.thoonk.removeListener('edit:' + this.name, callbacks['edit']);
    }
    if(callbacks['retract']) {
        this.thoonk.removeListener('retract:' + this.name, callbacks['retract']);
    }
    if(callbacks['position']) {
        this.thoonk.removeListener('position:' + this.name, callbacks['position']);
    }
    if(callbacks.done) {
        callbacks.done();
    }
}

/**
 * Subscribe to receive events from the feed.
 *
 * Events:
 *     publishes
 *     edits
 *     retractions
 *
 * Object Property Arguments:
 *     publish  -- Executed on an item publish event.
 *     edit     -- Executed on an item edited event.
 *     retract  -- Executed on an item removal event.
 *     position -- Placeholder for sorted feed item placement.
 *     done     -- Executed when subscription is completed.
 *
 * Publish and Edit Callback Arguments:
 *     name -- The name of the feed that changed.
 *     id   -- The ID of the published or edited item.
 *     item -- The content of the published or edited item.
 *     
 * Retract Callback Arguments:
 *     name -- The name of the feed that changed.
 *     id   -- The ID of the retracted item.
 *
 * Done Callback Arguments: None
 */
function feedSubscribeId(id, callbacks) {
    var lastfeed = null;
    if(callbacks['publish']) {
        this.thoonk.on('publish.id:' + this.name + ':' + id, callbacks['publish']);
        lastfeed = 'publish';
    }
    if(callbacks['edit']) {
        this.thoonk.on('edit.id:' + this.name + ':' + id, callbacks['edit']);
        lastfeed = 'edit';
    }
    if(callbacks['retract']) {
        this.thoonk.on('retract.id:' + this.name + ':' + id, callbacks['retract']);
        lastfeed = 'retract';
    }
    if(callbacks['position']) {
        this.thoonk.on('position.id:' + this.name + ':' + id, callbacks['position']);
        lastfeed = 'position';
    }
    if(!this.subscribed) {
        if(callbacks.hasOwnProperty('done')) {
            this.thoonk.once('subscribe:feed.' + lastfeed + ':' + this.name, callbacks.done);
        }
        this.lredis.subscribe("feed.publish:" + this.name);
        this.lredis.subscribe("feed.edit:" + this.name);
        this.lredis.subscribe("feed.retract:" + this.name);
        this.lredis.subscribe("feed.position:" + this.name);
        this.subscribed = true;
    } else {
        if(callbacks.hasOwnProperty('done')) {
            callbacks.done();
        }
    }
}

/**
 * Unsubscribe from feed events.
 *
 * Object Property Arguments:
 *     publish  -- Executed on an item publish event.
 *     edit     -- Executed on an item edited event.
 *     retract  -- Executed on an item removal event.
 *     position -- Placeholder for sorted feed item placement.
 *     done     -- Executed when subscription is completed.
 *
 * Done Callback Arguments: None
 */
function feedUnsubscribeId(id, callbacks) {
    if(callbacks['publish']) {
        this.thoonk.removeListener('publish.id:' + this.name + ':' + id, callbacks['publish']);
    }
    if(callbacks['edit']) {
        this.thoonk.removeListener('edit.id:' + this.name + ':' + id, callbacks['edit']);
    }
    if(callbacks['retract']) {
        this.thoonk.removeListener('retract.id:' + this.name + ':' + id, callbacks['retract']);
    }
    if(callbacks['position']) {
        this.thoonk.removeListener('position.id:' + this.name + ':' + id, callbacks['position']);
    }
    if(callbacks.done) {
        callbacks.done();
    }
}
function feedDelete (callback) {
    var self = this;
    this.mredis.watch('feeds');
    this.mredis.sismember('feeds', this.name, function (error, reply) {
        if(reply) {
            var multi = this.mredis.multi();
            multi.srem('feeds', this.name);
            multi.del('feed.ids:' + this.name);
            multi.del('feed.items:' + this.name);
            multi.del('feed.publishes:' + this.name);
            multi.del('feed.retract:' + this.name);
            multi.del('feed.config:' + this.name);
            multi.del('feed.edit:' + this.name);
            multi.publish('delfeed', this.name + '\x00' + this.thoonk.instance);
            multi.exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(!reply) {
                    process.nextTick(function() {
                        this.del(callback);
                    }.bind(this));
                } else {
                    if(callback) {
                        callback('Success', this.name);
                    }
                }
            }.bind(this));
        } else {
            this.mredis.unwatch(function(err, reply) {
                this.thoonk.lock.unlock();
                if(callback) { callback('DoesNotExist'); }
            }.bind(this));
        }
    }.bind(this));
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
Feed.prototype.edit = feedPublish;
Feed.prototype.retract = feedRetract;
Feed.prototype.getIds = feedGetIds;
Feed.prototype.getItem = feedGetItem;
Feed.prototype.getAll = feedGetAll;
Feed.prototype.subscribe = feedSubscribe;
Feed.prototype.unsubscribe = feedUnsubscribe;
Feed.prototype.ready = feedReady;
Feed.prototype.del = feedDelete;
Feed.prototype.hasId = feedHasId;
Feed.prototype.subscribeId = feedSubscribeId
Feed.prototype.unsubscribeId = feedUnsubscribeId

exports.Feed = Feed;
