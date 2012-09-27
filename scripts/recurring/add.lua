local name, task, curtime = unpack(ARGV)
local timeout = redis.call('HGET', 'recurring.config:'..name, 'timeout');
local score = redis.call('ZSCORE', 'recurring:'..name, task);
if(score == false) then
    redis.call('ZADD', 'recurring:'..name, curtime, task);
    return {false, task, curtime}
else
    return {"ALREADY EXISTS", task, score}
end
