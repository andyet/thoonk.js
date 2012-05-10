-- ARGV: name, id
if redis.call('zrem', 'job.claimed:'..ARGV[1], ARGV[2]) == 0 then
    return false
end
redis.call('hincrby', 'job.cancelled:'..ARGV[1], ARGV[2], 1)
redis.call('lpush', 'job.ids:'..ARGV[1], ARGV[2])
return true
