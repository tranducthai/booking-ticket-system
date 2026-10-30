import type { Role } from "../api/types";

/**
 * Where a freshly-logged-in user lands absent a more specific redirect
 * (e.g. they were bounced to /login from a protected page — that
 * `from` always wins over this). Organizers/admins have no real use for
 * the customer-facing homepage; they came here to manage things.
 */
export function roleHomePath(role: Role): string {
  switch (role) {
    case "ORGANIZER":
      return "/organizer";
    case "ADMIN":
      return "/admin";
    default:
      return "/";
  }
}
