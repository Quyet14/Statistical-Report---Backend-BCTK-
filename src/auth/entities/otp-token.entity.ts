import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('otp_tokens')
@Index('UQ_otp_email_purpose', ['email', 'purpose'], { unique: true })
export class OtpTokenEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 64 })
  otp: string;

  @Column({ type: 'enum', enum: ['login', 'reset-password'], default: 'login' })
  purpose: 'login' | 'reset-password';

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
