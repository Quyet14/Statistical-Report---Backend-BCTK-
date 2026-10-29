import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request, Response, NextFunction } from 'express';

export type ClientRequest = Request & { careopsClientIp?: string };
export function trustedClientMiddleware(secret?: string) {
  if (secret && Buffer.byteLength(secret) < 32)
    throw new Error('BFF_PROXY_SECRET must contain at least 32 bytes');
  return (req: ClientRequest, res: Response, next: NextFunction) => {
    if (!secret) return next();
    const ip = req.get('X-CareOps-Client-IP') ?? '';
    const at = req.get('X-CareOps-Forwarded-At') ?? '';
    const supplied = req.get('X-CareOps-Forwarded-Signature') ?? '';
    if (
      !isIP(ip) ||
      !/^\d+$/.test(at) ||
      Math.abs(Date.now() - Number(at)) > 30000 ||
      !/^[a-f0-9]{64}$/.test(supplied)
    )
      return res.status(403).json({ message: 'Untrusted frontend proxy' });
    const message = JSON.stringify([req.method, req.originalUrl, ip, at]);
    const expected = createHmac('sha256', secret).update(message).digest();
    if (!timingSafeEqual(Buffer.from(supplied, 'hex'), expected))
      return res.status(403).json({ message: 'Untrusted frontend proxy' });
    req.careopsClientIp = ip;
    next();
  };
}
