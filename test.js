var thoonk_module = require("./thoonk");
var thoonk = new thoonk_module.Thoonk();
var happy = thoonk.feed("happy", {'type': 'feed'});
happy.once("ready", function () {
    console.log(thoonk.feeds);
    happy.subscribe(function(id, msg) {
        console.log("happy -> [" + id + "]: " + msg);
    });
    happy.publish("neehaw");
    happy.publish("neehaw2");
    happy.publish("neehaw3");
    happy.publish("neehaw4");
    happy.publish("neehaw5");
    happy.publish("neehaw6");
});

