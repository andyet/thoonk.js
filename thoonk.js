uuid = require("node-uuid");
redis = require("redis");
EventEmitter = require("events").EventEmitter;

function Thoonk() {
    EventEmitter.call(this);
    this.lredis = redis.createClient();
    this.lredis.subscribe("newfeed", "delfeed", "conffeed");
    this.mredis = redis.createClient();
    this.bredis = redis.createClient();

    this.callbacks = {};

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
        enumerable: false,
    }
});

//map the event to the subscription callback
Thoonk.prototype.handle_message  = function(channel, msg) {
    if(channel == "newfeed") {
        //feed, instance
        var args = msg.split('\x00');
        if(args[1] != this.instance) {
            //this.feeds[args[0]] = null;
            this.update_config(args[0]);
        }
    } else if (channel == "delfeed") {
        //feed instance
        var args = msg.split('\x00');
        if(args[1] != this.instance) {
            delete this.feeds[args[0]];
        }
    } else if (channel == "conffeed") {
        //feed instance
        var args = msg.split('\x00');
        if(args[1] != this.instance) {
            //this.feeds[args[0]] = null;
            this.update_config(args[0]);
        }
    } else if (channel.substring(0, 13) == 'feed.publish:') {
        //id, event
        var args = msg.split('\x00');

        //chans[1] is the feed name
        var chans = channel.split(":");

        //if we have a registered callback for this feed, call it
        if(this.callbacks.hasOwnProperty(chans[1])) {
            this.callbacks[chans[1]](args[0], args[1]); 
        }
    }
}

//create a feed
Thoonk.prototype.create = function(name, config) {
    this.mredis.sadd("feeds", name, function(err, result) {
        //if we added it, configure it
        if(result != 0) { 
            this.set_config(name, config, true);
         } else {
            this.emit("ready:" + name);
         }
    }.bind(this));
}

//update the config
Thoonk.prototype.set_config = function(feed, config, _newfeed) {
    this.mredis.set("feed.config:" + feed, JSON.stringify(config));
    this.feeds[feed] = config;
    this.emit("ready:" + feed);
    if(!_newfeed) {
        this.mredis.publish("conffeed", feed + "\x00" + this.instance);
    }
}

Thoonk.prototype.update_config = function(feed, callback) {
    this.mredis.get("feed.config:" + feed, function(err, reply) {
        this.feeds[feed] = JSON.parse(reply);
        if(callback) {
           callback(this.feeds[feed]);
        }
    }.bind(this));
}

Thoonk.prototype.exists = function(feed, exists_callback, doesnt_callback) {
    if(this.feeds.hasOwnProperty(feed)) { return true; }
    var obj = this;
    this.mredis.sismember("feeds", feed, function(error, reply) {
        if(reply) {
            if(!this.feeds.hasOwnProperty(feed)) { this.update_config(feed); } 
            exists_callback(reply);
        } else {
            doesnt_callback(reply);
        }
    }.bind(this));
}

Thoonk.prototype.feed = function(name, config) {
    var feed = new Feed(this, name, config);
    return feed;
}

Thoonk.prototype.queue = function(name, config) {
    var queue = new Queue(this, name, config);
    return queue;
}

Thoonk.prototype.job = function(name, config) {
    var job = new Job(this, name, config);
    return job;
}

Thoonk.prototype.quit = function() {
    this.mredis.quit();
    this.lredis.quit();
    this.bredis.quit();
}

function Feed(thoonk, name, config) {
    EventEmitter.call(this);
    this.thoonk = thoonk;
    this.mredis = this.thoonk.mredis; //I'm lazy
    this.lredis = this.thoonk.lredis;
    this.bredis = this.thoonk.bredis;
    this.name = name;
    this.thoonk.once("ready:" + name, this.ready.bind(this));
    this.thoonk.exists(name,
        //exists
        function(reply) {
            if(!config) { 
                this.update_config(this.name, this.ready.bind(this));
            } else {
                this.thoonk.set_config(this.name, config);
            }
        }.bind(this),
        //doesn't
        function(reply) {
            this.thoonk.create(name, config);
        }.bind(this)
    );
}

function feed_ready() {
    this.emit("ready");
}

function feed_publish(item, id) {
    var m = this.mredis.multi();
    var id = id;
    var item = item;
    if(id == null) {
        id = uuid()
        //if we're generating a new id
        this.mredis.hset("feed.items:" + this.name, id, item)
        this.mredis.lpush("feed.ids:" + this.name, id, function(err,reply) { this.published(item, id); }.bind(this))
    } else {
        this.mredis.send_command("hexists", ["feed.items:" + this.name, id], function(err,reply) {
            if(!reply) {
                //if the id doesn't already exist
                this.mredis.hset("feed.items:" + this.name, id, item)
                this.mredis.lpush("feed.ids:" + this.name, id, function(err,reply) { this.published(item, id); }.bind(this))
            }
        }.bind(this));
    }
    //if we're updating an existing id
    this.mredis.hset("feed.items:" + this.name, id, item, function(err,reply) { this.published(item, id); }.bind(this))
}

function feed_published(item, id) {
    this.mredis.publish("feed.publish:" + this.name, id + "\x00" + item);
}

function feed_retract(id) {
    this.mredis.multi()
        .lrem("feed.ids:" + this.name, id, 1)
        .hdel("feed.items:" + this.name, id)
        .exec(function(err, replies) {
            var error = false;
            replies.forEach(function(reply, idx) {
                if(!reply) {
                    error = true;
                    console.log("Could not delete " + id + "from " + this.name);
                }
            });
            if(!error) {
                this.mredis.publish("feed.retract:" + this.name, id, id);
            }
        });
}

function feed_get_ids(callback) {
    return this.mredis.lrange("feed.ids:" + this.name, 0, -1, callback);
}

function feed_get_item(id, callback) {
    return this.mredis.hget("feed.items:" + this.name, id, callback);
}

function feed_subscribe(callback) {
    this.lredis.subscribe("feed.publish:" + this.name);
    this.thoonk.callbacks[this.name] = callback;
}

//extend Feed with EventEmitter
Feed.super_ = EventEmitter;
Feed.prototype = Object.create(EventEmitter.prototype, {
    constructor: {
        value: Feed,
        enumerable: false,
    }
});

Feed.prototype.publish = feed_publish;
Feed.prototype.published = feed_published;
Feed.prototype.retract = feed_retract;
Feed.prototype.get_ids = feed_get_ids;
Feed.prototype.get_item = feed_get_item;
Feed.prototype.subscribe = feed_subscribe;
Feed.prototype.ready = feed_ready;

function Queue(thoonk, name, config) {
    Feed.call(this, thoonk, name, config);
}

function queue_publish(item) {
    id = uuid()
    this.mredis.multi()
    .hset("feed.items:" + this.name, id, item)
    .lpush("feed.ids:" + this.name, id)
    .exec(function(err, replies) {
        //TODO error handler
    });
}

function queue_get(timeout, callback, timeout_callback) {
    var callback = callback;
    if(!timeout) { var timeout = 0 };
    this.bredis.brpop("feed.ids:" + this.name, timeout, function(err, result) {
        if(!err) {
            var id = result[1];
            this.mredis.hget("feed.items:" + this.name, id, function(err, result) {
                callback(result, id);
                this.mredis.hdel("feed.items:" + this.name, result);
            }.bind(this));
        } else {
            timeout_callback()
        }
    }.bind(this));
}

Queue.super_ = Feed;
Queue.prototype = Object.create(Feed.prototype, {
    constructor: {
        value: Queue,
        enumerable: false,
    }
});

Queue.prototype.publish = queue_publish;
Queue.prototype.put = queue_publish;
Queue.prototype.get = queue_get;

function Job(thoonk, name, config) {
    Queue.call(this, thoonk, name, config);
}

Job.super_ = Queue;
Job.prototype = Object.create(Queue.prototype, {
    constructor: {
        value: Job,
        enumerable: false,
    }
});

function job_get(timeout, callback, timeout_callback) {
    if(!timeout) { var timeout = 0; }
    this.bredis.brpop("feed.ids:" + this.name, timeout, function(err, result) {
        if(!err) {
            var d = new Date()
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
    var id = id;
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
