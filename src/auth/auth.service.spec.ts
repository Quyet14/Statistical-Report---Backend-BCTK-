import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';

describe('AuthService OTP flow', () => {
  let service: AuthService;
  let otpRepository: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    otpRepository = {
      save: jest.fn(async (dto) => dto),
      findOne: jest.fn(async () => ({
        id: 1,
        email: 'admin@example.com',
        otp: '123456',
        purpose: 'login',
        expiresAt: new Date(Date.now() + 600000),
        createdAt: new Date(),
      })),
      delete: jest.fn(async () => ({ affected: 1 })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(async (email: string) => {
              if (email === 'admin@example.com') {
                return {
                  id: 1,
                  email: 'admin@example.com',
                  password: '123456',
                  name: 'Admin',
                  role: 'admin',
                };
              }
              return null;
            }),
            updatePassword: jest.fn(
              async (email: string, password: string) => ({
                email,
                password,
              }),
            ),
          },
        },
        {
          provide: 'OTP_TOKEN_REPOSITORY',
          useValue: otpRepository,
        },
        {
          provide: EmailService,
          useValue: {
            sendOtpEmail: jest.fn(async () => ({ ok: true })),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<AuthService>(AuthService);
  });

  it('should send OTP for a valid login request and persist it', async () => {
    const result = await service.login({
      email: 'admin@example.com',
      password: '123456',
    });
    expect(result.message).toContain('OTP');
    expect(result.email).toBe('admin@example.com');
    expect(otpRepository.save).toHaveBeenCalledTimes(1);
    expect(otpRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@example.com',
        purpose: 'login',
      }),
    );
  });

  it('should verify OTP and return access token', async () => {
    await service.login({ email: 'admin@example.com', password: '123456' });
    const otp = '123456';
    const result = await service.verifyLoginOtp({
      email: 'admin@example.com',
      otp,
    });

    expect(result.accessToken).toBeDefined();
    expect(result.user.email).toBe('admin@example.com');
  });

  it('should reset password after valid OTP', async () => {
    await service.login({ email: 'admin@example.com', password: '123456' });
    const otp = '123456';
    const result = await service.resetPassword({
      email: 'admin@example.com',
      otp,
      newPassword: '654321',
    });

    expect(result.message).toContain('đổi mật khẩu');
  });
});
