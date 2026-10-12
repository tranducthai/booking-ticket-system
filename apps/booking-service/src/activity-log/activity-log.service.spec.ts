import { ActivityLogService } from "./activity-log.service";
import { requestContext } from "./request-context";

describe("ActivityLogService", () => {
  let rows: any[];
  let prisma: any;
  let service: ActivityLogService;

  beforeEach(() => {
    rows = [];
    prisma = {
      activityLog: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `id-${rows.length.toString().padStart(3, "0")}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, rows.length)), ...data };
          rows.push(row);
          return row;
        }),
        findMany: jest.fn(async ({ take }) =>
          // Good enough for these tests: newest first, cursor applied by hand below.
          [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take),
        ),
      },
    };
    service = new ActivityLogService(prisma);
  });

  it("never throws — a failed log write must not fail the business action", async () => {
    prisma.activityLog.create.mockRejectedValueOnce(new Error("db down"));
    await expect(service.record({ action: "order.created", targetType: "order", summary: "x" })).resolves.toBeUndefined();
  });

  it("stamps actor, IP and user agent from the request context", async () => {
    await requestContext.run({ actorId: "u1", actorRole: "CUSTOMER", ip: "1.2.3.4", userAgent: "UA" }, () =>
      service.record({ action: "order.created", targetType: "order", summary: "x" }),
    );
    expect(rows[0]).toMatchObject({ actorId: "u1", actorRole: "CUSTOMER", ip: "1.2.3.4", userAgent: "UA" });
  });

  it("attributes writes outside any request (consumers, crons) to the system", async () => {
    await service.record({ action: "order.expired", targetType: "order", summary: "x" });
    expect(rows[0]).toMatchObject({ actorId: "system", actorRole: "SYSTEM" });
  });

  it("does not inherit the caller's role when logging on behalf of someone else", async () => {
    await requestContext.run({ actorId: "admin", actorRole: "ADMIN" }, () =>
      service.record({ actorId: "anonymous", action: "auth.login_failed", targetType: "user", summary: "x" }),
    );
    expect(rows[0]).toMatchObject({ actorId: "anonymous", actorRole: null });
  });

  it("pages with a keyset cursor and hides network details from organizers", async () => {
    for (let i = 0; i < 3; i++) {
      await requestContext.run({ ip: "9.9.9.9" }, () => service.record({ action: "order.paid", targetType: "order", eventId: "e1", summary: `${i}` }));
    }
    const page = await service.listForEvent("e1", { limit: 2 });
    expect(page.data).toHaveLength(2);
    expect(page.nextBefore).toBe(page.data[1].cursor);
    expect(page.data.every((r) => r.ip === null && r.source === "booking")).toBe(true);

    const admin = await service.listAll({ limit: 2 });
    expect(admin.data[0].ip).toBe("9.9.9.9");
  });
});
