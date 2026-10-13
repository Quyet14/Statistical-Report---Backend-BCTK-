import { Injectable } from '@nestjs/common';

@Injectable()
export class BranchesService {
  findAll() {
    return [
      { id: 1, name: 'Chi nhánh Hà Nội' },
      { id: 2, name: 'Chi nhánh Đà Nẵng' },
    ];
  }

  findOne(id: number) {
    return { id, name: 'Chi nhánh sample' };
  }

  create(dto: { name: string }) {
    return { id: Date.now(), ...dto };
  }

  update(id: number, dto: { name?: string }) {
    return { id, ...dto };
  }
}
