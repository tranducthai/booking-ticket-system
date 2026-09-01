import { ConflictException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let config: { get: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue("signed-token"),
      verifyAsync: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) =>
        ({
          JWT_ACCESS_SECRET: "access-secret",
          JWT_REFRESH_SECRET: "refresh-secret",
          JWT_ACCESS_TTL: "15m",
          JWT_REFRESH_TTL: "7d",
        })[key],
      ),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuthService(prisma as any, jwt as any, config as any);
  });

  describe("register", () => {
    it("creates a user and returns tokens when the email is new", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "u1",
        email: "a@test.com",
        fullName: "A",
        role: "CUSTOMER",
      });

      const result = await service.register({
        email: "a@test.com",
        password: "password123",
        fullName: "A",
      } as never);

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBe("signed-token");
      expect(result.refreshToken).toBe("signed-token");
      expect(result.user).toEqual({ id: "u1", email: "a@test.com", fullName: "A", role: "CUSTOMER" });
    });

    it("rejects a duplicate email without hashing a password or hitting create", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        service.register({ email: "a@test.com", password: "x", fullName: "A" } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("returns tokens for correct credentials", async () => {
      const passwordHash = await bcrypt.hash("password123", 10);
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@test.com",
        fullName: "A",
        role: "CUSTOMER",
        passwordHash,
        isLocked: false,
      });

      const result = await service.login({ email: "a@test.com", password: "password123" } as never);
      expect(result.accessToken).toBe("signed-token");
    });

    it("rejects a wrong password", async () => {
      const passwordHash = await bcrypt.hash("password123", 10);
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@test.com",
        passwordHash,
        isLocked: false,
      });

      await expect(
        service.login({ email: "a@test.com", password: "wrong-password" } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects a locked account even with the correct password", async () => {
      const passwordHash = await bcrypt.hash("password123", 10);
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@test.com",
        passwordHash,
        isLocked: true,
      });

      await expect(
        service.login({ email: "a@test.com", password: "password123" } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects an unknown email", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: "nobody@test.com", password: "x" } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("refresh", () => {
    it("issues a new token pair for a valid refresh token", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "u1", email: "a@test.com", role: "CUSTOMER" });
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@test.com",
        fullName: "A",
        role: "CUSTOMER",
        isLocked: false,
      });

      const result = await service.refresh("some-refresh-token");
      expect(jwt.verifyAsync).toHaveBeenCalledWith("some-refresh-token", {
        secret: "refresh-secret",
      });
      expect(result.accessToken).toBe("signed-token");
    });

    it("rejects an invalid or expired refresh token", async () => {
      jwt.verifyAsync.mockRejectedValue(new Error("jwt expired"));

      await expect(service.refresh("bad-token")).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects a refresh token for a since-locked account", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "u1", email: "a@test.com", role: "CUSTOMER" });
      prisma.user.findUnique.mockResolvedValue({ id: "u1", isLocked: true });

      await expect(service.refresh("some-refresh-token")).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
