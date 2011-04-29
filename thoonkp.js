var uuid = require("node-uuid"),
	redis = require("redis"),
	EventEmitter = require("events").EventEmitter,
	Class = require('./class').Class,
	Deferred = require("./promise").Deferred,
	thoonk = require("./thoonk"),
	superThoonk = thoonk.Thoonk,
	superFeed = thoonk.Feed,
	superQueue = thoonk.Queue,
	superJob = thoonk.Job;

/**
 * This version of Thoonk utilizes promises as per CommonJS Promises/A, but still uses events for incoming updates. It
 * wraps the call of Thoonk where possible, otherwise it reimplements with Promises.
 * 
 * Thoonk is a persistent (and fast!) system for push feeds, queues, and jobs which leverages Redis. Thoonk.js is the
 * node.js implementation of Thoonk, and is interoperable with other versions of Thoonk (currently Thoonk.py).
 * 
 * @param host
 * @param port
 */
var Thoonk = new Class({
	extend: superThoonk,
	
	constructor: function(host, port) {
		superThoonk.call(this, host, port);
	},
	
	/**
	 * Create a new feed. A feed is a subject that you can publish items to (string, binary, json, xml, whatever), each with
	 * a unique id (assigned or generated). Other apps and services may subscribe to your feeds and recieve
	 * new/update/retract notices on your feeds. Each feed persists published items that can later be queried. Feeds may
	 * also be configured for various behaviors, such as max number of items, default serializer, friendly title, etc.
	 * 
	 * @param name The name of the feed to be created. If the feed has already been created it will not be recreated.
	 * @param config Configuration settings for the feed such as max items, default serializer, etc.
	 * @return Promise
	 */
	create: function(name, config) {
		var deferred = new Deferred();
		this.mredis.sadd("feeds", name, function(err, result) {
			// if we added it, configure it
			if(result != 0) {
				this.set_config(name, config, true).then(deferred.fulfill, deferred.fail);
			} else {
				deferred.fulfill(this);
			}
		}.bind(this));
		
		return deferred.promise;
	},
	
	/**
	 * Update the configuration of the feed. This will overwrite any previous settings that may have been set.
	 * 
	 * @param feed The feed name
	 * @param config The configuration settings
	 */
	set_config: function(feed, config, _newfeed) {
		var deferred = new Deferred();
		var self = this;
		this.mredis.set("feed.config:" + feed, JSON.stringify(config), function(err, result) {
			if (err) {
				deferred.fail(err);
			} else {
				self.feeds[feed] = config;
				if(!_newfeed) {
					this.mredis.publish("conffeed", feed + "\x00" + this.instance);
				}
				deferred.fulfill(config);
			}
		});
		return deferred.promise;
	},
	
	/**
	 * Retrieve the configuration of the feed from storage and update in memory. 
	 * 
	 * @param feed The feed name
	 */
	update_config: function(feed) {
		var deferred = new Deferred();
		superThoonk.prototype.update_config.call(this, feed, deferred.fulfill);
		return deferred.promise;
	},
	
	/**
	 * Whether a feed exists or not.
	 * 
	 * @param feed The name of the feed
	 */
	exists: function(feed) {
		var deferred = new Deferred();
		var result = superThoonk.prototype.exists.call(this, deferred.fulfill, deferred.fulfill);
		if (result === true) deferred.fulfill(true);
		return deferred.promise;
	},
	
	/**
	 * Create and return a new feed.
	 * 
	 * @param name The feed name
	 * @param config The feed configuration settings
	 */
	feed: function(name, config) {
		return new Feed(this, name, config);
	},
	
	/**
	 * Create and return a new queue.
	 * 
	 * @param name The queue name
	 * @param config The queue configuration settings
	 */
	queue: function(name, config) {
		return new Queue(this, name, config);
	},
	
	/**
	 * Create and return a new job queue.
	 * 
	 * @param name The job queue name
	 * @param config The job queue configuration settings
	 */
	job: function(name, config) {
		return new Job(this, name, config);
	}
});


/**
 * Create a new feed.
 * 
 * @param thoonk
 * @param name
 * @param config
 */
var Feed = new Class({
	extend: superFeed,
	
	constructor: function(thoonk, name, config) {
		EventEmitter.call(this);
		this.thoonk = thoonk;
		this.mredis = this.thoonk.mredis;
		this.lredis = this.thoonk.lredis;
		this.bredis = this.thoonk.bredis;
		this.name = name;
		this.subscribed = false;
		this.ready = this.thoonk.exists(name).then(function(exists) {
			if (!exists || config) {
				return thoonk.set_config(name, config);
			} else {
				return thoonk.update_config(name);
			}
		});
	},
	
	get_ids: function() {
		return this.ready.then(function() {
			var deferred = new Deferred();
			superFeed.prototype.get_ids.call(this, function(err, result) {
				if (err) deferred.fail(err);
				else deferred.fulfill(result);
			});
			return deferred.promise;
		});
	},
	
	get_item: function(id) {
		return this.ready.then(function() {
			var deferred = new Deferred();
			superFeed.prototype.get_item.call(this, id, function(err, result) {
				if (err) deferred.fail(err);
				else deferred.fulfill(result);
			});
			return deferred.promise;
		});
	},
	
	subscribe: function() {
		return this.ready.then(function() {
			var deferred = new Deferred();
			superFeed.prototype.get_item.call(this, deferred.fulfill, deferred.fail);
			return deferred.promise;
		});
	}
});


var Queue = new Class({
	extend: Feed,
	implement: superQueue,
	
	get: function(timeout) {
		return this.ready.then(function() {
			var deferred = new Deferred();
			superQueue.prototype.get.call(this, timeout, deferred.fulfill, deferred.fail);
			return deferred.promise;
		});
	}
});


var Job = new Class({
	extend: Queue,
	implement: superJob,
	
	get: function(timeout) {
		return this.ready.then(function() {
			var deferred = new Deferred();
			superJob.prototype.get.call(this, timeout, deferred.fulfill, deferred.fail);
			return deferred.promise;
		});
	},
	
	finish: function(id, setresult) {
		return this.ready.then(function() {
			var deferred = new Deferred();
			superJob.prototype.finish.call(this, id, setresult, deferrred.fulfill, deferred.fail);
			return deferred.promise;
		});
	},
	
	get_result: function(id, timeout) {
		return this.ready.then(function() {
			var deferred = new Deferred();
			superJob.prototype.get_result.call(this, id, timeout, deferrred.fulfill, deferred.fail);
			return deferred.promise;
		});
	}
});

exports.Thoonk = Thoonk;
exports.Feed = Feed;
exports.Queue = Queue;
exports.Job = Job;
