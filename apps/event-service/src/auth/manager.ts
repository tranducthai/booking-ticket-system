import { Role } from "./role";

/**
 * Who may change an event and everything hanging off it (ticket types, seat
 * map, discount codes, lineup): the organizer who owns it, or an admin —
 * admins create events on behalf of a partner organizer and manage any
 * event afterwards. The event itself always stays owned by the organizer.
 */
export interface Manager {
  userId: string;
  role?: Role | string | null;
}

export function canManage(organizerId: string, actor: Manager): boolean {
  return actor.role === Role.ADMIN || organizerId === actor.userId;
}
