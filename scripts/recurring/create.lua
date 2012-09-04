--name, config
local name = ARGV[1];
local config = cjson.decode(ARGV[2]);

if redis.call('SADD', 'recurrings', name) ~= 0 then
    for key, value in pairs(config) do
        redis.call('HSET', 'recurring.config:'..name, key, value);
    end
    return {false};
end
return {"Recurring already exists"};
