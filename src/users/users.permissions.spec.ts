import { plainToInstance } from 'class-transformer';
import { UpdateUserDto } from './dto/update-user.dto';
import { INestApplication } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';
import { DepartmentsController } from '../departments/departments.controller';
import { DepartmentsService } from '../departments/departments.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';

describe('Department employee management permissions (HTTP)', () => {
  let app: INestApplication;
  let people: Array<Record<string, any>>;
  let repository: Record<string, jest.Mock>;
  let beforeUpdate: (() => void) | null;
  const secret = 'test-only-secret-with-at-least-32-bytes';
  process.env.JWT_SECRET = secret;
  const bearer = (id: number, role = 'admin', departmentId = 999) =>
    `Bearer ${jwt.sign({ sub: id, role, departmentId, type: 'access', tokenVersion: 0 }, secret, { expiresIn: '15m' })}`;
  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  beforeEach(async () => {
    beforeUpdate = null;
    people = [
      {
        id: 1,
        name: 'Admin',
        email: 'admin@example.test',
        role: 'admin',
        departmentId: null,
        isActive: true,
      },
      {
        id: 2,
        name: 'Head A',
        email: 'head@example.test',
        role: 'manager',
        departmentId: 10,
        isActive: true,
      },
      {
        id: 3,
        name: 'Staff A',
        email: 'a@example.test',
        role: 'staff',
        departmentId: 10,
        isActive: true,
      },
      {
        id: 4,
        name: 'Staff B',
        email: 'b@example.test',
        role: 'staff',
        departmentId: 20,
        isActive: true,
      },
      {
        id: 5,
        name: 'Other Head A',
        email: 'other-head@example.test',
        role: 'manager',
        departmentId: 10,
        isActive: true,
      },
      {
        id: 6,
        name: 'Admin A',
        email: 'admin-a@example.test',
        role: 'admin',
        departmentId: 10,
        isActive: true,
      },
      {
        id: 7,
        name: 'Disabled A',
        email: 'disabled@example.test',
        role: 'staff',
        departmentId: 10,
        isActive: false,
      },
      {
        id: 8,
        name: 'Unassigned head',
        email: 'unassigned@example.test',
        role: 'manager',
        departmentId: null,
        isActive: true,
      },
    ];
    repository = {
      find: jest.fn(async (options: any = {}) =>
        people
          .filter((row) => matches(row, options.where))
          .map((row) => ({ ...row })),
      ),
      findOneBy: jest.fn(async (where: any) => {
        const row = people.find((person) => matches(person, where));
        return row ? { ...row } : null;
      }),
      update: jest.fn(async (where: any, data: any) => {
        beforeUpdate?.();
        const row = people.find((person) => matches(person, where));
        if (!row) return { affected: 0 };
        const version = typeof data.tokenVersion === 'function' ? (row.tokenVersion ?? 0) + 1 : data.tokenVersion;
        Object.assign(row, data, version !== undefined ? { tokenVersion: version } : {});
        return { affected: 1 };
      }),
      create: jest.fn((data) => data),
      save: jest.fn(async (data: any) => {
        const row = people.find((person) => person.id === data.id);
        if (row) Object.assign(row, data);
        else people.push({ ...data, id: 99 });
        return row ?? data;
      }),
      delete: jest.fn(async (id: any) => {
        const index = people.findIndex((person) => person.id === id);
        if (index >= 0) people.splice(index, 1);
        return { affected: index >= 0 ? 1 : 0 };
      }),
      createQueryBuilder: jest.fn(() => {
        let email = '';
        const builder = {
          addSelect: () => builder,
          where: (_sql, params) => {
            email = params.email;
            return builder;
          },
          getOne: async () =>
            people.find(
              (person) => person.email.toLowerCase() === email.toLowerCase(),
            ) ?? null,
          getMany: async () => [],
        };
        return builder;
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [UsersController, DepartmentsController, AuthController],
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: repository },
        { provide: DataSource, useValue: { getRepository: () => repository } },
        {
          provide: DepartmentsService,
          useValue: {
            findAll: async () => [],
            create: async (dto) => dto,
            update: async (id, dto) => ({ id, ...dto }),
            remove: async () => ({ deleted: true }),
          },
        },
        { provide: AuthService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('requires authentication for management', async () => {
    await request(app.getHttpServer()).get('/api/users/managed').expect(401);
    await request(app.getHttpServer())
      .patch('/api/users/3')
      .send({ name: 'Changed' })
      .expect(401);
  });
  it('returns only staff in the head current department, including disabled staff', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users/managed?departmentId=20')
      .set('Authorization', bearer(2))
      .expect(200);
    expect(response.body.map((row) => row.id)).toEqual([3, 7]);
  });
  it('accepts manager DTO instances with omitted privileged fields', async () => {
    const service = app.get(UsersService);
    const viewer = {
      id: 2,
      sub: 2,
      name: 'Head A',
      email: 'head@example.test',
      role: 'manager' as const,
      departmentId: 10,
    };
    const updated = await service.updateInDepartment(
      3,
      plainToInstance(UpdateUserDto, { isActive: false }),
      viewer,
    );
    expect(updated?.isActive).toBe(false);
    expect(updated?.role).toBe('staff');
    await expect(
      service.updateInDepartment(
        3,
        plainToInstance(UpdateUserDto, { role: 'admin' }),
        viewer,
      ),
    ).rejects.toThrow();
  });
  it('revokes tokens and device versions permanently when admin disables then re-enables an account', async () => {
    const service = app.get(UsersService);
    await service.update(3, plainToInstance(UpdateUserDto, { isActive: false }));
    await service.update(3, plainToInstance(UpdateUserDto, { isActive: true }));
    expect((await service.findOne(3))?.tokenVersion).toBe(1);
    await request(app.getHttpServer()).get('/api/users/3').set('Authorization', bearer(3)).expect(401);
  });
  it('department-head disabling also increments the revocation version atomically', async () => {
    const service = app.get(UsersService);
    const viewer = { id: 2, sub: 2, name: 'Head', email: 'head@example.test', role: 'manager' as const, departmentId: 10 };
    await service.updateInDepartment(3, plainToInstance(UpdateUserDto, { isActive: false }), viewer);
    await service.updateInDepartment(3, plainToInstance(UpdateUserDto, { isActive: true }), viewer);
    expect((await service.findOne(3))?.tokenVersion).toBe(1);
    await request(app.getHttpServer()).get('/api/users/3').set('Authorization', bearer(3)).expect(401);
  });
  it('preserves omitted account properties when admin edits a DTO instance', async () => {
    const updated = await app
      .get(UsersService)
      .update(3, plainToInstance(UpdateUserDto, { name: 'Updated name' }));
    expect(updated?.name).toBe('Updated name');
    expect(updated?.role).toBe('staff');
    expect(updated?.email).toBe('a@example.test');
    expect(updated?.isActive).toBe(true);
  });
  it('returns all accounts to admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users/managed')
      .set('Authorization', bearer(1))
      .expect(200);
    expect(response.body).toHaveLength(8);
  });
  it('returns no employees to a head without a department', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users/managed')
      .set('Authorization', bearer(8))
      .expect(200);
    expect(response.body).toEqual([]);
    await request(app.getHttpServer())
      .patch('/api/users/3')
      .set('Authorization', bearer(8))
      .send({ isActive: false })
      .expect(403);
  });
  it('blocks staff from the managed list and employee updates', async () => {
    await request(app.getHttpServer())
      .get('/api/users/managed')
      .set('Authorization', bearer(3))
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/users/7')
      .set('Authorization', bearer(3))
      .send({ name: 'Changed' })
      .expect(403);
  });
  it('lets a head edit name and email of their own staff', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/users/3')
      .set('Authorization', bearer(2))
      .send({ name: 'Updated A', email: 'updated@example.test' })
      .expect(200);
    expect(response.body.name).toBe('Updated A');
    expect(response.body.email).toBe('updated@example.test');
    expect(response.body.role).toBe('staff');
    expect(response.body.departmentId).toBe(10);
    expect(repository.update).toHaveBeenCalledWith(
      { id: 3, departmentId: 10, role: 'staff' },
      { name: 'Updated A', email: 'updated@example.test' },
    );
  });
  it('disables an own-department staff account and invalidates its existing session', async () => {
    const staffToken = bearer(3, 'staff', 10);
    await request(app.getHttpServer())
      .patch('/api/users/3')
      .set('Authorization', bearer(2))
      .send({ isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', staffToken)
      .expect(401);
  });
  it('allows reactivation of disabled staff in the same department', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/users/7')
      .set('Authorization', bearer(2))
      .send({ isActive: true })
      .expect(200);
    expect(response.body.isActive).toBe(true);
  });
  it.each([1, 2, 4, 5, 6])(
    'blocks editing admin, self, other heads, or other-department staff (id %s)',
    async (id) => {
      await request(app.getHttpServer())
        .patch(`/api/users/${id}`)
        .set('Authorization', bearer(2))
        .send({ name: 'Changed' })
        .expect(403);
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    },
  );
  it.each([
    { role: 'admin' },
    { role: 'staff' },
    { departmentId: 20 },
    { branchId: 1 },
    { password: 'new-password' },
    { id: 4 },
  ])('blocks privilege or scope changes from heads: %j', async (payload) => {
    await request(app.getHttpServer())
      .patch('/api/users/3')
      .set('Authorization', bearer(2))
      .send(payload)
      .expect(403);
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('rejects invalid account status and conflicting email', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/3')
      .set('Authorization', bearer(2))
      .send({ isActive: 'false' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/users/3')
      .set('Authorization', bearer(2))
      .send({ email: 'b@example.test' })
      .expect(409);
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('scopes both the employee listing and writes after a department reassignment', async () => {
    people.find((person) => person.id === 2)!.departmentId = 20;
    const response = await request(app.getHttpServer())
      .get('/api/users/managed')
      .set('Authorization', bearer(2, 'manager', 10))
      .expect(200);
    expect(response.body.map((row) => row.id)).toEqual([4]);
    await request(app.getHttpServer())
      .patch('/api/users/3')
      .set('Authorization', bearer(2, 'manager', 10))
      .send({ isActive: false })
      .expect(403);
  });
  it('keeps department scope in the write if the employee moves concurrently', async () => {
    beforeUpdate = () => {
      people.find((person) => person.id === 3)!.departmentId = 20;
    };
    await request(app.getHttpServer())
      .patch('/api/users/3')
      .set('Authorization', bearer(2))
      .send({ isActive: false })
      .expect(403);
    expect(people.find((person) => person.id === 3)!.isActive).toBe(true);
  });
  it('also restricts ordinary user-list and profile reads', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', bearer(2))
      .expect(200);
    expect(response.body.every((row) => row.departmentId === 10)).toBe(true);
    await request(app.getHttpServer())
      .get('/api/users/4')
      .set('Authorization', bearer(2))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/users/2')
      .set('Authorization', bearer(2))
      .expect(200);
    const staffResponse = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', bearer(3))
      .expect(200);
    expect(staffResponse.body.map((row) => row.id)).toEqual([3]);
  });
  it('prevents heads from creating or deleting employee accounts', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', bearer(2))
      .send({ name: 'New' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/users/3')
      .set('Authorization', bearer(2))
      .expect(403);
  });
  it('allows admins to manage staff from any department and change roles', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/users/4')
      .set('Authorization', bearer(1))
      .send({ name: 'Updated B', role: 'manager', departmentId: 10 })
      .expect(200);
    expect(response.body.role).toBe('manager');
    expect(response.body.departmentId).toBe(10);
  });
  it('restricts department creation, editing, and deletion to admins', async () => {
    await request(app.getHttpServer())
      .post('/api/departments')
      .set('Authorization', bearer(2))
      .send({ name: 'Test' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/departments/10')
      .set('Authorization', bearer(2))
      .send({ name: 'Test' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/departments/10')
      .set('Authorization', bearer(2))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/departments')
      .set('Authorization', bearer(1))
      .send({ name: 'Test' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/departments/10')
      .set('Authorization', bearer(1))
      .send({ name: 'Updated' })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/departments/10')
      .set('Authorization', bearer(1))
      .expect(200);
  });
  it.each([
    { type: 'refresh', tokenVersion: 0, expiresIn: '15m' },
    { type: 'access', tokenVersion: 0, expiresIn: '-1s' },
    { type: 'access', tokenVersion: 10, expiresIn: '15m' },
  ])(
    'rejects unusable session tokens: %j',
    async ({ type, tokenVersion, expiresIn }) => {
      const token = jwt.sign({ sub: 1, type, tokenVersion }, secret, {
        expiresIn: expiresIn as any,
      });
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ' + token)
        .expect(401);
    },
  );

  it('rejects access tokens without expiry', async () => {
    const token = jwt.sign({ sub: 1, type: 'access', tokenVersion: 0 }, secret);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .expect(401);
  });

  it('does not return password hashes and invalidates old sessions after a password change', async () => {
    const oldToken = bearer(3);
    const response = await request(app.getHttpServer())
      .patch('/api/users/3')
      .set('Authorization', bearer(1))
      .send({ password: 'updated-password' })
      .expect(200);
    expect(response.body.password).toBeUndefined();
    expect(people.find((person) => person.id === 3)!.password).toMatch(/^\$2/);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', oldToken)
      .expect(401);
  });
});
