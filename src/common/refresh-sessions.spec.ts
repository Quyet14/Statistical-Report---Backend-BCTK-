import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { DataSource } from 'typeorm';
import { RefreshSessions, SESSION_IDLE_MS, SESSION_MAX_MS } from './refresh-sessions';
process.env.JWT_SECRET = 'test-only-session-secret-at-least-32-bytes';
describe('Refresh session lifecycle', () => {
  let now: number; let sessions: RefreshSessions; let previous: string | undefined;
  beforeEach(() => { previous = process.env.RATE_LIMIT_REDIS_URL; delete process.env.RATE_LIMIT_REDIS_URL; now = Date.now(); jest.spyOn(Date, 'now').mockImplementation(() => now); sessions = new RefreshSessions(); });
  afterEach(() => { jest.restoreAllMocks(); if (previous === undefined) delete process.env.RATE_LIMIT_REDIS_URL; else process.env.RATE_LIMIT_REDIS_URL = previous; });
  const user = { id: 71, email: 'session@example.invalid', tokenVersion: 3 };
  it('rotates once and tolerates concurrent tabs for 15 seconds', async () => {
    const initial = await sessions.create(user);
    const next = await Promise.all([sessions.rotate(initial.refreshToken, initial.sid), sessions.rotate(initial.refreshToken, initial.sid)]);
    expect(next[0]).toBe(next[1]); expect(next[0]).not.toBe(initial.refreshToken);
    expect((await sessions.inspect(next[0])).record.version).toBe(3);
  });
  it('detects reuse after grace and revokes the whole session', async () => {
    const initial = await sessions.create(user); const next = await sessions.rotate(initial.refreshToken, initial.sid);
    now += 15001;
    await expect(sessions.inspect(initial.refreshToken)).rejects.toThrow();
    await expect(sessions.inspect(next)).rejects.toThrow();
    expect(await sessions.get(initial.sid)).toBeNull();
  });
  it('expires after 30 minutes without renewal', async () => {
    const initial = await sessions.create(user); now += SESSION_IDLE_MS;
    await expect(sessions.inspect(initial.refreshToken)).rejects.toThrow();
  });
  it('renews beyond 15 minutes and enforces the 12-hour absolute deadline', async () => {
    const initial = await sessions.create(user); let token = initial.refreshToken;
    for (let elapsed = 20 * 60000; elapsed < SESSION_MAX_MS; elapsed += 20 * 60000) {
      now = initial.record.created + elapsed; await sessions.inspect(token); token = await sessions.rotate(token, initial.sid);
    }
    now = initial.record.created + SESSION_MAX_MS;
    await expect(sessions.inspect(token)).rejects.toThrow();
  });
  it('rejects an otherwise valid access token after server logout', async () => {
    const initial = await sessions.create(user);
    const token = jwt.sign({ sub: user.id, sid: initial.sid, type: 'access', tokenVersion: 3 }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '15m' });
    const db = { getRepository: () => ({ findOneBy: async () => ({ ...user, isActive: true, role: 'manager', name: 'Head', departmentId: 7 }) }) } as unknown as DataSource;
    const guard = new JwtAuthGuard(db);
    const request = { headers: { authorization: 'Bearer ' + token } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;
    expect(await guard.canActivate(context)).toBe(true);
    await sessions.revoke(initial.sid); await expect(guard.canActivate(context)).rejects.toThrow();
  });
  it('rejects tampering without revoking an unrelated valid token', async () => {
    const initial = await sessions.create(user);
    await expect(sessions.inspect(initial.sid + '.' + '0'.repeat(64))).rejects.toThrow();
    expect((await sessions.inspect(initial.refreshToken)).sid).toBe(initial.sid);
    await sessions.revoke(initial.sid); await expect(sessions.inspect(initial.refreshToken)).rejects.toThrow();
  });
});
