import { boolEnv, createClientFromEnv, printJson } from "./_shared.js";

const client = createClientFromEnv();

// Auth methods covered here:
// - client.auth.login(): loads a cached session from .sessions when valid, otherwise runs Android OAuth login.
// - client.auth.validateToken(token?): validates the current access token, or the token argument if provided.
// - client.auth.refresh(refreshToken?): refreshes the current session, or the refresh token argument if provided.
// - client.auth.logout(): revokes the refresh token and removes the local session file.
//
// Client options available:
// - email: required account address.
// - password: optional after a cached session exists; required for a fresh login.
// - sessionDir: optional session directory, defaults to .sessions.
// - sessionStore: optional custom store implementing load/save/delete.
// - fetch: optional custom fetch implementation for tests or proxies.

const session = await client.auth.login();
const valid = await client.auth.validateToken();

printJson("auth.login", {
  valid,
  accessTokenPrefix: session.accessToken.slice(0, 12),
  refreshTokenPrefix: session.refreshToken.slice(0, 12),
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  expiresAt: session.expiresAt,
});

if (boolEnv("MAILCOM_REFRESH_NOW")) {
  const refreshed = await client.auth.refresh();
  printJson("auth.refresh", {
    accessTokenPrefix: refreshed.accessToken.slice(0, 12),
    updatedAt: refreshed.updatedAt,
    expiresAt: refreshed.expiresAt,
  });
}

if (boolEnv("MAILCOM_LOGOUT")) {
  await client.auth.logout();
  printJson("auth.logout", { loggedOut: true });
}
