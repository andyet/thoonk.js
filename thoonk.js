uuid = require("node-uuid");
redis = require("redis");

function Thoonk() {
    this.mredis = redis.createClient();
    this.lredis = redis.createClient();
    this.lredis.subscribe("newfeed", "delfeed", "conffeed");

    this.callbacks = {};

    this.instance = uuid();

    //map message events to this.handle_message using event_handler to apply instance scope
    this.lredis.on("message", this.handle_message.bind(this));

    this.feeds = {};

    this.mredis.on("error", function(error) {
        console.log("Error " + err);
    });
    //TODO: on disconnect, reconn
}

//map the event to the subscription callback
Thoonk.prototype.handle_message  = function(channel, msg) {

    if(channel == "newfeed") {
        //feed, instance
        var args = msg.split('\x00');
        if(args[1] != this.instance) {
            this.feeds[args[0]] = null;
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
        if(result) { 
            console.log("setting config...")
            this.set_config(name, config, true);
         }
    }.bind(this));
}

//update the config
Thoonk.prototype.set_config = function(feed, config, _newfeed) {
    this.mredis.set("feed.config:" + feed, JSON.stringify(config));
    this.feeds[feed] = config;
    if(!_newfeed) {
        this.mredis.publish("conffeed", feed + "\x00" + this.instance);
    }
}

Thoonk.prototype.update_config = function(feed) {
    var that = this;
    this.mredis.get("feed.config:" + feed, function(err, result) {
        if(!err) {
            that.feeds[feed] = JSON.parse(result);
        }
    });
}

Thoonk.prototype.exists = function(feed, exists_callback) {
    if(this.feeds.hasOwnProperty(feed)) { return true; }
    var obj = this;
    this.mredis.sismember("feeds", feed, function(error, reply) {
        if(exists_callback) {
            exists_callback(reply);
        }
        if(reply) { obj.feeds[feed] = null; }
    });
}

Thoonk.prototype.feed = function(name, config) {
    var feed = new Feed(this, name, config);
    return feed;
}

Thoonk.prototype.quit = function() {
    this.mredis.quit();
    this.lredis.quit();
}

function Feed(thoonk, name, config) {
    this.thoonk = thoonk;
    this.mredis = this.thoonk.mredis; //I'm lazy
    this.lredis = this.thoonk.lredis;
    this.name = name;
    var exists = this.thoonk.update_config(this.name);
    if(!exists) {
        this.thoonk.create(name, config);
    }
    //check does the feed exist? Make it if not?
}

function feed_publish(item, id) {
    var m = this.mredis.multi();
    if(id == null) {
        id = uuid()
        m.lpush("feed.ids:" + this.name, id)
    } else {
        if(!this.mredis.hexists("feed.items:" + this.name, id)) {
            m.lpush("feed.ids:" + this.name, id)
        }
    }
    m.hset("feed.items:" + this.name, id, item)
    m.exec(function(err, replies) {
        //TODO: error handling
    });
    this.mredis.publish("feed.publish:" + this.name, id + "\x00" + item);
}

function feed_retract(id) {
    var error = false;
    this.mredis.multi()
        .lrem("feed.ids:" + this.name, id, 1)
        .hdel("feed.items:" + this.name, id)
        .exec(function(err, replies) {
            replis.forEach(function(reply, idx) {
                if(!reply) {
                    error = true;
                    console.log("Could not delete " + id + "from " + this.name);
                }
            });
        });
    if(error) { return false; }
    this.mredis.publish("feed.retract:" + this.name, id, id);
}

function feed_get_ids() {
    return this.mredis.lrange("feed.ids:" + this.name, 0, -1);
}

function feed_get_item(id) {
    return this.mredis.hget("feed.items:" + this.name, id);
}

function feed_subscribe(callback) {
    this.lredis.subscribe("feed.publish:" + this.name);
    this.thoonk.callbacks[this.name] = callback;
}

Feed.prototype.publish = feed_publish;
Feed.prototype.retract = feed_retract;
Feed.prototype.get_ids = feed_get_ids;
Feed.prototype.get_item = feed_get_item;
Feed.prototype.subscribe = feed_subscribe;

exports.Thoonk = Thoonk;
exports.Feed = Feed;
