import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TicketStatus } from "../generated/prisma";
import { Role } from "../auth/role";
import { EventServiceClient } from "../event-client/event-service.client";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { DYNAMIC_STEP_SECONDS, QrSignerService } from "../qr/qr-signer.service";
import { TicketsService } from "./tickets.service";

const config = (env: Record<string, string> = {}) =>
  ({ get: (k: string) => ({ TICKET_SIGNING_SECRET: "s", ...env })[k] }) as unknown as ConfigService;

describe("TicketsService.checkIn", () => {
  const signer = new QrSignerService(config());
  const organizer = { userId: "org-1", role: Role.ORGANIZER };
  let tickets: Record<string, any>;
  let prisma: any;
  let service: TicketsService;
  let activity: { record: jest.Mock };

  function issue(id: string, eventId = "e1", qrVersion = 1) {
    const signed = signer.sign({ ticketId: id, eventId, orderItemId: `oi-${id}`, issuedAt: "2026-01-01T00:00:00Z", qrVersion });
    tickets[id] = { id, eventId, orderItemId: `oi-${id}`, userId: "u1", qrPayload: signed.qrPayload, qrSignature: signed.qrSignature, qrVersion, status: TicketStatus.ISSUED };
    return signed.qrPayload;
  }

  function build(env: Record<string, string> = {}) {
    const eventClient = { getOrganizerId: jest.fn().mockResolvedValue("org-1") } as unknown as EventServiceClient;
    const metrics = { checkinsTotal: { inc: jest.fn() }, checkinRejectedTotal: { inc: jest.fn() } } as unknown as MetricsService;
    activity = { record: jest.fn() };
    service = new TicketsService(prisma as PrismaService, activity as any, signer, eventClient, metrics, config(env));
  }

  beforeEach(() => {
    tickets = {};
    prisma = {
      ticket: {
        findUnique: jest.fn(async ({ where }) => tickets[where.id] ?? null),
        findUniqueOrThrow: jest.fn(async ({ where }) => tickets[where.id]),
        // Emulates Postgres' conditional UPDATE: only matches rows still in the expected state.
        updateMany: jest.fn(async ({ where, data }) => {
          const t = tickets[where.id];
          if (!t || t.status !== where.status || t.qrVersion !== where.qrVersion) return { count: 0 };
          Object.assign(t, data);
          return { count: 1 };
        }),
      },
    };
    build();
  });

  it("admits a valid static code exactly once", async () => {
    const code = issue("t1");
    await expect(service.checkIn("e1", code, organizer)).resolves.toMatchObject({ status: TicketStatus.USED });
    await expect(service.checkIn("e1", code, organizer)).rejects.toBeInstanceOf(ConflictException);
  });

  it("logs every refused scan for the fraud trail", async () => {
    const code = issue("t1");
    await service.checkIn("e1", code, organizer);
    await expect(service.checkIn("e1", code, organizer)).rejects.toBeInstanceOf(ConflictException);
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ticket.checkin_rejected", eventId: "e1", targetId: "t1", subjectUserId: "u1", metadata: { reason: "already_used" } }),
    );
  });

  it("lets only one of two simultaneous scans of the same screenshot through", async () => {
    const code = issue("t1");
    const results = await Promise.allSettled([service.checkIn("e1", code, organizer), service.checkIn("e1", code, organizer)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("admits a current rotating code", async () => {
    issue("t1");
    const step = Math.floor(Date.now() / 1000 / DYNAMIC_STEP_SECONDS);
    await expect(service.checkIn("e1", signer.dynamicCode("t1", 1, step), organizer)).resolves.toMatchObject({ status: TicketStatus.USED });
  });

  it("refuses a ticket of another event", async () => {
    const code = issue("t1", "other-event");
    await expect(service.checkIn("e1", code, organizer)).rejects.toThrow("không thuộc sự kiện");
  });

  it("refuses a code from before a reissue", async () => {
    const oldCode = issue("t1");
    issue("t1", "e1", 2); // reissued: version 2, new stored payload
    await expect(service.checkIn("e1", oldCode, organizer)).rejects.toThrow("thay thế");
  });

  it("refuses a ticket locked by a pending refund", async () => {
    const code = issue("t1");
    tickets.t1.status = TicketStatus.REFUND_PENDING;
    await expect(service.checkIn("e1", code, organizer)).rejects.toThrow("chờ hoàn");
  });

  it("refuses static codes when only rotating codes are allowed", async () => {
    build({ TICKET_STATIC_QR_ENABLED: "false" });
    const code = issue("t1");
    await expect(service.checkIn("e1", code, organizer)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses an organizer scanning for an event they don't own", async () => {
    const code = issue("t1");
    await expect(service.checkIn("e1", code, { userId: "someone-else", role: Role.ORGANIZER })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
