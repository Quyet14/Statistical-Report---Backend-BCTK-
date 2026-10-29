import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { trustedClientMiddleware, type ClientRequest } from './trusted-client';
import type { RateLimitStores } from './rate-limit-stores';
import { createHash } from 'node:crypto';

export function configureSecurity(
  app: INestApplication,
  stores?: RateLimitStores,
  ready: () => boolean = () => true,
) {
  const expressApp = app as NestExpressApplication;
  expressApp.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-CareOps-Backend', 'nest-v1');
    next();
  });
  // Trust only explicitly configured proxy IPs/CIDRs, never arbitrary forwarded headers.
  expressApp.set(
    'trust proxy',
    process.env.TRUSTED_PROXIES?.split(',')
      .map((ip) => ip.trim())
      .filter(Boolean) ?? false,
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      strictTransportSecurity:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.url === '/health/ready')
      return res.status(ready() ? 200 : 503).json({ ready: ready() });
    if (!ready())
      return res.status(503).json({ message: 'Rate limit store unavailable' });
    next();
  });
  app.use(trustedClientMiddleware(process.env.BFF_PROXY_SECRET));
  expressApp.useBodyParser('json', { limit: '64kb' });
  expressApp.useBodyParser('urlencoded', { limit: '64kb', extended: false });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      store: stores?.api,
      keyGenerator: (req: ClientRequest) =>
        ipKeyGenerator(
          req.careopsClientIp ??
            req.ip ??
            req.socket.remoteAddress ??
            'unknown',
        ),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      passOnStoreError: false,
    }),
  );
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 60_000,
      limit: 10,
      store: stores?.authIp,
      keyGenerator: (req: ClientRequest) =>
        ipKeyGenerator(
          req.careopsClientIp ??
            req.ip ??
            req.socket.remoteAddress ??
            'unknown',
        ),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      passOnStoreError: false,
      skip: (req) => req.method === 'GET' || req.method === 'OPTIONS',
    }),
  );
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 5 * 60_000,
      limit: 10,
      store: stores?.authEmail,

      standardHeaders: 'draft-8',
      legacyHeaders: false,
      passOnStoreError: false,
      skip: (req) =>
        req.method === 'GET' ||
        req.method === 'OPTIONS' ||
        typeof req.body?.email !== 'string',
      keyGenerator: (req) =>
        createHash('sha256')
          .update(String(req.body.email).trim().toLowerCase())
          .digest('hex'),
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
}
