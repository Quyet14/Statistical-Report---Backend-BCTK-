import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('reports')
export class ReportEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ['week', 'month'] })
  periodType: 'week' | 'month';

  @Column({ type: 'varchar', length: 50 })
  periodValue: string;

  @Column({ type: 'enum', enum: ['user', 'department', 'branch', 'company'] })
  scope: 'user' | 'department' | 'branch' | 'company';

  @Column({ type: 'int', nullable: true })
  scopeId?: number;

  @Column({ type: 'json' })
  data: Record<string, any>;

  @CreateDateColumn({ type: 'datetime', nullable: true })
  generatedAt?: Date;
}
