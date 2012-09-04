local name, task = unpack(ARGV);

local score = redis.call('ZSCORE', 'recurring:'..name, task);
if(score ~= nil) then
    return {false, score};
else
    return {"NOTASK"};
end
