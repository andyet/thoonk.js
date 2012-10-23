local name = ARGV[1];

if redis.call('SISMEMBER', 'recurrings', name) ~= 0 then
    return {false, true};
end
return {false, false};
