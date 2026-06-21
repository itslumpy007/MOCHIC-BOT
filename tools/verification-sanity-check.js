const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = {
  index: fs.readFileSync(path.join(root, "index.js"), "utf8"),
  app: fs.readFileSync(path.join(root, "web", "public", "app.js"), "utf8"),
  html: fs.readFileSync(path.join(root, "web", "public", "index.html"), "utf8"),
  supportHtml: fs.readFileSync(path.join(root, "web", "public", "support.html"), "utf8"),
  supportJs: fs.readFileSync(path.join(root, "web", "public", "support.js"), "utf8"),
  supportService: fs.readFileSync(path.join(root, "services", "support", "index.js"), "utf8"),
  packageJson: fs.readFileSync(path.join(root, "package.json"), "utf8")
};

const checks = [
  ["index.js exposes rules verify button", files.index.includes("verify:rules-check")],
  ["index.js exposes verification captcha", files.index.includes("verify:captcha") && files.index.includes("verificationCaptchaEnabled")],
  ["index.js exposes onboarding repair", files.index.includes("/api/onboarding-repair") && files.index.includes("repaironboarding")],
  ["index.js no longer exposes support routes", !files.index.includes("/support/login") && !files.index.includes("/api/support/tickets") && !files.index.includes("createSupportTicket") && !files.index.includes("formatSupportTranscript")],
  ["index.js keeps raid alerts", files.index.includes("raid-alert") && files.index.includes("Suspicious join burst")],
  ["index.js shortens web sessions", files.index.includes("WEB_SESSION_TTL_MS")],
  ["support service exists", files.supportService.includes("Support service available on port") && files.supportService.includes("mochi_support_session") && files.supportService.includes("/api/support/inbox") && files.supportService.includes("/support/login")],
  ["package scripts include support service", files.packageJson.includes("\"start:support\"") && files.packageJson.includes("\"start:moderation\"")],
  ["app.js has onboarding repair UI", files.app.includes("repairOnboardingButton") && files.app.includes("repairOnboarding()")],
  ["app.js no longer redirects members to support", !files.app.includes("getSupportPortalUrl(\"/\")") && !files.app.includes("syncSupportPortalLinks") && !files.app.includes("/api/support/inbox")],
  ["app.js splits verification settings", files.app.includes("verificationCoreFields") && files.app.includes("verificationBonusFields")],
  ["html has onboarding repair button", files.html.includes("Repair Onboarding") && files.html.includes("Core Verification")],
  ["html no longer links support portal", !files.html.includes("Support portal") && !files.html.includes("Open the support portal") && !files.html.includes("Staff Inbox")],
  ["support page exists", files.supportHtml.includes("Mochi Support") && files.supportHtml.includes("anonymous-chat")],
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
