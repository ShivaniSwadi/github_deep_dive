const EXPECTED_SERVICE = 0x41;
const EXPECTED_PID = 0x0c;
const EXPECTED_BYTE_COUNT = 4;
const COMPACT_LENGTH = EXPECTED_BYTE_COUNT * 2;
// Tested before upper-casing so characters that expand under case mapping are not accepted.
const BYTE_PATTERN = /^[0-9A-Fa-f]{2}$/;

const MESSAGES = {
  EMPTY: "Enter four hexadecimal bytes, for example: 41 0C 1A F8.",
  WRONG_BYTE_COUNT: "Enter exactly four bytes: service, PID, A, and B.",
  INVALID_BYTE: "Each byte must contain exactly two hexadecimal characters.",
  WRONG_SERVICE: "This is not a positive response for Mode 01; expected service 41.",
  WRONG_PID: "This response is for a different PID; expected 0C (engine speed)."
};

const rpmFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function failure(code) {
  return { ok: false, code, message: MESSAGES[code] };
}

export function calculateRpm(a, b) {
  return (a * 256 + b) / 4;
}

export function formatRpm(rpm) {
  return `${rpmFormat.format(rpm)} rpm`;
}

function splitBytes(text) {
  const tokens = text.split(/\s+/);
  if (tokens.length === 1 && tokens[0].length === COMPACT_LENGTH) {
    return Array.from({ length: EXPECTED_BYTE_COUNT }, (_, i) => tokens[0].slice(i * 2, i * 2 + 2));
  }
  return tokens;
}

export function decodeRpmResponse(input) {
  const text = typeof input === "string" ? input.trim() : "";
  if (text === "") {
    return failure("EMPTY");
  }

  const tokens = splitBytes(text);
  if (tokens.length !== EXPECTED_BYTE_COUNT) {
    return failure("WRONG_BYTE_COUNT");
  }
  if (!tokens.every((token) => BYTE_PATTERN.test(token))) {
    return failure("INVALID_BYTE");
  }

  const bytes = tokens.map((token) => Number.parseInt(token, 16));
  const [service, pid, a, b] = bytes;
  if (service !== EXPECTED_SERVICE) {
    return failure("WRONG_SERVICE");
  }
  if (pid !== EXPECTED_PID) {
    return failure("WRONG_PID");
  }

  const rpm = calculateRpm(a, b);
  return {
    ok: true,
    bytes,
    normalized: tokens.map((token) => token.toUpperCase()).join(" "),
    rpm,
    display: formatRpm(rpm)
  };
}
