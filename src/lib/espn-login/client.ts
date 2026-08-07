import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chromiumBinary from "@sparticuz/chromium";
import { chromium, type Browser, type FrameLocator, type Page } from "playwright-core";

const ESPN_LOGIN_URL = "https://www.espn.com/login/";
const ESPN_COOKIE_URL = "https://www.espn.com";
const NAV_TIMEOUT_MS = 20000;
const SETTLE_TIMEOUT_MS = 12000;
const OTP_SESSION_TTL_MS = 5 * 60 * 1000;
const COOKIE_POLL_ATTEMPTS = 10;
const COOKIE_POLL_INTERVAL_MS = 1000;

const CODE_INPUT_SELECTORS = [
  'input[autocomplete="one-time-code"]',
  'input[name*="code" i]',
  'input[id*="code" i]',
];
const CODE_SUBMIT_SELECTORS = [
  'button:has-text("Continue")',
  'button:has-text("Submit")',
  'button:has-text("Verify")',
  'button[type="submit"]',
];

/** Holds a login's browser open across the two HTTP requests an MFA round trip needs: one to
 * submit credentials, one to submit the code the user reads off their phone and types in. Best
 * effort — on Vercel a serverless instance isn't guaranteed to survive between requests, so a
 * session can disappear before the code arrives; submitEspnOtp treats a missing session as a
 * plain error rather than a crash. Not a bypass: the code the user types is the one ESPN itself
 * asked for, submitted straight into ESPN's real form. */
const otpSessions = new Map<string, { browser: Browser; page: Page; timeout: NodeJS.Timeout }>();

function storeOtpSession(browser: Browser, page: Page): string {
  const sessionId = randomUUID();
  const timeout = setTimeout(() => {
    otpSessions.delete(sessionId);
    browser.close().catch(() => {});
  }, OTP_SESSION_TTL_MS);
  otpSessions.set(sessionId, { browser, page, timeout });
  return sessionId;
}

function takeOtpSession(sessionId: string) {
  const session = otpSessions.get(sessionId);
  if (!session) return null;
  otpSessions.delete(sessionId);
  clearTimeout(session.timeout);
  return session;
}

/** Lets the caller give up on an in-progress MFA session (e.g. the user navigates away)
 * instead of leaving a headless Chromium process running until the TTL closes it. */
export function cancelEspnOtpSession(sessionId: string): void {
  const session = takeOtpSession(sessionId);
  if (session) session.browser.close().catch(() => {});
}

// ESPN's login form isn't on www.espn.com itself — it's rendered inside a
// Disney ID iframe (confirmed by inspecting a live session: the frame's URL
// is under cdn.registerdisney.go.com). Page-level locators can't see into an
// iframe, so every fill/click has to go through this frame instead.
const ESPN_LOGIN_FRAME_SELECTOR = 'iframe[src*="registerdisney.go.com"]';

export type EspnLoginResult =
  | { status: "success"; espnS2: string; swid: string }
  | { status: "otp_required"; sessionId: string }
  | { status: "error"; message: string; reason: "otp" | "captcha" | "invalid_credentials" };

/** No third-party browser-hosting vendor involved — this launches a real Chromium process
 * directly inside our own server (the system-installed Chrome in dev, a bundled serverless-
 * compatible Chromium via @sparticuz/chromium in production). Credentials only ever touch
 * this process and ESPN's real login endpoint, never a third party. If ESPN asks for an MFA
 * code mid-login, the browser is held open (see otpSessions) so the user's own code can be
 * submitted into ESPN's real form on a follow-up request; a CAPTCHA still just fails with a
 * message pointing at manual cookie paste, since there's no code to relay for that. */
async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    return chromium.launch({
      executablePath: await chromiumBinary.executablePath(),
      args: chromiumBinary.args,
      headless: true,
    });
  }
  // Local dev: drive the system's installed Chrome directly — no separate browser download needed.
  return chromium.launch({ channel: "chrome", headless: true });
}

function getEspnFormRoot(page: Page): Page | FrameLocator {
  const hasLoginFrame = page.frames().some((f) => f.url().includes("registerdisney.go.com"));
  return hasLoginFrame ? page.frameLocator(ESPN_LOGIN_FRAME_SELECTOR) : page;
}

async function fillFirst(
  root: Page | FrameLocator,
  selectors: string[],
  value: string,
): Promise<string | null> {
  for (const selector of selectors) {
    const locator = root.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 1000 })) {
        await locator.fill(value);
        return selector;
      }
    } catch {
      // selector not present on this page — try the next one
    }
  }
  return null;
}

async function clickFirst(root: Page | FrameLocator, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const locator = root.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 1000 })) {
        await locator.click();
        return selector;
      }
    } catch {
      // selector not present on this page — try the next one
    }
  }
  return null;
}

async function logLoginDebugInfo(page: Page, context: Record<string, unknown>) {
  console.error("[espn-login] ended in error —", { url: page.url(), ...context });
  try {
    const screenshot = await page.screenshot({ fullPage: true });
    const path = join(tmpdir(), `espn-login-debug-${Date.now()}.png`);
    await writeFile(path, screenshot);
    console.error(`[espn-login] saved a screenshot of what the page looked like: ${path}`);
  } catch (err) {
    console.error("[espn-login] couldn't save a debug screenshot", err);
  }
}

/** ESPN sets an espn_s2/SWID pair for anonymous visitors too (as soon as the login page itself
 * loads), so their mere presence doesn't mean the account is actually signed in — especially
 * right after an OTP submit, where the real authenticated pair can take a beat longer to replace
 * the guest one than a plain password login does. fan.api.espn.com 404s for any SWID that isn't
 * a real fan account, which is the cheapest way to tell "signed in" apart from "still a guest". */
async function cookiesAreAuthenticated(espnS2: string, swid: string): Promise<boolean> {
  const normalizedSwid = swid.startsWith("{") ? swid : `{${swid.replace(/[{}]/g, "")}}`;
  try {
    const res = await fetch(
      `https://fan.api.espn.com/apis/v2/fans/${encodeURIComponent(normalizedSwid)}?platform=fantasy`,
      { headers: { Cookie: `espn_s2=${espnS2}; SWID=${normalizedSwid};` }, cache: "no-store" },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function classifyLoginPage(page: Page): Promise<EspnLoginResult> {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS });
  } catch {
    // fine — classify whatever state exists once the wait times out
  }

  // A successful login redirects to a normal content page (e.g. the ESPN
  // homepage) — busy with images/video that keep "networkidle" from ever
  // firing, and the guest cookies set on page load can take a few seconds to
  // be replaced by the real authenticated pair. Poll (and validate) instead
  // of trusting the first espn_s2/SWID pair that shows up.
  const context = page.context();
  for (let attempt = 0; attempt < COOKIE_POLL_ATTEMPTS; attempt++) {
    const cookies = await context.cookies(ESPN_COOKIE_URL);
    const espnS2 = cookies.find((c) => c.name === "espn_s2")?.value;
    const swid = cookies.find((c) => c.name === "SWID")?.value;
    if (espnS2 && swid && (await cookiesAreAuthenticated(espnS2, swid))) {
      return { status: "success", espnS2, swid };
    }
    if (attempt < COOKIE_POLL_ATTEMPTS - 1) await page.waitForTimeout(COOKIE_POLL_INTERVAL_MS);
  }

  const root = getEspnFormRoot(page);

  const codeInput = root.locator(CODE_INPUT_SELECTORS.join(", ")).first();
  if (await codeInput.isVisible({ timeout: 500 }).catch(() => false)) {
    return {
      status: "error",
      message: "ESPN is asking for a verification code — the code entered was incorrect or expired.",
      reason: "otp",
    };
  }

  // ESPN runs invisible reCAPTCHA Enterprise on every page load (score-based
  // bot detection) — its anchor iframe is present even on a normal login, so
  // only treat it as an actual challenge if it's rendering real content.
  const captchaFrame = page
    .locator('iframe[src*="hcaptcha.com"], iframe[src*="recaptcha"], iframe[src*="arkose"], iframe[src*="funcaptcha"]')
    .first();
  if (await captchaFrame.isVisible({ timeout: 500 }).catch(() => false)) {
    const box = await captchaFrame.boundingBox().catch(() => null);
    if (box && box.width > 100 && box.height > 100) {
      return {
        status: "error",
        message: "ESPN is showing a CAPTCHA — paste cookies manually instead.",
        reason: "captcha",
      };
    }
  }

  // innerText (not textContent) — it respects rendered layout and inserts line
  // breaks between block-level elements, so a heading like "Disney account"
  // immediately followed by a "The credentials you entered are incorrect."
  // paragraph doesn't get glued into one run of text with no boundary between
  // them for the regex below to respect.
  const bodyText = (await root.locator("body").innerText().catch(() => "")) ?? "";
  const errorMatch = bodyText.match(/[^.\n]*\b(incorrect|invalid|doesn't match|didn't match)\b[^.\n]*\./i);
  return {
    status: "error",
    message: errorMatch?.[0]?.trim() ?? "Couldn't sign in to ESPN — check your username and password.",
    reason: "invalid_credentials",
  };
}

export async function attemptEspnLogin(credentials: {
  username: string;
  password: string;
}): Promise<EspnLoginResult> {
  const browser = await launchBrowser();
  let keepBrowserOpen = false;
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(ESPN_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForSelector(ESPN_LOGIN_FRAME_SELECTOR, { timeout: NAV_TIMEOUT_MS }).catch(() => {});
    const root = getEspnFormRoot(page);

    const emailSelector = await fillFirst(
      root,
      ['input[placeholder="Username or Email Address"]', 'input[placeholder*="Username" i]', 'input[type="email"]', "#email"],
      credentials.username,
    );
    await clickFirst(root, ['button:has-text("Continue")']);

    const passwordSelector = await fillFirst(
      root,
      ['input[placeholder*="Password" i]', 'input[type="password"]', "#password"],
      credentials.password,
    );
    const loginSelector = await clickFirst(root, ['button:has-text("Log In")', 'button[type="submit"]']);

    const result = await classifyLoginPage(page);
    if (result.status === "error") {
      if (result.reason === "otp") {
        keepBrowserOpen = true;
        return { status: "otp_required", sessionId: storeOtpSession(browser, page) };
      }
      await logLoginDebugInfo(page, { emailSelector, passwordSelector, loginSelector });
    }
    return result;
  } finally {
    if (!keepBrowserOpen) await browser.close();
  }
}

/** Submits the code the user read off their own phone/authenticator into ESPN's real MFA
 * form and resumes classifying the page — the second half of the round trip attemptEspnLogin's
 * otp_required result started. Always closes the browser: whether this succeeds, the code was
 * wrong, or the session already expired, there's nothing left to keep it open for. */
export async function submitEspnOtp(sessionId: string, code: string): Promise<EspnLoginResult> {
  const session = takeOtpSession(sessionId);
  if (!session) {
    return {
      status: "error",
      message: "This sign-in session expired — start over and enter the code more quickly.",
      reason: "otp",
    };
  }
  const { browser, page } = session;
  try {
    const root = getEspnFormRoot(page);
    const codeSelector = await fillFirst(root, CODE_INPUT_SELECTORS, code);
    const submitSelector = await clickFirst(root, CODE_SUBMIT_SELECTORS);

    const result = await classifyLoginPage(page);
    if (result.status === "error" && result.reason !== "otp") {
      await logLoginDebugInfo(page, { codeSelector, submitSelector });
    }
    return result;
  } finally {
    await browser.close();
  }
}
