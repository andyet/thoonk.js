var async = require('async');
var fs = require('fs');
var path = require('path');
var redis = require('redis');
var uuid = require('node-uuid');
var EventEmitter = require('events').EventEmitter;


var Thoonk = function (config) {
    EventEmitter.call(this);
    this.setMaxListeners(1000);

    var self = this;

    config = config || {};

    this.host = config.host || 'localhost';
    this.port = config.port || 6379;
    this.logger = config.logger || console;

    this.redis = redis.createClient(this.port, this.host);
    this.lredis = redis.createClient(this.port, this.host);
    this.ready = false;

    this.lredis.on('message', function _message(channel, msg) {
        msg = msg.toString();
        self.emit(channel, channel, msg);
    });

    this.lredis.on('subscribe', function _subscribed(channel) {
        self.emit('subscribed.' + channel);
    });

    this.instance = uuid();

    this.scripts = {};
    this.shas = {};
    this.subscriptions = {};
    this.subCounts = {};
    this.objects = {};
    this._blocking = {};
};

Thoonk.prototype = Object.create(EventEmitter.prototype);
Thoonk.prototype.constructor = Thoonk;

(function () {
    this.quit = function () {
        this.redis.quit();
        this.lredis.quit();
        for (var key in this._blocking) {
            if (this._blocking[key] && this._blocking[key].quit) {
                this._blocking[key].quit();
            }
        }
    };

    this.unsubscribeInstance = function (sub) {
        this.subCounts--;
        if (this.subCounts < 1) {
            for (var sidx in this.subscriptions[sub]) {
                this.lredis.unsubscribe(this.subscriptions[sub][sidx]);
            }
        }
        delete this.subscriptions[sub];
        delete this.subCounts[sub];
    };

    this.registerType = function (name, Model, type, cb) {
        var self = this;

        if (typeof type == 'undefined' || type == 'object') {
            this.objects[name] = function ModelFactory(name) {
                return new Model(name, self);
            };
        } else if (type == 'interface') {
            this.objects[name] = function () {
                return new Model(self);
            };
        }

        var dir = Model.prototype.scriptdir;
        var curdir = fs.readdirSync(dir);
        var modelType = Model.prototype.objtype;

        this.scripts[modelType] = {};
        this.shas[modelType] = {};

        curdir = curdir.filter(function _filterDir(fname) { 
            return fname.substr(-4) == '.lua'; 
        });

        async.each(curdir, function _loadScript(filename, next) {
            if (path.extname(filename) != '.lua') next();

            var verbName = path.basename(filename).slice(0, -4);
            var script = fs.readFileSync(dir + '/' + filename).toString();

            self.scripts[modelType][verbName] = script;
            self.redis.send_command('SCRIPT', ['LOAD', script], function _loaded(err, reply) {
                if (err) return next('Could not load ' + verbName + ': ' + err);

                self.shas[modelType][verbName] = reply.toString();

                next();
            });
        }, function (err) {
            if (err) {
                self.logger.error(err);
                cb(err);
            } else {
                self.emit('loaded.' + name);
                cb(false);
            }
        });
    };

    this.registerInterface = function (name, Model, cb) {
        return this.registerType(name, Model, 'interface', cb);
    };

    this._runScript = function (objtype, scriptName, feedName, args, cb) {
        args = [this.shas[objtype][scriptName], '0', feedName].concat(args);
        this.redis.send_command('EVALSHA', args, cb);
    };
    
    this._runScriptSingle = function (objtype, scriptName, args, cb) {
        args = [this.shas[objtype][scriptName], '0'].concat(args);
        this.redis.send_command('EVALSHA', args, cb);
    };

    this._getBlockingRedis = function (name) {
        if (this._blocking[name]) return this._blocking[name];

        this._blocking[name] = redis.createClient(this.port, this.host);

        return this._blocking[name];
    };
}).call(Thoonk.prototype);


module.exports = Thoonk;
