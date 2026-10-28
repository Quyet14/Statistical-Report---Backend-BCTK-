import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

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
        process.env.JWT_SECRET || 'bctk-super-secret-key',
      );
      if (
        typeof verified === 'string' ||
        verified.type === 'refresh' ||
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
    if (!user || !user.isActive)
      throw new UnauthorizedException('Tài khoản không còn hoạt động');
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
