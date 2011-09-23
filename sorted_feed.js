/**
 * Written by Nathan Fritz and Lance Stout. Copyright © 2011 by &yet, LLC. 
 * Released under the terms of the MIT License
 */

var Feed = require("./feed.js").Feed;

/**
 *
 * A Thoonk sorted feed is a manually ordered collection of items.
 * 
 * Redis Keys Used:
 *     feed.idincr:[feed]  -- A counter for ID values.
 *     feed.publish:[feed] -- A channel for publishing item position
 *                            change events.
 * 
 * Thoonk Standard API:
 *     append   -- Append an item to the end of the feed.
 *     edit     -- Edit an item in-place.
 *     getAll   -- Return all items in the feed.
 *     getIds   -- Return the IDs of all items in the feed.
 *     getItem  -- Return a single item from the feed given its ID.
 *     prepend  -- Add an item to the beginning of the feed.
 *     retract  -- Remove an item from the feed.
 *     publish  -- Add an item to the end of the feed.
 *     publishAfter  -- Add an item immediately before an existing item.
 *     publishBefore -- Add an item immediately after an existing item.
 */
function SortedFeed(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'sorted_feed');
    this.publish = this.thoonk.lock.require(sortedFeedPublish, this);
    this.edit = this.thoonk.lock.require(sortedFeedEdit, this);
    this.publishInsert = this.thoonk.lock.require(sortedFeedPublishInsert, this);
    this.move = this.thoonk.lock.require(sortedFeedMove, this);
    this.retract = this.thoonk.lock.require(sortedFeedRetract, this);
    this.getAll = this.thoonk.lock.require(sortedFeedGetAll, this);
}

/**
 * Add an item to the feed.
 *
 * Arguments:
 *     item     -- The contents of the item to publish.
 *     id       -- ignored, for the sake of consistency
 *     callback -- Executed on successful publication.
 *     prepend  -- If true, add the item to the start of the feed
 *                 instead of the end.
 *
 * Callback Arguments:
 *     error
 *     item -- The contents of the published item.
 *     id   -- The generated ID of the published item.
 */
function sortedFeedPublish(item, id, callback, prepend) {
    this.mredis.incr('feed.idincr:' + this.name, function(err, reply) {
        if(!id) { id = reply; }
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
            if(callback) { callback(null, item, id); }
        }.bind(this));
    }.bind(this));
}

/**
 * Add an item to the beginning of the feed.
 *
 * Arguments:
 *     item     -- The contents of the item to publish.
 *     id
 *     callback -- Executed on successful publication.
 *
 * Callback Arguments:
 *     error
 *     item -- The contents of the published item.
 *     id   -- The generated ID of the published item.
 */
function sortedFeedPrepend(item, id, callback) {
    this.publish(item, id, callback, true);
}

/**
 * Modify an item in-place in the feed.
 *
 * Arguments:
 *     id       -- The ID of the item to edit.
 *     item     -- The new contents of the item.
 *     callback -- Executed on successful modification.
 *
 * Callback Arguments:
 *     error
 *     item -- The new contents of the item.
 *     id   -- The ID of the item.
 */
function sortedFeedEdit(item, id, callback) {
    this.mredis.watch('feed.items:' + this.name, function(err, reply) {
        this.mredis.hexists('feed.items:' + this.name, id, function(err, reply) {
            if(!reply) {
                this.mredis.unwatch(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(callback) { callback('DoesNotExist', item, id); }
                }.bind(this));
                return;
            }
            this.mredis.multi()
                .hset('feed.items:' + this.name, id, item)
                .incr('feed.publishes:' + this.name)
                .publish('feed.edit:' + this.name, id + '\x00' + item)
            .exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(!reply) {
                    process.nextTick(function() {
                        this.edit(item, id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(null, item, id); }
                }
            }.bind(this));
        }.bind(this));
    }.bind(this));
}

/**
 * Insert an item into the feed, either before or after an
 * existing item.
 *
 * Intended for internal use.
 * 
 * Arguments:
 *     item      -- The item contents to insert.
 *     rel_id    -- The ID of an existing item.
 *     callback  -- Executed on successful publish.
 *     placement -- Either 'BEFORE' or 'AFTER', and indicates
 *                  where the item will be inserted in relation
 *                  to rel_id.
 *
 * Callback Arguments:
 *     error 
 *     item -- The content of the published item.
 *     id   -- The generated ID of the item.
 */
function sortedFeedPublishInsert(item, rel_id, callback, placement) {
    if(placement == 'BEFORE') {
        posUpdate = ':' + rel_id;
    } else {
        posUpdate = rel_id + ':';
    }
    this.mredis.watch('feed.items:' + this.name, function(err, reply) {
        this.mredis.hexists('feed.items:' + this.name, rel_id, function(err, reply) {
            if(!reply) {
                this.mredis.unwatch(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(callback) { callback('DoesNotExist', item, rel_id); }
                }.bind(this));
            } else {
                this.mredis.incr('feed.idincr:' + this.name, function(err, reply) {
                    var id = reply;
                    this.mredis.multi()
                        .linsert('feed.ids:' + this.name, placement, rel_id, id)
                        .hset('feed.items:' + this.name, id, item)
                        .incr('feed.publishes:' + this.name)
                        .publish('feed.publish:' + this.name, id + '\x00' + item)
                        .publish('feed.position:' + this.name, id + '\x00' + posUpdate)
                    .exec(function(err, reply) {
                        this.thoonk.lock.unlock();
                        if(!reply) {
                            process.nexttick(function() {
                                this.publishInsert(item, rel_id, callback, placement);
                            }.bind(this));
                        } else {
                            if(callback) { callback(null, item, id); }
                        }
                    }.bind(this));
                }.bind(this));
            }
        }.bind(this));
    }.bind(this));
}

/**
 * Insert an item immediately before an existing item.
 * 
 * Arguments:
 *     item      -- The item contents to insert.
 *     before_id -- The ID of an existing item.
 *     callback  -- Executed on successful publish.
 *
 * Callback Arguments:
 *     error
 *     item -- The content of the published item.
 *     id   -- The generated ID of the item.
 */
function sortedFeedPublishBefore(item, before_id, callback) {
    this.publishInsert(item, before_id, callback, 'BEFORE');
}

/**
 * Insert an item immediately after an existing item.
 * 
 * Arguments:
 *     item      -- The item contents to insert.
 *     after_id -- The ID of an existing item.
 *     callback  -- Executed on successful publish.
 *
 * Callback Arguments:
 *     error
 *     item -- The content of the published item.
 *     id   -- The generated ID of the item.
 */
function sortedFeedPublishAfter(item, after_id, callback) {
    this.publishInsert(item, after_id, callback, 'AFTER');
}

/**
 * Move an existing item to before or after an existing item.
 * 
 * The placement paramter specifies where to move the item
 * in relation to the given relative ID. If the placement
 * is BEGIN or END, then the item is moved to appropriate
 * end of the feed.
 *
 * Arguments:
 *     id          -- The ID of the item to move.
 *     relative_id -- The ID of an existing item.
 *     placement   -- One of: BEFORE, AFTER, BEGIN, END
 *     callback    -- Executed if an error occurred.
 *
 * Callback Arguments:
 *     error     -- A string error message. 
 *     id        -- The ID of the item to move.
 *     placement -- The desired placement for the item.
 */
function sortedFeedMove(id, relative_id, placement, callback) {
    var relative;
    if(id === relative_id) {
        this.thoonk.lock.unlock();
        if(callback) {
            callback('NoChange', id, placement);
        }
        return;
    }
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
                    if(callback) { callback('DoesNotExist', relative_id, placement); }
                }.bind(this));
            } else {
                this.mredis.hexists('feed.items:' + this.name, id, function(err, reply) {
                    if(!reply) {
                        this.mredis.unwatch(function(err, reply) {
                            this.thoonk.lock.unlock();
                            if(callback) { callback('DoesNotExist', id, placement); }
                        }.bind(this));
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
            }
        }.bind(this));
    }.bind(this));

}

/**
 * Move an item before an existing item.
 *
 * Arguments:
 *     id          -- The ID of the item to move. 
 *     relative_id -- The ID to move the item before.
 *     callback -- 
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     id
 *     placement
 */
function sortedFeedMoveBefore(id, relative_id, callback) {
    this.move(id, relative_id, 'BEFORE', callback);
}

/**
 * Move an item after an existing item.
 *
 * Arguments:
 *     id          -- The ID of the item to move. 
 *     relative_id -- The ID to move the item after.
 *     callback -- 
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     reply -- The Redis reply object.
 *
 */
function sortedFeedMoveAfter(id, relative_id, callback) {
    this.move(id, relative_id, 'AFTER', callback);
}

/**
 * Move an item to the beginning of the feed.
 *
 * Arguments:
 *     id -- The ID of the item to move.
 *     callback -- 
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     id
 *     placement
 *
 */
function sortedFeedMoveBegin(id, callback) {
    this.move(id, null, 'BEGIN', callback);
}

/**
 * Move an item to the end of the feed.
 *
 * Arguments:
 *     id -- The ID of the item to move.
 *     callback -- 
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     id
 *     placement
 */
function sortedFeedMoveEnd(id, callback) {
    this.move(id, null, 'END', callback);
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
function sortedFeedRetract(id, callback) {
    this.mredis.watch('feed.items:' + this.name, function(err, reply) {
        this.mredis.hexists('feed.items:' + this.name, id, function(err, reply) {
            if(!reply) {
                this.mredis.unwatch(function(err, reply) {
                    this.thoonk.lock.unlock();
                    if(callback) { callback('DoesNotExist', id); }
                }.bind(this));
                return;
            }
            this.mredis.multi()
                .lrem('feed.ids:' + this.name, 1, id)
                .hdel('feed.items:' + this.name, id)
                .publish('feed.retract:' + this.name, id)
            .exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(reply == null) {
                    process.nextTick(function() {
                        this.retract(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(null, id); }
                }
            }.bind(this));
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
function sortedFeedGetIds(callback) {
    this.mredis.lrange('feed.ids:' + this.name, 0, -1, function(err, reply) {
        callback(err, reply);
    }.bind(this));
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
function sortedFeedGetItem(id, callback) {
    this.mredis.hget('feed.items:' + this.name, id, function(err, reply) {
        callback(err, reply);
    }.bind(this));
}

/**
 * Retrieve all items from the feed.
 *
 * Arguments:
 *     callback -- 
 *
 * Callback Arguments:
 *     error -- A string or null.
 *     reply -- A list of {id, item} lists.
 */
function sortedFeedGetAll(callback) {
    var multi = this.mredis.multi();
    multi.lrange('feed.ids:' + this.name, 0, -1);
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
SortedFeed.prototype.getAll = sortedFeedGetAll;

exports.SortedFeed = SortedFeed;
