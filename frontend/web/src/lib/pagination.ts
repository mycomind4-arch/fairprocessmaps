/**
 * Pagination Middleware — Production Hardening
 *
 * Standardized pagination for all list endpoints.
 * Enforces max page size to prevent abuse.
 */

import { NextRequest } from "next/server";

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export function getPagination(req: NextRequest): PaginationParams {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function paginateResponse<T>(items: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.limit);
  return {
    items,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      total_pages: totalPages,
      has_next: params.page < totalPages,
      has_prev: params.page > 1,
    },
  };
}

// D1 pagination helper — runs count + paginated query
export async function paginatedD1Query<T>(
  db: D1Database,
  countSql: string,
  dataSql: string,
  params: PaginationParams,
  binds: unknown[],
): Promise<PaginatedResult<T>> {
  const countResult = await db.prepare(countSql).bind(...binds).first();
  const total = (countResult?.n as number) ?? 0;

  const dataResult = await db
    .prepare(`${dataSql} LIMIT ? OFFSET ?`)
    .bind(...binds, params.limit, params.offset)
    .all();

  return paginateResponse((dataResult.results ?? []) as T[], total, params);
}
