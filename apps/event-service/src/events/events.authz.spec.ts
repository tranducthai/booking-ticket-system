import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { EventsService } from "./events.service";

const ORG = { userId: "org", role: "ORGANIZER" };

describe("EventsService authorization rules", () => {
  let event: any;
  let service: EventsService;

  beforeEach(() => {
    event = { id: "e1", organizerId: "org", status: "DRAFT", title: "T", ticketMode: "GENERAL", ticketTypes: [], showtimes: [], startTime: new Date(Date.now() + 864e5 * 30) };
    const prisma = {
      event: {
        findUnique: jest.fn(async () => event),
        update: jest.fn(async ({ data }) => Object.assign(event, data)),
      },
      seatMap: { findUnique: jest.fn(async () => null) },
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
      await expect(service.update("e1", ORG, { startTime: new Date() })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update("e1", ORG, { venueName: "Elsewhere" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("still allows descriptive edits on an event on sale", async () => {
      event.status = "PUBLISHED";
      await expect(service.update("e1", ORG, { description: "Thêm thông tin" })).resolves.toMatchObject({ description: "Thêm thông tin" });
    });

    it("refuses any edit of a canceled event", async () => {
      event.status = "CANCELED";
      await expect(service.update("e1", ORG, { description: "x" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("lets a draft change anything", async () => {
      await expect(service.update("e1", ORG, { venueName: "New hall" })).resolves.toMatchObject({ venueName: "New hall" });
    });
  });

  describe("admin managing a partner's event", () => {
    it("lets an admin edit an event they don't own", async () => {
      await expect(service.update("e1", { userId: "admin", role: "ADMIN" }, { description: "Sửa bởi admin" })).resolves.toMatchObject({
        description: "Sửa bởi admin",
      });
    });

    it("still refuses another organizer", async () => {
      await expect(service.update("e1", { userId: "other-org", role: "ORGANIZER" }, { description: "x" })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe("multi-showtime events", () => {
    it("refuses editing the event dates directly — they come from the showtimes", async () => {
      event.showtimes = [{ id: "s1" }];
      await expect(service.update("e1", ORG, { startTime: new Date() })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update("e1", ORG, { description: "ok" })).resolves.toMatchObject({ description: "ok" });
    });
  });

  describe("approve (publish)", () => {
    it("lets an admin publish a draft directly once it has a visible ticket type", async () => {
      event.ticketTypes = [{ isHidden: false }];
      await expect(service.approve("e1")).resolves.toMatchObject({ status: "PUBLISHED" });
    });

    it("refuses to publish an event with nothing to sell", async () => {
      await expect(service.approve("e1")).rejects.toBeInstanceOf(BadRequestException);
      event.ticketTypes = [{ isHidden: true }];
      await expect(service.approve("e1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a seat-map event without a seat map", async () => {
      event.ticketMode = "SEATMAP";
      await expect(service.approve("e1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses an event that is already published or canceled", async () => {
      event.ticketTypes = [{ isHidden: false }];
      for (const status of ["PUBLISHED", "CANCELED"]) {
        event.status = status;
        await expect(service.approve("e1")).rejects.toBeInstanceOf(BadRequestException);
      }
    });
  });
});
