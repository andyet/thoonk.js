var thoonkmodule = require('./thoonk');

var Feed = function(name, thoonk) {
    thoonkmodule.ThoonkBaseObject.call(this, name, thoonk);
    this.subscribables = ['publish', 'edit', 'retract'];
    this.subinitted = false;
};

Feed.prototype = thoonkmodule.ThoonkBaseObject.prototype;
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
        } else if (eventname == 'retract') {
            this.emit('retract', msg);
        }
    };

    this.create = function(config, callback) {
        config = JSON.stringify(config);
        return this.runscript('create', [config], callback);
    };

    this.config = function(config, callback) {
        config = JSON.stringify(config);
        return this.runscript('config', [config], callback);
    };

    this.publish = function(item, id, callback) {
        if(id == undefined || id == null) {
            id = uuid();
        };
        return this.runscript('publish', [id, item, Date.now().toString()], callback);
    };

    this.retract = function(id, callback) {
        return this.runscript('retract', [id], callback);
    };

    this.get = function(id, callback) {
        return this.runscript('get', [id], callback);
    };

    this.getIds = function(callback) {
        return this.runscript('getids', [], callback);
    };

    this.getAll = function(callback) {
        return this.runscript('getall', [], function(err, result) {
            callback(err, JSON.parse(result));
        });
    };

    this.length = function(callback) {
        return this.runscript('length', [], callback);
    };

    this.hasId = function(id, callback) {
        return this.runscript('hasid', [id], function(err, result) {
            callback(err, Boolean(result));
        });
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

exports.Feed = Feed;
