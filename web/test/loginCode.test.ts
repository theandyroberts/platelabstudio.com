import test from "node:test";
import assert from "node:assert/strict";
import { codeChannelEnabled, normalizeCodeDestination, normalizeLoginCode } from "../lib/auth/loginCode";
import { launchAccountRedirect } from "../lib/auth/redirect";
import { isLaunchAccountPath } from "../lib/siteHosts";

test("email code identities normalize without accepting malformed destinations", () => {
  assert.equal(normalizeCodeDestination("email", " Visitor+lab@Gmail.com "), "visitor+lab@gmail.com");
  for (const email of ["", "a@", "a b@example.com", "a@example.com\nBcc: b@example.com", "a".repeat(255)+"@example.com"]) assert.equal(normalizeCodeDestination("email", email), null);
});
test("numeric codes preserve leading zeros and reject nonnumeric or wrong-length codes", () => {
  assert.equal(normalizeLoginCode(" 001234 "), "001234");
  for (const code of ["", "12345", "1234567", "12 3456", "abcdef", "１２３４５６"]) assert.equal(normalizeLoginCode(code), null);
});
test("delivery methods fail closed until individually enabled", () => {
  assert.equal(codeChannelEnabled("email", {}), false);
  assert.equal(codeChannelEnabled("sms", { AUTH_EMAIL_CODE_ENABLED: "true" }), false);
  assert.equal(codeChannelEnabled("email", { AUTH_EMAIL_CODE_ENABLED: "true" }), true);
  assert.equal(codeChannelEnabled("invalid", { AUTH_EMAIL_CODE_ENABLED: "true", AUTH_SMS_CODE_ENABLED: "true" }), false);
  assert.equal(normalizeCodeDestination("sms", "(212) 555-0123"), null);
  assert.equal(normalizeCodeDestination("sms", "+1 (212) 555-0123"), "+12125550123");
});
test("live accounts do not open the unreleased catalog or permit external redirects", () => {
  for (const path of [undefined, "/projects", "/browse", "https://evil.example", "//evil.example"]) assert.equal(launchAccountRedirect(path), "/account");
  assert.equal(launchAccountRedirect("/reset-password"), "/reset-password");
  assert.equal(launchAccountRedirect("/account?welcome=1"), "/account?welcome=1");
  for (const path of ["/", "/browse", "/projects", "/plate/PL-123", "/api/admin", "/account/../browse", "/login/evil"]) assert.equal(isLaunchAccountPath(path), false);
  for (const path of ["/login", "/account", "/auth/callback", "/auth/confirm", "/forgot-password", "/reset-password"]) assert.equal(isLaunchAccountPath(path), true);
});
