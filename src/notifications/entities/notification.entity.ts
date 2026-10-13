import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('notifications')
@Index(['taskId', 'userId', 'notificationDate'], { unique: true })
export class NotificationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  taskId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: ['upcoming', 'overdue'] })
  type: 'upcoming' | 'overdue';

  @Column({ type: 'date' })
  notificationDate: string;

  @Column({ type: 'datetime', nullable: true })
  readAt?: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
