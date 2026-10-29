import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { OtpTokenEntity } from './entities/otp-token.entity';
import { Repository } from 'typeorm';

describe('AuthService security', () => {
  let service: AuthService;
  let rows: any[];
  let user: any;
  let sendOtpEmail: jest.Mock;
  let updatePassword: jest.Mock;
  let repository: any;
  process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-bytes';

  beforeEach(async () => {
    rows = [];
    user = {
      id: 1,
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      isActive: true,
      tokenVersion: 0,
      password: await bcrypt.hash('valid-password', 4),
    };
    sendOtpEmail = jest.fn().mockResolvedValue(undefined);
    updatePassword = jest.fn().mockResolvedValue({});
    repository = {
      findOne: jest.fn(async ({ where }) =>
        rows.find(
          (row) => row.email === where.email && row.purpose === where.purpose,
        ),
      ),
      save: jest.fn(async (row) => {
        if (!row.id) {
          row.id = rows.length + 1;
          rows.push(row);
        }
        return row;
      }),
      delete: jest.fn(async (where) => {
        const index = rows.findIndex(
          (row) =>
            row.email === where.email &&
            row.purpose === where.purpose &&
            row.otp === where.otp &&
            row.expiresAt > where.expiresAt.value,
        );
        if (index < 0) return { affected: 0 };
        rows.splice(index, 1);
        return { affected: 1 };
      }),
    };
    service = new AuthService(
      {
        findByEmail: async (email) => (email === user.email ? user : null),
        updatePassword,
      } as unknown as UsersService,
      { sendOtpEmail } as unknown as EmailService,
      repository as Repository<OtpTokenEntity>,
    );
  });

  async function login() {
    await service.login({ email: user.email, password: 'valid-password' });
    return sendOtpEmail.mock.calls.at(-1)[1];
  }

  async function remembered() {
    const otp = await login();
    return service.verifyLoginOtp({ email: user.email, otp, rememberDevice: true, userAgent: 'personal-browser' });
  }
  it('requires OTP before creating a remembered device, then skips OTP only with correct password', async () => {
    const initial = await remembered(); expect(initial.deviceToken).toBeTruthy();
    const deliveries = sendOtpEmail.mock.calls.length;
    await expect(service.login({ email: user.email, password: 'incorrect', deviceToken: initial.deviceToken, userAgent: 'personal-browser', rememberDevice: true })).rejects.toThrow();
    const next = await service.login({ email: user.email, password: 'valid-password', deviceToken: initial.deviceToken, userAgent: 'personal-browser', rememberDevice: true });
    expect('accessToken' in next).toBe(true); expect(sendOtpEmail.mock.calls.length).toBe(deliveries);
  });
  it('a new browser or another account cannot reuse OTP trust', async () => {
    const initial = await remembered(); const deliveries = sendOtpEmail.mock.calls.length;
    const result = await service.login({ email: user.email, password: 'valid-password', deviceToken: initial.deviceToken, userAgent: 'different-browser', rememberDevice: true });
    expect('accessToken' in result).toBe(false); expect(sendOtpEmail.mock.calls.length).toBe(deliveries + 1);
    const second = await service.verifyLoginOtp({ email: user.email, otp: sendOtpEmail.mock.calls.at(-1)[1], rememberDevice: true, userAgent: 'other-browser' });
    user.id = 555;
    const other = await service.login({ email: user.email, password: 'valid-password', deviceToken: second.deviceToken, userAgent: 'other-browser', rememberDevice: true });
    expect('accessToken' in other).toBe(false);
  });
  it('restores remembered access after session expiry, but explicit logout requires the password again', async () => {
    const initial = await remembered();
    const restored = await service.resumeDevice(initial.deviceToken, 'personal-browser'); expect(restored.user.id).toBe(user.id);
    await service.logout(restored.refreshToken, restored.deviceToken, 'personal-browser');
    await expect(service.resumeDevice(restored.deviceToken, 'personal-browser')).rejects.toThrow();
    const next = await service.login({ email: user.email, password: 'valid-password', deviceToken: restored.deviceToken, userAgent: 'personal-browser', rememberDevice: true });
    expect('accessToken' in next).toBe(true);
  });
  it('does not remember by default and unchecking removes existing trust', async () => {
    const initial = await remembered();
    const result = await service.login({ email: user.email, password: 'valid-password', deviceToken: initial.deviceToken, userAgent: 'personal-browser', rememberDevice: false });
    expect('accessToken' in result).toBe(true); expect('deviceToken' in result).toBe(false);
    await expect(service.resumeDevice(initial.deviceToken, 'personal-browser')).rejects.toThrow();
    const otp = await login(); const plain = await service.verifyLoginOtp({ email: user.email, otp }); expect(plain.deviceToken).toBeUndefined();
  });
  it('forgetting a remembered device revokes linked refresh sessions', async () => {
    const initial = await remembered(); await service.forgetDevice(initial.deviceToken, 'personal-browser', initial.refreshToken);
    await expect(service.refresh(initial.refreshToken)).rejects.toThrow();
    await expect(service.resumeDevice(initial.deviceToken, 'personal-browser')).rejects.toThrow();
  });
  it('password changes and disabling accounts invalidate remembered entry', async () => {
    const initial = await remembered(); user.tokenVersion++;
    await expect(service.resumeDevice(initial.deviceToken, 'personal-browser')).rejects.toThrow();
    const next = await remembered(); user.isActive = false;
    await expect(service.resumeDevice(next.deviceToken, 'personal-browser')).rejects.toThrow();
  });

  it('refreshes current permissions and rejects disabled accounts', async () => {
    const otp = await login(); const initial = await service.verifyLoginOtp({ email: user.email, otp });
    user.role = 'manager'; user.departmentId = 18;
    const next = await service.refresh(initial.refreshToken);
    expect(next.user.role).toBe('manager'); expect(next.user.departmentId).toBe(18);
    expect(next.sessionExpiresAt).toBe(initial.sessionExpiresAt);
    user.isActive = false; await expect(service.refresh(next.refreshToken)).rejects.toThrow();
  });
  it('invalidates renewal after a password/token-version change', async () => {
    const otp = await login(); const initial = await service.verifyLoginOtp({ email: user.email, otp });
    user.tokenVersion++; await expect(service.refresh(initial.refreshToken)).rejects.toThrow();
  });
  it('revokes the server session on logout', async () => {
    const otp = await login(); const initial = await service.verifyLoginOtp({ email: user.email, otp });
    await service.logout(initial.refreshToken); await expect(service.refresh(initial.refreshToken)).rejects.toThrow();
  });

  it('stores only an OTP digest and issues expiring typed tokens', async () => {
    const otp = await login();
    expect(otp).toMatch(/^[0-9]{6}$/);
    expect(rows[0].otp).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].otp).not.toBe(otp);
    const result = await service.verifyLoginOtp({ email: user.email, otp });
    const access = jwt.verify(
      result.accessToken,
      process.env.JWT_SECRET!,
    ) as jwt.JwtPayload;

    expect(access.type).toBe('access');
    expect(access.exp! - access.iat!).toBe(900);
    expect(result.refreshToken).toMatch(/^[a-f0-9-]{36}\.[a-f0-9]{64}$/);
    expect(result.sessionExpiresAt).toBeGreaterThan(Date.now() + 43100000);
    expect(access.tokenVersion).toBe(0);
  });

  it('rejects wrong, expired, and reused OTPs', async () => {
    const otp = await login();
    await expect(
      service.verifyLoginOtp({ email: user.email, otp: 'wrong' }),
    ).rejects.toThrow();
    rows[0].expiresAt = new Date(Date.now() - 1);
    await expect(
      service.verifyLoginOtp({ email: user.email, otp }),
    ).rejects.toThrow();
    rows[0].expiresAt = new Date(Date.now() + 60000);
    await service.verifyLoginOtp({ email: user.email, otp });
    await expect(
      service.verifyLoginOtp({ email: user.email, otp }),
    ).rejects.toThrow();
  });

  it('allows only one concurrent redemption', async () => {
    const otp = await login();
    const results = await Promise.allSettled(
      [1, 2].map(() => service.verifyLoginOtp({ email: user.email, otp })),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
  });

  it('rejects a disabled user after OTP delivery', async () => {
    const otp = await login();
    user.isActive = false;
    await expect(
      service.verifyLoginOtp({ email: user.email, otp }),
    ).rejects.toThrow();
  });

  it('keeps login and reset OTP purposes separate', async () => {
    const otp = await login();
    await expect(
      service.resetPassword({
        email: user.email,
        otp,
        newPassword: 'new-password',
      }),
    ).rejects.toThrow();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('awaits password persistence and propagates failures', async () => {
    await service.forgotPassword({ email: user.email });
    const otp = sendOtpEmail.mock.calls.at(-1)[1];
    updatePassword.mockRejectedValueOnce(new Error('database failed'));
    await expect(
      service.resetPassword({
        email: user.email,
        otp,
        newPassword: 'new-password',
      }),
    ).rejects.toThrow('database failed');
  });

  it('returns the same recovery response for unknown and eligible accounts', async () => {
    const valid = await service.forgotPassword({ email: user.email });
    const unknown = await service.forgotPassword({
      email: 'unknown@example.com',
    });
    expect(valid.message).toBe(unknown.message);
    expect(sendOtpEmail).toHaveBeenCalledTimes(1);
  });

  it('uses identical credential errors for unknown users and wrong passwords', async () => {
    await expect(
      service.login({
        email: 'unknown@example.com',
        password: 'valid-password',
      }),
    ).rejects.toThrow('Invalid email or password');
    await expect(
      service.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toThrow('Invalid email or password');
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });
  it('invalidates pending login OTPs after a password change', async () => {
    const otp = await login();
    user.tokenVersion++;
    await expect(
      service.verifyLoginOtp({ email: user.email, otp }),
    ).rejects.toThrow();
  });
});
