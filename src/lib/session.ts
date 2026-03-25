import type { AccountType, AdminRole, UserStatus } from "@/types";

type SessionPayload = {
  uid: string;
  accountType: AccountType;
  status: UserStatus;
  teamId: string;
  role?: AdminRole;
};

export const SESSION_COOKIE_KEYS = {
  uid: "clh_uid",
  accountType: "clh_account_type",
  role: "clh_role",
  status: "clh_status",
  teamId: "clh_team_id",
} as const;

const COOKIE_MAX_AGE = 60 * 60 * 8;

function writeCookie(name: string, value: string, maxAge = COOKIE_MAX_AGE) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function setClientSession(session: SessionPayload) {
  writeCookie(SESSION_COOKIE_KEYS.uid, session.uid);
  writeCookie(SESSION_COOKIE_KEYS.accountType, session.accountType);
  writeCookie(SESSION_COOKIE_KEYS.status, session.status);
  writeCookie(SESSION_COOKIE_KEYS.teamId, session.teamId);
  writeCookie(SESSION_COOKIE_KEYS.role, session.role ?? "");
}

export function clearClientSession() {
  writeCookie(SESSION_COOKIE_KEYS.uid, "", 0);
  writeCookie(SESSION_COOKIE_KEYS.accountType, "", 0);
  writeCookie(SESSION_COOKIE_KEYS.role, "", 0);
  writeCookie(SESSION_COOKIE_KEYS.status, "", 0);
  writeCookie(SESSION_COOKIE_KEYS.teamId, "", 0);
}
