function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0;
}

function isTextLikeInput(el) {
  if (!(el instanceof HTMLInputElement)) return false;
  const t = (el.getAttribute("type") || "text").toLowerCase();
  return ["text", "tel", "number", "search", "email", "url", "password"].includes(t);
}

function likelyOtp(el) {
  if (!(el instanceof HTMLInputElement)) return false;
  const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
  if (ac === "one-time-code" || ac === "otp") return true;
  const n = `${el.name || ""} ${el.id || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
  if (/(otp|one.?time|code|verify|verification|pin)/.test(n)) return true;
  if (el.maxLength >= 4 && el.maxLength <= 10) return true;
  if ((el.inputMode || "").toLowerCase() === "numeric") return true;
  return false;
}

function normalizeOtpCode(code) {
  return String(code || "").trim().replace(/[\s-]+/g, "");
}

function setNativeValue(input, value) {
  const proto = Object.getPrototypeOf(input);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && typeof desc.set === "function") desc.set.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

// ---- Microsoft device-login auto-fill ------------------------------------
// When the Outlook OAuth flow starts, options.js stores the user_code in
// chrome.storage.local. On the Microsoft device-login page, we read the code
// from the URL (verification_uri_complete) or from storage, then auto-fill
// the input and click "Next".
(function autoFillMsDeviceCode() {
  // Check URL param first (verification_uri_complete includes user_code).
  const urlCode = new URLSearchParams(window.location.search).get("user_code");

  function tryFill(code) {
    if (!code) return false;
    // Microsoft's device-login page renders a text input for the code.
    // Try multiple selectors to be resilient against page changes.
    const input =
      document.querySelector('input[name="otc"]') ||
      document.querySelector('input[id*="code"]') ||
      document.querySelector('input[id*="otc"]') ||
      // Only fall back to generic text input on Microsoft domains to avoid
      // accidentally filling unrelated pages.
      (/(microsoft|live)\.com$/i.test(location.hostname)
        ? document.querySelector('input[type="text"]')
        : null);
    if (!input || !isVisible(input)) return false;

    console.log("[OTP autofill] Filling device code input");
    setNativeValue(input, code);

    // Auto-click "Next" / "Submit" after a short delay so React processes
    // the synthetic input event before the form is submitted.
    setTimeout(() => {
      const btn =
        document.querySelector('input[type="submit"]') ||
        document.querySelector('button[type="submit"]') ||
        // Fallback: look for a button whose text contains "Next"
        Array.from(document.querySelectorAll("button")).find((b) =>
          /next|continue|sign/i.test(b.textContent)
        );
      if (btn) {
        console.log("[OTP autofill] Clicking Next button");
        btn.click();
      }
    }, 500);

    // Clean up stored code so it's not reused.
    chrome.storage.local.remove(["msDeviceCode", "msDeviceCodeExp"]);
    return true;
  }

  // If the code is already in the URL, try immediately.
  if (urlCode) {
    console.log("[OTP autofill] Found user_code in URL");
    if (tryFill(urlCode)) return;
  }

  // Read from storage (set by options.js when the OAuth flow starts).
  chrome.storage.local.get(["msDeviceCode", "msDeviceCodeExp"], (data) => {
    const code = data.msDeviceCode;
    const exp = data.msDeviceCodeExp;
    if (!code || (exp && Date.now() > exp)) return;

    console.log("[OTP autofill] Found device code in storage");

    // Try immediately.
    if (tryFill(code)) return;

    // Otherwise watch for the SPA to render the input.
    console.log("[OTP autofill] Waiting for input field to appear...");
    const observer = new MutationObserver(() => {
      if (tryFill(code)) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Give up after 15 seconds to avoid leaking the observer.
    setTimeout(() => observer.disconnect(), 15000);
  });
})();

function findOtpTarget() {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && isVisible(active) && isTextLikeInput(active) && likelyOtp(active)) {
    return { kind: "single", input: active };
  }

  const all = Array.from(document.querySelectorAll("input"));

  // Prefer multi-input OTP widgets (maxlength=1).
  const candidates = all
    .filter((el) => el instanceof HTMLInputElement)
    .filter(isVisible)
    .filter(isTextLikeInput)
    .filter(likelyOtp)
    .filter((el) => el.maxLength === 1);

  if (candidates.length >= 4 && candidates.length <= 10) {
    // Sort left-to-right, top-to-bottom.
    const sorted = candidates.slice().sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 10) return ra.top - rb.top;
      return ra.left - rb.left;
    });
    return { kind: "group", inputs: sorted };
  }

  // Fallback: single input most likely to be OTP.
  const singles = all
    .filter((el) => el instanceof HTMLInputElement)
    .filter(isVisible)
    .filter(isTextLikeInput)
    .filter(likelyOtp)
    .filter((el) => el.maxLength !== 1);

  if (singles.length) return { kind: "single", input: singles[0] };
  return null;
}

function toast(level, message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.position = "fixed";
  el.style.zIndex = "2147483647";
  el.style.top = "16px";
  el.style.right = "16px";
  el.style.maxWidth = "360px";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "10px";
  el.style.font = "13px/1.4 -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
  el.style.boxShadow = "0 8px 24px rgba(0,0,0,.18)";
  el.style.color = "#111";
  el.style.background = level === "error" ? "#ffe3e3" : level === "info" ? "#e8f1ff" : "#eee";
  el.style.border = "1px solid rgba(0,0,0,.08)";
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "OTP_TOAST") {
      toast(msg.level || "info", msg.message || "");
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "OTP_AUTO_FILL") {
      const code = normalizeOtpCode(msg.code);
      if (!/^[A-Za-z0-9]{4,10}$/.test(code)) return sendResponse({ ok: false, error: "invalid_code" });
      if (msg.expectedLength && Number(msg.expectedLength) !== code.length) return sendResponse({ ok: false, error: "length_mismatch" });
      const target = findOtpTarget();
      if (!target) return sendResponse({ ok: false, error: "no_otp_field" });
      if (target.kind === "single") {
        target.input.focus();
        setNativeValue(target.input, code);
        if (target.input.value !== code) return sendResponse({ ok: false, error: "value_not_applied" });
      } else {
        if (target.inputs.length < code.length) return sendResponse({ ok: false, error: "length_mismatch" });
        code.split("").forEach((ch, i) => { target.inputs[i].focus(); setNativeValue(target.inputs[i], ch); });
      }
      toast("info", "验证码已自动填充");
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "OTP_FILL") {
      const code = normalizeOtpCode(msg.code);
      if (!/^[A-Za-z0-9]{4,10}$/.test(code)) {
        sendResponse({ ok: false, error: "invalid_code" });
        return;
      }

      const target = findOtpTarget();
      if (!target) {
        sendResponse({ ok: false, error: "no_otp_field" });
        return;
      }

      if (target.kind === "single") {
        target.input.focus();
        setNativeValue(target.input, code);
        sendResponse({ ok: true });
        return;
      }

      const chars = code.split("");
      const inputs = target.inputs.slice(0, chars.length);
      for (let i = 0; i < inputs.length; i++) {
        inputs[i].focus();
        setNativeValue(inputs[i], chars[i] || "");
      }
      sendResponse({ ok: true });
      return;
    }
  })().catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));

  return true;
});

// ---- Context-aware automatic fill ---------------------------------------
// Detect OTP widgets and send-code actions. The background worker performs a
// short, per-tab fast poll and only accepts messages received after the action.
let otpContextTimer = null;
let lastContextSignature = "";

function otpFieldScore(el) {
  if (!(el instanceof HTMLInputElement) || !isVisible(el) || el.disabled || el.readOnly) return -100;
  const text = [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.autocomplete]
    .filter(Boolean).join(" ").toLowerCase();
  let score = 0;
  if (["one-time-code", "otp"].includes((el.autocomplete || "").toLowerCase())) score += 100;
  if (/(otp|one.?time|verification|verify|security.?code|验证码|驗證碼|校验码|安全代码)/i.test(text)) score += 45;
  if (["numeric", "decimal"].includes((el.inputMode || "").toLowerCase())) score += 20;
  if (el.maxLength >= 4 && el.maxLength <= 8) score += 25;
  if (el.maxLength === 1) score += 15;
  if (/(password|phone|mobile|card|cvv|cvc|postal)/i.test(text)) score -= 100;
  return score;
}

function detectOtpContext(requestedAt = 0) {
  const inputs = Array.from(document.querySelectorAll("input")).filter((el) => otpFieldScore(el) >= 45);
  if (!inputs.length) return;
  const oneChar = inputs.filter((el) => el.maxLength === 1);
  const expectedLength = oneChar.length >= 4 && oneChar.length <= 10
    ? oneChar.length
    : Math.max(0, ...inputs.map((el) => el.maxLength > 0 ? el.maxLength : 0));
  const signature = `${location.href}|${expectedLength}|${requestedAt}`;
  if (!requestedAt && signature === lastContextSignature) return;
  lastContextSignature = signature;
  chrome.runtime.sendMessage({
    type: "OTP_CONTEXT_ACTIVE",
    context: { url: location.href, title: document.title, expectedLength, requestedAt }
  }).catch(() => {});
}

function scheduleOtpContextScan(requestedAt = 0) {
  clearTimeout(otpContextTimer);
  otpContextTimer = setTimeout(() => detectOtpContext(requestedAt), 180);
}

document.addEventListener("click", (event) => {
  const button = event.target && event.target.closest && event.target.closest("button,input[type=button],input[type=submit],a,[role=button]");
  if (!button) return;
  const label = [button.textContent, button.value, button.getAttribute("aria-label"), button.title]
    .filter(Boolean).join(" ");
  if (/(发送|获取|重新发送|取得|送信|send|resend|get).{0,16}(验证码|驗證碼|校验码|code|otp|passcode)/i.test(label)) {
    scheduleOtpContextScan(Date.now());
  }
}, true);

const otpObserver = new MutationObserver(() => scheduleOtpContextScan());
otpObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["autocomplete", "maxlength", "inputmode"] });
window.addEventListener("focus", () => scheduleOtpContextScan());
scheduleOtpContextScan();
