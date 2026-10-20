import { RefundEventsConsumer } from "./refund-events.consumer";

describe("RefundEventsConsumer — per-ticket refunds", () => {
  let order: any;
  let publish: jest.Mock;
  let releaseDiscountCode: jest.Mock;
  let consumer: RefundEventsConsumer;
  let handler: (envelope: any) => Promise<void>;

  beforeEach(async () => {
    order = {
      id: "o1",
      userId: "u1",
      eventId: "e1",
      status: "TICKET_ISSUED",
      discountCode: "SALE",
      refundedAmount: 0,
      items: [
        { id: "a", ticketTypeId: "tt1", seatId: null, quantity: 1, refundedAt: null },
        { id: "b", ticketTypeId: "tt1", seatId: null, quantity: 1, refundedAt: null },
      ],
    };
    const prisma = {
      processedEvent: { create: jest.fn() },
      order: {
        findUnique: jest.fn(async () => order),
        update: jest.fn(({ data }) => {
          if (data.status) order.status = data.status;
          order.refundedAmount += data.refundedAmount.increment;
          return Promise.resolve(order);
        }),
      },
      orderItem: {
        updateMany: jest.fn(({ where, data }) => {
          for (const item of order.items) if (where.id.in.includes(item.id) && !item.refundedAt) item.refundedAt = data.refundedAt;
          return Promise.resolve({ count: where.id.in.length });
        }),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    publish = jest.fn();
    releaseDiscountCode = jest.fn().mockResolvedValue(undefined);
    const rabbit = { consume: jest.fn((_x, _q, _k, h) => (handler = h)), publish };
    consumer = new RefundEventsConsumer(rabbit as any, prisma as any, { record: jest.fn() } as any, { releaseDiscountCode } as any);
    await consumer.onModuleInit();
  });

  const approved = (eventId: string, orderItemIds?: string[]) => ({
    eventId,
    payload: { refundId: `r-${eventId}`, orderId: "o1", amount: 100, approvedAt: new Date().toISOString(), orderItemIds },
  });

  it("cancels only the refunded ticket and keeps the order active", async () => {
    await handler(approved("ev1", ["a"]));
    expect(order.status).toBe("TICKET_ISSUED");
    expect(order.refundedAmount).toBe(100);
    expect(publish).toHaveBeenCalledWith(
      "booking.events",
      "order-canceled",
      expect.objectContaining({ partial: true, items: [expect.objectContaining({ orderItemId: "a" })] }),
    );
    expect(releaseDiscountCode).not.toHaveBeenCalled();
  });

  it("cancels the order once its last ticket is refunded", async () => {
    await handler(approved("ev1", ["a"]));
    await handler(approved("ev2", ["b"]));
    expect(order.status).toBe("CANCELED");
    const last = publish.mock.calls[1][2];
    expect(last.partial).toBeUndefined();
    expect(last.items.map((i: any) => i.orderItemId)).toEqual(["b"]);
    expect(releaseDiscountCode).toHaveBeenCalledWith("e1", "SALE");
  });

  it("treats a refund without orderItemIds as the whole order (canceled event, older publishers)", async () => {
    await handler(approved("ev1"));
    expect(order.status).toBe("CANCELED");
    expect(publish.mock.calls[0][2].items).toHaveLength(2);
  });
});
