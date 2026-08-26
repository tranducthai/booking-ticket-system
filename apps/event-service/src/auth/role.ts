/**
 * Mirrors user-service's Role enum (apps/user-service/prisma/schema.prisma).
 * Duplicated on purpose — Database per Service means this service never
 * imports another service's Prisma client, and the Gateway forwards role
 * as a plain string header anyway (see docs/spec/08-api-contracts.md).
 */
export enum Role {
  CUSTOMER = "CUSTOMER",
  ORGANIZER = "ORGANIZER",
  ADMIN = "ADMIN",
}
