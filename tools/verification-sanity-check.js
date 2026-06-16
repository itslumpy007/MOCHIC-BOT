const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = {
  index: fs.readFileSync(path.join(root, "index.js"), "utf8"),
  app: fs.readFileSync(path.join(root, "web", "public", "app.js"), "utf8"),
  html: fs.readFileSync(path.join(root, "web", "public", "index.html"), "utf8")
};

const checks = [
  ["index.js exposes rules verify button", files.index.includes("verify:rules-check")],
  ["index.js exposes onboarding repair", files.index.includes("/api/onboarding-repair") && files.index.includes("repaironboarding")],
  ["index.js keeps raid alerts", files.index.includes("raid-alert") && files.index.includes("Suspicious join burst")],
  ["index.js shortens web sessions", files.index.includes("WEB_SESSION_TTL_MS")],
  ["app.js has onboarding repair UI", files.app.includes("repairOnboardingButton") && files.app.includes("repairOnboarding()")],
  ["app.js splits verification settings", files.app.includes("verificationCoreFields") && files.app.includes("verificationBonusFields")],
  ["html has onboarding repair button", files.html.includes("Repair Onboarding") && files.html.includes("Core Verification")]
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
