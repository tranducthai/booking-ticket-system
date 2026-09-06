// Mirrors the Prisma models/DTOs across services — see docs/spec/07-database-schema.md
// and docs/spec/08-api-contracts.md. Hand-typed against the real controller/service
// responses rather than the docs alone where the two differ (e.g. seat map is one
// combined endpoint today, not layout+state — that split is Phase 8b, not yet built).

export type Role = "CUSTOMER" | "ORGANIZER" | "ADMIN";

export interface User {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  avatarUrl: string | null;
  role: Role;
  isOrganizerVerified: boolean;
  isLocked: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Pick<User, "id" | "email" | "fullName" | "role">;
}

/** GET /user/users/organizers — narrower than User, this is public (no auth). */
export interface OrganizerProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  isOrganizerVerified: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export type TicketMode = "GENERAL" | "SEATMAP";
export type EventStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "REJECTED" | "CANCELED";

export interface EventItem {
  id: string;
  organizerId: string;
  categoryId: string;
  category?: Category;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  venueName: string;
  venueAddress: string;
  startTime: string;
  endTime: string;
  ticketMode: TicketMode;
  status: EventStatus;
  rejectedReason: string | null;
  salesStartTime: string | null;
  salesEndTime: string | null;
  highDemand: boolean;
  createdAt: string;
  ticketTypes?: TicketType[]; // included by GET /events/:id (event-service events.service.ts findById), not by the search/list endpoints
  lineup?: EventArtist[]; // same — GET /events/:id only
}

export interface Artist {
  id: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  socialLinks: Record<string, string> | null;
  isVerified: boolean;
  createdAt: string;
}

/** GET /events/:id's `lineup` — the join row, ordered, with the artist embedded. */
export interface EventArtist {
  id: string;
  eventId: string;
  artistId: string;
  order: number;
  artist: Artist;
}

/** GET /artists/:id — an artist's own page. */
export interface ArtistDetail extends Artist {
  upcomingEvents: EventItem[];
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  price: string; // Prisma Decimal serializes as a string
  quantityTotal: number;
  quantitySold: number;
  salesStart: string | null;
  salesEnd: string | null;
}

export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";

export interface Seat {
  id: string;
  zoneId: string;
  row: string;
  number: string;
  status: SeatStatus;
}

export interface SeatZone {
  id: string;
  seatMapId: string;
  name: string;
  price: string;
  isGeneral: boolean;
  capacity: number | null;
  seats: Seat[];
}

export interface SeatMapData {
  id: string;
  eventId: string;
  zones: SeatZone[];
}

// Matches the split GET .../seat-map/layout + .../seat-map/state endpoints
// (docs/spec/11-implementation-roadmap.md Phase 8b) — layout has no status,
// state is just seatId -> status. EventDetailPage merges them client-side
// into a SeatMapData-shaped object for SeatMapView, which doesn't need to
// know the two came from different requests.
export interface SeatMapLayoutZone {
  id: string;
  name: string;
  price: string;
  isGeneral: boolean;
  capacity: number | null;
  seats: Array<{ id: string; row: string; number: string }>;
}

export interface SeatMapLayout {
  id: string;
  eventId: string;
  zones: SeatMapLayoutZone[];
}

export type SeatMapState = Record<string, SeatStatus>;

export interface WaitingRoomStatus {
  admitted: boolean;
  position?: number;
  queueLength?: number;
}

export interface DiscountCode {
  id: string;
  eventId: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  value: string;
  quantityTotal: number;
  quantityUsed: number;
  validFrom: string | null;
  validTo: string | null;
}

export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "TICKET_ISSUED" | "CANCELED" | "EXPIRED";

export interface OrderItem {
  id: string;
  orderId: string;
  ticketTypeId: string | null;
  seatId: string | null;
  price: string;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  eventId: string;
  status: OrderStatus;
  subtotal: string;
  discountCode: string | null;
  discountAmount: string;
  totalAmount: string;
  expiresAt: string | null;
  createdAt: string;
  items: OrderItem[];
}

export interface OrderStatsDaily {
  date: string;
  revenue: number;
  orders: number;
}

export interface OrderStats {
  eventId?: string;
  eventTitle?: string;
  totalRevenue: number;
  totalOrders: number;
  totalTicketsSold: number;
  byStatus: Record<OrderStatus, number>;
  dailyRevenue: OrderStatsDaily[];
  /** Only present on the admin (system-wide, no eventId) response. */
  topEvents?: Array<{ eventId: string; revenue: number; orders: number }>;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

/** GET /event/events (search) — cursor-paginated, no total count (docs/spec/12-resilience-and-failure-design.md "drop COUNT(*)"). */
export interface CursorPage<T> {
  data: T[];
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface Payment {
  id: string;
  orderId: string;
  amount: string;
  method: string;
  status: PaymentStatus;
  gatewayTxnId: string | null;
  createdAt: string;
}

export type RefundStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";

export interface Refund {
  id: string;
  paymentId: string;
  orderId: string;
  reason: string;
  amount: string;
  status: RefundStatus;
  requestedBy: string;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type TicketStatus = "ISSUED" | "USED" | "CANCELED";

export interface Ticket {
  id: string;
  orderItemId: string;
  eventId: string;
  userId: string;
  qrPayload: string;
  status: TicketStatus;
  checkedInAt: string | null;
  createdAt: string;
}
