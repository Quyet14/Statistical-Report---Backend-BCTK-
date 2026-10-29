export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (
    !secret ||
    Buffer.byteLength(secret) < 32 ||
    secret === 'bctk-super-secret-key'
  ) {
    throw new Error(
      'JWT_SECRET must contain at least 32 bytes of random secret material',
    );
  }
  return secret;
}

export function validateSecurityEnvironment(env: Record<string, unknown>) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('Set JWT_SECRET to a random secret of at least 32 bytes');
  }
  if (env.NODE_ENV === 'production') {
    if (
      !env.CORS_ORIGINS ||
      env.OTP_ENABLED === 'false' ||
      !env.SMTP_HOST ||
      !env.SMTP_USER ||
      !env.SMTP_PASS
    ) {
      throw new Error(
        'Production requires CORS_ORIGINS and enabled SMTP OTP delivery',
      );
    }
    if (env.DB_SYNCHRONIZE === 'true') {
      throw new Error('Use reviewed database migrations in production');
    }
  }
  if (env.NODE_ENV === 'production') {
    if (
      typeof env.BFF_PROXY_SECRET !== 'string' ||
      Buffer.byteLength(env.BFF_PROXY_SECRET) < 32 ||
      env.BFF_PROXY_SECRET === secret
    )
      throw new Error(
        'Production requires an independent BFF_PROXY_SECRET of at least 32 bytes',
      );
    if (
      typeof env.RATE_LIMIT_REDIS_URL !== 'string' ||
      !/^rediss?:\/\//.test(env.RATE_LIMIT_REDIS_URL)
    )
      throw new Error('Production requires RATE_LIMIT_REDIS_URL');
  }
  return env;
}
