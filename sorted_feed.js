/**
 * Written by Nathan Fritz and Lance Stout. Copyright © 2011 by &yet, LLC. 
 * Released under the terms of the MIT License
 */

var Feed = require("./feed.js").Feed;

function SortedFeedt(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'sorted_feed');
    this.publish = this.thoonk.lock.require(sortedFeedPublish, this);
    this.edit = this.thoonk.local.require(sortedFeedEdit, this);
}

//callback(item, id)
function sortedFeedPublish(item, callback) {
    this.mredis.incr('feed.idincr:' + this.name, function(err, reply) {
        var id = reply;
        this.mredis.multi()
            .lpush('feed.ids:' + this.name, id)
            .hset('feed.items:' + this.name, id, item)
            .incr('feed.publishes:' + this.name)
            .publish('feed.publish:' + this.name, id + '\x00' + item)
        .exec(function(err, reply) {
            this.thoonk.lock.unlock();
            callback(item, id);
        }.bind(this));
    }.bind(this));
}

//callback(item, id)
function sortedFeedEdit(id, item, callback) {
    this.mredis.watch('feed.items:' + this.name, function(err, reply) {
        this.mredis.hexists('feed.items:' + this.name, id, function(err, reply) {
            if(!reply) {
                this.mredis.unwatch(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(callback) { callback('DoesNotExist', id, item); }
                }.bind(this));
                return;
            }
            this.mredis.multi()
                .hset('feed.items:' + this.name, id, item)
                .inc('feed.publishes:' + this.name)
                .publish('feed.publish:' + this.name, id + '\x00' + item)
            .exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(!reply) {
                    process.nextTick(function() {
                        this.edit(id, item, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(item, id); }
                }
            }.bind(this));
        }.bind(this));
    }.bind(this));
}

//callback(item, id);
function sortedFeedPublishInsert(item, before_id, callback, placement) {
    this.mredis.watch('feed.items:' + this.name, function(err, reply) {
        this.mredis.hexists('feed.items:' + this.name, before_id, function(err, reply) {
            if(!reply) {
                this.mredis.unwatch(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(callback) { callback('DoesNotExist', id, item); }
                }.bind(this));
                return;
            }
            this.mredis.incr('feed.idincr:' + this.name, function(err, reply) {
                var id = reply;
                this.mredis.multi()
                    .linsert('feed.ids:' + this.name, placement, before_id, id)
                    .hset('feed.items:' + this.name, id, item)
                    .inc('feed.publishes:' + this.name)
                    .publish('feed.publish:' + this.name, id + '\x00' + item)
                .exec(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(!reply) {
                        process.nexttick(function() {
                            this.publishInsert(item, before_id, callback, placement);
                        }.bind(this));
                    } else {
                        if(callback) { callback(item, id); }
                    }
                }.bind(this));
            }.bind(this));
        }.bind(this));
    }.bind(this));
}

function sortedFeedPublishBefore(item, after_id, callback) {
    sortedFeedPublishInsert.call(this, item, after_id, callback, 'BEFORE');
}

function sortedFeedPublishAfter(item, after_id, callback) {
    sortedFeedPublishInsert.call(this, item, after_id, callback, 'AFTER');
}

//callback(id, error_msg);
function sortedFeedRetract(id, callback) {
    this.mredis.watch('feed.items:' + this.name, function(err, reply) {
        this.mredis.hexists('feed.items:' + this.name, id, function(err, reply) {
            if(!reply) {
                this.mredis.unwatch(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(callback) { callback(id, 'Does not exist'); }
                }.bind(this));
                return;
            }
            this.mredis.multi()
                .lrem('feed.ids:' + this.name, 1, id)
                .hdel('feed.items:' + this.name, id)
                .publish('feed.retract:' + this.name, id)
            .exec(function(err, reply) {
                if(reply == null) {
                    process.nextTick(function() {
                        this.retract(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(id, null); }
                }
            }.bind(this));
        }.bind(this));
    }.bind(this));
}

function sortedFeedGetIds(callback) {
    this.mredis.lrange('feed.ids:' + this.name, 0, -1, function(err, reply) {
        callback(reply);
    }.bind(this));
}

function sortedFeedGetItem(id, callback) {
    this.mredis.hget('feed.items:' + this.name, id, function(err, reply) {
        callback(reply);
    }.bind(this));
}

function sortedFeedGetAll(callback) {
    this.mredis.hgetall('feed.items:' + this.name, function(err, reply) {
        callback(reply);
    }.bind(this));
}

SortedFeed.super_ = Feed;
SortedFeed.prototype = Object.create(Feed.prototype, {
    constructor: {
        value: SortedFeed,
        enumerable: false
    }
});

SortedFeed.prototype.publish = sortedFeedPublish;
SortedFeed.prototype.edit = sortedFeedEdit;
SortedFeed.prototype.publishInsert = sortedFeedPublishInsert;
SortedFeed.prototype.publishBefore = sortedFeedPublishBefore;
SortedFeed.prototype.publishAfter = sortedFeedPublishAfter;
SortedFeed.prototype.retract = sortedFeedRetract;
SortedFeed.prototype.getIds = sortedFeedGetIds;
