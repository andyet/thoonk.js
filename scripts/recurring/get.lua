-- ARGV: name, curtime
local name, curtime = unpack(ARGV);

local r = redis.call('zrevrange', 'recurring:'..name, 0, 0, 'WITHSCORES');
if(#r == 2) then
    if(r[2] > curtime) then
        return {"NOTYET", false, r[2]};
    else
        local timeout = redis.call('HGET', 'recurring.config:'..name, 'timeout');
        redis.call('ZADD', 'recurring:'..name, curtime + timeout, r[1]);
        return {false, r[1], r[2]};
    end
else
    return {"EMPTY"};
end
