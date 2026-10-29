import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureSecurity } from './configure-security';
import { LoginDto } from '../auth/dto/login.dto';
import { validateSecurityEnvironment } from './security-config';

@Controller('auth')
class TestAuthController {
  @Post('login')
  login(@Body() body: LoginDto) {
    return { email: body.email };
  }
}

describe('HTTP security configuration', () => {
  let app: INestApplication;
  beforeEach(async () => {
    process.env.CORS_ORIGINS = 'https://frontend.example';
    process.env.NODE_ENV = 'production';
    delete process.env.TRUSTED_PROXIES;
    const module = await Test.createTestingModule({
      controllers: [TestAuthController],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    configureSecurity(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    delete process.env.NODE_ENV;
    delete process.env.CORS_ORIGINS;
  });
  const credentials = { email: 'a@example.com', password: 'valid-password' };

  it('sets API headers and allows only configured browser origins', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://frontend.example')
      .send(credentials)
      .expect(201);
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toContain(
      'max-age=31536000',
    );
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://frontend.example',
    );
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    const denied = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .send(credentials)
      .expect(201);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects invalid DTOs, extra fields and oversized bodies', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, role: 'admin' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: {}, password: [] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, password: 'x'.repeat(70000) })
      .expect(413);
  });

  it('limits auth attempts even with spoofed forwarded headers', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.' + i)
        .send(credentials)
        .expect(201);
    }
    const result = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(credentials)
      .expect(429);
    expect(result.headers['retry-after']).toBeDefined();
  });
});

describe('production configuration', () => {
  it('rejects missing secrets and incomplete production OTP configuration', () => {
    expect(() => validateSecurityEnvironment({})).toThrow('JWT_SECRET');
    expect(() =>
      validateSecurityEnvironment({
        JWT_SECRET: 'x'.repeat(32),
        NODE_ENV: 'production',
      }),
    ).toThrow('SMTP');
    expect(() =>
      validateSecurityEnvironment({
        JWT_SECRET: 'x'.repeat(32),
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://frontend.example',
        SMTP_HOST: 'smtp.example',
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        DB_SYNCHRONIZE: 'true',
      }),
    ).toThrow('migrations');
  });
});
