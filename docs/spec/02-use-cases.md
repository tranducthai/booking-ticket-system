# USE CASE SPECIFICATION
## Online Event Ticketing System (similar to Ticketbox)

---

## 1. Overview use case diagram

3 main actors (Customer, Organizer, Admin) connect to 3 main functional groups inside the system boundary:

- **Customer** → Buy tickets & attend (search events, choose tickets/seats, pay, receive QR ticket, view orders)
- **Organizer** → Manage events (create/edit events, set up tickets & seat map, track revenue, check-in)
- **Admin** → Administer the system (approve events, manage users, configure commission/categories, handle complaints/reports)

*(The full diagram was shown during the discussion. It can be redrawn with a UML tool like draw.io/PlantUML for the final report.)*

---

## 2. Detailed specification of key use cases

### UC-01: Book tickets & pay (with seat selection)

| Field | Content |
|---|---|
| **Primary actor** | Customer |
| **Secondary actor** | Payment Gateway, Notification System |
| **Description** | Customer selects an event, selects seats/tickets, pays, and receives the e-ticket |
| **Preconditions** | Customer is logged in; the event is within its sales window |
| **Main flow** | 1. Customer selects an event → views the seat map/ticket types<br>2. Selects seats/quantity → system holds them temporarily (Held, TTL ~10 min)<br>3. Customer applies a discount code (if any) → sees the total<br>4. Selects a payment method → redirected to the payment gateway<br>5. Payment succeeds → system updates seat status to "Booked", generates the e-ticket (QR)<br>6. System sends a confirmation email with the e-ticket |
| **Exception flows** | - Hold expires before payment → seat auto-releases to "Available", customer is notified<br>- Payment fails → hold is extended briefly to let the customer retry, or the seat is released<br>- Seat was taken by someone else while the customer was mid-flow → error shown, asked to reselect |
| **Postconditions** | Order is in "Paid" status, e-ticket has been generated and sent |

### UC-02: Check-in at the event

| Field | Content |
|---|---|
| **Primary actor** | Check-in Staff |
| **Description** | Scan the e-ticket's QR code to validate it and let the customer into the event |
| **Preconditions** | Ticket is in "Paid" status, not yet used |
| **Main flow** | 1. Staff opens the scanning screen<br>2. Scans the QR on the customer's ticket<br>3. System checks: ticket is valid, matches this event, not yet checked in<br>4. Shows a valid result → marks the ticket "Used" → lets the customer in |
| **Exception flows** | - Ticket was already used (possibly a screenshotted fraud attempt) → warning, denied<br>- Ticket doesn't belong to this event → warning, denied<br>- Network disconnected → needs an offline check-in mechanism with later sync (advanced) |
| **Postconditions** | Ticket status becomes "Used", check-in time is logged |

### UC-03: Create an event & set up the seat map

| Field | Content |
|---|---|
| **Primary actor** | Organizer |
| **Secondary actor** | Admin (event approval) |
| **Description** | Organizer creates a new event, sets up ticket types and (if needed) the seating map |
| **Preconditions** | The organizer account has been verified |
| **Main flow** | 1. Enter event info: name, description, time, location, category, images<br>2. Choose the ticketing model: General Admission or Seat Map<br>3. If Seat Map: use the map builder tool (zones, row-seat, price per zone)<br>4. Set the sales open/close time<br>5. Submit the event for Admin approval<br>6. Admin approves → the event goes public |
| **Exception flows** | - Admin rejects the event (policy violation, missing info) → Organizer edits and resubmits |
| **Postconditions** | Event is in "Published" status and customers can find it and buy tickets |

### UC-04: Request a refund/cancellation

| Field | Content |
|---|---|
| **Primary actor** | Customer |
| **Secondary actor** | Organizer or Admin (request approval) |
| **Description** | Customer submits a refund request according to the event's policy |
| **Preconditions** | The ticket has not been used; still within the refund policy's allowed window |
| **Main flow** | 1. Customer selects an order → requests a refund, states a reason<br>2. System checks that event's refund policy<br>3. Organizer/Admin approves the request<br>4. System refunds via the payment gateway (minus fees if any), cancels the ticket, releases the seat (if Seat Map) |
| **Exception flows** | - Outside the refund policy's window → request rejected<br>- Ticket already used (already checked in) → cannot be refunded |
| **Postconditions** | Order is in "Canceled" status, money has been refunded (if approved) |

---

## 3. Additional use case specifications

### UC-05: Register / Log in

| Field | Content |
|---|---|
| **Primary actor** | Customer (also applies to the Organizer/Admin login path) |
| **Secondary actor** | OAuth provider (Google/Facebook), Notification System |
| **Description** | A new user creates an account or logs into an existing one |
| **Preconditions** | None for registration; for login, an account must already exist |
| **Main flow** | 1. User chooses register or login<br>2. Register: enters email/phone + password, or picks OAuth → system creates the account, sends a verification email<br>3. Login: enters credentials or OAuth → system verifies and issues a JWT access token + refresh token |
| **Exception flows** | - Email/phone already registered → error shown, suggest login instead<br>- Wrong credentials → error shown, rate-limited after repeated failures<br>- OAuth provider returns an error/cancellation → registration/login aborted |
| **Postconditions** | User has a valid session (JWT); a first-time registration stays unverified until the email is confirmed |

### UC-06: Search & filter events

| Field | Content |
|---|---|
| **Primary actor** | Customer |
| **Description** | Customer searches/filters the public event catalog |
| **Preconditions** | None (works for anonymous visitors too) |
| **Main flow** | 1. Customer enters a keyword and/or selects filters (category, location, date range, price range)<br>2. System queries Event Service and returns matching published events, paginated<br>3. Customer can sort (by date, price, popularity) and open an event for details |
| **Exception flows** | - No results match → empty state with suggestions to broaden the filters |
| **Postconditions** | None (read-only) |

### UC-07: Manage & apply discount codes

| Field | Content |
|---|---|
| **Primary actor** | Organizer (create/manage), Customer (apply) |
| **Description** | Organizer creates discount codes for an event; customers apply them at checkout |
| **Preconditions** | Organizer: the event exists and belongs to them. Customer: has items in an active order/hold |
| **Main flow** | 1. Organizer creates a code (percentage or fixed amount, quantity limit, validity window)<br>2. Customer enters the code during checkout → system validates it (event match, still valid, quantity remaining)<br>3. System recalculates the order total and shows the discount applied |
| **Exception flows** | - Code expired/exhausted/invalid for this event → rejected with a specific reason<br>- Code already used on this order → rejected |
| **Postconditions** | Order total reflects the discount; the code's used-quantity counter increments once the order is paid |

### UC-08: Review & moderate events (Admin)

| Field | Content |
|---|---|
| **Primary actor** | Admin |
| **Secondary actor** | Organizer (receives the decision) |
| **Description** | Admin reviews events submitted for approval and publishes or rejects them |
| **Preconditions** | At least one event is in "Pending approval" status |
| **Main flow** | 1. Admin opens the moderation queue, sorted by submission time<br>2. Admin reviews the event's content (info, images, pricing, seat map)<br>3. Admin approves → event becomes "Published", or rejects with a reason → event goes back to the Organizer as "Rejected" |
| **Exception flows** | - Organizer edits and resubmits a rejected event → it re-enters the queue as "Pending approval" |
| **Postconditions** | Event status updated; Organizer notified of the decision |

### UC-09: User management (Admin)

| Field | Content |
|---|---|
| **Primary actor** | Admin |
| **Description** | Admin manages user accounts: lock/unlock, assign roles |
| **Preconditions** | Admin is logged in |
| **Main flow** | 1. Admin searches/filters the user list<br>2. Admin locks an account (e.g. for fraud/abuse) or unlocks a previously locked one<br>3. Admin can approve an organizer application or change a role where applicable |
| **Exception flows** | - Admin attempts to lock their own account → blocked by the system |
| **Postconditions** | The user's lock/role status is updated; a locked user is denied login immediately |

### UC-10: View revenue reports

| Field | Content |
|---|---|
| **Primary actor** | Organizer (their own events), Admin (system-wide) |
| **Description** | View sales/revenue statistics over a selected period |
| **Preconditions** | User is logged in with the corresponding role |
| **Main flow** | 1. User selects a date range and, for Admin, optional filters (organizer, category)<br>2. System aggregates paid orders/payments/commission for the range<br>3. Dashboard shows totals, trends, and a breakdown by event/ticket type |
| **Exception flows** | - No data in the selected range → empty state |
| **Postconditions** | None (read-only) |

### UC-11: Rate an event after attending

| Field | Content |
|---|---|
| **Primary actor** | Customer |
| **Description** | Customer leaves a rating/review for an event they attended |
| **Preconditions** | Customer holds a ticket marked "Used" for that event |
| **Main flow** | 1. Customer opens a past order/event → selects "Rate this event"<br>2. Enters a star rating and an optional comment<br>3. System stores the review, shown on the event's public page |
| **Exception flows** | - Ticket not yet "Used" (customer didn't check in) → rating option unavailable<br>- Customer already rated this event → edit instead of duplicate |
| **Postconditions** | Review stored and shown publicly, factored into the event's average rating |

---

*Related documents: 01-business-analysis.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md, 07-database-schema.md, 08-api-contracts.md, 09-event-contracts.md, 10-sequence-diagrams.md, 11-implementation-roadmap.md*
