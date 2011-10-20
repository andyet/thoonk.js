var Thoonk = require("../thoonk").Thoonk;
var thoonk = new Thoonk();
var testjob = thoonk.job('testjob2');
var idx = 0;
var getit = function() {
        //console.log('x')
        testjob.get(0, function(err, item, gid) {
            //console.log(item);
            testjob.finish(gid, function(err, fid) {
                process.nextTick(getit);
            });
        });
};
testjob.once("ready", function() {
    getit();
});
