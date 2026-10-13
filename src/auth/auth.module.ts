import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { OtpTokenEntity } from './entities/otp-token.entity';

@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([OtpTokenEntity])],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailService,
    {
      provide: 'OTP_TOKEN_REPOSITORY',
      useFactory: (dataSource: DataSource) =>
        dataSource.getRepository(OtpTokenEntity),
      inject: [DataSource],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
