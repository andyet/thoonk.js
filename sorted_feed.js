/**
 * Written by Nathan Fritz and Lance Stout. Copyright © 2011 by &yet, LLC. 
 * Released under the terms of the MIT License
 */

var Feed = require("./feed.js").Feed;

function SortedFeed(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'sorted_feed');
    this.publish = this.thoonk.lock.require(sortedFeedPublish, this);
    this.edit = this.thoonk.lock.require(sortedFeedEdit, this);
    this.publishInsert = this.thoonk.lock.require(sortedFeedPublishInsert, this);
    this.move = this.thoonk.lock.require(sortedFeedMove, this);
    this.retract = this.thoonk.lock.require(sortedFeedRetract, this);
}

//callback(item, id)
function sortedFeedPublish(item, callback, prepend) {
    this.mredis.incr('feed.idincr:' + this.name, function(err, reply) {
        var id = reply;
        var multi = this.mredis.multi();
        var relative;
        if(!prepend) {
            multi.rpush('feed.ids:' + this.name, id);
            relative = ':end';
        } else {
            multi.lpush('feed.ids:' + this.name, id);
            relative = 'begin:';
        }
        multi.hset('feed.items:' + this.name, id, item);
        multi.incr('feed.publishes:' + this.name);
        multi.publish('feed.publish:' + this.name, id + '\x00' + item);
        multi.publish('feed.position:' + this.name, id + '\x00' + relative);
        multi.exec(function(err, reply) {
            this.thoonk.lock.unlock();
            if(callback) { callback(item, id); }
        }.bind(this));
    }.bind(this));
}

function sortedFeedPrepend(item, callback) {
    this.publish(item, callback, true);
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
    if(placement == 'BEFORE') {
        placement = ':' + before_id;
    } else {
        placement = before_id + ':';
    }
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
                    .publish('feed.position:' + this.name, id + '\x00' + placement)
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
    this.publishInsert(this, item, after_id, callback, 'BEFORE');
}

function sortedFeedPublishAfter(item, after_id, callback) {
    this.publishInsert(item, after_id, callback, 'AFTER');
}

//callback(err_msg, id, placement);
function sortedFeedMove(id, relative_id, placement, callback) {
    var relative;
    if(placement == 'BEFORE') {
        relative = ':' + relative_id;
    } else if (placement == 'AFTER') {
        relative = relative_id + ':';
    } else if (placement == 'BEGIN') {
        relative = 'begin:';
        relative_id = id;
    } else if (placement == 'END') {
        relative = ':end';
        relative_id = id;
    }
    this.mredis.watch('feed.items:' + this.name, function(err, reply) {
        this.mredis.hexists('feed.items:' + this.name, relative_id, function(err, reply) {
            if(!reply) {
                this.mredis.unwatch(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(callback) { callback('DoesNotExist', relative_id); }
                }.bind(this));
                return;
            }
            this.mredis.hexists('feed.items:' + this.name, id, function(err, reply) {
                if(!reply) {
                    this.mredis.unwatch(function(err, reply) {
                        this.thoonk.lock.unlock();
                        if(callback) { callback('DoesNotExist', id, placement); }
                    }.bind(this));
                    return;
                } else {
                    var multi = this.mredis.multi();
                    multi.lrem('feed.ids:' + this.name, 1, id);
                    if(placement == 'BEFORE' || placement == 'AFTER') {
                        multi.linsert('feed.ids:' + this.name, placement, relative_id, id);
                    } else if (placement == 'BEGIN') {
                        multi.lpush('feed.ids:' + this.name, id);
                    } else if (placement == 'END') {
                        multi.rpush('feed.ids:' + this.name, id);
                    }
                    multi.publish('feed.position:' + this.name, id + '\x00' + relative);
                    multi.exec(function(err, reply) {
                        this.thoonk.lock.unlock();
                        if(!reply) {
                            process.nexttick(function() {
                                this.publishInsert(item, before_id, callback, placement);
                            }.bind(this));
                        } else {
                            if(callback) { callback(null, id, relative); }
                        }
                    }.bind(this));
                }
            }.bind(this));
        }.bind(this));
    }.bind(this));

}

function sortedFeedMoveBefore(id, relative_id, callback) {
    this.move(id, relative_id, 'BEFORE', callback);
}

function sortedFeedMoveAfter(id, relative_id, callback) {
    this.move(id, relative_id, 'AFTER', callback);
}

function sortedFeedMoveBegin(id, callback) {
    this.move(id, null, 'BEGIN', callback);
}

function sortedFeedMoveEnd(id, callback) {
    this.move(id, null, 'END', callback);
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
        callback(err, reply);
    }.bind(this));
}

function sortedFeedGetItem(id, callback) {
    this.mredis.hget('feed.items:' + this.name, id, function(err, reply) {
        callback(err, reply);
    }.bind(this));
}

function sortedFeedGetAll(callback) {
    this.mredis.hgetall('feed.items:' + this.name, function(err, reply) {
        callback(err, reply);
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
SortedFeed.prototype.append = sortedFeedPublish;
SortedFeed.prototype.prepend = sortedFeedPrepend;
SortedFeed.prototype.edit = sortedFeedEdit;
SortedFeed.prototype.publishInsert = sortedFeedPublishInsert;
SortedFeed.prototype.publishBefore = sortedFeedPublishBefore;
SortedFeed.prototype.publishAfter = sortedFeedPublishAfter;
SortedFeed.prototype.retract = sortedFeedRetract;
SortedFeed.prototype.getIds = sortedFeedGetIds;
SortedFeed.prototype.move = sortedFeedMove;
SortedFeed.prototype.moveAfter = sortedFeedMoveAfter;
SortedFeed.prototype.moveBefore = sortedFeedMoveBefore;
SortedFeed.prototype.moveBegin = sortedFeedMoveBegin;
SortedFeed.prototype.moveEnd = sortedFeedMoveEnd;

exports.SortedFeed = SortedFeed;
