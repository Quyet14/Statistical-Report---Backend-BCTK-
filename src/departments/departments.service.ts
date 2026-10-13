import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departmentsRepository: Repository<DepartmentEntity>,
  ) {}

  findAll() {
    return this.departmentsRepository.find({ order: { name: 'ASC' } });
  }

  findOne(id: number) {
    return this.departmentsRepository.findOneBy({ id });
  }

  create(dto: { name: string; branchId?: number }) {
    return this.departmentsRepository.save(
      this.departmentsRepository.create(dto),
    );
  }

  async update(id: number, dto: { name?: string; branchId?: number }) {
    const department = await this.departmentsRepository.preload({ id, ...dto });
    return department ? this.departmentsRepository.save(department) : null;
  }

  async remove(id: number) {
    const result = await this.departmentsRepository.delete(id);
    return { deleted: result.affected === 1 };
  }
}
