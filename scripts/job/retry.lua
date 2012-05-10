-- ARGV: name, id, time
if redis.call('srem', 'job.stalled:'..ARGV[1], ARGV[2]) == 0 then
    return false;
end
redis.call('lpush', 'job.ids:'..ARGV[1], ARGV[2]);
redis.call('zadd', 'job.published:'..ARGV[1], ARGV[3], ARGV[2]);
return true
