import { RefundProcessorService } from "./refund-processor.service";

describe("RefundProcessorService.process", () => {
  let row: any;
  let gateway: { refund: jest.Mock };
  let publish: jest.Mock;
  let service: RefundProcessorService;

  beforeEach(() => {
    row = {
      id: "r1",
      status: "APPROVED",
      attempts: 0,
      amount: 800,
      grossAmount: 1000,
      orderId: "o1",
      userId: "u1",
      kind: "CUSTOMER_REQUEST",
      decidedAt: new Date(),
      paymentId: "p1",
      orderItemIds: [],
      payment: { method: "vnpay", gatewayTxnId: "g1", amount: 1000 },
    };
    const prisma = {
      refund: {
        // Emulates the conditional claim UPDATE ... WHERE status IN (...)
        updateMany: jest.fn(async ({ where, data }) => {
          if (!where.status.in.includes(row.status) || row.attempts >= where.attempts.lt) return { count: 0 };
          row.status = data.status;
          row.attempts += data.attempts.increment;
          return { count: 1 };
        }),
        update: jest.fn(async ({ data }) => Object.assign(row, data)),
        findUniqueOrThrow: jest.fn(async () => row),
        findUnique: jest.fn(async () => row),
      },
      refundAuditLog: { create: jest.fn() },
    };
    gateway = { refund: jest.fn().mockResolvedValue({ success: true, gatewayRefundId: "GW1", message: "ok" }) };
    publish = jest.fn();
    service = new RefundProcessorService(
      prisma as any,
      { record: jest.fn() } as any,
      { forMethod: () => gateway } as any,
      { publish } as any,
      { refundsCompletedTotal: { inc: jest.fn() } } as any,
    );
  });

  it("pays once, with the refund id as idempotency key and the partial flag, then publishes RefundApproved", async () => {
    await service.process("r1");
    expect(gateway.refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 800, idempotencyKey: "r1", partial: true }));
    expect(row.status).toBe("COMPLETED");
    expect(publish).toHaveBeenCalledWith("payment.events", "refund-approved", expect.objectContaining({ refundId: "r1", amount: 800 }));
  });

  it("treats 100% of one ticket as a PARTIAL refund of the transaction and names the tickets", async () => {
    Object.assign(row, { amount: 400, grossAmount: 400, orderItemIds: ["oi1"] }); // 1 of a 1000-dong order's tickets
    await service.process("r1");
    expect(gateway.refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 400, partial: true }));
    expect(publish).toHaveBeenCalledWith("payment.events", "refund-approved", expect.objectContaining({ orderItemIds: ["oi1"] }));
  });

  it("refunds the full transaction as a full refund", async () => {
    Object.assign(row, { amount: 1000, grossAmount: 1000 });
    await service.process("r1");
    expect(gateway.refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 1000, partial: false }));
  });

  it("never calls the gateway twice for two concurrent triggers", async () => {
    await Promise.all([service.process("r1"), service.process("r1")]);
    expect(gateway.refund).toHaveBeenCalledTimes(1);
  });

  it("marks a definite gateway refusal FAILED (retryable)", async () => {
    gateway.refund.mockResolvedValue({ success: false, message: "insufficient merchant balance" });
    await service.process("r1");
    expect(row.status).toBe("FAILED");
    expect(publish).not.toHaveBeenCalled();
  });

  it("leaves an unknown outcome (thrown error) in PROCESSING so it is never blindly retried", async () => {
    gateway.refund.mockRejectedValue(new Error("socket hang up"));
    await service.process("r1");
    expect(row.status).toBe("PROCESSING");
    await service.process("r1");
    expect(gateway.refund).toHaveBeenCalledTimes(1);
  });
});
