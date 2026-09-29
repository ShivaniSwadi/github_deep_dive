import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  calculateRpm,
  decodeRpmResponse,
  formatRpm
} from "../src/decoder.js";

// Test design: docs/ut.md. Test IDs match that document.

const REFERENCE_INPUT = "41 0C 1A F8";

const MESSAGES = {
  EMPTY: "Enter four hexadecimal bytes, for example: 41 0C 1A F8.",
  WRONG_BYTE_COUNT: "Enter exactly four bytes: service, PID, A, and B.",
  INVALID_BYTE: "Each byte must contain exactly two hexadecimal characters.",
  WRONG_SERVICE: "This is not a positive response for Mode 01; expected service 41.",
  WRONG_PID: "This response is for a different PID; expected 0C (engine speed)."
};

const hex = (value) => value.toString(16).toUpperCase().padStart(2, "0");

function expectError(input, code) {
  const result = decodeRpmResponse(input);
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  return result;
}

function expectReference(input) {
  const result = decodeRpmResponse(input);
  assert.equal(result.ok, true);
  assert.equal(result.rpm, 1726);
  assert.equal(result.normalized, REFERENCE_INPUT);
  return result;
}

// [id, input, expected rpm]
const boundaryVectors = [
  ["UT-04", "41 0C 00 00", 0],
  ["UT-05", "41 0C 00 01", 0.25],
  ["UT-06", "41 0C 00 02", 0.5],
  ["UT-07", "41 0C 00 03", 0.75],
  ["UT-08", "41 0C 00 04", 1],
  ["UT-09", "41 0C 00 FF", 63.75],
  ["UT-10", "41 0C 01 00", 64],
  ["UT-11", "41 0C 7F FF", 8191.75],
  ["UT-12", "41 0C 80 00", 8192],
  ["UT-13", "41 0C FF 00", 16320],
  ["UT-14", "41 0C FF FF", 16383.75]
];

// [id, input]; every row must decode to the reference result.
const whitespaceVectors = [
  ["UT-15", "  41 0C 1A F8  "],
  ["UT-16", "41  0C   1A    F8"],
  ["UT-17", "41\t0C\t1A\tF8"],
  ["UT-18", "41 0C 1A F8\r\n"]
];

// [id, input, expected error code]
const errorVectors = [
  ["UT-19", "", "EMPTY"],
  ["UT-20", "   ", "EMPTY"],
  ["UT-21", "\t\r\n", "EMPTY"],
  ["UT-22", "41", "WRONG_BYTE_COUNT"],
  ["UT-23", "41 0C", "WRONG_BYTE_COUNT"],
  ["UT-24", "41 0C F8", "WRONG_BYTE_COUNT"],
  ["UT-25", "41 0C 1A F8 00", "WRONG_BYTE_COUNT"],
  ["UT-26", "41 0C 1A F8 41 0C 1A F8", "WRONG_BYTE_COUNT"],
  ["UT-27", "410C1AF8", "WRONG_BYTE_COUNT"],
  ["UT-28", "41,0C,1A,F8", "WRONG_BYTE_COUNT"],
  ["UT-29", "41 0C 1G F8", "INVALID_BYTE"],
  ["UT-30", "41 0C 1 F8", "INVALID_BYTE"],
  ["UT-31", "41 0C 1AF F8", "INVALID_BYTE"],
  ["UT-32", "0x41 0C 1A F8", "INVALID_BYTE"],
  ["UT-33", "41 0C -1 F8", "INVALID_BYTE"],
  ["UT-34", "41 0C +1 F8", "INVALID_BYTE"],
  ["UT-35", "41 0C 1. F8", "INVALID_BYTE"],
  ["UT-36", "\uFF14\uFF11 0C 1A F8", "INVALID_BYTE"],
  ["UT-37", "42 0C 1A F8", "WRONG_SERVICE"],
  ["UT-38", "01 0C 1A F8", "WRONG_SERVICE"],
  ["UT-39", "7F 0C 1A F8", "WRONG_SERVICE"],
  ["UT-40", "41 0D 1A F8", "WRONG_PID"],
  ["UT-41", "41 00 1A F8", "WRONG_PID"],
  ["UT-42", "41 0B 1A F8", "WRONG_PID"],
  ["UT-43", "41 0C 1G", "WRONG_BYTE_COUNT"],
  ["UT-44", "ZZ 0C 1A F8", "INVALID_BYTE"],
  ["UT-45", "42 0C 1G F8", "INVALID_BYTE"],
  ["UT-46", "41 0D 1G F8", "INVALID_BYTE"],
  ["UT-47", "42 0D 1A F8", "WRONG_SERVICE"]
];

const errorVectorGroups = [
  ["Empty input", "UT-19", "UT-21"],
  ["Byte count", "UT-22", "UT-28"],
  ["Byte syntax", "UT-29", "UT-36"],
  ["Service", "UT-37", "UT-39"],
  ["PID", "UT-40", "UT-42"],
  ["Check order", "UT-43", "UT-47"]
];

function vectorsInRange(first, last) {
  const ids = errorVectors.map(([id]) => id);
  return errorVectors.slice(ids.indexOf(first), ids.indexOf(last) + 1);
}

describe("Valid responses", () => {
  test("UT-01 decodes the reference response", () => {
    const result = decodeRpmResponse(REFERENCE_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.rpm, 1726);
    assert.deepEqual(result.bytes, [0x41, 0x0c, 0x1a, 0xf8]);
    assert.equal(result.normalized, REFERENCE_INPUT);
  });

  test("UT-02 accepts lowercase hex and normalizes to upper case", () => {
    expectReference("41 0c 1a f8");
  });

  test("UT-03 accepts mixed-case hex", () => {
    expectReference("41 0C 1a F8");
  });
});

describe("Calculation and boundaries", () => {
  for (const [id, input, rpm] of boundaryVectors) {
    test(`${id} decodes ${input} to ${rpm} rpm`, () => {
      const result = decodeRpmResponse(input);
      assert.equal(result.ok, true);
      assert.equal(result.rpm, rpm);
    });
  }

  test("UT-56 calculateRpm applies ((A * 256) + B) / 4", () => {
    assert.equal(calculateRpm(0x1a, 0xf8), 1726);
    assert.equal(calculateRpm(0, 1), 0.25);
    assert.equal(calculateRpm(255, 255), 16383.75);
  });
});

describe("Whitespace", () => {
  for (const [id, input] of whitespaceVectors) {
    test(`${id} tolerates ${JSON.stringify(input)}`, () => {
      expectReference(input);
    });
  }
});

for (const [suite, first, last] of errorVectorGroups) {
  describe(suite, () => {
    for (const [id, input, code] of vectorsInRange(first, last)) {
      test(`${id} rejects ${JSON.stringify(input)} with ${code}`, () => {
        expectError(input, code);
      });
    }
  });
}

describe("Robustness", () => {
  const nonStrings = [
    ["undefined", undefined],
    ["null", null],
    ["number", 123],
    ["boolean", true],
    ["object", {}],
    ["array", []]
  ];

  for (const [label, value] of nonStrings) {
    test(`UT-48 treats a ${label} input as EMPTY without throwing`, () => {
      assert.doesNotThrow(() => decodeRpmResponse(value));
      expectError(value, "EMPTY");
    });
  }

  test("UT-49 rejects 10,000 tokens with WRONG_BYTE_COUNT", () => {
    const input = Array.from({ length: 10000 }, () => "41").join(" ");
    expectError(input, "WRONG_BYTE_COUNT");
  });

  test("UT-50 results depend only on their own input", () => {
    const freshValid = decodeRpmResponse(REFERENCE_INPUT);
    const freshInvalid = decodeRpmResponse("41 0C 1G F8");

    assert.deepEqual(decodeRpmResponse("41 0C 1G F8"), freshInvalid);
    assert.deepEqual(decodeRpmResponse(REFERENCE_INPUT), freshValid);
    assert.deepEqual(decodeRpmResponse("41 0C 1G F8"), freshInvalid);
    assert.deepEqual(decodeRpmResponse(REFERENCE_INPUT), freshValid);
  });

  test("UT-51 is deterministic for the same input", () => {
    assert.deepEqual(
      decodeRpmResponse(REFERENCE_INPUT),
      decodeRpmResponse(REFERENCE_INPUT)
    );
  });
});

describe("Result contract", () => {
  test("UT-52 success result has the documented shape", () => {
    const result = decodeRpmResponse(REFERENCE_INPUT);
    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.bytes));
    assert.equal(result.bytes.length, 4);
    for (const byte of result.bytes) {
      assert.ok(Number.isInteger(byte) && byte >= 0 && byte <= 255);
    }
    assert.ok(Number.isFinite(result.rpm));
    assert.equal(typeof result.normalized, "string");
    assert.equal(typeof result.display, "string");
    assert.equal("code" in result, false);
    assert.equal("message" in result, false);
  });

  test("UT-53 every error result has the documented shape and no RPM", () => {
    for (const [id, input] of errorVectors) {
      const result = decodeRpmResponse(input);
      assert.equal(result.ok, false, id);
      assert.equal(typeof result.code, "string", id);
      assert.ok(result.code.length > 0, id);
      assert.equal(typeof result.message, "string", id);
      assert.ok(result.message.length > 0, id);
      for (const key of ["rpm", "bytes", "normalized", "display"]) {
        assert.equal(key in result, false, `${id} must not have ${key}`);
      }
    }
  });

  test("UT-54 error messages match the design text", () => {
    const samples = [
      ["UT-19", "EMPTY"],
      ["UT-24", "WRONG_BYTE_COUNT"],
      ["UT-29", "INVALID_BYTE"],
      ["UT-37", "WRONG_SERVICE"],
      ["UT-40", "WRONG_PID"]
    ];

    for (const [id, code] of samples) {
      const [, input] = errorVectors.find(([vectorId]) => vectorId === id);
      const result = expectError(input, code);
      assert.equal(result.message, MESSAGES[code], id);
    }
  });

  test("UT-55 only the five documented error codes are produced", () => {
    const produced = new Set(
      errorVectors.map(([, input]) => decodeRpmResponse(input).code)
    );
    assert.deepEqual([...produced].sort(), Object.keys(MESSAGES).sort());
  });
});

describe("Formatting", () => {
  test("UT-57 formatRpm groups thousands and never rounds or pads", () => {
    const expected = [
      [0, "0 rpm"],
      [0.25, "0.25 rpm"],
      [0.5, "0.5 rpm"],
      [1.5, "1.5 rpm"],
      [64, "64 rpm"],
      [1726, "1,726 rpm"],
      [16320, "16,320 rpm"],
      [16383.75, "16,383.75 rpm"]
    ];

    for (const [rpm, text] of expected) {
      assert.equal(formatRpm(rpm), text);
    }
  });

  test("UT-58 display equals formatRpm of the decoded value", () => {
    const expected = [
      ["41 0C 1A F8", "1,726 rpm"],
      ["41 0C 00 01", "0.25 rpm"],
      ["41 0C FF FF", "16,383.75 rpm"]
    ];

    for (const [input, text] of expected) {
      const result = decodeRpmResponse(input);
      assert.equal(result.display, text);
      assert.equal(result.display, formatRpm(result.rpm));
    }
  });
});

describe("Exhaustive and static checks", () => {
  test("UT-59 every A and B decodes exactly and displays without rounding", () => {
    for (let a = 0; a <= 255; a += 1) {
      for (let b = 0; b <= 255; b += 1) {
        const input = `41 0C ${hex(a)} ${hex(b)}`;
        const result = decodeRpmResponse(input);

        assert.equal(result.ok, true, input);
        assert.ok(result.rpm >= 0 && result.rpm <= 16383.75, input);
        assert.equal(result.rpm * 4, a * 256 + b, input);

        const shown = Number(
          result.display.replace(/,/g, "").replace(/ rpm$/, "")
        );
        assert.equal(shown, result.rpm, input);
      }
    }
  });

  test("UT-60 decoder source has no DOM, network, storage, logging, or imports", () => {
    const source = readFileSync(
      new URL("../src/decoder.js", import.meta.url),
      "utf8"
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    const forbidden = [
      "document",
      "window",
      "fetch",
      "XMLHttpRequest",
      "localStorage",
      "sessionStorage",
      "console",
      "innerHTML",
      "eval"
    ];

    for (const name of forbidden) {
      assert.equal(new RegExp(`\\b${name}\\b`).test(source), false, name);
    }
    assert.equal(/^\s*import\s/m.test(source), false, "static import");
    assert.equal(/\bimport\s*\(/.test(source), false, "dynamic import");
  });
});
