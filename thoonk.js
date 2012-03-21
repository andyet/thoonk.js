var redis = require('redis'),
    fs = require('fs'),
    path = require('path'),
    EventEmitter = require("events").EventEmitter,
    uuid = require('node-uuid');

var Thoonk = function() {
    EventEmitter.call(this);


    this.redis = redis.createClient();
    this.lredis = redis.createClient();
    this.ready = false;

    this.lredis.on('message', function(channel, msg) {
        msg = msg.toString();
        this.emit(channel, channel, msg);
    }.bind(this));

    this.lredis.on('subscribe', function(channel) {
        this.emit('subscribed.' + channel);
    }.bind(this));

    this.scripts = {};
    this.shas = {};

    this.instance = uuid();

    this.subscriptions = {};

    this.objects = {};
};

Thoonk.prototype = Object.create(EventEmitter.prototype);
Thoonk.prototype.constructor = Thoonk;

(function() {
    //continue extending Thoonk

    this.quit = function() {
        this.redis.quit();
        this.lredis.quit();
    };

    this.registerType = function(objname, theobject, callback) {
        this.objects[objname] = function(name) {
            return new theobject(name, this);
        }.bind(this);
        var dir = theobject.prototype.scriptdir;
        this.scripts[theobject.prototype.objtype] = {};
        this.shas[theobject.prototype.objtype] = {}
        var curdir = fs.readdirSync(dir);
        curdir = curdir.filter(function(fname) { return fname.substr(-4) == '.lua'; });
        curdir.forEach(function(filename, fidx, curdir) {
            var last = (fidx + 1 == curdir.length);
            if(path.extname(filename) == '.lua') {
                var verbname = path.basename(filename).slice(0,-4);
                this.scripts[theobject.prototype.objtype][verbname] = fs.readFileSync(dir + '/' + filename).toString();
                this.redis.send_command('SCRIPT', ['LOAD', this.scripts[theobject.prototype.objtype][verbname]], function(err, reply) {
                    if(err) { console.log(verbname, err); }
                    this.shas[theobject.prototype.objtype][verbname] = reply.toString();
                    if(last) {
                        if(callback) {
                            callback(false);
                        }
                        this.emit('loaded.' + objname);
                    }
                }.bind(this));
            }
        }.bind(this));
    };

    this.create = function() {
    };

    this._runscript = function(objtype, scriptname, feedname, args, callback) {
        args = [this.shas[objtype][scriptname], '0', feedname].concat(args);
        this.redis.send_command('EVALSHA', args, callback);
    };

    this.feed = function(name, config) {
        return new Feed(name);
    };

}).call(Thoonk.prototype);

var ThoonkBaseObject = function(name, thoonk) {
    EventEmitter.call(this);
    this.thoonk = thoonk;
    this.redis = this.thoonk.redis;
    this.name = name;
    //TODO: create feed if it doesn't exist
};

ThoonkBaseObject.prototype = Object.create(EventEmitter.prototype);
ThoonkBaseObject.constructor = ThoonkBaseObject;

(function() {

    this._build_event = function(eventtype) {
        return 'event.' + this.objtype + '.' + eventtype + ':' + this.name
    };

    this.handle_event = function(channel, msg) {
        //override this function in your object
    };

    this.init_subscribe = function(functions) {
        if(!this.thoonk.subscriptions.hasOwnProperty(this.name)) {
            this.thoonk.once('subscribed.' + this._build_event(this.subscribables[this.subscribables.length - 1]), function() {
                this.emit('subscribe_ready');
            }.bind(this));
            this.thoonk.subscriptions[this.name] = this.subscribables;
            for(var subscribable in this.subscribables) {
                this.thoonk.lredis.subscribe(this._build_event(this.subscribables[subscribable]));
            }
        }
        if(!this.subinitted) {
            for(var subscribable in this.subscribables) {
                this.thoonk.on(this._build_event(this.subscribables[subscribable]), this.handle_event.bind(this));
            }
            this.subinitted = true;
        }
    };

    this.runscript = function(scriptname, args, callback) {
        this.thoonk._runscript(this.objtype, scriptname, this.name, args, function(err, results) {
            console.log(scriptname);
            if(err) {
                console.log(scriptname, err);
            } else {
                if(callback) {
                    callback.apply(this, results);
                }
            };
        }.bind(this));
    };

}).call(ThoonkBaseObject.prototype);

exports.Thoonk = Thoonk;
exports.ThoonkBaseObject = ThoonkBaseObject;
