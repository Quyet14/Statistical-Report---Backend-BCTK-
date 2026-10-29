import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomUUID, randomBytes } from 'node:crypto';
import { sessionRedisCommand } from './rate-limit-stores';
import { jwtSecret } from './security-config';
export const DEVICE_MAX_MS = 30 * 24 * 60 * 60_000;
type Device = { userId: number; email: string; version: number; agent: string; hash: string; previous?: string; grace?: number; autoLogin: boolean; expires: number };
const memory = new Map<string, Device>();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const key = (id: string) => (process.env.RATE_LIMIT_PREFIX ?? 'careops:') + 'device:' + id;
const mutation = `
local text = redis.call('GET', KEYS[1]); if not text then return '' end
local r = cjson.decode(text); local now = tonumber(ARGV[3]);
if r.expires <= now then redis.call('DEL', KEYS[1]); return '' end
if r.agent ~= ARGV[4] then return '' end
if r.hash ~= ARGV[1] then
 if r.previous ~= ARGV[1] then return '' end
 if r.grace < now then redis.call('DEL', KEYS[1]); return '' end
end
if ARGV[5] == 'forget' then redis.call('DEL', KEYS[1]); return 'forgotten' end
if ARGV[5] == 'resume' and not r.autoLogin then return '' end
if ARGV[5] == 'disable' then r.autoLogin = false
else
 if r.hash == ARGV[1] then r.previous = r.hash; r.grace = now + 15000; r.hash = ARGV[2] end
 if ARGV[6] ~= 'preserve' then r.autoLogin = ARGV[6] == 'true' end
end
local result = cjson.encode(r); redis.call('SET', KEYS[1], result, 'PX', r.expires - now); return result
`;
@Injectable()
export class TrustedDevices {
  private redis() { if (!process.env.RATE_LIMIT_REDIS_URL && process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Device store unavailable'); return !!process.env.RATE_LIMIT_REDIS_URL; }
  private async command(...args: string[]) { try { return await sessionRedisCommand(...args); } catch { throw new ServiceUnavailableException('Device store unavailable'); } }
  async create(user: { id: number; email: string; tokenVersion?: number }, agent: string) {
    const id = randomUUID(); const token = id + '.' + randomBytes(32).toString('hex');
    const record: Device = { userId: user.id, email: user.email, version: user.tokenVersion ?? 0, agent: hash(agent), hash: hash(token), autoLogin: true, expires: Date.now() + DEVICE_MAX_MS };
    if (this.redis()) await this.command('SET', key(id), JSON.stringify(record), 'PX', String(DEVICE_MAX_MS));
    else { for (const [old, r] of memory) if(r.expires <= Date.now()) memory.delete(old); memory.set(id, record); }
    return { id, token, record };
  }
  async get(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) return null;
    const value = this.redis() ? await this.command('GET', key(id)) : null;
    const record: Device | undefined = this.redis() ? (value ? JSON.parse(String(value)) : undefined) : memory.get(id);
    if (!record || record.expires <= Date.now()) return null;
    return record;
  }
  async inspect(token: string | undefined, agent: string) {
    if (!token || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) return null;
    const id = token.split('.')[0]; const record = await this.get(id); const value = hash(token);
    if (!record || record.agent !== hash(agent) || (record.hash !== value && record.previous !== value)) return null;
    if (record.previous === value && (record.grace ?? 0) < Date.now()) { await this.revoke(id); return null; }
    return { id, record };
  }
  async change(token: string, agent: string, action: 'resume' | 'login' | 'disable' | 'forget', autoLogin?: boolean) {
    const proof = await this.inspect(token, agent); if (!proof) return null;
    const next = proof.id + '.' + createHmac('sha256', jwtSecret()).update('careops-device:' + token).digest('hex');
    const now = Date.now(); const oldHash = hash(token); const newHash = hash(next); let record: Device | null = null;
    if (this.redis()) {
      const result = await this.command('EVAL', mutation, '1', key(proof.id), oldHash, newHash, String(now), hash(agent), action, autoLogin === undefined ? 'preserve' : String(autoLogin));
      if (result && result !== 'forgotten') record = JSON.parse(String(result));
    } else {
      const r = memory.get(proof.id);
      if (r && r.expires > now && (r.hash === oldHash || (r.previous === oldHash && (r.grace ?? 0) >= now))) {
        if (action === 'forget') memory.delete(proof.id);
        else if (action !== 'resume' || r.autoLogin) {
          if (action === 'disable') r.autoLogin = false;
          else { if (r.hash === oldHash) { r.previous = r.hash; r.grace = now + 15000; r.hash = newHash; } if(autoLogin !== undefined) r.autoLogin = autoLogin; }
          record = r;
        }
      }
    }
    return record ? { id: proof.id, token: next, record } : null;
  }
  async revoke(id: string) { if (this.redis()) await this.command('DEL', key(id)); else memory.delete(id); }
}
