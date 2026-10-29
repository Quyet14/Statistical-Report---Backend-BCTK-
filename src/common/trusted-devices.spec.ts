import { TrustedDevices, DEVICE_MAX_MS } from './trusted-devices';
process.env.JWT_SECRET = 'test-only-trusted-device-secret-at-least-32-bytes';
describe('Personal remembered devices', () => {
  let now: number; let store: TrustedDevices; let previous: string | undefined;
  const user = { id: 777, email: 'device@example.invalid', tokenVersion: 4 };
  beforeEach(() => { previous = process.env.RATE_LIMIT_REDIS_URL; delete process.env.RATE_LIMIT_REDIS_URL; now = Date.now(); jest.spyOn(Date, 'now').mockImplementation(() => now); store = new TrustedDevices(); });
  afterEach(() => { jest.restoreAllMocks(); if(previous === undefined) delete process.env.RATE_LIMIT_REDIS_URL; else process.env.RATE_LIMIT_REDIS_URL = previous; });
  it('stores a digest and binds trust to the browser for exactly 30 days', async () => {
    const device = await store.create(user, 'browser-one');
    expect(device.record.hash).not.toBe(device.token); expect(device.record.agent).not.toBe('browser-one');
    expect(device.record.expires - now).toBe(30 * 24 * 60 * 60000);
    expect(await store.inspect(device.token, 'browser-two')).toBeNull();
    expect((await store.inspect(device.token, 'browser-one'))?.record.version).toBe(4);
  });
  it('rotates concurrently without extending the original expiry and rejects replay', async () => {
    const device = await store.create(user, 'browser');
    const next = await Promise.all([store.change(device.token, 'browser', 'resume'), store.change(device.token, 'browser', 'resume')]);
    expect(next[0]?.token).toBe(next[1]?.token); expect(next[0]?.token).not.toBe(device.token);
    expect(next[0]?.record.expires).toBe(device.record.expires);
    now += 15001; expect(await store.inspect(device.token, 'browser')).toBeNull();
    expect(await store.get(device.id)).toBeNull();
  });
  it('logout disables automatic entry but keeps password-based OTP trust', async () => {
    const device = await store.create(user, 'browser');
    await store.change(device.token, 'browser', 'disable');
    expect((await store.inspect(device.token, 'browser'))?.record.autoLogin).toBe(false);
    expect(await store.change(device.token, 'browser', 'resume')).toBeNull();
    const next = await store.change(device.token, 'browser', 'login', true);
    expect(next?.record.autoLogin).toBe(true);
  });
  it('forgetting or expiry removes device authorization', async () => {
    const device = await store.create(user, 'browser');
    await store.change(device.token, 'browser', 'forget'); expect(await store.get(device.id)).toBeNull();
    const later = await store.create(user, 'browser'); now += DEVICE_MAX_MS;
    expect(await store.inspect(later.token, 'browser')).toBeNull();
  });
});
