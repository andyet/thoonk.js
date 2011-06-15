var Feed = require("./feed.js").Feed,
    uuid = require("node-uuid");

function Queue(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'queue');
    this.publish = this.thoonk.lock.require(queuePublish, this);
    this.put = this.thoonk.lock.require(queuePublish, this);
    this.get = this.thoonk.lock.require(queueGet, this);
}

function queuePublish(item, priority, callback) {
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
        //TODO error handler
        if(!replies) {
            process.nextTick(function() {
                this.put(item, priority, callback);
            }.bind(this));
        } else {
            if(callback) { callback(item, id); }
        }
    }.bind(this));
}

function queuePublishFront(item, callback) {
    this.put(item, true, callback);
}

//callback(item, id, timedout);
//callback is not optional
function queueGet(timeout, callback, timeout_callback) {
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
