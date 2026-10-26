import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateDiscountCodeDto } from "../discount-codes/dto/create-discount-code.dto";
import { CreateEventDto } from "../events/dto/create-event.dto";
import { CreateTicketTypeDto } from "../ticket-types/dto/create-ticket-type.dto";
import { CreateArtistDto } from "../artists/dto/create-artist.dto";

const messages = (cls: new () => object, input: object) =>
  validateSync(plainToInstance(cls, input)).flatMap((e) => Object.values(e.constraints ?? {}));

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const event = {
  categoryId: "c1",
  title: "Đêm nhạc mùa thu",
  venueName: "Nhà hát Lớn",
  venueAddress: "1 Tràng Tiền, Hà Nội",
  startTime: inDays(10),
  endTime: inDays(10.1),
  ticketMode: "GENERAL",
};

describe("event input rules", () => {
  it("accepts a well-formed event", () => {
    expect(messages(CreateEventDto, event)).toEqual([]);
  });

  it("rejects a start time in the past", () => {
    expect(messages(CreateEventDto, { ...event, startTime: inDays(-1), endTime: inDays(1) })).toContain("Thời gian bắt đầu phải sau thời điểm hiện tại");
  });

  it("rejects an end before the start", () => {
    expect(messages(CreateEventDto, { ...event, endTime: inDays(9) })).toContain("Thời gian kết thúc phải sau thời gian bắt đầu");
  });

  it("rejects a too-short title", () => {
    expect(messages(CreateEventDto, { ...event, title: "Hi" }).join()).toContain("Tên sự kiện");
  });

  it("rejects a negative ticket price and an inverted sales window", () => {
    const m = messages(CreateTicketTypeDto, { name: "VIP", price: -1, quantityTotal: 10, salesStart: inDays(5), salesEnd: inDays(2) });
    expect(m).toContain("Giá vé không được âm");
    expect(m).toContain("Thời gian đóng bán phải sau thời gian mở bán");
  });

  it("allows a free (0đ) ticket", () => {
    expect(messages(CreateTicketTypeDto, { name: "Vé miễn phí", price: 0, quantityTotal: 100 })).toEqual([]);
  });

  it("normalizes discount codes to upper case and rejects odd characters", () => {
    const dto = plainToInstance(CreateDiscountCodeDto, { code: " summer10 ", discountType: "PERCENT", value: 10, quantityTotal: 5 });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.code).toBe("SUMMER10");
    expect(messages(CreateDiscountCodeDto, { code: "giảm giá!", discountType: "PERCENT", value: 10, quantityTotal: 5 }).join()).toContain("Mã giảm giá");
  });

  it("accepts an artist with known social links and rejects unknown networks or non-URLs", () => {
    expect(messages(CreateArtistDto, { name: "Ngọt", socialLinks: { facebook: "https://facebook.com/ngot", spotify: "https://open.spotify.com/artist/x" } })).toEqual([]);
    expect(messages(CreateArtistDto, { name: "Ngọt", socialLinks: { myspace: "https://myspace.com/x" } }).join()).toContain("mạng xã hội");
    expect(messages(CreateArtistDto, { name: "Ngọt", socialLinks: { facebook: "javascript:alert(1)" } }).join()).toContain("mạng xã hội");
  });
});
