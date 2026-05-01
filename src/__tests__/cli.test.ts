import { describe, it, expect } from "vitest";
import { parseCompactFlag } from "../cli.js";

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
