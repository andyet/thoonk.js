var LoadConfig = require("./tests/testcore").LoadConfig;
var testnames = ['feeds', 'lists', 'jobs'];
var idx = 0;

function runtest(config) {
    if(idx >= testnames.length) {
        return;
    }
    var test = require("./tests/test_" + testnames[idx]).tests;
    process.stdout.write("Testing " + testnames[idx] );
    process.stdout.flush()
    idx++;
    test.config(config);
    test.start();
    test.on('done', runtest);
    test.done(2);
}

LoadConfig(function(config) {
    if(config) {
        runtest(config);
    } else {
        console.log("Config disabled... edit testconfig.json.\nRemember, the DB you select will be DESTROYED in testing.");
    }
});
