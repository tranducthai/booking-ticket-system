# SYSTEM DESIGN
## Online Event Ticketing System (similar to Ticketbox)

---

## 1. Database design (ERD)

13 tables: `USERS`, `CATEGORIES`, `EVENTS`, `TICKET_TYPES`, `SEAT_MAPS`, `SEAT_ZONES`, `SEATS`, `ORDERS`, `ORDER_ITEMS`, `TICKETS`, `PAYMENTS`, `DISCOUNT_CODES`, `REFUNDS`.

*(The full ERD diagram was shown during the discussion — it can be rebuilt with dbdiagram.io or MySQL Workbench for the report.)*

### Core design decision: handling 2 ticketing models in 1 schema

The `ORDER_ITEMS` table has **2 optional foreign keys** (nullable):
- `ticket_type_id` → filled in for unassigned-seat tickets (General Admission)
- `seat_id` → filled in when the customer picks a specific seat (Seat Map)

A given `order_items` row fills in exactly one of these two columns (a database-level CHECK constraint: exactly one of the two is non-NULL). This lets the entire booking flow — cart, payment, e-ticket generation — share a single processing pipeline regardless of which model the event uses.

The `EVENTS.ticket_mode` column (value `general` or `seatmap`) tells the app whether to show the quantity-selection UI or the seat-map UI.

### Explanation of the main tables

| Table | Role |
|---|---|
| `USERS` | Shared account table for all 3 roles (distinguished by the `role` column) |
| `CATEGORIES` | Event categories (Music/Theater/Movie/Sports/Workshop...), assigned to `EVENTS` |
| `EVENTS` | Event info, linked to the organizer and category |
| `TICKET_TYPES` | Ticket tiers (VIP/Regular) for General Admission events — has `quantity_total`/`quantity_sold` for inventory control |
| `SEAT_MAPS` → `SEAT_ZONES` → `SEATS` | 3-tier hierarchy for seated events: 1 event has 1 map, 1 map has multiple zones, 1 zone has multiple seats. `SEATS.status` stores Available/Held/Booked/Blocked — this is the field that needs concurrency handling (lock or Redis TTL) when a customer holds a seat |
| `ORDERS` | Order, groups multiple `ORDER_ITEMS` |
| `ORDER_ITEMS` | Each ticket/seat within an order — the bridge between the 2 ticketing models |
| `TICKETS` | Electronic QR ticket — 1-to-1 with `ORDER_ITEMS` |
| `PAYMENTS` | Separated from `ORDERS` to support multiple payment attempts for the same order |
| `REFUNDS` | Refund requests, linked to `ORDERS` |
| `DISCOUNT_CODES` | Discount codes per event |

### Implementation notes
- Consider an additional `SEAT_HOLDS` table (or use Redis) to store temporary hold state with a TTL, to avoid `SEATS.status = 'held'` getting "stuck" forever if the updating process fails.
- Consider indexing `EVENTS.start_time`, `ORDERS.user_id`, `SEATS.zone_id` to optimize search and lookup queries.
- `ORDER_ITEMS.price` should store the **price at purchase time** (a snapshot), not reference `TICKET_TYPES`/`SEAT_ZONES`'s current price directly, to avoid discrepancies if the ticket price changes later.

---

## 2. Microservices architecture

Client → API Gateway → 6 business microservices → Message broker.

*(The full architecture diagram was shown during the discussion.)*

### Service & data split (Database per Service)

| Service | Owns tables (from ERD) | Main responsibility |
|---|---|---|
| **User Service** | `USERS` | Register/login, JWT, 3-role access control |
| **Event Service** | `EVENTS`, `CATEGORIES`, `TICKET_TYPES`, `SEAT_MAPS`, `SEAT_ZONES`, `SEATS`, `DISCOUNT_CODES` | Source of truth for event structure & seat maps, event search/filtering |
| **Booking Service** | `ORDERS`, `ORDER_ITEMS` | Cart, temporary holds via Redis (TTL), kicks off the booking flow and updates order status when it receives events from the broker |
| **Payment Service** | `PAYMENTS`, `REFUNDS` | Integrates with the external payment gateway, handles webhooks, refunds |
| **Ticket Service** | `TICKETS` | Generates digitally-signed QR codes, handles event check-in |
| **Notification Service** | (owns no business table) | Listens to system events, sends email/SMS |

### Inter-service communication

- **Synchronous (REST via API Gateway)**: for operations that need an immediate response — login, event search, seat holding, payment.
- **Asynchronous (via Message Broker — Kafka/RabbitMQ)**: for steps that happen after a main action has completed — e.g. after a successful payment, generating the ticket and sending the email, which the customer doesn't need to wait for.

### Booking flow using the Saga pattern (event-driven)

1. Client → Gateway → **Booking Service**: hold the seat (calls Event Service to lock the seat via Redis, TTL ~10 min)
2. Client → Gateway → **Payment Service**: process payment via the external payment gateway
3. Payment Service succeeds → publishes a `PaymentSucceeded` event to the broker
4. **Booking Service** listens → moves the order to "Paid" status
5. **Ticket Service** listens → generates the e-ticket (QR)
6. **Notification Service** listens → sends the e-ticket confirmation email to the customer

If a step fails (e.g. ticket generation errors out), the system can retry or publish a compensating event (e.g. an automatic refund) without services calling each other directly in a chain — this is a technical point worth emphasizing in the report, as it demonstrates understanding of the **Saga pattern**, an important topic when designing microservices with transactions spanning multiple services.

**Terminology note:** this is **choreography-style Saga** — each service independently listens to events on the broker and decides its own next action, with **no central service orchestrating** the whole flow. This is distinct from **orchestration-style Saga**, where an orchestrator (e.g. Booking Service itself) calls each service in sequence and issues commands, and also decides the compensating steps on failure. This is a question the defense committee likes to ask whenever the word "Saga" appears in the report — the correct answer here is that the system uses choreography.

### Suggested tech stack (reference)

| Component | Suggested technology |
|---|---|
| Backend framework | Spring Boot (Java) or NestJS (Node.js) — whichever stack you're familiar with |
| Database per service | PostgreSQL (relational, fits the designed ERD) |
| Cache & temporary holds | Redis (TTL for seat/ticket holding) |
| Message broker | RabbitMQ (easier to set up for a school project) or Kafka (if you want to show more advanced skills) |
| API Gateway | Spring Cloud Gateway, Kong, or Nginx depending on the stack |
| Containerization | Docker + Docker Compose (enough for a school project, Kubernetes not required) |

### Implementation note for the project
Given the limited time available, it isn't necessary to split all 6 services into 6 fully independent processes from day one. You can start with a **modular monolith** architecture (code split into clear modules along the boundaries above) and gradually extract 1-2 of the most important services into true microservices (e.g. Booking Service, since it best showcases the concurrency problem) — enough technical depth to defend the project while staying feasible on time.

---

*Related documents: 01-business-analysis.md, 02-use-cases.md, 04-deployment-design.md, 05-project-structure-and-tech-stack.md, 06-infrastructure-diagram.md*
