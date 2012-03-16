return {"crap", true};

--if redis.call('zrank', 'feed.ids:'..ARGV[1], ARGV[2]) == 0 then
--    return {false, false};
--else
--    return {false, true};
--end
