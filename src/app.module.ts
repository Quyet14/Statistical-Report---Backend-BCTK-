import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { DepartmentsModule } from './departments/departments.module';
import { KpiModule } from './kpi/kpi.module';
import { ReportsModule } from './reports/reports.module';
import { TaskLogsModule } from './task-logs/task-logs.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { validateSecurityEnvironment } from './common/security-config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateSecurityEnvironment,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST'),
        port: Number(configService.get<number>('DB_PORT')),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database:
          configService.get<string>('DB_DATABASE') ??
          configService.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: configService.get<string>('DB_SYNCHRONIZE') === 'true',
        logging: false,
      }),
    }),
    AuthModule,
    UsersModule,
    BranchesModule,
    DepartmentsModule,
    TasksModule,
    TaskLogsModule,
    KpiModule,
    ReportsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
