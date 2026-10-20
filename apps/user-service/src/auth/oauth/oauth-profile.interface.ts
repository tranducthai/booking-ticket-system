export interface OAuthProfile {
  oauthId: string;
  email: string;
  fullName: string;
  /** Only true when the provider itself vouches for the address (Google's `email_verified`). */
  emailVerified: boolean;
}
