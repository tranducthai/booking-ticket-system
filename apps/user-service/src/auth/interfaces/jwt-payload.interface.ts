export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  sid: string; // session id — src/sessions/session.service.ts
}
