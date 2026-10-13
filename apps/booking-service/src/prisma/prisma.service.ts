import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "../generated/prisma";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * The Postgres schema this service's tables live in — `?schema=` on
   * DATABASE_URL (one shared database, one schema per service, e.g. Neon in
   * production), else "public". Prisma qualifies its own generated queries
   * with it, but NOT hand-written $queryRaw/$executeRaw — those must go
   * through table() below or they'd look in "public" and miss the table.
   */
  private readonly schema = schemaFromUrl(process.env.DATABASE_URL);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Schema-qualified table name for raw SQL: UPDATE ${this.prisma.table("TicketType")} ... */
  table(name: string): Prisma.Sql {
    return Prisma.raw(`"${this.schema}"."${name}"`);
  }
}

function schemaFromUrl(url: string | undefined): string {
  try {
    const schema = url ? new URL(url).searchParams.get("schema") : null;
    // Interpolated into SQL as an identifier — only accept a plain one.
    return schema && /^[A-Za-z_][A-Za-z0-9_]*$/.test(schema) ? schema : "public";
  } catch {
    return "public";
  }
}
