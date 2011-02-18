function Thoonk() {
    this.redis = require("redis");
    this.mredis = this.redis.createClient();
    this.lredis = this.redis.createClient();
    this.feeds = {};
    this.Feed = Feed;

    this.mredis.on("error", function(error) {
        console.log("Error " + err);
    });
    //on disconnect, reconn
}

Thoonk.prototype.create = function(name, config) {
    if(!this.mredis.sadd("feeds", name)) { return false; }
    this.set_config(name, config);
}

Thoonk.prototype.set_config(feed, config) {
    this.mredis.set("feed.config:" + feed, JSON.stringify(config));
    this.feeds[feed] = config;
}

Thoonk.prototype.update_config(feed) {
    if(this.exists(feed)) {
        this.feeds[feed] = JSON.parse(this.mredis.get("feed.config:" + feed));
        return this.feeds[feed];
    } else {
        return false;
    }
}

Thoonk.prototype.exists(feed) {
    if(this.feeds.hasOwnProperty(feed)) { return true; }
    if(this.mredis.sismember("feeds", feed)) {
        this.feeds[feed] = null;
        return true;
    }
    return false;
}

function Feed(thoonk, name, config) {
    this.thoonk = thoonk;
    this.name = name;
    var exists = this.thoonk.update_config(this.name);
    if(!exists) {
        this.thoonk.create(name, config);
    }
    //check does the feed exist? Make it if not?
}

Feed.prototype.publish = function(item, id) {
}

Feed.prototype.retract = function(id) {
}

Feed.prototype.get_ids = function() {
}

Feed.prototype.get_item = function(id) {
}

Feed.prototype.subscribe = function() {
}
