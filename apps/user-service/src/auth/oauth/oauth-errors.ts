/**
 * Why an OAuth sign-in was refused. `code` is passed to apps/web as
 * `/login?loi=<code>` (LoginPage maps it to a message) — never a raw
 * provider error, which may carry tokens or internal detail.
 */
export type OAuthErrorCode =
  | "oauth" // generic: provider/network failure
  | "oauth_chua_cau_hinh" // provider credentials not configured on this deployment
  | "oauth_huy" // user cancelled on the consent screen
  | "oauth_state" // state cookie missing/mismatched — expired or forged callback
  | "oauth_email_chua_xac_minh" // provider says the email isn't verified
  | "oauth_email_da_ton_tai" // email belongs to an account we can't safely link
  | "oauth_tai_khoan_bi_khoa"; // account is locked

export class OAuthLoginError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}
