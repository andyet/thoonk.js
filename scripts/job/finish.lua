-- ARGV: name, id, result
if redis.call('zrem', 'job.claimed:'..ARGV[1], ARGV[2]) == 0 then
    return false;
end
redis.call('hdel', 'job.cancelled:'..ARGV[1], ARGV[2])
redis.call('zrem', 'job.published:'..ARGV[1], ARGV[2])
redis.call('incr', 'job.finishes:'..ARGV[1])
if ARGV[3] then
    redis.call('publish', 'job.finish:'..ARGV[1], ARGV[2].."\0"..ARGV[3])
end
redis.call('hdel', 'job.items:'..ARGV[1], ARGV[2])
return true
