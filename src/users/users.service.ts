import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';

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
