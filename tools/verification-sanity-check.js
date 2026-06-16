const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = {
  index: fs.readFileSync(path.join(root, "index.js"), "utf8"),
  app: fs.readFileSync(path.join(root, "web", "public", "app.js"), "utf8"),
  html: fs.readFileSync(path.join(root, "web", "public", "index.html"), "utf8"),
  supportHtml: fs.readFileSync(path.join(root, "web", "public", "support.html"), "utf8"),
  supportJs: fs.readFileSync(path.join(root, "web", "public", "support.js"), "utf8")
};

const checks = [
  ["index.js exposes rules verify button", files.index.includes("verify:rules-check")],
  ["index.js exposes verification captcha", files.index.includes("verify:captcha") && files.index.includes("verificationCaptchaEnabled")],
  ["index.js exposes onboarding repair", files.index.includes("/api/onboarding-repair") && files.index.includes("repaironboarding")],
  ["index.js exposes support portal", files.index.includes("/support/login") && files.index.includes("/api/support/tickets") && files.index.includes("createSupportTicket")],
  ["index.js exposes support inbox export", files.index.includes("/api/support/inbox") && files.index.includes("action === \"transcript\"") && files.index.includes("formatSupportTranscript")],
  ["index.js keeps raid alerts", files.index.includes("raid-alert") && files.index.includes("Suspicious join burst")],
  ["index.js shortens web sessions", files.index.includes("WEB_SESSION_TTL_MS")],
  ["app.js has onboarding repair UI", files.app.includes("repairOnboardingButton") && files.app.includes("repairOnboarding()")],
  ["app.js redirects members to support", files.app.includes("window.location.replace(\"/support\")")],
  ["app.js splits verification settings", files.app.includes("verificationCoreFields") && files.app.includes("verificationBonusFields")],
  ["app.js has staff inbox", files.app.includes("staffInboxList") && files.app.includes("exportSupportTranscript()") && files.app.includes("/api/support/inbox")],
  ["html has onboarding repair button", files.html.includes("Repair Onboarding") && files.html.includes("Core Verification")],
  ["html has staff inbox", files.html.includes("Staff Inbox") && files.html.includes("Export Transcript")],
  ["support page exists", files.supportHtml.includes("Mochi Support") && files.supportHtml.includes("/support/login")],
  ["support script exists", files.supportJs.includes("createTicket") && files.supportJs.includes("anonymous-chat") && files.supportJs.includes("exportTranscriptButton")],
  ["html mentions captcha", files.html.includes("newer or suspicious accounts") || files.html.includes("CAPTCHA is optional")],
  ["index.js scopes captcha", files.index.includes("new/suspicious accounts only") && files.index.includes("newer or suspicious accounts")]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error("Verification sanity check failed:");
  for (const [name] of failed) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log(`Verification sanity check passed (${checks.length} checks).`);
