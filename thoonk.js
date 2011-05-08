var uuid = require("node-uuid"),
	redis = require("redis"),
    padlock = require("padlock"),
	EventEmitter = require("events").EventEmitter;

/**
 * Thoonk is a persistent (and fast!) system for push feeds, queues, and jobs which leverages Redis. Thoonk.js is the
 * node.js implementation of Thoonk, and is interoperable with other versions of Thoonk (currently Thoonk.py).
 * 
 * @param host
 * @param port
 */
function Thoonk(host, port) {
    if(!host) { host = "127.0.0.1"; }
    if(!port) { port = 6379; }
    EventEmitter.call(this);
    this.lredis = redis.createClient(port, host);
    this.lredis.subscribe("newfeed", "delfeed", "conffeed");
    this.mredis = redis.createClient(port, host);
    this.bredis = redis.createClient(port, host);
    this.lock = new padlock.Padlock();

    this.instance = uuid();

    //map message events to this.handle_message using event_handler to apply instance scope
    this.lredis.on("message", this.handle_message.bind(this));

    this.feeds = {};

    this.mredis.on("error", function(error) {
        console.log("Error " + error);
    });
    //TODO: on disconnect, reconn
}

//extend Thoonk with EventEmitter
Thoonk.super_ = EventEmitter;
Thoonk.prototype = Object.create(EventEmitter.prototype, {
    constructor: {
        value: Thoonk,
        enumerable: false
    }
});

//map the event to the subscription callback
Thoonk.prototype.handle_message = function(channel, msg) {
	var args;
    if(channel == "newfeed") {
        //feed, instance
        args = msg.split('\x00');
        if(args[1] != this.instance) {
            //this.feeds[args[0]] = null;
            this.update_config(args[0]);
        }
    } else if (channel == "delfeed") {
        //feed instance
        args = msg.split('\x00');
        if(args[1] != this.instance) {
            delete this.feeds[args[0]];
        }
    } else if (channel == "conffeed") {
        //feed instance
        args = msg.split('\x00');
        if(args[1] != this.instance) {
            //this.feeds[args[0]] = null;
            this.update_config(args[0]);
        }
    } else if (channel.substring(0, 13) == 'feed.publish:') {
        //id, event
        args = msg.split('\x00');

        //chans[1] is the feed name
        var chans = channel.split(":");

        //publish: id, payload
        this.emit('publish:' + chans[1], args[0], args[1]);
    } else if (channel.substring(0, 10) == 'feed.edit:') {
        //id, event
        args = msg.split('\x00');

        //chans[1] is the feed name
        var chans = channel.split(":");

        //publish: id, payload
        this.emit('edit:' + chans[1], args[0], args[1]);
    } else if (channel.substring(0, 13) == 'feed.retract:') {
        //retract: id
        var chans = channel.split(":");
        this.emit('retract:' + chans[1], msg);
    }
};

/**
 * Create a new feed. A feed is a subject that you can publish items to (string, binary, json, xml, whatever), each with
 * a unique id (assigned or generated). Other apps and services may subscribe to your feeds and recieve
 * new/update/retract notices on your feeds. Each feed persists published items that can later be queried. Feeds may
 * also be configured for various behaviors, such as max number of items, default serializer, friendly title, etc.
 * 
 * @param name The name of the feed to be created. If the feed has already been created it will not be recreated.
 * @param config Configuration settings for the feed such as max items, default serializer, etc. 
 */
Thoonk.prototype.create = function(name, config) {
    this.mredis.sadd("feeds", name, function(err, result) {
        // if we added it, configure it
        if(result != 0) { 
            this.set_config(name, config, true);
        } else {
            this.emit("ready:" + name);
        }
        this.mredis.publish("newfeed", name + "\x00" + this.instance);
    }.bind(this));
};

/**
 * Update the configuration of the feed. This will overwrite any previous settings that may have been set.
 * 
 * @param feed The feed name
 * @param config The configuration settings
 */
Thoonk.prototype.set_config = function(feed, config, _newfeed) {
    if(!config.hasOwnProperty('type')) {
        config['type'] = 'feed';
    }
    this.mredis.set("feed.config:" + feed, JSON.stringify(config));
    this.feeds[feed] = config;
    this.emit("ready:" + feed);
    if(!_newfeed) {
        this.mredis.publish("conffeed", feed + "\x00" + this.instance);
    }
};

/**
 * Retrieve the configuration of the feed from storage and update in memory. 
 * 
 * @param feed The feed name
 * @param callback
 */
Thoonk.prototype.update_config = function(feed, callback) {
    this.mredis.get("feed.config:" + feed, function(err, reply) {
        this.feeds[feed] = JSON.parse(reply);
        if(callback) {
           callback(this.feeds[feed]);
        }
    }.bind(this));
};

/**
 * Whether a feed exists or not.
 * 
 * @param feed The name of the feed
 * @param exists_callback Callback if it exists
 * @param doesnt_callback Callback if it doesn't exist
 */
Thoonk.prototype.exists = function(feed, exists_callback, doesnt_callback) {
    if(this.feeds.hasOwnProperty(feed)) exists_callback(true);
    this.mredis.sismember("feeds", feed, function(error, reply) {
        if(reply) {
            if(!this.feeds.hasOwnProperty(feed)) { this.update_config(feed); } 
            exists_callback(reply);
        } else {
            doesnt_callback(reply);
        }
    }.bind(this));
};

/**
 * Create and return a new feed.
 * 
 * @param name The feed name
 * @param config The feed configuration settings
 */
Thoonk.prototype.feed = function(name, config) {
    return new Feed(this, name, config);
};

/**
 * Create and return a new queue.
 * 
 * @param name The queue name
 * @param config The queue configuration settings
 */
Thoonk.prototype.queue = function(name, config) {
    return new Queue(this, name, config);
};

/**
 * Create and return a new job queue.
 * 
 * @param name The job queue name
 * @param config The job queue configuration settings
 */
Thoonk.prototype.job = function(name, config) {
    return new Job(this, name, config);
};

/**
 * Disconnect from the server.
 */
Thoonk.prototype.quit = function() {
    this.mredis.quit();
    this.lredis.quit();
    this.bredis.quit();
};

//Feed object
function Feed(thoonk, name, config, type) {
    EventEmitter.call(this);
    this.thoonk = thoonk;

    //local references
    this.mredis = this.thoonk.mredis;
    this.lredis = this.thoonk.lredis;
    this.bredis = this.thoonk.bredis;

    this.name = name;
    this.subscribed = false;
    this.thoonk.once("ready:" + name, this.ready.bind(this));
    this.thoonk.exists(name,
        //exists
        function(reply) {
            if(!config) { 
                thoonk.update_config(this.name, this.ready.bind(this));
            } else {
                if(!type) { type = 'feed' }
                if(!config.hasOwnProperty('type')) { config.type = type; }
                this.thoonk.set_config(this.name, config);
            }
        }.bind(this),
        //doesn't
        function(reply) {
            thoonk.create(name, config);
        }.bind(this)
    );

    this.publish = this.thoonk.lock.require(feed_publish, this);
}

function feed_ready() {
    this.lredis.once('idle', function() { 
        this.emit('ready');
    }.bind(this));
    setTimeout(function() {
        this.emit('ready');
    }.bind(this), 100);
    this.lredis.subscribe("feed.publish:" + this.name);
    this.lredis.subscribe("feed.edit:" + this.name);
    this.lredis.subscribe("feed.retract:" + this.name);
    this.subscribed = true;
}

function feed_publish(item, id, callback) {
    if(id == null) {
        id = uuid();
    }
    var max_length = this.thoonk.feeds[this.name]['max_length'];
    var pmulti = this.mredis.multi();
    if(max_length) {
        //attempt to publish, so long as feed.ids doesn't change
        var publish_attempt = function() {
            this.mredis.watch('feed.ids:' + this.name);
            this.mredis.zrange('feed.ids:' + this.name, 0, (-max_length - 1), function (err, reply) {
                var delete_ids = reply;
                delete_ids.forEach(function (delete_id, idx) {
                    pmulti.zrem('feed.ids:' + this.name, delete_id);
                    pmulti.hdel('feed.items:' + this.name, delete_id);
                    pmulti.publish('feed.retract:' + this.name, delete_id);
                }.bind(this));
                pmulti.zadd('feed.ids:' + this.name, Date.now(), id);
                pmulti.incr('feed.publishes:' + this.name);
                pmulti.hset('feed.items:' + this.name, id, item);
                pmulti.exec(function(err, reply) {
                    if(!reply) { 
                        publish_attempt();
                    } else {
                        if(reply.slice(-3,-2)[0]) {
                            this.mredis.publish('feed.publish:' + this.name, id + "\x00" + item);
                        } else {
                            this.mredis.publish('feed.edit:' + this.name, id + "\x00" + item);
                        }
                        this.thoonk.lock.unlock();
                        if(callback !== undefined) { callback(true); }
                    }
                }.bind(this));
            }.bind(this));
        }.bind(this);
        publish_attempt();
    } else {
        pmulti.zadd('feed.ids:' + this.name, Date.now(), id);
        pmulti.incr('feed.publishes:' + this.name);
        pmulti.hset('feed.items:' + this.name, id, item);
        pmulti.exec(function(err,reply) {
            if(reply.slice(-3,-2)[0]) {
                this.mredis.publish('feed.publish:' + this.name, id + "\x00" + item);
            } else {
                this.mredis.publish('feed.edit:' + this.name, id + "\x00" + item);
            }
            this.thoonk.lock.unlock();
            if(callback !== undefined) { callback(true); }
        }.bind(this));
    }
}

function feed_retract(id) {
    this.mredis.watch('feed.ids:' + this.name, function(err, reply) {
        this.mredis.zrank('feed.ids:' + this.name, function(err, reply) {
            if(reply) {
                var rmulti = this.mredis.multi();
                rmulti.zrem('feed.ids:' + this.name, id);
                rmulti.hdel('feed.items:' + this.name, id); 
                rmulti.publish('feed.retract:' + this.name, id);
                rmulti.exec(function(err, reply) {
                    if(!reply) {
                        this.mredis.unwatch('feed.ids:' + this.name);
                    }
                }.bind(this));
            }
        }.bind(this));
    }.bind(this));
}


function feed_get_ids(callback) {
    return this.mredis.zrange("feed.ids:" + this.name, 0, -1, callback);
}

function feed_get_item(id, callback) {
    return this.mredis.hget("feed.items:" + this.name, id, callback);
}

function feed_subscribe(publish_callback, edit_callback, retract_callback, done_callback) {
    this.thoonk.on('publish:' + this.name, publish_callback);
    this.thoonk.on('edit:' + this.name, edit_callback);
    this.thoonk.on('retract:' + this.name, retract_callback);
    if(!this.subscribed) {
        this.lredis.once('idle', done_callback);
        this.lredis.subscribe("feed.publish:" + this.name);
        this.lredis.subscribe("feed.edit:" + this.name);
        this.lredis.subscribe("feed.retract:" + this.name);
        this.subscribed = true;
    } else {
        done_callback();
    }
}

//extend Feed with EventEmitter
Feed.super_ = EventEmitter;
Feed.prototype = Object.create(EventEmitter.prototype, {
    constructor: {
        value: Feed,
        enumerable: false
    }
});

Feed.prototype.publish = feed_publish;
Feed.prototype.retract = feed_retract;
Feed.prototype.get_ids = feed_get_ids;
Feed.prototype.get_item = feed_get_item;
Feed.prototype.subscribe = feed_subscribe;
Feed.prototype.ready = feed_ready;

function Queue(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'queue');
}

function queue_publish(item, callback, priority) {
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
        //TODO error handler
    });
}

function queue_publishfront(item, callback) {
    this.queue_publish(item, callback, true);
}

function queue_get(timeout, callback, timeout_callback) {
    if(!timeout) timeout = 0;
    this.bredis.brpop("feed.ids:" + this.name, timeout, function(err, result) {
        if(!err) {
            var id = result[1];
            this.mredis.multi()
            .hget("feed.items:" + this.name, id)
            .hdel("feed.items:" + this.name, id)
            .exec(function(err, result) {
                callback(result, id);
            });
        } else {
            timeout_callback();
        }
    }.bind(this));
}

Queue.super_ = Feed;
Queue.prototype = Object.create(Feed.prototype, {
    constructor: {
        value: Queue,
        enumerable: false
    }
});

Queue.prototype.publish = queue_publish;
Queue.prototype.put = queue_publish;
Queue.prototype.get = queue_get;
Queue.prototype.high_put = queue_publishfront;

function Job(thoonk, name, config) {
    Feed.call(this, thoonk, name, config, 'job');
}

Job.super_ = Queue;
Job.prototype = Object.create(Queue.prototype, {
    constructor: {
        value: Job,
        enumerable: false
    }
});

function job_get(timeout, callback, timeout_callback) {
    if(!timeout) timeout = 0;
    this.bredis.brpop("feed.ids:" + this.name, timeout, function(err, result) {
        if(!err) {
            var d = new Date();
            var id = result[1];
            this.mredis.hset("feed.running:" + this.name, id, d.getTime());
            this.mredis.hget("feed.items:" + this.name, id, function(err, result) {
                callback(result, id);
            }.bind(this));
        } else {
            timeout_callback();
        }
    }.bind(this));
}

function job_finish(id, setresult, callback, error_callback) {
    this.mredis.hdel("feed.running:" + this.name, id, function(err, result) {
        if(!err) {
            if(setresult !== null && setresult !== undefined) {
                this.mredis.hget("feed.items:" + this.name, id, function(err, result) {
                    if(!err) {
                        this.mredis.lpush("feed.jobfinished:" + this.name + "\x00" + id, setresult);
                    }
                });
            }
            this.mredis.hdel("feed.items:" + this.name, id, function(err, result) {
                if(err) {
                    if(error_callback) {
                        error_callback(id);
                    }
                } else {
                    if(callback) {
                        callback(id);
                    }
                }
            }.bind(this));
        } else {
            error_callback(id);
        }
    }.bind(this));
}

function job_get_result(id, timeout, callback, timeout_callback) {
    this.mredis.blpop("feed.jobfinished:" + this.name + "\x00" + id, timeout, function(err, result) {
        if(err) {
            timeout_callback(id);
        } else {
            callback(result);
        }
    }.bind(this));
}

function job_cancel(id) {
    this.mredis.hdel("feed.running:" + this.name, id, function(err, result) {
        if(!err) {
            this.mredis.rpush("feed.ids:" + this.name, id);
        }
    });
}

function job_stall(id) {
    this.mredis.hdel("feed.running:" + this.name, id, function(err, result) {
        if(!err) {
            this.mredis.rpush("feed.stalled:" + this.name, id);
        }
    });
}

function job_retry(id) {
    this.mredis.lrem("feed.stalled:" + this.name, 1, id, function(err, result) {
        if(!err) {
            this.mredis.rpush("feed.ids:" + this.name, id);
        }
    });
}

Job.prototype.get = job_get;
Job.prototype.finish = job_finish;
Job.prototype.get_result = job_get_result;
Job.prototype.cancel = job_cancel;
Job.prototype.stall = job_stall;
Job.prototype.retry = job_retry;

exports.Thoonk = Thoonk;
exports.Feed = Feed;
exports.Queue = Queue;
exports.Job = Job;
