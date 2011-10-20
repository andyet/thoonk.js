/**
 * Written by Nathan Fritz and Lance Stout. Copyright © 2011 by &yet, LLC. 
 * Released under the terms of the MIT License
 */

var uuid = require("node-uuid"),
    redis = require("redis"),
    padlock = require("padlock"),
    EventEmitter = require("events").EventEmitter;

var Feed = exports.Feed = require("./feed.js").Feed,
    Queue = exports.Queue = require("./queue.js").Queue,
    Job = exports.Job = require("./job.js").Job,
    SortedFeed = exports.SortedFeed = require("./sorted_feed.js").SortedFeed;

/**
 * Thoonk is a persistent (and fast!) system for push feeds, queues, and jobs
 * which leverages Redis. Thoonk.js is the node.js implementation of Thoonk, and
 * is interoperable with other versions of Thoonk (currently Thoonk.py).
 * 
 * @param host
 * @param port
 */
var Thoonk = exports.Thoonk = function Thoonk(host, port, db) {
    host || (host = "127.0.0.1");
    port || (port = 6379);
    db || (db = 0);
    this.host = host;
    this.port = port;
    this.db = db;
    EventEmitter.call(this);
    this.lredis = redis.createClient(port, host);
    this.lredis.select(db);
    this.lredis.subscribe("newfeed", "delfeed", "conffeed");
    this.mredis = redis.createClient(port, host);
    this.mredis.select(db);
    this.lock = new padlock.Padlock();

    this.instance = uuid();

    //map message events to this.handle_message using event_handler to apply instance scope
    this.lredis.on("message", this.handle_message.bind(this));
    this.lredis.on("pmessage", this.handle_pmessage.bind(this));
    this.lredis.on("subscribe", this.handle_subscribe.bind(this));
    this.lredis.on("unsubscribe", this.handle_unsubscribe.bind(this));
    this.lredis.on("psubscribe", this.handle_psubscribe.bind(this));
    this.lredis.on("punsubscribe", this.handle_punsubscribe.bind(this));

    this.subscribepatterns = {};

    this.mredis.on("error", function(error) {
        console.log("Error " + error);
    });
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
        this.emit('create', args[0]);
    } else if (channel == "delfeed") {
        //feed instance
        args = msg.split('\x00');
        this.emit('delete', args[0]);
    } else if (channel == "conffeed") {
        //feed instance
        args = msg.split('\x00');
        this.emit('config:' + args[0]);
    } else if (channel.substring(0, 13) == 'feed.publish:') {
        //id, event
        args = msg.split('\x00');

        //chans[1] is the feed name
        var chans = channel.split(":");

        //publish: id, payload
        this.emit('publish:' + chans[1], chans[1], args[0], args[1]);
        this.emit('publish.id:' + chans[1] + ':' + args[0], chans[1], args[0], args[1]);
    } else if (channel.substring(0,11) == 'job.finish:') {
        var chans = channel.split(":");
        args = msg.split('\x00');
        this.emit('job.finish:' + chans[1], chans[1], args[0], args[1]);
    } else if (channel.substring(0, 10) == 'feed.edit:') {
        //id, event
        args = msg.split('\x00');

        //chans[1] is the feed name
        var chans = channel.split(":");

        //publish: id, payload
        this.emit('edit:' + chans[1], chans[1], args[0], args[1]);
        this.emit('edit.id:' + chans[1] + ':' + args[0], chans[1], args[0], args[1]);
    } else if (channel.substring(0, 13) == 'feed.retract:') {
        //retract: id
        var chans = channel.split(":");
        this.emit('retract:' + chans[1], chans[1], msg);
        this.emit('publish.id:' + chans[1] + ':' + msg, chans[1], msg);
    } else if (channel.substring(0, 14) == 'feed.position:') {
        var chans = channel.split(":");
        args = msg.split('\x00');
        this.emit('position:' + chans[1], chans[1], args[0], args[1]);
        this.emit('position.id:' + chans[1] + ':' + args[0], chans[1], args[0], args[1]);
    }
};

//map the pattern event to the subscription callback
Thoonk.prototype.handle_pmessage = function(pattern, channel, msg) {
    var args;
    if (channel.substring(0, 13) == 'feed.publish:') {
        //id, event
        args = msg.split('\x00');

        //chans[1] is the feed name
        var chans = channel.split(":");

        //publish: id, payload
        this.emit('ns.publish:' + pattern, chans[1], args[0], args[1]);
    } else if (channel.substring(0, 10) == 'feed.edit:') {
        //id, event
        args = msg.split('\x00');

        //chans[1] is the feed name
        var chans = channel.split(":");

        //publish: id, payload
        this.emit('ns.edit:' + pattern, chans[1], args[0], args[1]);
    } else if (channel.substring(0, 13) == 'feed.retract:') {
        //retract: id
        var chans = channel.split(":");
        this.emit('ns.retract:' + pattern, chans[1], msg);
    } else if (channel.substring(0, 14) == 'feed.position:') {
        var chans = channel.split(":");
        args = msg.split('\x00');
        this.emit('ns.position:' + pattern, chans[1], args[0], args[1]);
    }
};

Thoonk.prototype.handle_subscribe = function(channel, count) {
    this.emit('subscribe:' + channel, count);
};

Thoonk.prototype.handle_unsubscribe = function(channel, count) {
    this.emit('unsubscribe:' + channel, count);
};

Thoonk.prototype.handle_psubscribe = function(pattern, count) {
    this.emit('psubscribe:' + pattern, count);
};

Thoonk.prototype.handle_punsubscribe = function(pattern, count) {
    this.emit('punsubscribe:' + pattern, count);
};

/**
 * Subscribe to receive pattern events.
 *
 * Events:
 *     publishes
 *     edits
 *     retractions
 *     position updates
 *
 * Object Property Arguments:
 *     publish  -- Executed on an item publish event.
 *     edit     -- Executed on an item edited event.
 *     retract  -- Executed on an item removal event.
 *     position -- Placeholder for sorted feed item placement.
 *     done     -- Executed when subscription is completed.
 *
 * Publish and Edit Callback Arguments:
 *     name -- The name of the feed that changed.
 *     id   -- The ID of the published or edited item.
 *     item -- The content of the published or edited item.
 *     
 * Retract Callback Arguments:
 *     name -- The name of the feed that changed.
 *     id   -- The ID of the retracted item.
 *
 * Done Callback Arguments: None
 */
Thoonk.prototype.namespaceSubscribe = function(pattern, callbacks) {
    if(callbacks['publish']) {
        this.on('ns.publish:' + 'feed.publish:' + pattern, callbacks['publish']);
    }
    if(callbacks['edit']) {
        this.on('ns.edit:' + 'feed.edit:' + pattern, callbacks['edit']);
    }
    if(callbacks['retract']) {
        this.on('ns.retract:' + 'feed.retract:' + pattern, callbacks['retract']);
    }
    if(callbacks['position']) {
        this.on('ns.position:' + 'feed.position:' + pattern, callbacks['position']);
    }
    if(!this.subscribepatterns.hasOwnProperty(pattern)) {
        this.lredis.psubscribe("feed.publish:" + pattern);
        this.lredis.psubscribe("feed.edit:" + pattern);
        this.lredis.psubscribe("feed.retract:" + pattern);
        this.lredis.psubscribe("feed.position:" + pattern);
        this.subscribepatterns[pattern] = 0;
    }
    this.subscribepatterns[pattern]++;
    if(callbacks.hasOwnProperty('done')) {
        this.once('psubscribe:feed.position:' + pattern, callbacks.done);
    }
}

/**
 * Unsubscribe from pattern events.
 *
 * Object Property Arguments:
 *     publish  -- Executed on an item publish event.
 *     edit     -- Executed on an item edited event.
 *     retract  -- Executed on an item removal event.
 *     position -- Placeholder for sorted feed item placement.
 *     done     -- Executed when subscription is completed.
 *
 * Done Callback Arguments: None
 *
 *  pattern
 *  callbacks
 *
 */
Thoonk.prototype.namespaceUnsubscribe = function(pattern, callbacks) {
    if(this.subscribepatterns.hasOwnProperty(pattern)) {
        this.subscribepatterns[pattern]--;
        if(callbacks['publish']) {
            this.removeListener('ns.publish:' + 'feed.publish:' + pattern, callbacks['publish']);
        }
        if(callbacks['edit']) {
            this.removeListener('ns.edit:' + 'feed.edit:' + pattern, callbacks['edit']);
        }
        if(callbacks['retract']) {
            this.removeListener('ns.retract:' + 'feed.retract:' + pattern, callbacks['retract']);
        }
        if(callbacks['position']) {
            this.removeListener('ns.position:' + 'feed.position:' + pattern, callbacks['position']);
        }
        if(this.subscribepatterns[pattern] == 0) {
            delete this.subscribepatterns[pattern];
            this.lredis.punsubscribe("feed.publish:" + pattern);
            this.lredis.punsubscribe("feed.edit:" + pattern);
            this.lredis.punsubscribe("feed.retract:" + pattern);
            this.lredis.punsubscribe("feed.position:" + pattern);
        }
        if(callbacks.hasOwnProperty('done')) {
            this.once('punsubscribe:feed.position:' + pattern, callbacks.done);
        }
    } else {
        if(callbacks.hasOwnProperty('done')) {
            callbacks.done();
        }
    }
};

/**
 * Create a new feed. A feed is a subject that you can publish items to
 * (string, binary, json, xml, whatever), each with a unique id (assigned or
 * generated). Other apps and services may subscribe to your feeds and recieve
 * new/update/retract notices on your feeds. Each feed persists published
 * items that can later be queried. Feeds may also be configured for various
 * behaviors, such as max number of items, default serializer, friendly title,
 * etc.
 * 
 * @param name The name of the feed to be created. If the feed has already been
 *             created it will not be recreated.
 * @param config Configuration settings for the feed such as max items, default
 *               serializer, etc.
 */
Thoonk.prototype.create = function(name, config) {
    config || (config = {});
    this.mredis.sadd("feeds", name, function(err, result) {
        // if we added it, configure it
        if(result != 0) { 
            this.setConfig(name, config, true);
        } else {
            this.emit("ready:" + name);
        }
    }.bind(this));
};

/**
 * Update the configuration of the feed. This will overwrite any previous
 * settings that may have been set.
 * 
 * @param feed The feed name
 * @param config The configuration settings
 */
Thoonk.prototype.setConfig = function(feed, config, _newfeed) {
    if(!config.hasOwnProperty('type')) {
        config.type = 'feed';
    }
    var multi = this.mredis.multi();
    for(var key in config) {
        multi.hset('feed.config:' + feed, key, config[key]);
    }
    multi.exec(function(err, reply) {
        this.emit("ready:" + feed);
        if(_newfeed) {
            this.mredis.publish("newfeed", feed + "\x00" + this.instance);
        }
        this.mredis.publish("conffeed", feed + "\x00" + this.instance);
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
    this.mredis.sismember("feeds", feed, function(error, reply) {
        if(reply) {
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
 * Create and return a new sorted feed.
 * 
 * @param name The sorted feed name
 * @param config The sorted feed configuration settings
 */
Thoonk.prototype.sortedFeed = function(name, config) {
    return new SortedFeed(this, name, config);
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

Thoonk.prototype.loadFeed = function(name, callback) {
    this.mredis.hget('feed.config:' + name, 'type', function(err, reply) {
        if(err) {
            callback("not found");
        } else {
            if(reply == 'feed') {
                callback(null, this.feed(name));
            } else if(reply == 'sorted_feed') {
                callback(null, this.sortedFeed(name));
            } else if(reply == 'job') {
                callback(null, this.job(name));
            } else {
                callback("unknown type: " + reply);
            }
        }
    }.bind(this));
};

/**
 * Disconnect from the server.
 */
Thoonk.prototype.quit = function() {
    this.mredis.quit();
    this.lredis.quit();
    this.emit('quit');
};

/**
 * Return the names of all existing feeds.
 */
Thoonk.prototype.getFeedNames = function(callback, error_callback) {
    this.mredis.smembers("feeds", function(error, reply) {
        if(reply) {
            callback(reply);
        } else {
            callback([]);
        }
    });
};


/**
 * Shortcut function to make creating a Thoonk instance
 * easier, as so:
 *
 *     var pubsub = require("thoonk").createClient(host, port, db);
 */
exports.createClient = function(host, port, db) {
    return new Thoonk(host, port, db);
}

exports.VERSION = '0.5.1';
