# BUSINESS ANALYSIS
## Online Event Ticketing System (similar to Ticketbox)

---

## 1. System Overview

The system is an intermediary platform (marketplace) connecting **Event Organizers** with **Ticket Buyers**, allowing:
- Organizers to create, manage, and sell tickets for their events
- Customers to search for events, buy tickets, and attend events using e-tickets
- The platform to charge service fees / commission on transactions

**Project scope:** The system supports a variety of event types like Ticketbox — **Music (concerts), Theater/Stage, Movies (cinema), Sports, Workshops/Conferences**. Each type has its own characteristics to consider:

| Event type | Characteristics |
|---|---|
| Music / Theater / Sports | Usually has a **fixed seating map**, multiple ticket tiers by zone |
| Movies | Seat map per showtime (multiple showtimes/day), short gaps between showtimes |
| Workshop/Conference | Usually no fixed seating (General Admission), limited quantity |

Therefore the system needs to support **2 parallel ticketing models**:
1. **Unassigned tickets (General Admission)** — quantity-limited only, first-come-first-served
2. **Assigned-seat tickets (Seat Selection)** — customers pick a specific seat on the map

---

## 2. Actors / Stakeholders

| Actor | Role |
|---|---|
| **Customer (Buyer)** | Searches for events, buys tickets, pays, receives e-tickets, attends events |
| **Organizer** | Creates & manages events, sets up ticket types/prices, tracks revenue, checks in guests |
| **System Administrator (Admin)** | Approves events, manages users, handles complaints, configures commission, views system-wide reports |
| **Check-in Staff** | Scans ticket codes at the venue gate to verify them |
| **Payment Gateway** | Third party that processes transactions (VNPay, Momo, ZaloPay, cards...) |
| **Notification System (Email/SMS Gateway)** | Sends e-tickets, order confirmations, event reminders |

---

## 3. Functional Requirements

### 3.1. Customer-facing features
- **Register / Log in** (email, phone number, or OAuth Google/Facebook)
- **Search & filter events** by: category, location, time, price range, keyword
- **View event details**: description, time, location, seating map (if any), ticket types & prices
- **Select tickets & reserve**:
  - For General Admission events: choose quantity, ticket type (VIP/Regular)
  - For Seat Map events: view the visual map (available/sold/held seats), pick specific seats, seats are **held temporarily** (e.g. 10 minutes) during checkout, auto-released on expiry
- **Cart & checkout**: apply discount codes, choose payment method, confirm order
- **Receive e-ticket**: QR/barcode sent via email or stored in-app
- **Order management**: view purchase history, order status, request refund/cancellation (if policy allows)
- **Rate events** after attending (optional extension)
- **Receive notifications**: event reminders, promotions, schedule changes

### 3.2. Organizer-facing features
- **Register an organizer account** (may require verification/approval by Admin)
- **Create & edit events**: info, images, time, location
- **Set up ticket types & prices**: multiple tiers, quantity limits, sales open/close time
- **Set up the seating map (Seat Map Builder)**:
  - Build the map by zone: VIP, Regular, Balcony... each zone with its own price
  - For cinemas/theaters: build a row-column seat grid
  - For stadiums/standing areas: can be a zone without individual seats (General zone), capacity-limited only
  - Mark blocked seats (broken seats, seats reserved for guests/press)
  - Copy the map between similar showtimes/events for reuse
- **Manage discount codes / vouchers**
- **Track ticket sales** in real time (dashboard)
- **Export attendee lists**
- **Check in guests at the event** (QR scan)
- **View revenue reports**, reconcile with the platform (after commission deduction)

### 3.3. Admin-facing features
- **Approve/reject events** before they go public (content moderation)
- **User management**: lock/unlock accounts, assign roles
- **Configure commission / service fees**
- **Manage event categories**
- **Handle complaints, refund requests**
- **View system-wide reports & statistics**: revenue, transaction count, trending events

### 3.4. Automated system features
- **Process payments** via the payment gateway, confirm transactions
- **Generate e-tickets** (QR code), unique, tamper/duplicate resistant
- **Send automated email/SMS**: order confirmation, e-ticket, reminders
- **Temporary seat/ticket locking** while the customer checks out, to prevent double-selling
- **Automatic revenue reconciliation** between the platform and organizers

---

## 4. Non-functional Requirements

| Category | Specific requirement |
|---|---|
| **Performance** | Handle high load during ticket sales openings (flash sale) — many simultaneous buyers, avoid overselling |
| **Security** | Encrypt payment info, prevent ticket fraud, clear role-based access control |
| **Availability** | High uptime, especially during sales-opening windows |
| **Scalability** | Architecture that scales as the number of events/users grows |
| **Data consistency** | Guarantee tickets are never oversold (concurrency control) |
| **User experience** | Responsive UI (mobile-first, since most users buy tickets via phone) |
| **Auditability** | Log transactions and change history for dispute resolution |

---

## 5. The Seat Map Problem — deep dive

Since this is a complex module and also a key technical highlight, the business flow needs careful analysis:

**Seat state machine:**
```
Available
   ├─→ Held/Locked (customer is checking out)
   │      ├─→ Booked/Sold (payment succeeded)
   │      └─→ Available (hold expired / customer canceled)
   │
   └─→ Blocked (locked by the Organizer — broken seat/reserved for VIPs)

Booked/Sold → Available (approved refund/cancellation before the event — see UC-04, 02-use-cases.md)
```

**Concurrency — the most important issue:**
- 2 customers click the same seat at the same moment → only 1 gets to hold the seat, the other gets a "this seat was just taken" notification
- Possible technical solutions to propose: **row-level lock** or **optimistic locking** (version field) at the database level, or **Redis** to hold seat state temporarily with a self-expiring TTL (Time-To-Live) — this is the modern, highly regarded approach.
- Real-time seat state updates for other customers viewing the same map → consider **WebSocket** to push seat state directly (when someone holds/releases a seat, others see it change color immediately).

**Customer seat-selection flow:**
1. Customer opens the event page → views the seat map (real-time state)
2. Selects one or more available seats → system holds them temporarily (Held) + starts a countdown (e.g. 10 minutes)
3. Customer proceeds to payment within the hold window
4. Payment succeeds → seat becomes Booked, e-ticket generated
5. Hold expires without payment → seat automatically returns to Available

---

## 6. Core business problems to solve (the hard parts of the project)

These are the "backbone" problems typically valued highly in a ticketing-system project:

1. **Preventing overselling** when many people buy at once → needs a temporary lock mechanism (reservation timeout ~5-15 minutes) + transaction/lock handling at the database layer (applies to both General Admission tickets and Seat Map seats).
2. **Generating and validating tamper-proof e-tickets** — QR code with a digital signature or hash, checked at the check-in gate to prevent a screenshotted ticket from being reused.
3. **Financial reconciliation** between Ticketbox (the platform) and the Organizer (commission %, when the organizer gets paid).
4. **Refund/cancellation process** — refund policy, who bears the transaction fee for the refund.
5. **Order status flow**: Pending payment → Paid → Ticket issued → Used / Canceled.
6. **Real-time seat state synchronization** (analyzed in section 5) for events with a seating map.

---

## 7. Overall project scope

For full scope (diverse event types + seat map), here are all the modules to build:

| Module | Content |
|---|---|
| **User management** | Register/login, 3-role access control (Customer, Organizer, Admin), organizer account verification |
| **Event management** | Event CRUD, categories (Music/Theater/Movie/Sports/Workshop), event approval by Admin |
| **Ticket & pricing management** | Set up ticket tiers, prices, quantities, sales open/close time |
| **Seat Map Builder & Booking** | Build seat maps, real-time holds, seat selection for customers |
| **Cart & Payment** | Apply discount codes, integrate payment gateway, handle transactions |
| **E-tickets** | Generate QR codes, send emails, anti-fraud |
| **Check-in** | Scan codes at the venue, validate tickets (web or a dedicated app for check-in staff) |
| **Dashboard & Reports** | Revenue stats for Organizers, system-wide reports for Admin |
| **Notifications** | Automated email/SMS for key events in the purchase flow |

Given the large scope, the project should have a **phased (sprint) development roadmap** — e.g.: phase 1 builds the user + event + basic ticket modules, phase 2 builds seat map + payment, phase 3 builds check-in + dashboard + polish.

---

*Related documents: 02-use-cases.md, 03-system-design.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md*
