/**
 * Pagination, in one place.
 *
 * Every list endpoint takes ?page and ?pageSize and answers with the same
 * envelope, so a consumer learns the shape once. The controllers turn the
 * query string into numbers with Nest's built-in pipes — that is what produces
 * a 400 for `?page=abc` — and this module decides whether those numbers are
 * acceptable.
 */
import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PAGE_SIZE = 25;

/**
 * An upper bound on pageSize is not politeness, it is a limit on how much work
 * one request can ask the database for. Without it, ?pageSize=1000000 is a
 * denial-of-service knob that anybody can turn.
 */
export const MAX_PAGE_SIZE = 100;

/** A validated request for one page, in the form Prisma wants it. */
export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pagination(page: number, pageSize: number): Pagination {
  if (!Number.isInteger(page) || page < 1) {
    throw new BadRequestException('page must be a whole number of 1 or more.');
  }

  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new BadRequestException('pageSize must be a whole number of 1 or more.');
  }

  if (pageSize > MAX_PAGE_SIZE) {
    throw new BadRequestException(`pageSize must be ${MAX_PAGE_SIZE} or less.`);
  }

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * One page of results.
 *
 * `total` is the number of rows that match, not the number returned, so a
 * consumer can show "page 2 of 7" without asking for every row to count them.
 */
export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function pageOf<T>(data: T[], total: number, request: Pagination): Page<T> {
  return {
    data,
    page: request.page,
    pageSize: request.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / request.pageSize),
  };
}
