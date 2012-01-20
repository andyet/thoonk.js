--name
return redis.call('zcount', 'feed.ids:'..ARGV[1], '-inf', '+inf')
