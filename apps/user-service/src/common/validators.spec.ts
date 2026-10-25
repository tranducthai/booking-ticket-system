import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { RegisterDto } from "../auth/dto/register.dto";

const errorsOf = (input: object) =>
  validateSync(plainToInstance(RegisterDto, input)).flatMap((e) => Object.values(e.constraints ?? {}));

const valid = { email: "a@test.com", password: "matkhau123", fullName: "Nguyễn Văn A" };

describe("account input rules (RegisterDto)", () => {
  it("accepts a normal Vietnamese registration and normalizes the phone", () => {
    const dto = plainToInstance(RegisterDto, { ...valid, phone: "091 234.5678" });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.phone).toBe("0912345678");
  });

  it.each(["0123456789", "091234567", "abc0912345", "+8412345678"])("rejects phone %s", (phone) => {
    expect(errorsOf({ ...valid, phone }).join()).toContain("Số điện thoại");
  });

  it("accepts +84 numbers", () => {
    expect(errorsOf({ ...valid, phone: "+84912345678" })).toHaveLength(0);
  });

  it.each(["not-an-email", "a@b", "@test.com"])("rejects email %s", (email) => {
    expect(errorsOf({ ...valid, email }).join()).toContain("Email");
  });

  it.each(["abcdefgh", "12345678", "a1"])("rejects weak password %s", (password) => {
    expect(errorsOf({ ...valid, password }).join()).toContain("Mật khẩu");
  });

  it.each(["A", "Nguyen123", "Lê <script>"])("rejects name %s", (fullName) => {
    expect(errorsOf({ ...valid, fullName }).length).toBeGreaterThan(0);
  });
});
