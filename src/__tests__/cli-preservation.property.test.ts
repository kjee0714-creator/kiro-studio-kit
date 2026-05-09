import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseCompactFlag, parseMode } from "../cli.js";

/**
 * Preservation Property Tests
 *
 * Property 2: Preservation - parseCompactFlag と parseMode の動作保持
 *
 * 修正前・修正後の両方で PASS することが期待される。
 * これらのテストは関数ロジック自体が変更されていないことを検証する。
 *
 * **Validates: Requirements 3.5, 3.6**
 */
describe("Preservation: parseCompactFlag プロパティテスト", () => {
  it("Property 2: 任意の文字列配列に対して parseCompactFlag は '--compact' の有無のみに依存する", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string().filter((s) => s !== "--compact")),
        (args) => {
          // "--compact" を含まない配列では常に false
          expect(parseCompactFlag(args)).toBe(false);

          // "--compact" を追加すると常に true
          expect(parseCompactFlag([...args, "--compact"])).toBe(true);

          // "--compact" を先頭に追加しても true
          expect(parseCompactFlag(["--compact", ...args])).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 2: 空配列では false を返す", () => {
    expect(parseCompactFlag([])).toBe(false);
  });
});

describe("Preservation: parseMode プロパティテスト", () => {
  it("Property 2: 有効なモード値は常に正しく解析される", () => {
    const validModes = ["full", "compact", "minimal"] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...validModes),
        fc.array(fc.string().filter((s) => s !== "--mode")),
        (mode, prefix) => {
          const args = [...prefix, "--mode", mode];
          const result = parseMode(args);
          expect(result.mode).toBe(mode);
          expect(result.invalid).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 2: '--mode' がない場合は mode=null, invalid=null を返す", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string().filter((s) => s !== "--mode")),
        (args) => {
          const result = parseMode(args);
          expect(result.mode).toBeNull();
          expect(result.invalid).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 2: 無効なモード値は常に invalid として返される", () => {
    fc.assert(
      fc.property(
        fc
          .string()
          .filter(
            (s) =>
              !["full", "compact", "minimal"].includes(s) &&
              s.length > 0 &&
              !s.startsWith("--"),
          ),
        (invalidMode) => {
          const result = parseMode(["--mode", invalidMode]);
          expect(result.mode).toBeNull();
          expect(result.invalid).toBe(invalidMode);
        },
      ),
      { numRuns: 100 },
    );
  });
});
