import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { sessionRedisCommand } from './rate-limit-stores';
import { jwtSecret } from './security-config';
export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_MAX_MS = 12 * 60 * 60_000;
type Record = { deviceId?: string; email: string; userId: number; version: number; hash: string; previous?: string; grace?: number; created: number; touched: number };
const memory = new Map<string, Record>();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const key = (sid: string) => (process.env.RATE_LIMIT_PREFIX ?? 'careops:') + 'session:' + sid;
const rotateScript = `
local text = redis.call('GET', KEYS[1])
if not text then return 0 end
local r = cjson.decode(text)
local now = tonumber(ARGV[3])
if r.created + tonumber(ARGV[4]) <= now or r.touched + tonumber(ARGV[5]) <= now then redis.call('DEL', KEYS[1]); return 0 end
if r.hash == ARGV[1] then
 r.previous = r.hash; r.grace = now + 15000; r.hash = ARGV[2]; r.touched = now
 redis.call('SET', KEYS[1], cjson.encode(r), 'PX', math.min(tonumber(ARGV[5]), r.created + tonumber(ARGV[4]) - now)); return 1
end
if r.previous == ARGV[1] then
 if r.grace >= now then return 2 end
 redis.call('DEL', KEYS[1])
end
return 0
`;
@Injectable()
export class RefreshSessions {
  private async command(...args: string[]) {
    try { return await sessionRedisCommand(...args); }
    catch { throw new ServiceUnavailableException('Session store unavailable'); }
  }
  private usesRedis() {
    if (!process.env.RATE_LIMIT_REDIS_URL && process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Session store unavailable');
    return !!process.env.RATE_LIMIT_REDIS_URL;
  }
  async create(user: { id: number; email: string; tokenVersion?: number }, deviceId?: string) {
    const sid = randomUUID(); const token = sid + '.' + randomBytes(32).toString('hex');
    const now = Date.now();
    const record: Record = { ...(deviceId ? { deviceId } : {}), userId: user.id, email: user.email, version: user.tokenVersion ?? 0, hash: digest(token), created: now, touched: now };
    if (this.usesRedis()) await this.command('SET', key(sid), JSON.stringify(record), 'PX', String(SESSION_IDLE_MS));
    else { for (const [id, r] of memory) if (r.touched + SESSION_IDLE_MS <= now || r.created + SESSION_MAX_MS <= now) memory.delete(id); memory.set(sid, record); }
    return { sid, refreshToken: token, record };
  }
  async get(sid: string) {
    if (!/^[a-f0-9-]{36}$/.test(sid)) return null;
    const text = this.usesRedis() ? await this.command('GET', key(sid)) : null;
    const record: Record | undefined = this.usesRedis() ? (text ? JSON.parse(String(text)) : undefined) : memory.get(sid);
    if (!record) return null;
    if (record.created + SESSION_MAX_MS <= Date.now() || record.touched + SESSION_IDLE_MS <= Date.now()) { await this.revoke(sid); return null; }
    return record;
  }
  async inspect(token: string) {
    if (!/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    const sid = token.split('.')[0]; const record = await this.get(sid); const hash = digest(token);
    if (!record || (record.hash !== hash && record.previous !== hash)) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    if (record.previous === hash && (record.grace ?? 0) < Date.now()) { await this.revoke(sid); throw new UnauthorizedException('Refresh token reused'); }
    return { sid, record };
  }
  async rotate(token: string, sid: string) {
    const next = sid + '.' + createHmac('sha256', jwtSecret()).update('careops-refresh:' + token).digest('hex');
    const now = Date.now(); const oldHash = digest(token); const nextHash = digest(next);
    let accepted = false;
    if (this.usesRedis()) accepted = Number(await this.command('EVAL', rotateScript, '1', key(sid), oldHash, nextHash, String(now), String(SESSION_MAX_MS), String(SESSION_IDLE_MS))) > 0;
    else {
      const r = memory.get(sid);
      if (r && r.created + SESSION_MAX_MS > now && r.touched + SESSION_IDLE_MS > now) {
        if (r.hash === oldHash) { r.previous = oldHash; r.grace = now + 15000; r.hash = nextHash; r.touched = now; accepted = true; }
        else if (r.previous === oldHash) { if ((r.grace ?? 0) >= now) accepted = true; else memory.delete(sid); }
      }
    }
    if (!accepted) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    return next;
  }
  async revoke(sid: string) { if (this.usesRedis()) await this.command('DEL', key(sid)); else memory.delete(sid); }
}
