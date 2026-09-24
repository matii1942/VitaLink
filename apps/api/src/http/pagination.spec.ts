import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageOf, pagination } from './pagination.js';

describe('pagination', () => {
  it('turns a page number into an offset', () => {
    expect(pagination(1, 25)).toEqual({ page: 1, pageSize: 25, skip: 0, take: 25 });
    expect(pagination(2, 25)).toEqual({ page: 2, pageSize: 25, skip: 25, take: 25 });
    expect(pagination(4, 10)).toEqual({ page: 4, pageSize: 10, skip: 30, take: 10 });
  });

  it('rejects a page below the first one', () => {
    expect(() => pagination(0, DEFAULT_PAGE_SIZE)).toThrow(BadRequestException);
    expect(() => pagination(-1, DEFAULT_PAGE_SIZE)).toThrow(BadRequestException);
  });

  it('rejects a page size that is empty or above the maximum', () => {
    expect(() => pagination(1, 0)).toThrow(BadRequestException);
    expect(() => pagination(1, MAX_PAGE_SIZE + 1)).toThrow(BadRequestException);
    expect(() => pagination(1, MAX_PAGE_SIZE)).not.toThrow();
  });

  it('rejects numbers that are not whole', () => {
    // ParseIntPipe would already have refused "1.5", but a fractional skip
    // silently returns the wrong rows, so this does not rely on the pipe.
    expect(() => pagination(1.5, DEFAULT_PAGE_SIZE)).toThrow(BadRequestException);
    expect(() => pagination(1, 2.5)).toThrow(BadRequestException);
    expect(() => pagination(Number.NaN, DEFAULT_PAGE_SIZE)).toThrow(BadRequestException);
  });
});

describe('pageOf', () => {
  it('reports how many pages the total needs', () => {
    expect(pageOf(['a'], 7, pagination(1, 3)).totalPages).toBe(3);
    expect(pageOf(['a'], 9, pagination(1, 3)).totalPages).toBe(3);
    expect(pageOf(['a'], 10, pagination(1, 3)).totalPages).toBe(4);
  });

  it('reports no pages at all when nothing matches', () => {
    expect(pageOf([], 0, pagination(1, 25))).toEqual({
      data: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
  });

  it('echoes the page that was asked for, not the rows it got', () => {
    // A page past the end returns no rows, and still says which page it was.
    const result = pageOf([], 5, pagination(9, 25));
    expect(result.page).toBe(9);
    expect(result.total).toBe(5);
  });
});
