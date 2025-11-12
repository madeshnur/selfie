import type { SQLiteAdapter } from "./sqlite-adapter";

/**
 * Query builder for complex SQL queries (JOINs, aggregates)
 */
export class QueryBuilder {
  constructor(private adapter: SQLiteAdapter) {}

  /**
   * Execute JOIN query
   */
  async join<T>(config: {
    select: string[];
    from: string;
    joins: Array<{
      type: "INNER" | "LEFT" | "RIGHT" | "CROSS";
      table: string;
      on?: string;
      alias?: string;
    }>;
    where?: string;
    groupBy?: string[];
    orderBy?: string;
    limit?: number;
  }): Promise<T[]> {
    let sql = `SELECT ${config.select.join(", ")} FROM ${config.from}`;

    // Add JOINs
    for (const join of config.joins) {
      const alias = join.alias ? `AS ${join.alias}` : "";
      sql += ` ${join.type} JOIN ${join.table} ${alias}`;
      if (join.on) {
        sql += ` ON ${join.on}`;
      }
    }

    // Add WHERE
    if (config.where) {
      sql += ` WHERE ${config.where}`;
    }

    // Add GROUP BY
    if (config.groupBy && config.groupBy.length > 0) {
      sql += ` GROUP BY ${config.groupBy.join(", ")}`;
    }

    // Add ORDER BY
    if (config.orderBy) {
      sql += ` ORDER BY ${config.orderBy}`;
    }

    // Add LIMIT
    if (config.limit) {
      sql += ` LIMIT ${config.limit}`;
    }

    return await this.adapter.executeRaw(sql);
  }

  /**
   * Execute aggregate query
   */
  async aggregate(config: {
    table: string;
    aggregates: Record<string, string>; // e.g. { total: 'COUNT(*)', avg: 'AVG(score)' }
    where?: string;
    groupBy?: string[];
  }): Promise<any[]> {
    const selectParts = Object.entries(config.aggregates).map(
      ([alias, expr]) => `${expr} as ${alias}`
    );

    let sql = `SELECT ${selectParts.join(", ")} FROM ${config.table}`;

    if (config.where) {
      sql += ` WHERE ${config.where}`;
    }

    if (config.groupBy && config.groupBy.length > 0) {
      sql += ` GROUP BY ${config.groupBy.join(", ")}`;
    }

    return await this.adapter.executeRaw(sql);
  }
}
