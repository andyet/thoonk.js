/**
 * Written by Nathan Fritz and Lance Stout. Copyright © 2011 by &yet, LLC. 
 * Released under the terms of the MIT License
 */

var Feed = require("./feed.js").Feed,
    uuid = require("node-uuid");

/**
 * A Thoonk queue is a typical FIFO structure, but with an
 * optional priority override for inserting to the head
 * of the queue.
 *
 * Thoonk Standard API:
 *     publish -- Alias for put()
 *     put     -- Add an item to the queue, with optional priority.
 *     get     -- Retrieve the next item from the queue.
 */

/**
 * Create a new Queue object for a given Thoonk feed.
 * 
 * Note: More than one Queue objects may be create for the same
 *       Thoonk feed, and creating a Queue object does not
 *       automatically generate the Thoonk feed itself.
 * 
 * Arguments:
 *     thoonk -- The main Thoonk object.
 *     feed   -- The name of the feed.
 *     config -- Optional dictionary of configuration values.
 */
function Queue(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'queue');
    this.bredis = redis.createClient(this.thoonk.port, this.thoonk.host);
    this.bredis.select(this.thoonk.db);
    this.publish = this.thoonk.lock.require(queuePublish, this);
    this.put = this.thoonk.lock.require(queuePublish, this);
    this.get = this.thoonk.lock.require(queueGet, this);
    this.thoonk.on('quit', function() {
        this.bredis.quit();
    }.bind(this));
}

/**
 * Add a new item to the queue.
 * 
 * (Same as self.put())
 * 
 * Arguments:
 *     item     -- The content to add to the queue.
 *     callback -- Executed when the items is sucessfully published.
 *     priority -- Optional priority; if equal to True then
 *                 the item will be inserted at the head of the
 *                 queue instead of the end.
 *
 * Callback Arguments:
 *     item -- The content of the published item.
 *     id   -- The ID of the of published item.
 */
function queuePublish(item, callback, priority) {
    id = uuid();
    var multi = this.mredis.multi();
    if(priority) {
        multi.lpush("feed.ids:" + this.name, id);
    } else {
        multi.rpush("feed.ids:" + this.name, id);
    }
    multi.hset("feed.items:" + this.name, id, item);
    multi.incr("feed.publishes:" + this.name);
    multi.exec(function(err, replies) {
        this.thoonk.lock.unlock();
        if(!replies) {
            process.nextTick(function() {
                this.put(item, callback, priority);
            }.bind(this));
        } else {
            if(callback) { callback(item, id); }
        }
    }.bind(this));
}

/**
 * Add a new item to the beginning of the queue.
 *
 * Same as calling publish() with priority=true.
 *
 * Arguments:
 *     item     -- The content to add to the queue.
 *     callback -- Executed when the items is sucessfully published.
 *
 * Callback Arguments:
 *     item -- The content of the published item.
 *     id   -- The ID of the of published item.
 */ 
function queuePublishFront(item, callback) {
    this.put(item, callback, true);
}

/**
 * Retrieve the next item from the queue.
 *
 * Arguments:
 *     timeout  -- Time in seconds to wait for an item. If set
 *                 to 0, the call will block indefinitely.
 *     callback -- Executed when an item is received, or a time out occurs.
 * 
 * Callback Arguments:
 *     item  -- The contents of the requested item.
 *     id    -- The ID of the retrieved item.
 *     error -- Flag indicating if an occurred, including time outs.
 */
function queueGet(timeout, callback) {
    if(!timeout) timeout = 0;
    this.bredis.brpop("feed.ids:" + this.name, timeout, function(err, result) {
        if(!err) {
            var id = result[1];
            this.mredis.multi()
            .hget("feed.items:" + this.name, id)
            .hdel("feed.items:" + this.name, id)
            .exec(function(err, result) {
                this.thoonk.lock.unlock();
                callback(result[0], id, false);
            }.bind(this));
        } else {
            this.thoonk.lock.unlock();
            callback(null, null, true);
        }
    }.bind(this));
}

/**
 * Return the set of IDs used by items in the queue.
 *
 * Arguments:
 *     callback --
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     reply -- The Redis reply object.
 */
function queueGetIds(callback) {
    return this.mredis.lrange("feed.ids:" + this.name, 0, -1, callback);
}

Queue.super_ = Feed;
Queue.prototype = Object.create(Feed.prototype, {
    constructor: {
        value: Queue,
        enumerable: false
    }
});

Queue.prototype.publish = queuePublish;
Queue.prototype.put = queuePublish;
Queue.prototype.get = queueGet;
Queue.prototype.putHigh = queuePublishFront;
Queue.prototype.getIds = queueGetIds;

exports.Queue = Queue;
