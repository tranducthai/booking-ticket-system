import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EventsService } from "./events.service";

describe("EventsService authorization rules", () => {
  let event: any;
  let service: EventsService;

  beforeEach(() => {
    event = { id: "e1", organizerId: "org", status: "DRAFT", title: "T", startTime: new Date(Date.now() + 864e5 * 30) };
    const prisma = {
      event: {
        findUnique: jest.fn(async () => event),
        update: jest.fn(async ({ data }) => Object.assign(event, data)),
      },
    };
    const redis = { get: jest.fn(async () => null), set: jest.fn(async () => "OK"), del: jest.fn(async () => 1) };
    service = new EventsService(prisma as any, redis as any, { publish: jest.fn() } as any);
  });

  describe("findVisible (public GET /events/:id)", () => {
    it.each(["DRAFT", "PENDING_APPROVAL", "REJECTED"])("hides a %s event from strangers as 404", async (status) => {
      event.status = status;
      await expect(service.findVisible("e1", { userId: "someone", role: "CUSTOMER" })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.findVisible("e1", { userId: null, role: null })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("shows it to its organizer and to admins", async () => {
      await expect(service.findVisible("e1", { userId: "org", role: "ORGANIZER" })).resolves.toMatchObject({ id: "e1" });
      await expect(service.findVisible("e1", { userId: "a", role: "ADMIN" })).resolves.toMatchObject({ id: "e1" });
    });

    it.each(["PUBLISHED", "CANCELED"])("shows a %s event to everyone", async (status) => {
      event.status = status;
      await expect(service.findVisible("e1", { userId: null, role: null })).resolves.toMatchObject({ id: "e1" });
    });
  });

  describe("update", () => {
    it("refuses moving the date or venue of an event on sale (must go through postpone)", async () => {
      event.status = "PUBLISHED";
      await expect(service.update("e1", "org", { startTime: new Date() })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update("e1", "org", { venueName: "Elsewhere" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("still allows descriptive edits on an event on sale", async () => {
      event.status = "PUBLISHED";
      await expect(service.update("e1", "org", { description: "Thêm thông tin" })).resolves.toMatchObject({ description: "Thêm thông tin" });
    });

    it("refuses any edit of a canceled event", async () => {
      event.status = "CANCELED";
      await expect(service.update("e1", "org", { description: "x" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("lets a draft change anything", async () => {
      await expect(service.update("e1", "org", { venueName: "New hall" })).resolves.toMatchObject({ venueName: "New hall" });
    });
  });
});
