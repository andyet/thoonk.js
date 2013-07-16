var thoonk = require('../index').createClient();
var HelloWorld = require('./helloworld');

thoonk.registerInterface('HelloWorld', HelloWorld, function () {
    // All scripts have been loaded and event subscriptions initialized.

    var hello = thoonk.objects.HelloWorld();

    hello.greet('Arthur', 'Dent', function (err, result) {
        console.log(result);
        // >>> Hello, Arthur Dent
    });
});
