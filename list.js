var Feed = require("./feed.js").Feed;

function List(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'list');
}


function list_publish(item, callback) {
    this.mredis.incr('feed.idincr:' + this.name, function(err, reply) {
        var id = reply;
        this.mredis.multi()
            .lpush('feed.ids:' + this.name, id)
            .hset('feed.items:' + this.name, id, item)
            .incr('feed.publishes:' + this.name)
            .publish('feed.publish:' + this.name, id + '\x00' + item)
        .exec(function(err, reply) {
            this.thoonk.lock.unlock();
            callback(err, id, item);
        }.bind(this));
    }.bind(this));
}

function list_edit(id, item, callback) {
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
                if(reply == null) {
                    process.nextTick(function() {
                        this.edit(id, item, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(err, id, item); }
                }
            }.bind(this));
        }.bind(this));
    }.bind(this));
}

function list_publish_insert(item, before_id, callback, placement) {
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
                    if(reply == null) {
                        process.nexttick(function() {
                            this.publishInsert(item, before_id, callback, placement);
                        }.bind(this));
                    } else {
                        if(callback) { callback(err, id, item); }
                    }
                }.bind(this));
            }.bind(this));
        }.bind(this));
    }.bind(this));
}

function list_publish_before(item, after_id, callback) {
    list_publish_insert.call(this, item, after_id, callback, 'BEFORE');
}

function list_publish_after(item, after_id, callback) {
    list_publish_insert.call(this, item, after_id, callback, 'AFTER');
}

function list_retract(id, callback) {
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
                if(reply == null) {
                    process.nextTick(function() {
                        this.retract(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(err, id); }
                }
            }.bind(this));
        }.bind(this));
    }.bind(this));
}

function list_get_ids(callback) {
    this.mredis.lrange('feed.ids:' + this.name, 0, -1, function(err, reply) {
        callback(err, reply);
    }.bind(this));
}

function list_get_item(id, callback) {
    this.mredis.hget('feed.items:' + this.name, id, function(err, reply) {
        callback(err, reply);
    }.bind(this));
}

function list_get_all(callback) {
    this.mredis.hgetall('feed.items:' + this.name, function(err, reply) {
        callback(err, reply);
    }.bind(this));
}

List.super_ = Feed;
List.prototype = Object.create(Feed.prototype, {
    constructor: {
        value: List,
        enumerable: false
    }
});

List.prototype.publish = list_publish;
List.prototype.edit = list_edit;
List.prototype.publishInsert = list_publish_insert;
List.prototype.publishBefore = list_publish_before;
List.prototype.publishAfter = list_publish_after;
List.prototype.retract = list_retract;
List.prototype.getIds = list_get_ids;
