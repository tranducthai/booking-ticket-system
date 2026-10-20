import { ConflictException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { OAuthLoginError } from "./oauth/oauth-errors";

describe("AuthService", () => {
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    oAuthLoginCode: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  };
  let sessions: { start: jest.Mock; rotate: jest.Mock; logout: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      oAuthLoginCode: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    };
    sessions = {
      start: jest.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh" }),
      rotate: jest.fn(),
      logout: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuthService(prisma as any, sessions as any, { record: jest.fn() } as any);
  });

  describe("register", () => {
    it("creates a user and starts a session when the email is new", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: "u1", email: "a@test.com", fullName: "A", role: "CUSTOMER" });

      const result = await service.register({ email: "a@test.com", password: "password123", fullName: "A" } as never);

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(sessions.start).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), "register");
      expect(result).toEqual({
        accessToken: "access",
        refreshToken: "refresh",
        user: { id: "u1", email: "a@test.com", fullName: "A", role: "CUSTOMER" },
      });
    });

    it("rejects a duplicate email without hashing a password or hitting create", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "existing" });

      await expect(service.register({ email: "a@test.com", password: "x", fullName: "A" } as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("starts a password session for correct credentials", async () => {
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
      expect(result.accessToken).toBe("access");
      expect(sessions.start).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), "password");
    });

    it.each([
      ["a wrong password", { passwordHash: "hash-of-something-else", isLocked: false }, "wrong-password"],
      ["a locked account even with the correct password", { isLocked: true }, "password123"],
    ])("rejects %s", async (_label, overrides, password) => {
      const passwordHash = await bcrypt.hash("password123", 10);
      prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@test.com", passwordHash, ...overrides });

      await expect(service.login({ email: "a@test.com", password } as never)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessions.start).not.toHaveBeenCalled();
    });

    it("rejects an unknown email", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: "nobody@test.com", password: "x" } as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("resolveOAuthUser", () => {
    const googleProfile = { oauthId: "g1", email: "a@test.com", fullName: "A", emailVerified: true };

    it("links a verified Google email and drops a password nobody ever proved they owned", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "squatter-hash", emailVerifiedAt: null });
      prisma.user.update.mockImplementation(({ data }) => Promise.resolve({ id: "u1", role: "CUSTOMER", isLocked: false, ...data }));

      await service.resolveOAuthUser("google", googleProfile);

      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data).toMatchObject({ oauthProvider: "google", oauthId: "g1", passwordHash: null });
      expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it("keeps the password of an account whose email was already verified", async () => {
      const verifiedAt = new Date("2026-01-01");
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "owner-hash", emailVerifiedAt: verifiedAt });
      prisma.user.update.mockImplementation(({ data }) => Promise.resolve({ id: "u1", role: "CUSTOMER", isLocked: false, ...data }));

      await service.resolveOAuthUser("google", googleProfile);

      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty("passwordHash");
    });

    it("never lets an unverified (Facebook) email take over an existing account", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "owner-hash", emailVerifiedAt: null });

      await expect(
        service.resolveOAuthUser("facebook", { oauthId: "f1", email: "a@test.com", fullName: "A", emailVerified: false }),
      ).rejects.toMatchObject({ code: "oauth_email_da_ton_tai" });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("refuses to create an account from an unverified Google email", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resolveOAuthUser("google", { ...googleProfile, emailVerified: false })).rejects.toMatchObject({
        code: "oauth_email_chua_xac_minh",
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects a locked account", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "u1", email: "a@test.com", isLocked: true });

      const err = await service.resolveOAuthUser("google", googleProfile).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(OAuthLoginError);
      expect((err as OAuthLoginError).code).toBe("oauth_tai_khoan_bi_khoa");
    });
  });

  describe("exchangeOAuthCode", () => {
    const user = { id: "u1", email: "a@test.com", fullName: "A", role: "CUSTOMER", isLocked: false };

    it("burns the code and starts a session with the provider as method", async () => {
      prisma.oAuthLoginCode.findUnique.mockResolvedValue({ id: "c1", usedAt: null, expiresAt: new Date(Date.now() + 60_000), method: "google", user });
      prisma.oAuthLoginCode.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.exchangeOAuthCode("a".repeat(64));
      expect(result.accessToken).toBe("access");
      expect(sessions.start).toHaveBeenCalledWith(user, "google");
    });

    it("rejects a code that a concurrent exchange already burned", async () => {
      prisma.oAuthLoginCode.findUnique.mockResolvedValue({ id: "c1", usedAt: null, expiresAt: new Date(Date.now() + 60_000), method: "google", user });
      prisma.oAuthLoginCode.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.exchangeOAuthCode("a".repeat(64))).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessions.start).not.toHaveBeenCalled();
    });

    it("rejects an expired code", async () => {
      prisma.oAuthLoginCode.findUnique.mockResolvedValue({ id: "c1", usedAt: null, expiresAt: new Date(Date.now() - 1), method: "google", user });

      await expect(service.exchangeOAuthCode("a".repeat(64))).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
