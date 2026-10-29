import { RefreshSessions } from './refresh-sessions';
import { connectRateLimitStores } from './rate-limit-stores';
import { randomUUID } from 'node:crypto';
const run = process.env.RUN_REDIS_INTEGRATION === 'true' ? describe : describe.skip;
run('Refresh session Redis atomic rotation', () => {
  it('shares state across workers, handles parallel refresh and revokes replay', async () => {
    const previousUrl = process.env.RATE_LIMIT_REDIS_URL; const previousPrefix = process.env.RATE_LIMIT_PREFIX;
    const realNow = Date.now(); let now = realNow;
    process.env.RATE_LIMIT_REDIS_URL = process.env.REDIS_INTEGRATION_URL ?? 'redis://127.0.0.1:16379';
    process.env.RATE_LIMIT_PREFIX = 'careops:session-test:' + randomUUID() + ':';
    process.env.JWT_SECRET ||= 'test-only-session-secret-at-least-32-bytes';
    const connection = await connectRateLimitStores();
    const first = new RefreshSessions(); const second = new RefreshSessions(); let sid: string | undefined;
    try {
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      const session = await first.create({ id: 19, email: 'redis-session@example.invalid', tokenVersion: 0 }); sid = session.sid;
      const next = await Promise.all([first.rotate(session.refreshToken, sid), second.rotate(session.refreshToken, sid)]);
      expect(next[0]).toBe(next[1]); expect((await second.inspect(next[0])).record.userId).toBe(19);
      now += 16000; await expect(first.inspect(session.refreshToken)).rejects.toThrow();
      await expect(second.inspect(next[0])).rejects.toThrow();
    } finally {
      jest.restoreAllMocks(); if(sid) await first.revoke(sid); await connection.close();
      if(previousUrl === undefined) delete process.env.RATE_LIMIT_REDIS_URL; else process.env.RATE_LIMIT_REDIS_URL = previousUrl;
      if(previousPrefix === undefined) delete process.env.RATE_LIMIT_PREFIX; else process.env.RATE_LIMIT_PREFIX = previousPrefix;
    }
  }, 20000);
});
