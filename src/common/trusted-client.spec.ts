import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, createHmac } from 'node:crypto';
import request from 'supertest';
import { configureSecurity } from './configure-security';
import { redisStores, redisReconnectDelay } from './rate-limit-stores';

@Controller('auth')
class ForwardedAuthController {
  @Post('login') login(@Body() body: { email: string }) {
    return { email: body.email };
  }
}
const secret = 'separate-bff-secret-with-more-than-32-bytes';
const proof = (
  ip: string,
  path = '/api/auth/login',
  at = String(Date.now()),
) => ({
  'X-CareOps-Client-IP': ip,
  'X-CareOps-Forwarded-At': at,
  'X-CareOps-Forwarded-Signature': createHmac('sha256', secret)
    .update(JSON.stringify(['POST', path, ip, at]))
    .digest('hex'),
});
describe('Authenticated client IP forwarding', () => {
  let app: INestApplication;
  let ready: boolean;
  beforeEach(async () => {
    process.env.BFF_PROXY_SECRET = secret;
    const module = await Test.createTestingModule({
      controllers: [ForwardedAuthController],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    ready = true;
    configureSecurity(app, undefined, () => ready);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    delete process.env.BFF_PROXY_SECRET;
  });
  it('reports unavailable readiness and blocks requests until the store recovers', async () => {
    await request(app.getHttpServer()).get('/health/ready').expect(200);
    ready = false;
    await request(app.getHttpServer()).get('/health/ready').expect(503);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(proof('203.0.113.1'))
      .send({ email: 'a@example.test' })
      .expect(503);
    ready = true;
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(proof('203.0.113.1'))
      .send({ email: 'a@example.test' })
      .expect(201);
  });
  it('rejects forged or stale assertions and does not trust X-Forwarded-For', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.1')
      .send({ email: 'a@example.test' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(proof('203.0.113.1', '/api/other'))
      .send({ email: 'a@example.test' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(proof('203.0.113.1', undefined, String(Date.now() - 60000)))
      .send({ email: 'a@example.test' })
      .expect(403);
  });
  it('separates users behind Next and enforces the same verified-IP bucket', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set(proof('203.0.113.1'))
        .set('X-Forwarded-For', `198.51.100.${i}`)
        .send({ email: `user${i}@example.test` })
        .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(proof('203.0.113.1'))
      .send({ email: 'eleventh@example.test' })
      .expect(429);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(proof('203.0.113.2'))
      .send({ email: 'other@example.test' })
      .expect(201);
    expect(response.headers['x-careops-backend']).toBe('nest-v1');
  });
});
describe('Redis rate limit stores', () => {
  it('uses bounded reconnect backoff instead of giving up', () => {
    expect(redisReconnectDelay(0)).toBeGreaterThanOrEqual(250);
    expect(redisReconnectDelay(100)).toBeLessThanOrEqual(5250);
    expect(redisReconnectDelay(100)).toBeGreaterThanOrEqual(5000);
  });
  it('shares counters across worker store instances and separates the three limiters', async () => {
    const counts = new Map<string, number>();
    const send = async (...args: string[]): Promise<any> => {
      if (args[0] === 'SCRIPT')
        return createHash('sha1').update(args[2]).digest('hex');
      if (args[0] === 'EVALSHA') {
        const count = (counts.get(args[3]) ?? 0) + 1;
        counts.set(args[3], count);
        return [count, Number(args[4])];
      }
      throw new Error('Unexpected Redis command');
    };
    const first = redisStores(send, 'isolated-test:');
    const second = redisStores(send, 'isolated-test:');
    for (const store of [...Object.values(first), ...Object.values(second)])
      await store.init?.({ windowMs: 60000 } as any);
    expect((await first.authIp.increment('203.0.113.1')).totalHits).toBe(1);
    expect((await second.authIp.increment('203.0.113.1')).totalHits).toBe(2);
    expect((await first.api.increment('203.0.113.1')).totalHits).toBe(1);
    expect((await first.authEmail.increment('203.0.113.1')).totalHits).toBe(1);
  });
  it('does not bypass limits on store errors', async () => {
    const stores = redisStores(async () => {
      throw new Error('Redis offline');
    });
    await expect(
      stores.api.init?.({ windowMs: 60000 } as any),
    ).rejects.toThrow();
  });
});
