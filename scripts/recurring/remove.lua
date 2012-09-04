local name, task = unpack(ARGV);

if (redis.call('ZREM', 'recurring:'..name, task) ~= 0) then
    return {false};
else
    return {"NOTASK"};
end
