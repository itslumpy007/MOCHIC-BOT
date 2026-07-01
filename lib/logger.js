const fs = require("node:fs");
const path = require("node:path");

const LOG_FILE_PATH = (process.env.LOG_FILE_PATH || "").trim();
const LOG_MAX_BYTES = Number.isFinite(Number(process.env.LOG_MAX_BYTES))
  ? Math.max(1024, Number(process.env.LOG_MAX_BYTES))
  : 5 * 1024 * 1024;
const LOG_BACKUP_PATH = LOG_FILE_PATH ? `${LOG_FILE_PATH}.1` : "";

function serializeError(error) {
  if (error == null) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    const parts = [`${error.name}: ${error.message}`];
    const extras = [];

    if (error.code != null) {
      extras.push(`code=${String(error.code)}`);
    }

    if (error.status != null) {
      extras.push(`status=${String(error.status)}`);
    }

    if (error.cause instanceof Error) {
      extras.push(`cause=${error.cause.name}: ${error.cause.message}`);
    }

    if (extras.length > 0) {
      parts.push(`(${extras.join(", ")})`);
    }

    if (error.stack) {
      parts.push(error.stack);
    }

    return parts.join("\n");
  }

  if (typeof error === "object") {
    try {
      return JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function rotateLogFileIfNeeded() {
  if (!LOG_FILE_PATH) return;

  try {
    if (!fs.existsSync(LOG_FILE_PATH)) return;
    const stats = fs.statSync(LOG_FILE_PATH);
    if (stats.size < LOG_MAX_BYTES) return;

    if (LOG_BACKUP_PATH) {
      if (fs.existsSync(LOG_BACKUP_PATH)) {
        fs.unlinkSync(LOG_BACKUP_PATH);
      }
      fs.renameSync(LOG_FILE_PATH, LOG_BACKUP_PATH);
    } else {
      fs.writeFileSync(LOG_FILE_PATH, "");
    }
  } catch {
    // Logging should never block the bot.
  }
}

function appendLogLine(line) {
  if (!LOG_FILE_PATH) return;

  try {
    fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
    rotateLogFileIfNeeded();
    fs.appendFileSync(LOG_FILE_PATH, `${line}\n`, "utf8");
  } catch {
    // Logging should never block the bot.
  }
}

function createLogger(scope) {
  function write(level, message, details) {
    const ts = new Date().toISOString();
    const header = `[${ts}] [${scope}] [${level}] ${message}`;
    appendLogLine(header);
    if (details == null || details === "") {
      console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](header);
      return;
    }

    const detailText = details instanceof Error ? serializeError(details) : serializeError(details);
    appendLogLine(detailText);
    console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](`${header}\n${detailText}`);
  }

  return {
    info(message, details) {
      write("INFO", message, details);
    },
    warn(message, details) {
      write("WARN", message, details);
    },
    error(message, details) {
      write("ERROR", message, details);
    },
    debug(message, details) {
      write("DEBUG", message, details);
    }
  };
}

module.exports = {
  createLogger,
  serializeError
};
