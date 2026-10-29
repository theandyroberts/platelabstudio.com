import test from "node:test";
import assert from "node:assert/strict";
import { testLoginsForEnvironment } from "../lib/auth/testLogins";
import { hasAdminRole } from "../lib/auth/roles";

const configured = {
  SHOW_TEST_LOGINS: "true",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase-staging.theplatelab.site",
  TEST_CUSTOMER_EMAIL: "customer@example.com", TEST_CUSTOMER_PASSWORD: "test-customer-password",
  TEST_ADMIN_EMAIL: "admin@example.com", TEST_ADMIN_PASSWORD: "test-admin-password",
};

test("local and staging login pages can display both dedicated account levels", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "staging.platelabstudio.com", "staging.theplatelab.studio"]) {
    const result = testLoginsForEnvironment(host, { ...configured, NEXT_PUBLIC_SITE_URL: `http://${host}` });
    assert.equal(result?.customer.email, configured.TEST_CUSTOMER_EMAIL);
    assert.equal(result?.admin.password, configured.TEST_ADMIN_PASSWORD);
  }
});

test("production and unknown hosts never display test passwords", () => {
  for (const host of ["platelabstudio.com", "www.platelabstudio.com", "theplatelab.studio", "localhost.evil.example", null]) {
    assert.equal(testLoginsForEnvironment(host, configured), null);
  }
  assert.equal(testLoginsForEnvironment("localhost", { ...configured, NEXT_PUBLIC_SITE_URL: "https://platelabstudio.com" }), null);
  assert.equal(testLoginsForEnvironment("staging.platelabstudio.com", { ...configured, NEXT_PUBLIC_SUPABASE_URL: "https://supabase.theplatelab.site" }), null);
});

test("test accounts are opt-in and missing or malformed configuration fails closed", () => {
  for (const patch of [{ SHOW_TEST_LOGINS: "false" }, { TEST_ADMIN_PASSWORD: "" }, { TEST_CUSTOMER_EMAIL: "" }, { NEXT_PUBLIC_SITE_URL: "invalid" }, { NEXT_PUBLIC_SUPABASE_URL: "" }]) {
    assert.equal(testLoginsForEnvironment("localhost", { ...configured, ...patch }), null);
  }
});

test("only system-admin staff grants full admin-panel access", () => {
  for (const role of [null, undefined, "customer", "producer", "catalog_admin", "owner", "admin"]) assert.equal(hasAdminRole(role), false);
  assert.equal(hasAdminRole("system_admin"), true);
});
