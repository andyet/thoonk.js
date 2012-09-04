local name, task, newtask = unpack(ARGV);

local score = redis.call('ZSCORE', 'recurring:'..name, task);
if(score ~= nil) then
    redis.call('ZADD', 'recurring:'..name, score, newtask);
    redis.call('ZREM', 'recurring:'..name, task);
    return {false, score};
else
    return {"NOTASK"};
end
