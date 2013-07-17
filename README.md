# Thoonk

## What is Thoonk?

Thoonk is a persistent (and fast!) framework for Redis backed live data and 
objects, such as push feeds, queues, and jobs.

Thoonk lets you create a Model whose methods are mapped to Redis Lua scripts,
and can listen for and emit events using Redis pubsub channels. 

Since all of the actual logic for the model is written in Lua, Thoonk wrappers
for other languages can be written which can interoperate with `thoonk.js`, 
such as the Python version `thoonk.py`.


## Installing

    npm install thoonk

By itself, Thoonk is just a small framework for marshalling and setting up
subscriptions and loading Lua scripts into Redis. To see Thoonk in action
you will want to look at the examples for how to build a Thoonk backed model.


## Example

First, we create our model definition in `examples/helloworld.js`:

```js
var ThoonkInterface = require('thoonk').ThoonkBaseInterface;


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
```

Then we create the Lua script we need in `examples/scripts/greet.lua`:

```lua
local firstName, lastName = unpack(ARGV);

return "Hello, " .. firstName .. " " .. lastName;
```

And finally, when we want to use our HelloWorld model:

```js
var thoonk = require('thoonk').createClient();
var HelloWorld = require('helloworld');

thoonk.registerInterface('HelloWorld', HelloWorld, function () {
    // All scripts have been loaded and event subscriptions initialized.

    var hello = thoonk.objects.HelloWorld();

    hello.greet('Arthur', 'Dent', function (err, result) {
        if (err) {
            console.error(err);
        } else {
            console.log(result);
            // >>> Hello, Arthur Dent
        }
    });
});
```

## Addons

- [Thoonk Jobs](https://github.com/fritzy/thoonk-jobs.js) - A Thoonk-based Redis job system


## License

MIT


## Created By

If you like this, follow: [@fritzy](http://twitter.com/fritzy) on twitter.
