import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OtpStore } from "../../src/otp/store.js";

describe("verification link store", () => {
  it("isolates users and filters by request time", () => {
    const store = new OtpStore();
    const now = Date.now();
    store.addLink({ provider: "gmail", userId: "u1", url: "https://example.com/verify?token=a", receivedAt: now, subject: "Verify example.com" });
    store.addLink({ provider: "gmail", userId: "u2", url: "https://other.example/verify?token=b", receivedAt: now });
    assert.equal(store.validLinks({ userId: "u1", maxAgeMs: 60_000, requestedAt: now - 1 }).length, 1);
    assert.equal(store.validLinks({ userId: "u1", maxAgeMs: 60_000, requestedAt: now + 1 }).length, 0);
  });

  it("does not return a link after it is opened", () => {
    const store = new OtpStore();
    const item = store.addLink({ provider: "outlook", userId: "u1", url: "https://example.com/confirm?token=a", receivedAt: Date.now() });
    assert.equal(store.markLinkOpened(item.id, "u2"), false);
    assert.equal(store.markLinkOpened(item.id, "u1"), true);
    assert.equal(store.validLinks({ userId: "u1", maxAgeMs: 60_000 }).length, 0);
  });
});
