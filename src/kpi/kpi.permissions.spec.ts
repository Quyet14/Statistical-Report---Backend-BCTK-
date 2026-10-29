import { INestApplication } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { KpiScoreEntity } from './entities/kpi-score.entity';
import { UserEntity } from '../users/entities/user.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';

describe('Current permissions and KPI isolation (HTTP)', () => {
  let app: INestApplication;
  let users: Array<Partial<UserEntity>>;
  const tasks = [
    { id: 1, assigneeId: 2, status: 'done' },
    { id: 2, assigneeId: 3, status: 'doing' },
    { id: 3, assigneeId: 4, status: 'done' },
  ];
  const secret = 'test-only-secret-with-at-least-32-bytes';
  process.env.JWT_SECRET = secret;
  const token = (id: number, role: string, departmentId: number | null = 10) =>
    jwt.sign(
      { sub: id, role, departmentId, type: 'access', tokenVersion: 0 },
      secret,
      { expiresIn: '15m' },
    );
  const bearer = (id: number, role: string, departmentId: number | null = 10) =>
    `Bearer ${token(id, role, departmentId)}`;
  let findUsers: jest.Mock;
  let updateUser: jest.Mock;

  beforeEach(async () => {
    users = [
      {
        id: 1,
        name: 'Admin',
        email: 'admin@example.test',
        role: 'admin',
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
    ];
    findUsers = jest.fn(async (options) =>
      users.filter(
        (user) =>
          options.where.departmentId == null ||
          user.departmentId === options.where.departmentId,
      ),
    );
    const usersRepository = {
      find: findUsers,
      findOneBy: jest.fn(
        async ({ id }) => users.find((user) => user.id === id) ?? null,
      ),
    };
    const tasksRepository = {
      find: jest.fn(async ({ where }) =>
        tasks.filter((task) =>
          typeof where.assigneeId === 'number'
            ? task.assigneeId === where.assigneeId
            : where.assigneeId.value.includes(task.assigneeId),
        ),
      ),
    };
    updateUser = jest.fn(async (id, dto) => ({ id, ...dto }));
    const moduleRef = await Test.createTestingModule({
      controllers: [KpiController, AuthController, UsersController],
      providers: [
        KpiService,
        { provide: getRepositoryToken(KpiScoreEntity), useValue: {} },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        { provide: getRepositoryToken(TaskEntity), useValue: tasksRepository },
        {
          provide: DataSource,
          useValue: { getRepository: () => usersRepository },
        },
        { provide: AuthService, useValue: {} },
        { provide: UsersService, useValue: { update: updateUser } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects anonymous ranking requests', async () => {
    await request(app.getHttpServer()).get('/api/kpi/ranking').expect(401);
    expect(findUsers).not.toHaveBeenCalled();
  });

  it('rejects invalid JWTs', async () => {
    await request(app.getHttpServer())
      .get('/api/kpi/ranking')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });

  it('limits a head to the current department, ignoring admin claims in an old token and client query overrides', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/kpi/ranking?departmentId=20')
      .set('Authorization', bearer(2, 'admin'))
      .expect(200);
    expect(response.body.map((row: { userId: number }) => row.userId)).toEqual([
      2, 3,
    ]);
    expect(
      response.body.every(
        (row: { departmentId: number }) => row.departmentId === 10,
      ),
    ).toBe(true);
    expect(findUsers).toHaveBeenCalledWith({ where: { departmentId: 10 } });
  });

  it('returns all departments to admins', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/kpi/ranking')
      .set('Authorization', bearer(1, 'admin'))
      .expect(200);
    expect(
      response.body.map((row: { userId: number }) => row.userId).sort(),
    ).toEqual([2, 3, 4]);
    expect(findUsers).toHaveBeenCalledWith({ where: {} });
  });

  it('uses a reassigned department immediately despite stale token claims', async () => {
    users[1].departmentId = 20;
    const response = await request(app.getHttpServer())
      .get('/api/kpi/ranking')
      .set('Authorization', bearer(2, 'manager', 10))
      .expect(200);
    expect(response.body.map((row: { userId: number }) => row.userId)).toEqual([
      2, 4,
    ]);
  });

  it('returns no ranking if a department head has no department', async () => {
    users[1].departmentId = undefined;
    const response = await request(app.getHttpServer())
      .get('/api/kpi/ranking')
      .set('Authorization', bearer(2, 'manager'))
      .expect(200);
    expect(response.body).toEqual([]);
    expect(findUsers).not.toHaveBeenCalled();
  });

  it('rejects staff even if their old token claims admin', async () => {
    await request(app.getHttpServer())
      .get('/api/kpi/ranking')
      .set('Authorization', bearer(3, 'admin'))
      .expect(403);
    expect(findUsers).not.toHaveBeenCalled();
  });

  it('blocks direct KPI access to a person in another department', async () => {
    await request(app.getHttpServer())
      .get('/api/kpi/user/4')
      .set('Authorization', bearer(2, 'manager'))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/kpi/user/3')
      .set('Authorization', bearer(2, 'manager'))
      .expect(200);
  });

  it('only lets staff access their own individual KPI', async () => {
    await request(app.getHttpServer())
      .get('/api/kpi/user/3')
      .set('Authorization', bearer(3, 'staff'))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/kpi/user/2')
      .set('Authorization', bearer(3, 'staff'))
      .expect(403);
  });

  it('returns current role and department for page reloads without exposing credentials', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', bearer(3, 'admin', 20))
      .expect(200);
    expect(response.body).toEqual({
      id: 3,
      name: 'Staff A',
      email: 'a@example.test',
      role: 'staff',
      departmentId: 10,
    });
  });

  it('enforces demotion and promotion on protected writes without requiring a new login', async () => {
    const oldAdminToken = bearer(1, 'admin');
    users[0].role = 'staff';
    await request(app.getHttpServer())
      .patch('/api/users/4')
      .set('Authorization', oldAdminToken)
      .send({ role: 'admin' })
      .expect(403);
    expect(updateUser).not.toHaveBeenCalled();
    users[2].role = 'admin';
    await request(app.getHttpServer())
      .patch('/api/users/4')
      .set('Authorization', bearer(3, 'staff'))
      .send({ role: 'manager' })
      .expect(200);
    expect(updateUser).toHaveBeenCalledWith(4, { role: 'manager' });
  });

  it('rejects disabled or deleted accounts using previously valid tokens', async () => {
    users[1].isActive = false;
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', bearer(2, 'manager'))
      .expect(401);
    users.splice(1, 1);
    await request(app.getHttpServer())
      .get('/api/kpi/ranking')
      .set('Authorization', bearer(2, 'manager'))
      .expect(401);
  });

  it('does not accept refresh tokens as access tokens', async () => {
    const refresh = jwt.sign(
      { sub: 1, role: 'admin', type: 'refresh' },
      secret,
    );
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refresh}`)
      .expect(401);
  });
});
