var Feed = require("./feed.js").Feed;

function List(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'list');
    this.publish = this.thoonk.lock.require(listPublish, this);
    this.edit = this.thoonk.local.require(listEdit, this);
}

//callback(item, id)
function listPublish(item, callback) {
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
function listEdit(id, item, callback) {
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
function listPublishInsert(item, before_id, callback, placement) {
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

function listPublishBefore(item, after_id, callback) {
    list_publish_insert.call(this, item, after_id, callback, 'BEFORE');
}

function listPublishAfter(item, after_id, callback) {
    list_publish_insert.call(this, item, after_id, callback, 'AFTER');
}

//callback(id, error_msg);
function listRetract(id, callback) {
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

function listGetIds(callback) {
    this.mredis.lrange('feed.ids:' + this.name, 0, -1, function(err, reply) {
        callback(reply);
    }.bind(this));
}

function listGetItem(id, callback) {
    this.mredis.hget('feed.items:' + this.name, id, function(err, reply) {
        callback(reply);
    }.bind(this));
}

function listGetAll(callback) {
    this.mredis.hgetall('feed.items:' + this.name, function(err, reply) {
        callback(reply);
    }.bind(this));
}

List.super_ = Feed;
List.prototype = Object.create(Feed.prototype, {
    constructor: {
        value: List,
        enumerable: false
    }
});

List.prototype.publish = listPublish;
List.prototype.edit = listEdit;
List.prototype.publishInsert = listPublishInsert;
List.prototype.publishBefore = listPublishBefore;
List.prototype.publishAfter = listPublishAfter;
List.prototype.retract = listRetract;
List.prototype.getIds = listGetIds;
