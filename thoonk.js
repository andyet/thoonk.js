var redis = require('redis'),
    fs = require('fs'),
    path = require('path'),
    EventEmitter = require("events").EventEmitter,
    uuid = require('node-uuid');

var Thoonk = function(host, port) {
    EventEmitter.call(this);


    this.host = host || 'localhost';
    this.port = port || 6379;
    this.redis = redis.createClient(this.port, this.host);
    this.lredis = redis.createClient(this.port, this.host);
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

    this.registerType = function(objname, theobject, callback, type) {
        if(typeof type == 'undefined' || type == 'object') {
            this.objects[objname] = function(name) {
                return new theobject(name, this);
            }.bind(this);
        } else if (type == 'interface') {
            this.objects[objname] = function() {
                return new theobject(this);
            }.bind(this);
        }
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

    this.registerInterface = function(objname, theobject, callback) {
        return this.registerType(objname, theobject, callback, 'interface');
    };

    this._runscript = function(objtype, scriptname, feedname, args, callback) {
        args = [this.shas[objtype][scriptname], '0', feedname].concat(args);
        this.redis.send_command('EVALSHA', args, callback);
    };
    
    this._runscriptsingle = function(objtype, scriptname, args, callback) {
        args = [this.shas[objtype][scriptname], '0'].concat(args);
        this.redis.send_command('EVALSHA', args, callback);
    };

    this.feed = function(name, config) {
        return new Feed(name);
    };

}).call(Thoonk.prototype);


var Subscription = function(thoonkobject, instance, event_handler) {
    EventEmitter.call(this);
    this.thoonk = thoonkobject.thoonk;
    this.instance = instance;
    this.objtype = thoonkobject.objtype;
    this.thoonkobject = thoonkobject;
    this.sub = this.objtype + '::' + this.instance;
    this.subscribables = thoonkobject.subscribables;
    this.init_subscribe(event_handler);
};

Subscription.prototype = Object.create(EventEmitter.prototype);
Subscription.prototype.constructor = Subscription;

(function() {

    this._build_event = function(eventtype) {
        if(this.instance) {
            return 'event.' + this.objtype + '.' + eventtype + ':' + this.instance;
        } else {
            return 'event.' + this.objtype + '.' + eventtype;
        }
    };

    this._parse_channel = function(channel) {
        if(this.instance) {
            return channel.split(':')[0].split('.')[2];
        } else {
            return channel.split('.')[2];
        }
    };
    
    this.init_subscribe = function(event_handler) {
        if(!this.thoonk.subscriptions.hasOwnProperty(this.sub)) {
            this.thoonk.once('subscribed.' + this._build_event(this.subscribables[this.subscribables.length - 1]), function() {
                this.emit('subscribe_ready');
            }.bind(this));
            this.thoonk.subscriptions[this.sub] = this.subscribables;
            for(var subscribable in this.subscribables) {
                if(!this.thoonk.lredis.subscription_set['sub ' + this._build_event(this.subscribables[subscribable])]) {
                    this.thoonk.lredis.subscribe(this._build_event(this.subscribables[subscribable]));
                }
            }
        } else {
            this.emit('subscribe_ready');
        }
        if(!this.subinitted) {
            for(var subscribable in this.subscribables) {
                if(typeof event_handler != "undefined") {
                    this.thoonk.on(this._build_event(this.subscribables[subscribable]), event_handler);
                }
                this.thoonk.on(this._build_event(this.subscribables[subscribable]), this.handle_event.bind(this));
            }
            this.subinitted = true;
        }
    };
    
    this.handle_event = function(channel, msg) {
        if (this.thoonkobject.handle_event) {
            this.thoonkobject.handle_event.apply(this, arguments);
        } else {
            this.emit(this._parse_channel(channel), msg);
            this.emit('all', this._parse_channel(channel), msg);
        }
    };

}).call(Subscription.prototype);


var ThoonkBaseObject = function(name, thoonk) {
    EventEmitter.call(this);
    this.thoonk = thoonk;
    this.redis = this.thoonk.redis;
    this.name = name;
    this.subscription = null;
    //TODO: create feed if it doesn't exist
};

ThoonkBaseObject.prototype = Object.create(EventEmitter.prototype);
ThoonkBaseObject.constructor = ThoonkBaseObject;

(function() {

    this.handle_event = function(channel, msg) {
        //override this function in your object
    };

    this.init_subscribe = function(callback) {
        this.subscription = new Subscription(this, this.name, this.handle_event.bind(this));
        this.subscription.once("subscribe_ready", function() {
            this.emit("subscribe_ready");
            if(callback) {
                callback(false, this.subscription);
            }
        }.bind(this));
    };

    this.runscript = function(scriptname, args, callback) {
        this.thoonk._runscript(this.objtype, scriptname, this.name, args, function(err, results) {
            results =results.concat(['crap']);
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


var ThoonkBaseInterface = function(thoonk) {
    EventEmitter.call(this);
    this.thoonk = thoonk;
    this.redis = this.thoonk.redis;
};

ThoonkBaseInterface.prototype = Object.create(EventEmitter.prototype);
ThoonkBaseInterface.constructor = ThoonkBaseInterface;

(function() {
    this.handle_event = function(channel, msg) {
        //override this function in your object
    };

    this.getEmitter = function(instance, event_handler, callback) {
        var emitter = new Subscription(this, instance, event_handler);
        if(callback) {
            emitter.once('subscribe_ready', function() {
                callback(false, emitter);
            }.bind(this));
        }
        return emitter;
    };

    this.runscript = function(scriptname, args, callback) {
        this.thoonk._runscriptsingle(this.objtype, scriptname, args, function(err, results) {
            if(err) {
                console.log(scriptname, err);
            } else {
                if(callback) {
                    callback.apply(this, results);
                }
            };
        }.bind(this));
    };
}).call(ThoonkBaseInterface.prototype);

exports.Thoonk = Thoonk;
exports.ThoonkBaseObject = ThoonkBaseObject;
exports.ThoonkBaseInterface = ThoonkBaseInterface;

exports.createClient = function(host, port) {
    return new Thoonk(host, port);
};
