import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { Role } from "../auth/role";
import { RefundsService } from "./refunds.service";

describe("RefundsService review authorization & ticket lock", () => {
  let row: any;
  let tickets: { lock: jest.Mock; unlock: jest.Mock };
  let processor: { process: jest.Mock };
  let service: RefundsService;

  const owner = { userId: "org-owner", role: Role.ORGANIZER };
  const otherOrganizer = { userId: "org-other", role: Role.ORGANIZER };
  const admin = { userId: "admin", role: Role.ADMIN };

  beforeEach(() => {
    row = {
      id: "r1",
      orderId: "o1",
      eventId: "e1",
      userId: "cust",
      requestedBy: "cust",
      status: "REQUESTED",
      refundPercent: 80,
      grossAmount: 1000,
      amount: 800,
      orderItemIds: ["oi1"],
      evidence: [],
      auditLogs: [],
      escalatedAt: null,
      decidedAt: null,
      slaDueAt: new Date(Date.now() + 86_400_000),
    };
    const prisma = {
      refund: {
        findUnique: jest.fn(async () => row),
        updateMany: jest.fn(async ({ where, data }) => {
          if (!where.status.in.includes(row.status)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
      },
      refundAuditLog: { create: jest.fn() },
    };
    tickets = { lock: jest.fn(), unlock: jest.fn() };
    processor = { process: jest.fn() };
    const events = { getRefundContext: jest.fn().mockResolvedValue({ organizerId: "org-owner" }) };
    service = new RefundsService(prisma as any, { record: jest.fn() } as any, {} as any, events as any, tickets as any, { publish: jest.fn() } as any, {} as any, processor as any);
  });

  it("refuses an organizer approving a refund on someone else's event", async () => {
    await expect(service.approve("r1", otherOrganizer, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(processor.process).not.toHaveBeenCalled();
  });

  it("lets the event's organizer approve, re-asserting the ticket lock before paying", async () => {
    await service.approve("r1", owner, {});
    expect(tickets.lock).toHaveBeenCalledWith(["oi1"], "r1");
    expect(row.status).toBe("APPROVED");
    expect(processor.process).toHaveBeenCalledWith("r1");
  });

  it("does not pay if the ticket was scanned since the request (lock fails)", async () => {
    tickets.lock.mockRejectedValue(new ConflictException("đã được check-in"));
    await expect(service.approve("r1", owner, {})).rejects.toBeInstanceOf(ConflictException);
    expect(processor.process).not.toHaveBeenCalled();
  });

  it("only lets a reviewer raise the refund percent, never lower it", async () => {
    await expect(service.approve("r1", owner, { percent: 50 })).rejects.toBeInstanceOf(BadRequestException);
    await service.approve("r1", owner, { percent: 100 });
    expect(row).toMatchObject({ refundPercent: 100, amount: 1000, feeAmount: 0 });
  });

  it("reserves escalated requests for admins", async () => {
    row.status = "ESCALATED";
    await expect(service.approve("r1", owner, {})).rejects.toBeInstanceOf(BadRequestException);
    await service.reject("r1", admin, "Không đủ căn cứ");
    expect(row.status).toBe("REJECTED_FINAL");
  });

  it("unlocks the tickets on rejection so the customer can still attend", async () => {
    await service.reject("r1", owner, "Ngoài chính sách");
    expect(tickets.unlock).toHaveBeenCalledWith("r1");
    expect(row.status).toBe("REJECTED");
  });

  it("allows escalation after a rejection, re-locking the tickets", async () => {
    row.status = "REJECTED";
    row.decidedAt = new Date();
    await service.escalate("r1", { userId: "cust", role: Role.CUSTOMER }, "Tôi có giấy nhập viện");
    expect(tickets.lock).toHaveBeenCalledWith(["oi1"], "r1");
    expect(row.status).toBe("ESCALATED");
  });

  it("refuses escalation of a request the organizer can still answer", async () => {
    await expect(service.escalate("r1", { userId: "cust", role: Role.CUSTOMER }, "nhanh lên")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses a concurrent second decision", async () => {
    await service.reject("r1", owner, "lý do");
    await expect(service.approve("r1", owner, {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
