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

## 3. Remaining use cases (suggested for further specification)

The following use cases haven't been detailed yet; they can be specified using the same template (Actor, Preconditions, Main flow, Exception flows, Postconditions) when writing the full report:

- Account registration/login
- Search & filter events
- Discount code management (Organizer creates, Customer applies)
- Event approval (Admin)
- User management (Admin locks/unlocks accounts)
- View revenue reports (Organizer, Admin)
- Rate an event after attending

---

*Related documents: 01-business-analysis.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md*
