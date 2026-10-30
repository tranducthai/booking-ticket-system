import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { randomBytes, randomInt, randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import sharp = require("sharp");
import { RedisService } from "../redis/redis.service";

const IMAGE_DIR = join(process.cwd(), "assets", "captcha");
const WIDTH = 320;
const HEIGHT = 200;
/** The puzzle piece lives in a PIECE x PIECE box (body + the little knob on its right). */
const PIECE = 60;
const CHALLENGE_TTL_SECONDS = 120;
const TOKEN_TTL_SECONDS = 300;
/** How far (px) from the hole still counts as fitting. */
const TOLERANCE_PX = 6;
/** Solving faster than a person can drag a slider is a script. */
const MIN_SOLVE_MS = 700;
const CHALLENGES_PER_MINUTE = 30;

interface StoredChallenge {
  /** Left edge (px) of the hole the piece has to be dragged to. */
  x: number;
  userId: string;
  issuedAt: number;
}

/** The piece outline in its box: a rounded body with a knob on the right. */
const SHAPE = `<rect x="6" y="6" width="44" height="44" rx="8"/><circle cx="53" cy="28" r="7"/>`;
const svg = (inner: string, attrs = "") => Buffer.from(`<svg width="${PIECE}" height="${PIECE}" xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`);

/**
 * "Xác minh người dùng" before holding tickets: a photo with a piece cut out of
 * it, and the cut-out piece to be dragged along a slider into the gap. The hole
 * position never leaves the server — the client gets the picture with the gap
 * and the piece, and answers with how far it slid the piece. One try per
 * challenge; a solved challenge becomes a single-use token that booking-service
 * consumes when the hold is made (InternalCaptchaController).
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly images: string[];
  /** Pictures resized to the puzzle size, built once. */
  private readonly bases = new Map<string, Promise<Buffer>>();

  constructor(private readonly redis: RedisService) {
    this.images = readdirSync(IMAGE_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (this.images.length === 0) this.logger.error(`No captcha images in ${IMAGE_DIR}`);
  }

  async createChallenge(userId: string) {
    const key = `captcha:rl:${userId}`;
    const used = await this.redis.incr(key);
    if (used === 1) await this.redis.expire(key, 60);
    if (used > CHALLENGES_PER_MINUTE) throw new HttpException("Thử quá nhiều lần — vui lòng đợi một lát", HttpStatus.TOO_MANY_REQUESTS);

    const image = this.images[randomInt(this.images.length)];
    // The gap is never near the start, so the piece always has to travel.
    const x = randomInt(PIECE + 40, WIDTH - PIECE - 8);
    const y = randomInt(10, HEIGHT - PIECE - 10);
    const challengeId = randomUUID();
    const stored: StoredChallenge = { x, userId, issuedAt: Date.now() };
    await this.redis.set(`captcha:ch:${challengeId}`, JSON.stringify(stored), "EX", CHALLENGE_TTL_SECONDS);

    const { background, piece } = await this.render(image, x, y);
    return {
      challengeId,
      background: `data:image/webp;base64,${background.toString("base64")}`,
      piece: `data:image/png;base64,${piece.toString("base64")}`,
      width: WIDTH,
      height: HEIGHT,
      pieceSize: PIECE,
      pieceY: y,
      expiresIn: CHALLENGE_TTL_SECONDS,
    };
  }

  /**
   * @param x how far (px, in picture coordinates) the user slid the piece from the left edge.
   * One try: the challenge is deleted whether or not the answer is right.
   */
  async verify(userId: string, challengeId: string, x: number): Promise<{ token: string; expiresIn: number }> {
    const raw = await this.redis.getdel(`captcha:ch:${challengeId}`);
    if (!raw) throw new BadRequestException({ code: "CAPTCHA_EXPIRED", message: "Phiên xác minh đã hết hạn — vui lòng thử lại" });
    const challenge = JSON.parse(raw) as StoredChallenge;
    if (challenge.userId !== userId) throw new BadRequestException({ code: "CAPTCHA_EXPIRED", message: "Phiên xác minh không hợp lệ" });

    const tooFast = Date.now() - challenge.issuedAt < MIN_SOLVE_MS;
    if (tooFast || Math.abs(challenge.x - x) > TOLERANCE_PX) {
      throw new BadRequestException({ code: "CAPTCHA_WRONG", message: "Chưa khớp — vui lòng thử lại với hình mới" });
    }

    const token = randomBytes(24).toString("hex");
    await this.redis.set(`captcha:tok:${token}`, userId, "EX", TOKEN_TTL_SECONDS);
    return { token, expiresIn: TOKEN_TTL_SECONDS };
  }

  /** Single use: true only for the user the token was issued to, and only the first time. */
  async consume(token: string, userId: string): Promise<boolean> {
    if (!/^[0-9a-f]{48}$/.test(token)) return false;
    return (await this.redis.getdel(`captcha:tok:${token}`)) === userId;
  }

  private base(image: string): Promise<Buffer> {
    let built = this.bases.get(image);
    if (!built) {
      built = sharp(join(IMAGE_DIR, image)).resize(WIDTH, HEIGHT, { fit: "cover" }).png().toBuffer();
      this.bases.set(image, built);
    }
    return built;
  }

  /**
   * The picture with a darkened gap at (x, y), and the piece cut from exactly
   * that spot (transparent outside its outline, starting at the left edge —
   * the client slides it sideways and keeps its y).
   */
  private async render(image: string, x: number, y: number): Promise<{ background: Buffer; piece: Buffer }> {
    const base = await this.base(image);
    const cut = await sharp(base).extract({ left: x, top: y, width: PIECE, height: PIECE }).png().toBuffer();
    const piece = await sharp(cut)
      .composite([
        { input: svg(`<g fill="#fff">${SHAPE}</g>`), blend: "dest-in" },
        { input: svg(`<g fill="none" stroke="#fff" stroke-width="2" stroke-opacity="0.9">${SHAPE}</g>`) },
      ])
      .png()
      .toBuffer();
    const gap = svg(`<g fill="#000" fill-opacity="0.55" stroke="#fff" stroke-opacity="0.7" stroke-width="1.5">${SHAPE}</g>`);
    const background = await sharp(base).composite([{ input: gap, left: x, top: y }]).webp({ quality: 82 }).toBuffer();
    return { background, piece };
  }
}
