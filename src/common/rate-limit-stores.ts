import { Logger } from '@nestjs/common';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { randomInt } from 'node:crypto';
import type { Store } from 'express-rate-limit';

let activeSessionCommand: ((...args: string[]) => Promise<any>) | undefined;
export async function sessionRedisCommand(...args: string[]) {
  if (!activeSessionCommand) throw new Error('Session Redis unavailable');
  return activeSessionCommand(...args);
}
export type RateLimitStores = { api: Store; authIp: Store; authEmail: Store };
export function redisStores(
  sendCommand: (...args: string[]) => Promise<any>,
  prefix = 'careops:',
): RateLimitStores {
  return {
    api: new RedisStore({ sendCommand, prefix: `${prefix}api:` }),
    authIp: new RedisStore({ sendCommand, prefix: `${prefix}auth-ip:` }),
    authEmail: new RedisStore({ sendCommand, prefix: `${prefix}auth-email:` }),
  };
}
export function redisReconnectDelay(attempt: number) {
  return Math.min(250 * 2 ** Math.min(attempt, 5), 5000) + randomInt(0, 251);
}
export async function connectRateLimitStores() {
  const url = process.env.RATE_LIMIT_REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Production requires RATE_LIMIT_REDIS_URL');
    return { stores: undefined, ready: () => true, close: async () => {} };
  }
  const client = createClient({
    url,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 1000,
    socket: { connectTimeout: 5000, reconnectStrategy: redisReconnectDelay },
  });
  let lastErrorLog = 0;
  client.on('error', () => {
    if (Date.now() - lastErrorLog >= 15000) {
      lastErrorLog = Date.now();
      Logger.error(
        'Rate limit Redis unavailable; requests fail closed while reconnecting',
        'RateLimit',
      );
    }
  });
  client.on('ready', () => {
    if (lastErrorLog)
      Logger.log('Rate limit Redis connection restored', 'RateLimit');
    lastErrorLog = 0;
  });
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => {
        startupTimer = setTimeout(
          () => reject(new Error('Redis startup timeout')),
          10000,
        );
      }),
    ]);
  } catch {
    if (client.isOpen) client.destroy();
    throw new Error(
      'Cannot initialize rate limit Redis within startup deadline',
    );
  } finally {
    clearTimeout(startupTimer);
  }
  const sendCommand = async (...args: string[]) => {
    if (!client.isReady) throw new Error('Rate limit store unavailable');
    return client.sendCommand(args, { timeout: 3000 });
  };
  activeSessionCommand = sendCommand;
  return {
    stores: redisStores(
      sendCommand,
      process.env.RATE_LIMIT_PREFIX ?? 'careops:',
    ),
    ready: () => client.isReady,
    close: async () => {
      activeSessionCommand = undefined;
      if (!client.isOpen) return;
      if (client.isReady) await client.close();
      else client.destroy();
    },
  };
}
