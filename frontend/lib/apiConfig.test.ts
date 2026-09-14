import test from "node:test";
import assert from "node:assert/strict";
import { apiBaseUrl } from "./apiConfig";

test("API development/test fallback is explicit", () => {
  for (const env of ["development", "test"]) assert.equal(apiBaseUrl(undefined, env), "http://localhost:8000");
});
test("API URL normalizes whitespace and trailing separators", () => {
  assert.equal(apiBaseUrl(" https://API.example.com/api/// ", "production"), "https://api.example.com/api");
  assert.equal(apiBaseUrl("http://localhost:9000/", "development"), "http://localhost:9000");
});
test("production API requires an explicit remote HTTPS URL", () => {
  for (const value of [undefined, "", " ", "http://api.example.com", "https://localhost", "https://127.0.0.1"]) assert.throws(() => apiBaseUrl(value, "production"));
});
test("API URL rejects malformed, credential-bearing and ambiguous URLs", () => {
  for (const value of ["relative", "/api", "ftp://example.com", "https://user:secret@example.com", "https://example.com?x=1", "https://example.com#token", "https://bad_host", "https://*.example.com", "https://example.com?"]) assert.throws(() => apiBaseUrl(value));
});
