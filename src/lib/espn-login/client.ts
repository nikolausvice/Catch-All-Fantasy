import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chromiumBinary from "@sparticuz/chromium";
import { chromium, type Browser, type FrameLocator, type Page } from "playwright-core";

const ESPN_LOGIN_URL = "https://www.espn.com/login/";
const ESPN_COOKIE_URL = "https://www.espn.com";
const NAV_TIMEOUT_MS = 20000;
const SETTLE_TIMEOUT_MS = 12000;

// ESPN's login form isn't on www.espn.com itself — it's rendered inside a
// Disney ID iframe (confirmed by inspecting a live session: the frame's URL
// is under cdn.registerdisney.go.com). Page-level locators can't see into an
// iframe, so every fill/click has to go through this frame instead.
const ESPN_LOGIN_FRAME_SELECTOR = 'iframe[src*="registerdisney.go.com"]';

export type EspnLoginResult =
  | { status: "success"; espnS2: string; swid: string }
  | { status: "error"; message: string };

/** No third-party browser-hosting vendor involved — this launches a real Chromium process
 * directly inside our own server (the system-installed Chrome in dev, a bundled serverless-
 * compatible Chromium via @sparticuz/chromium in production). Credentials only ever touch
 * this process and ESPN's real login endpoint, never a third party. Runs entirely within a
 * single request — no persisted session, so there's no way to relay an MFA code or CAPTCHA
 * that appears mid-login; those cases just fail with a message pointing at manual cookie paste. */
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

async function classifyLoginPage(page: Page): Promise<EspnLoginResult> {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS });
  } catch {
    // fine — classify whatever state exists once the wait times out
  }

  // A successful login redirects to a normal content page (e.g. the ESPN
  // homepage) — busy with images/video that keep "networkidle" from ever
  // firing, and the actual cookies can land a beat after the redirect. Poll
  // briefly instead of checking once.
  const context = page.context();
  for (let attempt = 0; attempt < 5; attempt++) {
    const cookies = await context.cookies(ESPN_COOKIE_URL);
    const espnS2 = cookies.find((c) => c.name === "espn_s2")?.value;
    const swid = cookies.find((c) => c.name === "SWID")?.value;
    if (espnS2 && swid) return { status: "success", espnS2, swid };
    if (attempt < 4) await page.waitForTimeout(1000);
  }

  const root = getEspnFormRoot(page);

  const codeInput = root
    .locator('input[autocomplete="one-time-code"], input[name*="code" i], input[id*="code" i]')
    .first();
  if (await codeInput.isVisible({ timeout: 500 }).catch(() => false)) {
    return {
      status: "error",
      message: "ESPN is asking for a verification code — paste cookies manually instead.",
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
      };
    }
  }

  const bodyText = (await root.locator("body").textContent().catch(() => "")) ?? "";
  const errorMatch = bodyText.match(/[^.]*\b(incorrect|invalid|doesn't match|didn't match)\b[^.]*\./i);
  return {
    status: "error",
    message: errorMatch?.[0]?.trim() ?? "Couldn't sign in to ESPN — check your username and password.",
  };
}

export async function attemptEspnLogin(credentials: {
  username: string;
  password: string;
}): Promise<EspnLoginResult> {
  const browser = await launchBrowser();
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
      await logLoginDebugInfo(page, { emailSelector, passwordSelector, loginSelector });
    }
    return result;
  } finally {
    await browser.close();
  }
}
