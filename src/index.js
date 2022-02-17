import Redis from 'redis-tag-cache';
import crypto from 'crypto';

const defaultVersion = crypto.randomBytes(15).toString('hex')

export default function RedisCache (options) {
  const client = new Redis(options.redisConfig);
  
  return {
    async invoke({ route, context, render, getTags }) {
      const version = options.version || defaultVersion
      const hostname = context.req.hostname

      const key = `${ version }:page:${ hostname }${ route }`;
      const cachedResponse = await client.get(key);

      if (cachedResponse) {
        return cachedResponse;
      }

      const content = await render();
      const tags = getTags();

      if (!tags.length) {
        return content;
      }

      // We could add "await" here, but saving content in cache doesn't have to block the request
      client.set(
        key,
        content,
        tags
      );

      return content;
    },

    invalidate({ tags }) {
      const clearAll = tags.includes('*');

      if (!clearAll) {
        return client.invalidate(...tags)
      }

      return new Promise((resolve, reject) => {
        const prefix = `${options.redis.keyPrefix || ''}tags:`;
        const stream = client.redis.scanStream({ match: `${prefix}*` });

        const tags = [];

        stream.on('data', rawTags => tags.push(...rawTags.map(tag => tag.replace(prefix, ''))));
        stream.on('end', async () => {
          if (tags.length) {
            await client.invalidate(...tags);
          }
          resolve();
        });
        stream.on('error', reject);
      });
    }
  };
};
