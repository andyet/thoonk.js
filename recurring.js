var thoonkmodule = require('./thoonk');

var Recurring = function(name, thoonk) {
    thoonkmodule.ThoonkBaseObject.call(this, name, thoonk);
    this.subscribables = [];
    this.subinitted = false;
};

Recurring.prototype = Object.create(thoonkmodule.ThoonkBaseObject.prototype);
Recurring.prototype.constructor = Recurring;
Recurring.prototype.objtype = 'recurring';
Recurring.prototype.scriptdir = __dirname + '/scripts/recurring';

(function() {

    //config should have {timeout: seconds}
    this.create = function(config, callback) {
        config = JSON.stringify(config);
        return this.runscript('create', [config], callback);
    };

    this.exists = function(callback) {
        return this.runscript('exists', [], callback);
    };

    this.add = function(task, callback) {
        return this.runscript('add', [task, Date.now().toString()], callback);
    };
    
    this.get = function(callback) {
        return this.runscript('get', [Date.now().toString()], callback);
    };
    
    this.remove = function(task, callback) {
        return this.runscript('remove', [task], callback);
    };

    this.update = function(task, newtask, callback) {
        return this.runscript('update', [task, newtask], callback);
    };

    this.peek = function(task, callback) {
        return this.runscript('peek', [task], callback);
    };

    this.length = function(callback) {
        return this.runscript('length', [], callback);
    };
    
    this.behind = function(callback) {
        return this.runscript('behind', [Date.now().toString()], callback);
    };

}).call(Recurring.prototype);

exports.Recurring = Recurring;
