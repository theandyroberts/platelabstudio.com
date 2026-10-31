import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function request(host: string, path = "/") {
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

test("production routes stay on the launch page without a Supabase connection", async () => {
  for (const path of ["/", "/browse", "/admin", "/login", "/api/reserve"]) {
    const response = await middleware(request("platelabstudio.com", path));
    assert.equal(response.headers.get("x-middleware-rewrite"), "https://platelabstudio.com/coming-soon");
    assert.equal(response.headers.get("location"), null);
  }
  const page = await middleware(request("platelabstudio.com", "/coming-soon"));
  assert.equal(page.headers.get("x-middleware-next"), "1");
  assert.equal(page.headers.get("x-middleware-rewrite"), null);
});

test("legacy and www redirects preserve paths and queries", async () => {
  for (const host of ["theplatelab.site", "www.theplatelab.site", "theplatelab.studio", "www.theplatelab.studio", "www.platelabstudio.com"]) {
    const response = await middleware(request(host, "/browse?q=city%20night&stage=led-volume"));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "https://platelabstudio.com/browse?q=city%20night&stage=led-volume");
  }
  for (const host of ["staging.theplatelab.site", "staging.theplatelab.studio"]) {
    const response = await middleware(request(host, "/auth/callback?code=test"));
    assert.equal(response.headers.get("location"), "https://staging.platelabstudio.com/auth/callback?code=test");
  }
});

test("production routing honors the proxy hostname", async () => {
  const response = await middleware(new NextRequest("http://localhost:3000/browse", {
    headers: { host: "localhost:3000", "x-forwarded-host": "PLATELABSTUDIO.COM:443" },
  }));
  assert.equal(response.headers.get("x-middleware-rewrite"), "http://localhost:3000/coming-soon");
});
