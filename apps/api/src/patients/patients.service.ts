import { Injectable, NotFoundException } from '@nestjs/common';

import { toAdmissionSummary } from '../admissions/admissions.dto.js';
import { pageOf, type Page, type Pagination } from '../http/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toPatientSummary, type PatientDetail, type PatientSummary } from './patients.dto.js';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of patients, ordered by name.
   *
   * Two details worth naming:
   *
   * The open-admission count is a filtered relation count inside the same
   * query, not a second query per patient. Asking the database "how many open
   * admissions does this patient have?" once per row is the N+1 problem: 25
   * patients would be 26 round trips.
   *
   * The rows and the total are one transaction, so they are counted against the
   * same snapshot. Run separately, a sync writing rows in between can produce a
   * page of 25 patients alongside a total of 24.
   */
  async list(request: Pagination): Promise<Page<PatientSummary>> {
    const now = new Date();

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        skip: request.skip,
        take: request.take,
        // mrn last, so the order is total: two patients with the same name
        // must not swap places between page 1 and page 2.
        orderBy: [{ familyName: 'asc' }, { givenName: 'asc' }, { mrn: 'asc' }],
        include: {
          _count: { select: { admissions: { where: { dischargedAt: null } } } },
        },
      }),
      this.prisma.patient.count(),
    ]);

    return pageOf(
      rows.map((row) => toPatientSummary(row, row._count.admissions, now)),
      total,
      request,
    );
  }

  /**
   * One patient with their admission history.
   *
   * Observations are not included: a long admission has hundreds of them, which
   * would make the size of this response depend on how ill the patient has
   * been. They have their own paginated endpoint.
   */
  async findByMrn(mrn: string): Promise<PatientDetail> {
    const patient = await this.prisma.patient.findUnique({
      where: { mrn },
      include: {
        _count: { select: { admissions: { where: { dischargedAt: null } } } },
        admissions: {
          orderBy: { admittedAt: 'desc' },
          include: { _count: { select: { observations: true } } },
        },
      },
    });

    if (patient === null) {
      throw new NotFoundException(`No patient with MRN ${mrn}.`);
    }

    return {
      ...toPatientSummary(patient, patient._count.admissions, new Date()),
      admissions: patient.admissions.map((admission) =>
        toAdmissionSummary(admission, admission._count.observations),
      ),
    };
  }
}
