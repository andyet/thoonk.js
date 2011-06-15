var Feed = require("./feed.js").Feed,
    Queue = require("./queue.js").Queue,
    uuid = require("node-uuid");

function Job(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'job');
    this.publish = this.thoonk.lock.require(jobPublish, this);
    this.get = this.thoonk.lock.require(jobGet, this);
    this.finish = this.thoonk.lock.require(jobFinish, this);
    this.cancel = this.thoonk.lock.require(jobCancel, this);
    this.stall = this.thoonk.lock.require(jobStall, this);
    this.retry = this.thoonk.lock.require(jobRetry, this);
}

function jobPublish(item, callback, high_priority) {
    var id = uuid();
    var multi = this.mredis.multi();
    if(high_priority === true) {
        multi.rpush("feed.ids:" + this.name, id);
    } else {
        multi.lpush("feed.ids:" + this.name, id);
    }
    multi.incr("feed.publishes:" + this.name);
    multi.hset("feed.items:" + this.name, id, item);
    multi.zadd("feed.published:" + this.name, Date.now(), id);
    multi.exec(function(err, reply) {
        this.thoonk.lock.unlock();
        if(callback) { callback(item, id); }
    }.bind(this));
}

function jobGet(timeout, callback) {
    if(!timeout) timeout = 0;
    this.bredis.brpop("feed.ids:" + this.name, timeout, function(err, result) {
        if(!err) {
            var id = result[1];
            this.mredis.multi()
                .zadd("feed.claimed:" + this.name, Date.now(), result[1])
                .hget("feed.items:" + this.name, result[1])
            .exec(function(err, result) {
                this.thoonk.lock.unlock();
                callback(result, id, false);
            }.bind(this));
            var d = new Date();
        } else {
            this.thoonk.lock.unlock();
            //shit timed out, yo
            callback(null, null, true);
        }
    }.bind(this));
}

//callback(id, error bool);
function jobFinish(id, callback, setresult) {
    this.mredis.watch("feed.claimed:" + this.name);
    this.mredis.zrank("feed.claimed:" + this.name, id, function(err, result) {
        if(result == null) {
            this.thoonk.lock.unlock();
            if(callback) {
                callback(id, true);
            }
        } else {
            var multi = this.mredis.multi();
            multi.zrem("feed.claimed:" + this.name, id);
            multi.hdel("feed.cancelled:" + this.name, id);
            if(setresult) {
                multi.lpush("feed.jobfinished:" + this.name + "\x00" + id, setresult);
                multi.expire("feed.jobfinished:" + this.name + "\x00" + id);
            }
            multi.hdel("feed.items:" + this.name, id);
            multi.exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(reply == null) {
                    //watch failed, try again
                    process.nextTick(function() {
                        this.finish(id, callback, setresult);
                    }.bind(this));
                } else {
                    if(callback) {
                        callback(id, false);
                    }
                }
            }.bind(this));
        }
    }.bind(this));
}

//callback(id, timedout bool);
function jobGetResult(id, timeout, callback) {
    this.mredis.blpop("feed.jobfinished:" + this.name + "\x00" + id, timeout, function(err, result) {
        if(err) {
            callback(id, true);
        } else {
            callback(id, false);
        }
    }.bind(this));
}

//callback(id, error_msg);
function jobCancel(id, callback) {
    this.mredis.watch("feed.claimed:" + this.name);
    this.mredis.zrank("feed.claimed:" + this.name, id, function(err, result) {
        if(result == null) {
            this.thoonk.lock.unlock();
            if(callback) { callback(id, "id unclaimed"); }
        } else {
            this.mredis.multi()
                .hincrby("feed.cancelled:" + this.name, id, 1)
                .lpush("feed.ids:" + this.name, id)
                .zrem("feed.claimed:" + this.name, id)
            .exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(!reply) {
                    process.nextTick(function() {
                        this.jobCancel(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(id, null); }
                }
            }.bind(this));
        }
    }.bind(this));
}

//callback(id, error_msg);
function jobStall(id, callback) {
    this.mredis.watch("feed.claimed:" + this.name);
    this.mredis.zrank("feed.claimed:" + this.name, id, function(err, result) {
        if(result == null) {
            this.thoonk.lock.unlock();
            if(callback) { callback(id, "id already claimed"); }
        } else {
            this.mredis.multi()
                .zrem("feed.claimed:" + this.name, id)
                .hdel("feed.cancelled:" + this.name, id)
                .sadd("feed.stalled:" + this.name, id)
                .zrem("feed.published:" + this.name, id)
            .exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(!reply) {
                    process.nextTick(function() {
                        this.jobStall(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(id, null); }
                }
            }.bind(this));
        }
    }.bind(this));
}

//callback(id, error_msg)
function jobRetry(id, callback) {
    this.mredis.watch("feed.stalled:" + this.name);
    this.mredis.sismember("feed.stalled:" + this.name, id, function(err, result) {
        if(result == null) {
            this.thoonk.lock.unlock();
            if(callback) { callback(id, "id not stalled"); }
        } else {
            this.mredis.multi()
                .srem("feed.stalled:" + this.name, id)
                .lpush("feed.ids:" + this.name, id)
                .zadd("feed.published:" + this.name, Date.now(), id)
            .exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(!reply) {
                    process.nextTick(function() {
                        this.jobRetry(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(id, null); }
                }
            }.bind(this));
        }
    }.bind(this));
}

Job.super_ = Queue;
Job.prototype = Object.create(Queue.prototype, {
    constructor: {
        value: Job,
        enumerable: false
    }
});


Job.prototype.get = jobGet;
Job.prototype.finish = jobFinish;
Job.prototype.get_result = jobGetResult;
Job.prototype.cancel = jobCancel;
Job.prototype.stall = jobStall;
Job.prototype.retry = jobRetry;

exports.Job = Job;
