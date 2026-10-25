import { registerDecorator, ValidationArguments, ValidationOptions } from "class-validator";

/**
 * Cross-field / time checks shared by the event DTOs. class-validator only
 * knows single-field rules; these cover "end after start" and "not in the
 * past", which every date pair here needs (event, showtime, postpone, ticket
 * sales window, discount validity). Mirrored client-side in
 * apps/web/src/lib/validation.ts — the server is the one that counts.
 */

const time = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "string" ? Date.parse(v) : NaN);

/** The value must be strictly later than the sibling `property` — skipped when either is absent, so partial updates pass. */
export function IsAfter(property: string, message: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: "isAfter",
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: { message, ...options },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const other = (args.object as Record<string, unknown>)[args.constraints[0] as string];
          if (value == null || other == null) return true;
          const a = time(value);
          const b = time(other);
          return Number.isNaN(a) || Number.isNaN(b) ? true : a > b;
        },
      },
    });
}

/** The value must be in the future (a minute of slack for clock drift between browser and server). */
export function IsFuture(message: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: "isFuture",
      target: object.constructor,
      propertyName,
      options: { message, ...options },
      validator: {
        validate(value: unknown) {
          if (value == null) return true;
          const t = time(value);
          return Number.isNaN(t) || t > Date.now() - 60_000;
        },
      },
    });
}

/** class-transformer helper: trim strings, leave everything else alone. */
export const trimString = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export const MAX_EVENT_DAYS = 90;
export const MAX_PRICE = 1_000_000_000;
