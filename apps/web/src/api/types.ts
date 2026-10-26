// Mirrors the Prisma models/DTOs across services — see docs/spec/07-database-schema.md
// and docs/spec/08-api-contracts.md. Hand-typed against the real controller/service
// responses rather than the docs alone where the two differ (e.g. seat map is one
// combined endpoint today, not layout+state — that split is Phase 8b, not yet built).

export type Role = "CUSTOMER" | "ORGANIZER" | "ADMIN";

export type Gender = "MALE" | "FEMALE" | "OTHER";

export interface User {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  avatarUrl: string | null;
  /** "YYYY-MM-DD…" (a date column — read the first 10 chars). */
  dateOfBirth?: string | null;
  gender?: Gender | null;
  organizerDescription?: string | null;
  emailVerifiedAt?: string | null;
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

/** FREE_ENTRY: free, open entry — no tickets, no registration (event page shows "vào cửa tự do"). */
export type TicketMode = "GENERAL" | "SEATMAP" | "FREE_ENTRY";
export type EventStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "REJECTED" | "CANCELED";

export interface EventItem {
  id: string;
  organizerId: string;
  categoryId: string;
  category?: Category;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  galleryUrls: string[];
  maxTicketsPerAccount: number | null;
  // "Ban tổ chức" / terms / age — event-service schema.prisma Event
  organizerName: string | null;
  organizerLogoUrl: string | null;
  organizerDescription: string | null;
  terms: string | null;
  minAge: number | null;
  zoneMapUrl: string | null; // image of the venue's ticket zones, shown above the tiers
  venueName: string;
  venueAddress: string;
  /** Structured address from the creation wizard — null on older events (venueAddress is still the display string). */
  isOnline?: boolean;
  province?: string | null;
  ward?: string | null;
  streetAddress?: string | null;
  startTime: string;
  endTime: string;
  ticketMode: TicketMode;
  status: EventStatus;
  rejectedReason: string | null;
  salesStartTime: string | null;
  salesEndTime: string | null;
  highDemand: boolean;
  /** Organizer opt-in: artist membership cards give presale + discount on this event. */
  memberBenefits?: boolean;
  /** Organizer reopened unsold tickets after the sales deadline, until this time. */
  lateSalesUntil?: string | null;
  refundPolicy: RefundPolicy | null;
  // docs/spec/13-refund-and-anti-fraud-design.md §2.3/§2.4
  cancelRequestedAt: string | null;
  cancelRequestReason: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  postponedAt: string | null;
  refundWindowEndsAt: string | null;
  createdAt: string;
  showtimes?: Showtime[]; // GET /events/:id only — empty for a single-date event
  ticketTypes?: TicketType[]; // included by GET /events/:id (event-service events.service.ts findById), not by the search/list endpoints
  lineup?: EventArtist[]; // same — GET /events/:id only
}

export interface Artist {
  id: string;
  name: string;
  avatarUrl: string | null;
  coverUrl?: string | null;
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
  /** Most recent shows that already ended (newest first). */
  pastEvents: EventItem[];
  followerCount: number;
  postCount: number;
  membershipPlan: MembershipPlan | null;
}

/** A post on the artist page. `locked`: members-only and the viewer isn't a member — content/image are null. */
export interface ArtistPost {
  id: string;
  artistId: string;
  content: string | null;
  imageUrl: string | null;
  membersOnly: boolean;
  locked: boolean;
  createdAt: string;
}

/** An artist's fan-club card offer (event-service ArtistMembershipPlan). price "0" = free registration. */
export interface MembershipPlan {
  id: string;
  artistId: string;
  name: string;
  price: string;
  durationDays: number;
  discountPercent: number;
  presaleHours: number;
  benefits: string | null;
  isActive: boolean;
}

/** One bought card. Expired = ACTIVE with expiresAt in the past; a renewal can start in the future. */
export interface Membership {
  id: string;
  planId: string;
  artistId: string;
  cardNumber: string;
  status: "ACTIVE" | "CANCELED";
  pricePaid: string;
  discountPercent: number;
  presaleHours: number;
  startsAt: string;
  expiresAt: string;
  canceledAt: string | null;
  artist: { id: string; name: string; avatarUrl: string | null };
  plan: { name: string; benefits: string | null };
}

/** GET /events/:id/member-benefits — empty unless the organizer turned member benefits on. */
export interface EventMemberBenefits {
  memberBenefits: boolean;
  offers: Array<{ artistId: string; artistName: string; planId: string; planName: string; price: number; discountPercent: number; presaleHours: number }>;
  member: { artistName: string; cardNumber: string; discountPercent: number; presaleHours: number } | null;
}

export type TicketDeliveryMethod = "E_TICKET" | "PRINT_AT_HOME";

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  price: string; // Prisma Decimal serializes as a string
  quantityTotal: number;
  quantitySold: number;
  salesStart: string | null;
  salesEnd: string | null;
  deliveryMethod: TicketDeliveryMethod;
  showtimeId: string | null; // set when the event has showtimes — the performance this tier sells
  description: string | null; // what the tier includes ("quyền lợi")
  minPerOrder: number;
  maxPerOrder: number | null;
  isHidden: boolean; // only ever true in the organizer's/admin's view — event-service filters hidden tiers out for everyone else
}

/** One performance of a multi-date event — event-service schema.prisma Showtime. */
export interface Showtime {
  id: string;
  eventId: string;
  startTime: string;
  endTime: string;
}

export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";

export interface Seat {
  id: string;
  zoneId: string;
  row: string;
  number: string;
  status: SeatStatus;
  /** Cell on the hall canvas — null/absent on maps built before the designer. */
  gridRow?: number | null;
  gridCol?: number | null;
}

/** The drawn hall: rows x cols grid, stage above row 0. */
export interface SeatCanvas {
  rows: number;
  cols: number;
  stageLabel: string;
}

export interface SeatZone {
  id: string;
  seatMapId: string;
  name: string;
  price: string;
  isGeneral: boolean;
  capacity: number | null;
  color?: string | null;
  /** Standing zone: the ticket type sold by quantity for it (event-service seat-map layout). */
  ticketTypeId?: string | null;
  seats: Seat[];
}

export interface SeatMapData {
  id: string;
  eventId: string;
  canvas?: SeatCanvas | null;
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
  color?: string | null;
  /** Standing zone: the ticket type sold by quantity for it (event-service seat-map layout). */
  ticketTypeId?: string | null;
  seats: Array<{ id: string; row: string; number: string; gridRow?: number | null; gridCol?: number | null }>;
}

export interface SeatMapLayout {
  id: string;
  eventId: string;
  /** Absent on layouts cached before the designer shipped, null on old-style maps. */
  canvas?: SeatCanvas | null;
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
  isActive: boolean;
  createdAt: string;
}

export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "TICKET_ISSUED" | "CANCELED" | "EXPIRED";

export interface OrderItem {
  id: string;
  orderId: string;
  ticketTypeId: string | null;
  seatId: string | null;
  price: string;
  quantity: number;
  /** Set once a (per-ticket) refund paid this ticket back. */
  refundedAt: string | null;
}

export interface Order {
  id: string;
  userId: string;
  /** MEMBERSHIP: an artist's membership card — no eventId, no items; itemLabel names it. */
  kind?: "TICKETS" | "MEMBERSHIP" | "RESALE";
  /** RESALE: the listing being bought. */
  resaleListingId?: string | null;
  eventId: string | null;
  membershipPlanId?: string | null;
  itemLabel?: string | null;
  status: OrderStatus;
  subtotal: string;
  /** Taken off by the buyer's membership card (events with member benefits). */
  memberDiscountAmount?: string;
  discountCode: string | null;
  discountAmount: string;
  totalAmount: string;
  /** Sum paid back so far by per-ticket refunds. */
  refundedAmount: string;
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
  /** Set only for a still-PENDING bank transfer (method "sepay") — see payment-service sepay.gateway.ts. */
  bankTransfer?: BankTransferInstructions | null;
}

export interface BankTransferInstructions {
  qrImageUrl: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  transferContent: string;
}

export type RefundStatus =
  | "REQUESTED"
  | "NEED_INFO"
  | "APPROVED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "REJECTED"
  | "ESCALATED"
  | "REJECTED_FINAL"
  | "WITHDRAWN";

export type RefundKind = "CUSTOMER_REQUEST" | "EVENT_CANCELED" | "EVENT_POSTPONED" | "SYSTEM_ERROR";

export type RefundReasonCategory = "PERSONAL" | "SCHEDULE_CONFLICT" | "MEDICAL" | "EVENT_ISSUE" | "OTHER";

/** Event.refundPolicy — mirrors RefundPolicy in libs/event-contracts. */
export interface RefundPolicy {
  customerRefundable: boolean;
  tiers: Array<{ minHoursBefore: number; percent: number }>;
  evidenceRequiredFor?: RefundReasonCategory[];
  /** Eligible customer requests are approved and paid out immediately, no organizer review. */
  autoApprove?: boolean;
}

export interface RefundEvidence {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RefundAuditLog {
  id: string;
  actorId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
}

export interface Refund {
  id: string;
  paymentId: string;
  orderId: string;
  eventId: string | null;
  userId: string | null;
  kind: RefundKind;
  reasonCategory: RefundReasonCategory | null;
  reason: string;
  /** Tickets (order items) this refund covers; empty = the whole order. */
  orderItemIds: string[];
  grossAmount: string | null;
  refundPercent: number;
  amount: string;
  feeAmount: string;
  status: RefundStatus;
  requestedBy: string;
  decidedBy: string | null;
  rejectReason: string | null;
  infoRequest: string | null;
  slaDueAt: string | null;
  escalatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  decidedAt: string | null;
  completedAt: string | null;
  evidence: RefundEvidence[];
  auditLogs: RefundAuditLog[];
}

/** GET /payment/refunds/quote — see apps/payment-service/src/refunds/refund-policy.ts. */
export type RefundQuote =
  | {
      eligible: true;
      kind: RefundKind;
      percent: number;
      grossAmount: number;
      amount: number;
      feeAmount: number;
      autoApprove: boolean;
      evidenceRequired: boolean;
      /** The tickets this quote is for. */
      orderItemIds: string[];
    }
  | { eligible: false; message: string };

/** RESALE_LISTED: up for resale — locked (no check-in, no refund) until sold or withdrawn. */
export type TicketStatus = "ISSUED" | "REFUND_PENDING" | "RESALE_LISTED" | "USED" | "CANCELED";

/** List endpoints never include the QR (docs/spec/13 §3.4); only the owner's single-ticket read does. */
export interface Ticket {
  id: string;
  orderItemId: string;
  eventId: string;
  userId: string;
  qrVersion: number;
  status: TicketStatus;
  cancelReason: string | null;
  checkedInAt: string | null;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  /** null when the ticket isn't usable, or when the deployment only accepts rotating codes. */
  qrPayload: string | null;
  /** Seed for the rotating in-app QR (apps/web/src/lib/dynamicQr.ts); null unless ISSUED. */
  dynamicQr: { seed: string; stepSeconds: number } | null;
  /** Online event: the join link — only on a valid/used ticket of its holder. */
  onlineUrl?: string | null;
}

/** GET/PUT /event/events/:id/private-info — organizer & admin only, never on a public read. */
export interface EventPrivateInfo {
  eventId: string;
  onlineUrl?: string | null;
  payoutAccountHolder?: string | null;
  payoutAccountNumber?: string | null;
  payoutBankName?: string | null;
  payoutBankBranch?: string | null;
  invoiceBusinessType?: "INDIVIDUAL" | "COMPANY" | null;
  invoiceName?: string | null;
  invoiceAddress?: string | null;
  invoiceTaxCode?: string | null;
}

export type NotificationType =
  | "ORDER_PAID"
  | "TICKET_ISSUED"
  | "EVENT_REMINDER"
  | "EVENT_APPROVED"
  | "EVENT_REJECTED"
  | "REFUND_APPROVED"
  | "REFUND_REJECTED"
  | "REFUND_INFO_REQUESTED"
  | "EVENT_CANCELED"
  | "EVENT_POSTPONED";

/** `data` shape varies by type — always at least one of these, set by the notification-service consumer that created it (see apps/notification-service/src/notifications/*, src/inbox/inbox.service.ts). */
export interface NotificationData {
  orderId?: string;
  eventId?: string;
  refundId?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData | null;
  readAt: string | null;
  createdAt: string;
}

export type ResaleStatus = "ACTIVE" | "RESERVED" | "SOLD" | "CANCELED";

/** A ticket a customer resells ("Bán lại vé"). The public marketplace omits seller/ticket ids. */
export interface ResaleListing {
  id: string;
  code: string;
  eventId: string;
  ticketTypeId: string | null;
  seatId: string | null;
  facePrice: string;
  price: string;
  status: ResaleStatus;
  soldAt: string | null;
  createdAt: string;
  /** Only on the seller's own listings. */
  ticketId?: string;
  feeAmount?: string;
  payoutAmount?: number;
}

export type StatsBucket = "hour" | "day" | "month";

/** GET /booking/orders/organizer-stats — the organizer's statistics page (paid ticket orders only, revenue net of refunds). */
export interface OrganizerStats {
  bucket: StatsBucket;
  totals: {
    revenue: number;
    grossRevenue: number;
    refundedAmount: number;
    discountAmount: number;
    orders: number;
    buyers: number;
    repeatBuyers: number;
    ticketsSold: number;
    ticketsRefunded: number;
    averageOrderValue: number;
    /** % of orders placed in the range that got paid. */
    conversionRate: number;
  };
  /** `bucket` is "YYYY-MM-DDTHH:MM" in Vietnam time, truncated to the granularity. */
  series: Array<{ bucket: string; revenue: number; orders: number; tickets: number }>;
  byEvent: Array<{ eventId: string; revenue: number; orders: number; buyers: number; tickets: number }>;
  byTicketType: Array<{ ticketTypeId: string | null; seat: boolean; quantity: number; revenue: number }>;
  byStatus: Record<string, number>;
}

/** GET /artists/mine — an artist in the organizer's "Quản lý nghệ sĩ" list. */
export interface MyArtist extends Artist {
  eventCount: number;
  followerCount: number;
  canEdit: boolean;
}
