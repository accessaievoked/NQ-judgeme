import IORedis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var redisGlobal: IORedis | undefined;
}

function createConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is not set");
  }
  // BullMQ requires this exact setting on the connection it's given.
  return new IORedis(url, { maxRetriesPerRequest: null });
}

const redis = global.redisGlobal ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  global.redisGlobal = redis;
}

export default redis;
