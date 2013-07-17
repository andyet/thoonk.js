var ThoonkInterface = require('../index').ThoonkBaseInterface;


function HelloWorld(thoonk) {
    // Link the HelloWorld object to a thoonk connection.
    ThoonkInterface.call(this, thoonk);
}

HelloWorld.prototype = Object.create(ThoonkInterface.prototype);

// Set a unique type name for our HelloWorld model
HelloWorld.prototype.objtype = 'helloworld'; 

// Specify where to load Lua scripts from for our model
HelloWorld.prototype.scriptdir = __dirname + '/scripts';

(function () {

    this.greet = function (firstName, lastName, cb) {
        this.runScript('greet', [firstName, lastName], cb);
    };

}).call(HelloWorld.prototype);


module.exports = HelloWorld;
