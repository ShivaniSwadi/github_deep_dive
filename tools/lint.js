// Deterministic version of the lint agent (.github/agents/lint.agent.md): conventions from .github/workflows/copilot-instructions.md.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "node_modules", "reports"]);
const TEXT_EXTENSIONS = new Set([".js", ".html", ".css", ".md", ".yml", ".yaml", ".json", ".csv"]);

// Node loads a reporter through its default export.
const ALLOWED = { "tools/ut-csv-reporter.js": ["default-export"] };

const DECODER_FORBIDDEN = /\b(document|window|fetch|XMLHttpRequest|localStorage|sessionStorage|console|innerHTML|eval)\b/;
const APP_FORBIDDEN = /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write\b/;
const SECRETS = [
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(password|passwd|secret|token)\b\s*[:=]\s*["'][^"'\s]{8,}["']/i
];

const findings = [];
const report = (file, line, rule, message) => findings.push({ file, line, rule, message });

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : listFiles(path.join(dir, entry.name));
    }
    return [path.join(dir, entry.name)];
  });
}

// Blanks comments and string contents so rules see code only; records single-quoted strings that need no escaping.
function scan(text) {
  const singles = [];
  const braces = [];
  let code = "";
  let line = 1;
  let depth = 0;
  let last = "";
  let inTemplate = false;
  let i = 0;

  const emit = (ch, visible) => {
    code += ch === "\n" || visible ? ch : " ";
    if (ch === "\n") {
      line += 1;
    }
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inTemplate) {
      if (ch === "\\") {
        emit(ch, false);
        emit(next ?? "", false);
        i += 2;
      } else if (ch === "`") {
        emit(ch, true);
        inTemplate = false;
        last = "`";
        i += 1;
      } else if (ch === "$" && next === "{") {
        emit("${", true);
        braces.push(depth);
        depth += 1;
        inTemplate = false;
        last = "{";
        i += 2;
      } else {
        emit(ch, false);
        i += 1;
      }
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") {
        emit(text[i], false);
        i += 1;
      }
    } else if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (; i < stop; i += 1) {
        emit(text[i], false);
      }
    } else if (ch === '"' || ch === "'") {
      const startLine = line;
      let body = "";
      emit(ch, true);
      i += 1;
      while (i < text.length && text[i] !== ch && text[i] !== "\n") {
        if (text[i] === "\\") {
          body += text[i];
          emit(text[i], false);
          i += 1;
        }
        body += text[i] ?? "";
        emit(text[i] ?? "", false);
        i += 1;
      }
      emit(text[i] ?? "", true);
      i += 1;
      if (ch === "'" && !body.includes('"')) {
        singles.push(startLine);
      }
      last = ch;
    } else if (ch === "`") {
      emit(ch, true);
      inTemplate = true;
      i += 1;
    } else if (ch === "/" && (last === "" || "(,=:[!&|?{};".includes(last))) {
      let inClass = false;
      emit(ch, true);
      i += 1;
      while (i < text.length && text[i] !== "\n" && (inClass || text[i] !== "/")) {
        if (text[i] === "\\") {
          emit(text[i], false);
          i += 1;
        } else if (text[i] === "[") {
          inClass = true;
        } else if (text[i] === "]") {
          inClass = false;
        }
        emit(text[i] ?? "", false);
        i += 1;
      }
      emit("/", true);
      i += 1;
      last = "/";
    } else {
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (braces.length > 0 && depth === braces[braces.length - 1]) {
          braces.pop();
          emit(ch, true);
          inTemplate = true;
          i += 1;
          continue;
        }
      }
      emit(ch, true);
      if (!/\s/.test(ch)) {
        last = ch;
      }
      i += 1;
    }
  }
  return { code, singles };
}

function lintJavaScript(rel, text) {
  const allowed = ALLOWED[rel] ?? [];
  const { code, singles } = scan(text);
  const codeLines = code.split("\n");
  const rawLines = text.split("\n");

  for (const line of singles) {
    report(rel, line, "double-quotes", "use double quotes");
  }
  codeLines.forEach((codeLine, index) => {
    const n = index + 1;
    const raw = rawLines[index] ?? "";
    if (/^\s*\t/.test(raw)) {
      report(rel, n, "indent", "tab indentation; use two spaces");
    } else if (codeLine.trim() !== "" && (/^( *)/.exec(raw)[1].length % 2) !== 0) {
      report(rel, n, "indent", "indentation is not a multiple of two spaces");
    }
    if (/\bvar\s+[\w$]/.test(codeLine)) {
      report(rel, n, "no-var", "use const or let");
    }
    if (/(?<![=!<>])==(?!=)|!=(?!=)/.test(codeLine)) {
      report(rel, n, "eqeqeq", "use === or !==");
    }
    if (/\bdebugger\b/.test(codeLine)) {
      report(rel, n, "no-debugger", "remove debugger statement");
    }
    if (/\bconsole\./.test(codeLine) && !rel.startsWith("tools/")) {
      report(rel, n, "no-console", "console output is only allowed in tools/");
    }
    if (/^\s*export\s+default\b/.test(codeLine) && !allowed.includes("default-export")) {
      report(rel, n, "default-export", "use named exports");
    }
    if (rel === "src/decoder.js") {
      if (DECODER_FORBIDDEN.test(codeLine)) {
        report(rel, n, "decoder-purity", "decoder must not use DOM, network, storage, logging, or eval");
      }
      if (/^\s*import\b/.test(codeLine)) {
        report(rel, n, "decoder-purity", "decoder must not import modules");
      }
    }
    if (rel === "src/app.js" && APP_FORBIDDEN.test(codeLine)) {
      report(rel, n, "no-html-injection", "render user-visible text with textContent");
    }
  });
}

function lintHtml(rel, text) {
  if (!/<html\b[^>]*\blang="[^"]+"/.test(text)) {
    report(rel, 1, "html-lang", "<html> needs a lang attribute");
  }
  const labelled = new Set([...text.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((match) => match[1]));
  for (const match of text.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attributes = match[2];
    const id = /\bid="([^"]+)"/.exec(attributes)?.[1];
    if (!/\btype="(hidden|submit|button)"/.test(attributes) && !(id && labelled.has(id)) && !/\baria-label(ledby)?=/.test(attributes)) {
      report(rel, text.slice(0, match.index).split("\n").length, "form-label", `<${match[1]}> has no associated label`);
    }
  }
  for (const match of text.matchAll(/\b(?:src|href)="(https?:)?\/\/[^"]+"/g)) {
    report(rel, text.slice(0, match.index).split("\n").length, "no-external-assets", "no external scripts, fonts, or links");
  }
}

function lintMarkdown(rel, text) {
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
        continue;
      }
      const resolved = path.join(root, path.dirname(rel), decodeURIComponent(target));
      if (!existsSync(resolved)) {
        report(rel, index + 1, "broken-link", `link target ${target} does not exist`);
      }
    }
  });
}

function lintText(rel, buffer) {
  const raw = buffer.toString("utf8");
  if (buffer.includes(0)) {
    report(rel, 1, "encoding", "file contains NUL bytes (wrong encoding or stray UTF-16 text)");
    return null;
  }
  if (raw.charCodeAt(0) === 0xfeff) {
    report(rel, 1, "encoding", "file starts with a byte order mark");
  }
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (text !== "" && !text.endsWith("\n")) {
    report(rel, text.split("\n").length, "final-newline", "file does not end with a newline");
  }
  text.split("\n").forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      report(rel, index + 1, "trailing-whitespace", "trailing whitespace");
    }
    if (/\.ya?ml$/.test(rel) && /^\t/.test(line)) {
      report(rel, index + 1, "yaml-tab", "YAML must not be indented with tabs");
    }
    if (SECRETS.some((pattern) => pattern.test(line))) {
      report(rel, index + 1, "secret", "possible secret or credential");
    }
  });
  return text;
}

for (const file of listFiles(root).sort()) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const extension = path.extname(rel);
  if (/(\.bak|\.tmp|\.orig|~)$/.test(rel)) {
    report(rel, 1, "scratch-file", "scratch or backup file");
    continue;
  }
  if (!TEXT_EXTENSIONS.has(extension) && !rel.startsWith(".github/")) {
    continue;
  }
  const text = lintText(rel, readFileSync(file));
  if (text === null) {
    continue;
  }
  if (extension === ".js") {
    lintJavaScript(rel, text);
  } else if (extension === ".html") {
    lintHtml(rel, text);
  } else if (extension === ".md") {
    lintMarkdown(rel, text);
  } else if (extension === ".json") {
    try {
      JSON.parse(text);
    } catch (error) {
      report(rel, 1, "json", `invalid JSON: ${error.message}`);
    }
  }
}

for (const { file, line, rule, message } of findings) {
  console.log(`${file}:${line}  ${rule}  ${message}`);
}
console.log(findings.length === 0 ? "Lint: no findings." : `\nLint: ${findings.length} finding(s).`);
process.exit(findings.length === 0 ? 0 : 1);
