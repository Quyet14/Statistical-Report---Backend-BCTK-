import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('task_logs')
export class TaskLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  taskId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'date' })
  logDate: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'done', 'late'],
    default: 'pending',
  })
  status: 'pending' | 'done' | 'late';
}
