var redis = require('node-redis'),
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
        console.log(channel, "==>", msg);
        msg = msg.toString();
        this.emit(channel, channel, msg);
    }.bind(this));

    this.lredis.on('subscribe', function(channel) {
        console.log('subscribed.' + channel);
        this.emit('subscribed.' + channel);
    }.bind(this));

    this.scripts = {};
    this.shas = {};

    this.instance = uuid();

    this.subscriptions = {};

    this.objects = {};

    //read scripts
    /*
    scriptdir = fs.readdirSync(__dirname + '/scripts/');
    scriptdir.forEach(function(objname, didx, scriptdir) {
        console.log(objname);
    }.bind(this));
    */

};

Thoonk.prototype = EventEmitter.prototype;
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
        console.log('//////', dir);
        this.scripts[theobject.prototype.objtype] = {};
        this.shas[theobject.prototype.objtype] = {}
        var curdir = fs.readdirSync(dir);
        curdir.forEach(function(filename, fidx, curdir) {
            if(path.extname(filename) == '.lua') {
                var verbname = path.basename(filename).slice(0,-4);
                console.log('  ', verbname, theobject.prototype.objtype)
                this.scripts[theobject.prototype.objtype][verbname] = fs.readFileSync(dir + '/' + filename).toString();
                var last = (fidx + 1 == curdir.length);
                this.redis.sendCommand('SCRIPT', ['LOAD', this.scripts[theobject.prototype.objtype][verbname]], function(err, reply) {
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

    this.subscribe = function(name, functions) {
    };

    this.unsubscribe = function() {
    };

    this.create = function() {
    };

    this._runscript = function(objtype, scriptname, feedname, args, callback) {
        args = [this.shas[objtype][scriptname], '0', feedname].concat(args);
        this.redis.sendCommand('EVALSHA', args, callback);
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

ThoonkBaseObject.prototype = EventEmitter.prototype;
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
    
    this.subscribe = function() {
    };

    this.unsubscribe = function() {
    };

    this.runscript = function(scriptname, args, callback) {
        this.thoonk._runscript(this.objtype, scriptname, this.name, args, callback);
    };

}).call(ThoonkBaseObject.prototype);

var Feed = function(name, thoonk) {
    ThoonkBaseObject.call(this, name, thoonk);
    this.subscribables = ['publish', 'edit', 'retract'];
    this.subinitted = false;
};

Feed.prototype = ThoonkBaseObject.prototype;
Feed.prototype.constructor = Feed;
Feed.prototype.objtype = 'feed';
Feed.prototype.scriptdir = __dirname + '/scripts/feed';

(function() {
    //continue extending the Feed prototype

    this.handle_event = function(channel, msg) {
        //overridden
        var objsplit = channel.split(':');
        var typesplit = objsplit[0].split('.');
        var eventname = typesplit[2];
        if(eventname == 'publish') {
            var msgsplit = msg.split('\x00');
            //pulish, id, item
            this.emit('publish', msgsplit[0], msgsplit[1]);
            this.emit('publishid:' + msgsplit[0], msgsplit[0], msgsplit[1]);
        }
        console.log("override", this.name, "got", channel, msg);
    };

    this.publish = function(item, id, callback) {
        if(id == undefined || id == null) {
            id = uuid();
        };
        return this.runscript('publish', [id, item, Date.now().toString()], callback);
    };

    this.retract = function() {
    };

    this.get = function() {
    };

}).call(Feed.prototype);


var Deck = function() {
};

Deck.prototype = (function() {
})();

var Job = function() {
};

Job.prototype = (function() {
})();

exports.Thoonk = Thoonk;
exports.Feed = Feed;
