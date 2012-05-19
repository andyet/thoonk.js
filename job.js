/**
 * Written by Nathan Fritz and Lance Stout. Copyright © 2011 by &yet, LLC. 
 * Released under the terms of the MIT License
 */

var thoonkmodule = require('./thoonk'),
    uuid = require("node-uuid"),
    redis = require('redis'),
    fs = require('fs');

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
function Job(name, thoonk, config) {

    thoonkmodule.ThoonkBaseObject.call(this, name, thoonk);
    this.bredis = this.thoonk._get_blocking_redis(name);
    this.lredis = this.thoonk.lredis;

    this.subscribables = ['publish', 'retract', 'finish', 'retry', 'stall'];

    this.subinitted = false;
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
    var args = [id, JSON.stringify(item), ''+Date.now()];
    if (high_priority) args.push(high_priority);
    if(finish_callback) {
        this.once('job.id.finish:' + id, finish_callback);
    }
    this.runscript('publish', args, callback);
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
    this.bredis.brpop("job.ids:"+this.name, timeout||0, function (err, args) {
        if (args && args[1]) {
            this.runscript('get', [args[1], ''+Date.now()], callback);
        } else {
            callback(null, null, null, true);
        }
    }.bind(this));
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
    var args = [id];
    if (setresult) args.push(setresult);
    this.runscript('finish', args, callback);
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
    this.runscript('cancel', [id], callback);
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
    this.runscript('stall', [id], callback);
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
    this.runscript('retry', [id, ''+Date.now()], callback);
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
    this.redis.hget("job.cancelled:" + this.name, id, callback);
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
    this.runscript('retract', [id], callback);
}

Job.prototype = thoonkmodule.ThoonkBaseObject.prototype;
Job.prototype.constructor = Job;
Job.prototype.objtype = 'job';
Job.prototype.scriptdir = __dirname + '/scripts/job';

Job.prototype.put = jobPublish;
Job.prototype.publish = jobPublish;
Job.prototype.get = jobGet;
Job.prototype.finish = jobFinish;
Job.prototype.cancel = jobCancel;
Job.prototype.stall = jobStall;
Job.prototype.retry = jobRetry;
Job.prototype.retract = jobRetract;
Job.prototype.getNumOfFailures = jobGetNumOfFailures;
// Job.prototype.ready = jobReady;
Job.prototype.handle_event = function jobHandleEvent(channel, msg) {
    var objsplit = channel.split(':');
    var typesplit = objsplit[0].split('.');
    var eventname = typesplit[2];
    if(~['publish','finish'].indexOf(eventname)) {
        var msgsplit = msg.split('\x00');
        this.emit('job.id.'+eventname+':'+msgsplit[0], null, msgsplit[0], msgsplit[1]||null);
    }
};

exports.Job = Job;
