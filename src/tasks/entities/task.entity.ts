import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tasks')
export class TaskEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'int', nullable: true })
  assigneeId?: number;

  @Column({ type: 'int', nullable: true })
  createdById?: number;

  @Column({ type: 'date', nullable: true })
  dueDate?: string;

  @Column({ type: 'enum', enum: ['low', 'medium', 'high'], default: 'medium' })
  priority: 'low' | 'medium' | 'high';

  @Column({ type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ type: 'enum', enum: ['todo', 'doing', 'done'], default: 'todo' })
  status: 'todo' | 'doing' | 'done';

  @Column({ type: 'int', default: 0 })
  progress: number;

  @CreateDateColumn({ type: 'datetime', nullable: true })
  createdAt?: Date;
}
