-- Resale: a ticket listed for resale is locked (no check-in, no refund).
ALTER TYPE "TicketStatus" ADD VALUE 'RESALE_LISTED';
