import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';
import type { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async onModuleInit() {
    const defaultUsers: Array<{
      name: string;
      email: string;
      password: string;
      role: 'admin' | 'manager' | 'staff';
    }> = [];

    for (const defaultUser of defaultUsers) {
      const existingUser = await this.findByEmail(defaultUser.email);
      if (!existingUser) {
        await this.usersRepository.save(
          this.usersRepository.create(defaultUser),
        );
      }
    }

    const storedUsers = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .getMany();
    for (const user of storedUsers) {
      if (user.password && !user.password.startsWith('$2')) {
        user.password = await bcrypt.hash(user.password, 12);
        await this.usersRepository.save(user);
      }
    }
  }

  findAll() {
    return this.usersRepository.find();
  }

  findVisible(viewer: AuthenticatedUser) {
    if (viewer.role === 'admin') return this.findAll();
    const where =
      viewer.role === 'manager' && viewer.departmentId != null
        ? { departmentId: viewer.departmentId }
        : { id: viewer.id };
    return this.usersRepository.find({ where, order: { name: 'ASC' } });
  }

  findManaged(viewer: AuthenticatedUser) {
    if (viewer.role === 'admin') return this.findAll();
    if (viewer.role !== 'manager')
      throw new ForbiddenException('Bạn không có quyền quản lý nhân viên');
    if (viewer.departmentId == null) return Promise.resolve([]);
    return this.usersRepository.find({
      where: { departmentId: viewer.departmentId, role: 'staff' },
      order: { name: 'ASC' },
    });
  }

  async findVisibleOne(id: number, viewer: AuthenticatedUser) {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    if (
      viewer.role === 'admin' ||
      viewer.id === id ||
      (viewer.role === 'manager' &&
        viewer.departmentId != null &&
        user.departmentId != null &&
        Number(user.departmentId) === Number(viewer.departmentId))
    )
      return user;
    throw new ForbiddenException('Bạn không có quyền xem tài khoản này');
  }

  async updateInDepartment(
    id: number,
    dto: UpdateUserDto,
    viewer: AuthenticatedUser,
  ) {
    if (viewer.role !== 'manager' || viewer.departmentId == null)
      throw new ForbiddenException('Bạn không có quyền quản lý tài khoản này');
    const keys = Object.keys(dto);
    if (keys.some((key) => !['name', 'email', 'isActive'].includes(key)))
      throw new ForbiddenException(
        'Trưởng khoa chỉ được sửa họ tên, email và trạng thái nhân viên',
      );
    if (!keys.length)
      throw new BadRequestException('Chưa có thông tin cập nhật');
    if (
      keys.includes('name') &&
      (typeof dto.name !== 'string' || !dto.name.trim())
    )
      throw new BadRequestException('Họ tên không hợp lệ');
    if (
      keys.includes('email') &&
      (typeof dto.email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email))
    )
      throw new BadRequestException('Email không hợp lệ');
    if (keys.includes('isActive') && typeof dto.isActive !== 'boolean')
      throw new BadRequestException('Trạng thái tài khoản không hợp lệ');
    const scope = {
      id,
      departmentId: viewer.departmentId,
      role: 'staff' as const,
    };
    const user = await this.usersRepository.findOneBy(scope);
    if (!user || user.id === viewer.id)
      throw new ForbiddenException(
        'Chỉ được quản lý nhân viên thuộc khoa/phòng của mình',
      );
    const updates: Partial<UserEntity> = {};
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const existing = await this.usersRepository.findOneBy({ email });
      if (existing && existing.id !== id)
        throw new ConflictException('Email đã tồn tại');
      updates.email = email;
    }
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;
    // Keep the scope in the write itself if an admin moves/promotes the target concurrently.
    const result = await this.usersRepository.update(scope, updates);
    if (!result.affected)
      throw new ForbiddenException('Tài khoản không còn thuộc phạm vi quản lý');
    return this.usersRepository.findOneBy(scope);
  }

  findOne(id: number) {
    return this.usersRepository.findOneBy({ id });
  }

  findByEmail(email: string) {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .getOne();
  }

  async create(dto: CreateUserDto) {
    if (await this.findByEmail(dto.email)) {
      throw new ConflictException('Email đã tồn tại');
    }

    const newUser = this.usersRepository.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      password: await bcrypt.hash(dto.password, 12),
      role: dto.role ?? 'staff',
      branchId: dto.branchId,
      departmentId: dto.departmentId,
    });

    return this.usersRepository.save(newUser);
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.findOne(id);
    if (!user) return null;

    if (dto.email && dto.email.toLowerCase() !== user.email.toLowerCase()) {
      const existingUser = await this.findByEmail(dto.email);
      if (existingUser) throw new ConflictException('Email đã tồn tại');
    }

    Object.assign(
      user,
      dto,
      dto.email ? { email: dto.email.toLowerCase() } : {},
      dto.password ? { password: await bcrypt.hash(dto.password, 12) } : {},
    );
    return this.usersRepository.save(user);
  }

  async updatePassword(email: string, newPassword: string) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    user.password = await bcrypt.hash(newPassword, 12);
    return this.usersRepository.save(user);
  }

  async remove(id: number) {
    const result = await this.usersRepository.delete(id);
    return { deleted: result.affected === 1 };
  }
}
