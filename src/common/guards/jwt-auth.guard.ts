import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { jwtSecret } from '../security-config';
import { RefreshSessions } from '../refresh-sessions';
import { TrustedDevices } from '../trusted-devices';

export type AuthenticatedUser = {
  id: number;
  sub: number;
  name: string;
  email: string;
  role: UserEntity['role'];
  departmentId: number | null;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authorization = req.headers.authorization;
    if (
      typeof authorization !== 'string' ||
      !/^Bearer\s+/i.test(authorization)
    ) {
      throw new UnauthorizedException('Cần đăng nhập');
    }
    let payload: jwt.JwtPayload;
    try {
      const verified = jwt.verify(
        authorization.replace(/^Bearer\s+/i, ''),
        jwtSecret(),
        { algorithms: ['HS256'] },
      );
      if (
        typeof verified === 'string' ||
        verified.type !== 'access' ||
        typeof verified.exp !== 'number' ||
        !Number.isInteger(Number(verified.sub)) ||
        Number(verified.sub) <= 0
      ) {
        throw new Error('Invalid access token');
      }
      payload = verified;
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    // Tokens establish identity; current database values establish permissions.
    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOneBy({ id: Number(payload.sub) });
    if (
      !user ||
      !user.isActive ||
      payload.tokenVersion !== (user.tokenVersion ?? 0)
    )
      throw new UnauthorizedException('Tài khoản không còn hoạt động');
    if (payload.sid !== undefined) {
      if (typeof payload.sid !== 'string') throw new UnauthorizedException('Invalid session');
      const session = await new RefreshSessions().get(payload.sid);
      if (!session || session.userId !== user.id || session.version !== (user.tokenVersion ?? 0)) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
      if (session.deviceId) { const device = await new TrustedDevices().get(session.deviceId); if (!device || device.userId !== user.id || device.version !== (user.tokenVersion ?? 0)) throw new UnauthorizedException('Thiết bị không còn được ghi nhớ'); }
    }
    req.user = {
      id: user.id,
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId ?? null,
    } satisfies AuthenticatedUser;
    return true;
  }
}
