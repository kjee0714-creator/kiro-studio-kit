import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseCompactFlag, parseMode } from "../cli.js";

describe("parseCompactFlag", () => {
  it("--compact フラグが含まれる場合に true を返す", () => {
    expect(parseCompactFlag(["prompt", "task.md", "--compact"])).toBe(true);
  });

  it("--compact フラグが含まれない場合に false を返す", () => {
    expect(parseCompactFlag(["prompt", "task.md"])).toBe(false);
  });

  it("--compact が他のフラグと併用される場合に true を返す", () => {
    expect(
      parseCompactFlag(["prompt", "task.md", "--out", "output", "--compact"]),
    ).toBe(true);
  });

  it("--compact が先頭に配置されても true を返す", () => {
    expect(parseCompactFlag(["prompt", "--compact", "task.md"])).toBe(true);
  });

  it("空の引数配列で false を返す", () => {
    expect(parseCompactFlag([])).toBe(false);
  });

  it("--compact に似た文字列（--compacts, --COMPACT）では false を返す", () => {
    expect(parseCompactFlag(["prompt", "task.md", "--compacts"])).toBe(false);
    expect(parseCompactFlag(["prompt", "task.md", "--COMPACT"])).toBe(false);
  });
});

describe("parseMode", () => {
  it("--mode full を正しく解析する", () => {
    expect(parseMode(["prompt", "task.md", "--mode", "full"])).toEqual({ mode: "full", invalid: null });
  });
  it("--mode compact を正しく解析する", () => {
    expect(parseMode(["prompt", "task.md", "--mode", "compact"])).toEqual({ mode: "compact", invalid: null });
  });
  it("--mode minimal を正しく解析する", () => {
    expect(parseMode(["prompt", "task.md", "--mode", "minimal"])).toEqual({ mode: "minimal", invalid: null });
  });
  it("--mode が指定されない場合は null を返す", () => {
    expect(parseMode(["prompt", "task.md"])).toEqual({ mode: null, invalid: null });
  });
  it("--mode に不正値が指定された場合は invalid を返す", () => {
    expect(parseMode(["prompt", "task.md", "--mode", "ultra"])).toEqual({ mode: null, invalid: "ultra" });
  });
  it("--mode の後に値がない場合は invalid を返す", () => {
    expect(parseMode(["prompt", "task.md", "--mode"])).toEqual({ mode: null, invalid: "" });
  });
  it("--mode の後に別フラグがある場合は invalid を返す", () => {
    expect(parseMode(["prompt", "task.md", "--mode", "--out"])).toEqual({ mode: null, invalid: "" });
  });
});

describe("parseMode property tests", () => {
  it("Feature: prompt-mode-support, Property 1: 不正な --mode 値は常にエラーになる", () => {
    fc.assert(fc.property(
      fc.string().filter(s => !["full", "compact", "minimal"].includes(s) && s.length > 0 && !s.startsWith("--")),
      (invalidMode) => {
        const result = parseMode(["--mode", invalidMode]);
        expect(result.invalid).toBe(invalidMode);
        expect(result.mode).toBeNull();
      }
    ), { numRuns: 100 });
  });
});
