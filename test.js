var thoonk_module = require("./thoonk");
var thoonk = new thoonk_module.Thoonk();
var happy_feed = thoonk.feed("happy", {'type': 'feed'});
happy_feed.subscribe(function(id, msg) {
    console.log("happy -> [" + id + "]: " + msg);
});
happy_feed.publish("neehaw");
happy_feed.publish("neehaw2");
happy_feed.publish("neehaw3");
happy_feed.publish("neehaw4");
happy_feed.publish("neehaw5");
happy_feed.publish("neehaw6");
console.log(thoonk.feeds)

