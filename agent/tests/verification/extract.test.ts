import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractBestVerificationLink, extractVerificationLinks } from "../../src/verification/extract.js";

describe("verification link extraction", () => {
  it("extracts a confirmation link", () => {
    const item = extractBestVerificationLink("Verify your email: https://accounts.example.com/confirm?token=abc123");
    assert.equal(item?.url, "https://accounts.example.com/confirm?token=abc123");
  });
  it("extracts links from HTML attributes and decodes ampersands", () => {
    const item = extractBestVerificationLink('<a href="https://example.com/verify?token=abc&amp;source=mail">Verify email</a>');
    assert.equal(item?.url, "https://example.com/verify?token=abc&source=mail");
  });
  it("rejects unsubscribe and privacy links", () => {
    const items = extractVerificationLinks("unsubscribe https://example.com/unsubscribe?token=x privacy https://example.com/privacy");
    assert.equal(items.length, 0);
  });
  it("rejects insecure links", () => {
    assert.equal(extractBestVerificationLink("Verify: http://example.com/verify?token=x"), null);
  });
});
