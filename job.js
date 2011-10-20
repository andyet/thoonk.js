/**
 * Written by Nathan Fritz and Lance Stout. Copyright © 2011 by &yet, LLC. 
 * Released under the terms of the MIT License
 */

var Feed = require("./feed.js").Feed,
    Queue = require("./queue.js").Queue,
    uuid = require("node-uuid"),
    redis = require('redis');

/**
 * A Thoonk Job is a queue which does not completely remove items
 * from the queue until a task completion notice is received.
 * 
 * Job Item Lifecycle:
 *     - A job is created using put() with the data for the job.
 *     - The job is moved to a claimed state when a worker retrieves
 *       the job data from the queue.
 *     - The worker performs any processing required, and calls
 *       finish() with the job's result data.
 *     - The job is marked as finished and removed from the queue.
 * 
 * Alternative: Job Cancellation
 *     - After a worker has claimed a job, it calls cancel() with
 *       the job's ID, possibly because of an error or lack of required
 *       resources.
 *     - The job is moved from a claimed state back to the queue.
 * 
 * Alternative: Job Stalling
 *     - A call to stall() with the job ID is made.
 *     - The job is moved out of the queue and into a stalled state. While
 *       stalled, the job will not be dispatched.
 *     - A call to retry() with the job ID is made.
 *     - The job is moved out of the stalled state and back into the queue.
 * 
 * Alternative: Job Deletion
 *     - A call to retract() with the job ID is made.
 *     - The job item is completely removed from the queue and any
 *       other job states.
 * 
 * Redis Keys Used:
 *     feed.published:[feed] -- A time sorted set of queued jobs.
 *     feed.cancelled:[feed] -- A hash table of cancelled jobs.
 *     feed.claimed:[feed]   -- A hash table of claimed jobs.
 *     feed.stalled:[feed]   -- A hash table of stalled jobs.
 *     feeed.funning:[feed]  -- A hash table of running jobs.
 *     feed.finished:[feed]\x00[id] -- Temporary queue for receiving job
 *                                     result data.
 * 
 * Thoonk Standard API:
 *     cancel    -- Move a job from a claimed state back into the queue.
 *     finish    -- Mark a job as completed and store the results.
 *     get       -- Retrieve the next job from the queue.
 *     getIds    -- Return IDs of all jobs in the queue.
 *     getResult -- Retrieve the result of a job.
 *     put       -- Add a new job to the queue.
 *     retract   -- Completely remove a job from use.
 *     retry     -- Resume execution of a stalled job.
 *     stall     -- Pause execution of a queued job.
 */

/**
 * Create a new Job queue object for a given Thoonk feed.
 * 
 * Note: More than one Job queue objects may be create for
 *       the same Thoonk feed, and creating a Job queue object
 *       does not automatically generate the Thoonk feed itself.
 * 
 * Arguments:
 *     thoonk -- The main Thoonk object.
 *     feed   -- The name of the feed.
 *     config -- Optional dictionary of configuration values.
 */
function Job(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'job');
    this.bredis = redis.createClient(this.thoonk.port, this.thoonk.host);
    this.bredis.select(this.thoonk.db);
    this.publish = this.thoonk.lock.require(jobPublish, this);
    this.put = this.thoonk.lock.require(jobPublish, this);
    //this.get = this.thoonk.lock.require(jobGet, this);
    this.finish = this.thoonk.lock.require(jobFinish, this);
    this.cancel = this.thoonk.lock.require(jobCancel, this);
    this.stall = this.thoonk.lock.require(jobStall, this);
    this.retry = this.thoonk.lock.require(jobRetry, this);

    this.thoonk.on('job.finish:' + this.name, function(feed, id, result) {
        this.emit('job.id.finish:' + id, null, feed, id, result);
    }.bind(this));

    this.thoonk.on('quit', function() {
        this.lredis.unsubscribe('job.finish:' + this.name);
        this.bredis.quit();
    }.bind(this));
}

//override feedReady to wait until we're subscribed to the job.finish channel
function jobReady() {
    this.thoonk.once('subscribe:' + 'job.finish:' + this.name, function() {
        this.emit("ready");
    }.bind(this));
    this.lredis.subscribe('job.finish:' + this.name);
}

/**
 * Add a new job to the queue.
 *
 * Arguments:
 *     item            -- The contents of the job request.
 *     callback        -- Executed on successful submission of the job.
 *     high_priority   -- Optional bool indicating that the job
 *                      should be inserted to the beginning of the
 *                      queue. Defaults to false.
 *     id              -- Optionally set the id of the job.
 *     finish_callback -- Optional callback (feed, id, result) for published job
 * 
 * Callback Arguments:
 *     error
 *     item  -- The contents of the job.
 *     id    -- The ID of the submitted job.
 */
function jobPublish(item, callback, high_priority, id, finish_callback) {
    if(id === undefined || id === null) {
        var id = uuid();
    }
    if(finish_callback) {
        this.once('job.id.finish:' + id, finish_callback);
    }
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
        if(err || !reply) {
            process.nextTick(function() {
                this.publish(item, callback, high_priority, id);
            }.bind(this));
        } else if(callback) {
            callback(null, item, id);
        }
    }.bind(this));
}

/**
 * Retrieve the next job from the queue.
 *
 * Arguments:
 *     timeout  -- Optional time in seconds to wait before exiting.
 *     callback -- 
 *
 * Callback Arguments:
 *     error
 *     result  -- The content of the job request.
 *     id      -- The ID of the job.
 *     timeout -- Flag indicating that the request timed out.
 */
function jobGet(timeout, callback) {
    if(!timeout) timeout = 0;
    //this.bredis.brpop("feed.ids:" + this.name, timeout, function(err, result) {
    var brpopresult = function(err, result) {
        if(err || !result) {
            //unwatch unnecessary since no watch
            this.thoonk.lock.unlock();
            //shit timed out, yo
            callback('timeout', null, null, true);
        } else {
            var id = result[1];
            this.mredis.multi()
                .zadd("feed.claimed:" + this.name, Date.now(), result[1])
                .hget("feed.items:" + this.name, result[1])
            .exec(function(err, result) {
                this.thoonk.lock.unlock();
                if(err || !result) {
                    process.nextTick(function() {
                        this.get(timeout, callback);
                    }.bind(this));
                } else if(callback) {
                    callback(null, result[1], id, false);
                }
            }.bind(this));
            var d = new Date();
        }
    }.bind(this);
    brpopresult = this.thoonk.lock.require(brpopresult, this);
    this.bredis.brpop("feed.ids:" + this.name, timeout, brpopresult);
}

/**
 * Mark a job as completed, and optionally store any results.
 *
 * Arguments:
 *     id        -- The ID of the job to finish.
 *     callback  -- Executes 
 *     setresult -- Optional result data from the job.
 *
 * Callback Arguments:
 *     error -- Boolean indicating that an error occurred.
 *     id    -- The ID of the finished job.
 */
function jobFinish(id, callback, setresult) {
    this.mredis.watch("feed.claimed:" + this.name);
    this.mredis.zrank("feed.claimed:" + this.name, id, function(err, result) {
        if(result == null) {
            this.mredis.unwatch(function(err, reply) {
                this.thoonk.lock.unlock();
                if(callback) {
                    callback('Job not claimed', id);
                }
            }.bind(this));
        } else {
            var multi = this.mredis.multi();
            multi.zrem("feed.claimed:" + this.name, id);
            multi.hdel("feed.cancelled:" + this.name, id);
            multi.zrem("feed.published:" + this.name, id);
            multi.incr('feed.finishes:' + this.name);
            if(setresult !== undefined) {
                multi.publish('job.finish:' + this.name, id + '\x00' + setresult);
            }
            multi.hdel("feed.items:" + this.name, id);
            multi.exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(reply == null) {
                    //watch failed, try again
                    process.nextTick(function() {
                        this.finish(id, callback, setresult, timeout);
                    }.bind(this));
                } else {
                    if(callback) {
                        callback(null, id);
                    }
                }
            }.bind(this));
        }
    }.bind(this));
}

/**
 * Move a claimed job back to the queue.
 *
 * Arguments:
 *     id       -- The ID of the job to cancel.
 *     callback -- Executed if an error occurs.
 *
 * Callback Arguments:
 *     error -- A string description of the error.
 *     id    -- The ID of the cancelled job.
 */
function jobCancel(id, callback) {
    this.mredis.watch("feed.claimed:" + this.name);
    this.mredis.zrank("feed.claimed:" + this.name, id, function(err, result) {
        if(result == null) {
            this.mredis.unwatch(function(err, reply) {
                this.thoonk.lock.unlock();
                if(callback) { callback("id unclaimed", id); }
            }.bind(this));
        } else {
            this.mredis.multi()
                .hincrby("feed.cancelled:" + this.name, id, 1)
                .lpush("feed.ids:" + this.name, id)
                .zrem("feed.claimed:" + this.name, id)
            .exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(err || !reply) {
                    process.nextTick(function() {
                        this.cancel(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(null, id); }
                }
            }.bind(this));
        }
    }.bind(this));
}

/**
 * Move a job out of the queue in order to pause processing.
 *
 * While stalled, a job will not be dispatched to requesting workers.
 *
 * Arguments:
 *     id       -- The ID of the job to pause.
 *     callback -- Executed if an error occurs.
 *
 * Callback Arguments:
 *     error -- A string description of the error.
 *     id    -- The ID of the stalled job.
 */
function jobStall(id, callback) {
    this.mredis.watch("feed.claimed:" + this.name);
    this.mredis.zrank("feed.claimed:" + this.name, id, function(err, result) {
        if(result == null) {
            this.mredis.unwatch(function(err, reply) {
                this.thoonk.lock.unlock();
                if(callback) { callback("id already claimed", id); }
            }.bind(this));
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
                        this.stall(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(null, id); }
                }
            }.bind(this));
        }
    }.bind(this));
}

/**
 * Move a job from a stalled state back into the job queue.
 *
 * Arguments:
 *     id       -- The ID of the job to resume.
 *     callback -- Executed if an error occurred.
 *
 * Callback Arguments:
 *     error -- A string description of the error.
 *     id    -- The ID of the resumed job.
 */
function jobRetry(id, callback) {
    this.mredis.watch("feed.stalled:" + this.name);
    this.mredis.sismember("feed.stalled:" + this.name, id, function(err, result) {
        if(result == null) {
            this.mredis.unwatch(function(err, reply) {
                this.thoonk.lock.unlock();
                if(callback) { callback("id not stalled", id); }
            }.bind(this));
        } else {
            this.mredis.multi()
                .srem("feed.stalled:" + this.name, id)
                .lpush("feed.ids:" + this.name, id)
                .zadd("feed.published:" + this.name, Date.now(), id)
            .exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(!reply) {
                    process.nextTick(function() {
                        this.retry(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(null, id); }
                }
            }.bind(this));
        }
    }.bind(this));
}

/**
 * Get the number of times the job has been cancelled.
 *
 * Arguments:
 *     id       -- The ID of the job to check.
 *     callback -- Called with result.
 *
 * Callback Arguments:
 *     error -- A string description of the error.
 *     num   -- The number of times the job has been cancelled.
 */
function jobGetNumOfFailures(id, callback) {
    this.mredis.hget("feed.cancelled:" + this.name, id, callback);
}

/**
 * Delete a job from anywhere in the process.
 *
 * Arguments:
 *     id       -- The ID of the job to delete.
 *     callback -- Executed if an error occurred.
 *
 * Callback Arguments:
 *     error -- A string description of the error.
 *     id    -- The ID of the deleted job.
 */
function jobRetract(id, callback) {
    this.mredis.watch("feed.items:" + this.name);
    this.mredis.hexists("feed.items:" + this.name, id, function(err, result) {
        if(result == null) {
            this.mredis.unwatch(function(err, reply) {
                this.thoonk.lock.unlock();
                if(callback) { callback("id not found", id); }
            }.bind(this));
        } else {
            this.mredis.multi()
                .hdel('feed:items:' + this.name, id)
                .hdel('feed.cancelled:' + this.name, id)
                .zrem('feed.published:' + this.name, id)
                .srem('feed.stalled:' + this.name, id)
                .zrem('feed.claimed:' + this.name, id)
                .lrem('feed.ids:' + this.name, 1, id)
            .exec(function(err, reply) {
                this.thoonk.lock.unlock();
                if(err || !reply) {
                    process.nextTick(function() {
                        this.retact(id, callback);
                    }.bind(this));
                } else {
                    if(callback) { callback(null, id); }
                }
            }.bind(this));
        }
    }.bind(this));
}

Job.super_ = Feed;
Job.prototype = Object.create(Feed.prototype, {
    constructor: {
        value: Job,
        enumerable: false
    }
});

Job.prototype.put = jobPublish;
Job.prototype.publish = jobPublish;
Job.prototype.get = jobGet;
Job.prototype.finish = jobFinish;
Job.prototype.cancel = jobCancel;
Job.prototype.stall = jobStall;
Job.prototype.retry = jobRetry;
Job.prototype.retract = jobRetract;
Job.prototype.getNumOfFailures = jobGetNumOfFailures;
Job.prototype.ready = jobReady;

exports.Job = Job;
