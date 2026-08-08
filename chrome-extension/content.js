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


function extensionPanel(id) {
  let host = document.getElementById(id);
  if (host) return host.shadowRoot;
  host = document.createElement("div");
  host.id = id;
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);
  return shadow;
}

function showVerificationLinkPrompt(item) {
  const shadow = extensionPanel("email-otp-verification-link");
  let target = "";
  try { target = new URL(item.url).hostname; } catch { return; }
  shadow.innerHTML = `<style>
    .card{position:fixed;z-index:2147483647;right:18px;top:18px;width:320px;padding:16px;border-radius:14px;background:#fff;color:#172033;box-shadow:0 12px 40px rgba(0,0,0,.24);font:14px/1.45 system-ui,sans-serif;border:1px solid #dbe2ef}
    .title{font-weight:700;font-size:15px}.meta{margin:7px 0 12px;color:#596579;overflow:hidden;text-overflow:ellipsis}.row{display:flex;gap:8px}.primary{background:#2563eb;color:#fff;border:0}.btn{padding:8px 11px;border-radius:9px;border:1px solid #cfd7e6;background:#fff;cursor:pointer}.close{position:absolute;right:9px;top:7px;border:0;background:none;cursor:pointer;font-size:18px}
  </style><div class="card" role="dialog" aria-label="邮箱验证链接">
    <button class="close" aria-label="关闭">×</button><div class="title">检测到邮箱验证链接</div>
    <div class="meta">目标：${target}<br>${item.subject || "新验证邮件"}</div>
    <div class="row"><button class="btn primary" id="open">安全打开</button><button class="btn" id="copy">复制链接</button></div>
  </div>`;
  shadow.querySelector(".close").onclick = () => shadow.host.remove();
  shadow.querySelector("#open").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "BG_OPEN_VERIFICATION_LINK", item });
    shadow.host.remove();
  };
  shadow.querySelector("#copy").onclick = async () => {
    await navigator.clipboard.writeText(item.url);
    toast("info", "验证链接已复制");
  };
}

function isRegistrationEmailField(input) {
  if (!(input instanceof HTMLInputElement) || !isVisible(input) || input.disabled || input.readOnly) return false;
  const attrs = `${input.type} ${input.name} ${input.id} ${input.placeholder} ${input.autocomplete} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
  if (!/(email|e-mail|邮箱|郵箱)/i.test(attrs)) return false;
  const context = `${location.pathname} ${document.title} ${input.form?.innerText || ""}`.slice(0, 5000);
  if (/(login|log in|sign in|登录|登入)/i.test(context) && !/(register|sign up|signup|create|join|注册|註冊|创建|建立)/i.test(context)) return false;
  return /(register|sign up|signup|create|join|account|注册|註冊|创建|建立|账号|帳號)/i.test(context);
}

let emailPickerTarget = null;
async function showEmailCandidatePicker(input) {
  if (emailPickerTarget === input && document.getElementById("email-otp-candidate-picker")) return;
  const response = await chrome.runtime.sendMessage({ type: "BG_EMAIL_CANDIDATES" }).catch(() => null);
  const candidates = response && response.ok && Array.isArray(response.candidates) ? response.candidates : [];
  if (!candidates.length || !isVisible(input) || input.value) return;
  emailPickerTarget = input;
  const shadow = extensionPanel("email-otp-candidate-picker");
  const rect = input.getBoundingClientRect();
  const options = candidates.map((item, i) => `<button class="item" data-i="${i}"><b>${item.email}</b><span>${item.provider}</span></button>`).join("");
  shadow.innerHTML = `<style>
    .box{position:fixed;z-index:2147483647;left:${Math.max(8, Math.min(rect.left, innerWidth-340))}px;top:${Math.min(innerHeight-80, rect.bottom+7)}px;width:320px;padding:9px;border-radius:12px;background:#fff;border:1px solid #dbe2ef;box-shadow:0 10px 35px rgba(0,0,0,.2);font:13px system-ui,sans-serif}
    .head{padding:4px 7px 8px;color:#536077}.item{width:100%;display:flex;justify-content:space-between;gap:10px;padding:9px;border:0;border-radius:8px;background:#fff;cursor:pointer;text-align:left}.item:hover{background:#eef4ff}.item span{color:#758197}
  </style><div class="box"><div class="head">选择已连接的注册邮箱</div>${options}</div>`;
  shadow.querySelectorAll(".item").forEach((button) => button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const item = candidates[Number(button.dataset.i)];
    input.focus(); setNativeValue(input, item.email); shadow.host.remove(); emailPickerTarget = null;
    toast("info", `已填入 ${item.email}`);
  }));
}

document.addEventListener("focusin", (event) => {
  const input = event.target;
  if (isRegistrationEmailField(input)) void showEmailCandidatePicker(input);
}, true);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "OTP_TOAST") {
      toast(msg.level || "info", msg.message || "");
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "OTP_VERIFICATION_LINK") {
      showVerificationLinkPrompt(msg.item || {});
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
let lastOtpRequestedAt = 0;
let lastOtpRequestExpiresAt = 0;

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
  if (requestedAt > 0) {
    lastOtpRequestedAt = requestedAt;
    lastOtpRequestExpiresAt = requestedAt + 90_000;
  }
  const effectiveRequestedAt = Date.now() < lastOtpRequestExpiresAt ? lastOtpRequestedAt : 0;
  const inputs = Array.from(document.querySelectorAll("input")).filter((el) => otpFieldScore(el) >= 45);
  const pageText = `${document.title} ${document.body?.innerText || ""}`.slice(0, 12000);
  const allowLink = /(check|open|verify|confirm|查看|检查|打開|打开|验证|驗證|确认|確認).{0,24}(email|inbox|mail|邮箱|郵箱|邮件|郵件)|(verification|confirmation|magic).{0,12}link/i.test(pageText);
  if (!inputs.length && !allowLink) return;
  if (allowLink && !effectiveRequestedAt) {
    // The mail can arrive just before the SPA renders its check-email page.
    // Keep a small grace window while still excluding unrelated older mail.
    lastOtpRequestedAt = Date.now() - 15_000;
    lastOtpRequestExpiresAt = Date.now() + 10 * 60_000;
  }
  const oneChar = inputs.filter((el) => el.maxLength === 1);
  const expectedLength = oneChar.length >= 4 && oneChar.length <= 10
    ? oneChar.length
    : Math.max(0, ...inputs.map((el) => el.maxLength > 0 ? el.maxLength : 0));
  const signature = `${location.href}|${expectedLength}|${effectiveRequestedAt}`;
  if (!requestedAt && signature === lastContextSignature) return;
  lastContextSignature = signature;
  chrome.runtime.sendMessage({
    type: "OTP_CONTEXT_ACTIVE",
    context: { url: location.href, title: document.title, expectedLength, requestedAt: Date.now() < lastOtpRequestExpiresAt ? lastOtpRequestedAt : effectiveRequestedAt, allowLink }
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
