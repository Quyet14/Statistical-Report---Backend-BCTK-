import { TrustedDevices } from './trusted-devices';
import { connectRateLimitStores } from './rate-limit-stores';
import { randomUUID } from 'node:crypto';
const run = process.env.RUN_REDIS_INTEGRATION === 'true' ? describe : describe.skip;
run('Remembered device Redis', () => {
  it('rotates across workers and disables/revokes remembered entry atomically', async () => {
    const previousUrl = process.env.RATE_LIMIT_REDIS_URL; const previousPrefix = process.env.RATE_LIMIT_PREFIX;
    process.env.RATE_LIMIT_REDIS_URL = process.env.REDIS_INTEGRATION_URL ?? 'redis://127.0.0.1:16379'; process.env.RATE_LIMIT_PREFIX = 'careops:device-test:' + randomUUID() + ':';
    process.env.JWT_SECRET ||= 'test-only-trusted-device-secret-at-least-32-bytes';
    const connection = await connectRateLimitStores(); const first = new TrustedDevices(); const second = new TrustedDevices(); let id: string | undefined;
    try {
      const initial = await first.create({ id: 31, email: 'redis-device@example.invalid', tokenVersion: 2 }, 'browser'); id = initial.id;
      const results = await Promise.all([first.change(initial.token, 'browser', 'resume'), second.change(initial.token, 'browser', 'resume')]);
      expect(results[0]?.token).toBe(results[1]?.token);
      const token = results[0]!.token; await first.change(token, 'browser', 'disable');
      expect(await second.change(token, 'browser', 'resume')).toBeNull();
      const renewed = await second.change(token, 'browser', 'login', true); expect(renewed?.record.autoLogin).toBe(true);
      await first.change(renewed!.token, 'browser', 'forget'); expect(await second.get(id)).toBeNull();
    } finally { if(id) await first.revoke(id); await connection.close(); if(previousUrl === undefined) delete process.env.RATE_LIMIT_REDIS_URL; else process.env.RATE_LIMIT_REDIS_URL = previousUrl; if(previousPrefix === undefined) delete process.env.RATE_LIMIT_PREFIX; else process.env.RATE_LIMIT_PREFIX = previousPrefix; }
  }, 20000);
});
