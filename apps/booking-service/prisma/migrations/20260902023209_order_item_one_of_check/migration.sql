-- Prisma can't express this CHECK constraint declaratively (pre-5.x) — see
-- docs/spec/07-database-schema.md §3. Exactly one of ticketTypeId/seatId
-- must be set per OrderItem (General Admission vs. Seat Map).
ALTER TABLE "OrderItem"
  ADD CONSTRAINT chk_order_item_one_of
  CHECK (
    ("ticketTypeId" IS NOT NULL AND "seatId" IS NULL) OR
    ("ticketTypeId" IS NULL AND "seatId" IS NOT NULL)
  );
