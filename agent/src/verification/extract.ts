export type VerificationLinkCandidate = {
  url: string;
  score: number;
  reason: string;
};

const POSITIVE = /(verify|verification|confirm|activate|activation|validate|magic[\s-]?link|sign[\s-]?in|验证|驗證|确认|確認|激活|啟用|登入|登录)/i;
const NEGATIVE = /(unsubscribe|optout|privacy|terms|support|help|preferences|tracking|pixel|退订|退訂|隐私|隱私|条款|條款|帮助|幫助)/i;
const PATH_HINT = /(verify|confirm|activate|validate|magic|token|auth|signin|signup|registration)/i;

function decodeHtml(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&#x3d;/gi, "=").replace(/&#61;/g, "=").replace(/&quot;/gi, '"');
}

function safeUrl(raw: string): URL | null {
  try {
    const cleaned = decodeHtml(raw).replace(/[)>\]"']+$/g, "");
    const url = new URL(cleaned);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function extractVerificationLinks(raw: string): VerificationLinkCandidate[] {
  const text = String(raw || "");
  const matches = text.match(/https:\/\/[^\s<>"']+/gi) || [];
  const best = new Map<string, VerificationLinkCandidate>();
  for (const match of matches) {
    const url = safeUrl(match);
    if (!url) continue;
    const index = text.indexOf(match);
    const context = text.slice(Math.max(0, index - 160), Math.min(text.length, index + match.length + 160));
    let score = 0;
    const reasons: string[] = [];
    if (POSITIVE.test(context)) { score += 80; reasons.push("verification_context"); }
    if (PATH_HINT.test(`${url.pathname} ${url.searchParams.toString()}`)) { score += 45; reasons.push("verification_url"); }
    if ([...url.searchParams.keys()].some((k) => /(token|code|key|ticket|confirm|verify)/i.test(k))) {
      score += 25; reasons.push("token_parameter");
    }
    if (NEGATIVE.test(context) || NEGATIVE.test(url.pathname)) { score -= 120; reasons.push("negative_context"); }
    if (url.hostname.includes("googleusercontent.com") || url.pathname.endsWith(".png") || url.pathname.endsWith(".gif")) score -= 100;
    if (score < 60) continue;
    const candidate = { url: url.toString(), score, reason: reasons.join(",") };
    const previous = best.get(candidate.url);
    if (!previous || candidate.score > previous.score) best.set(candidate.url, candidate);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

export function extractBestVerificationLink(raw: string): VerificationLinkCandidate | null {
  return extractVerificationLinks(raw)[0] ?? null;
}
