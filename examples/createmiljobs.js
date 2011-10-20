var Thoonk = require("../thoonk").Thoonk;
var thoonk = new Thoonk();
var testjob = thoonk.job('testjob2');
var idx = 0;
var publishit = function() {
        idx++;
        //console.log('x')
        testjob.publish(idx, function(err, item, id) {
            if(idx < 2000000) {
                if(!(idx % 1000)) {
                   console.log(idx);
                  console.log('------');
                }
                process.nextTick(publishit);
            } else {
                console.log("done");
                thoonk.quit();
            }
        });
};
testjob.once("ready", function() {
    publishit();
});
