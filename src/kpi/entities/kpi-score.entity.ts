import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('kpi_scores')
export class KpiScoreEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'enum', enum: ['week', 'month'] })
  periodType: 'week' | 'month';

  @Column({ type: 'varchar', length: 50 })
  periodValue: string;

  @Column({ type: 'int', default: 0 })
  completedCount: number;

  @Column({ type: 'int', default: 0 })
  lateCount: number;

  @Column({ type: 'float', default: 0 })
  score: number;
}
