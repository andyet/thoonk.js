-- ARGV: name, id
if redis.call('zrem', 'feed.claimed:'..ARGV[1], ARGV[2]) == 0 then
    return false
end
redis.call('hincrby', 'feed.cancelled:'..ARGV[1], ARGV[2], 1)
redis.call('lpush', 'feed.ids:'..ARGV[1], ARGV[2])
return true
