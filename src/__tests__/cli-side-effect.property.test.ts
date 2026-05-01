import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Bug Condition Exploration Test
 *
 * Property 1: Bug Condition - インポート時に main() が無条件実行される
 *
 * このテストは `src/cli.ts` をモジュールとしてインポートした際に
 * `main()` が実行されないことを検証する。
 *
 * 修正前のコードでは FAIL することが期待される（バグの存在証明）。
 * 修正後のコードでは PASS することが期待される。
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 */
describe("Bug Condition: cli.ts インポート時の副作用", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("Property 1: cli.ts をインポートしても process.exit が呼ばれない", async () => {
    /**
     * Bug Condition: isBugCondition(X) = X.importedAsModule = true AND X.isDirectCLIExecution = false
     *
     * 修正前: main() がトップレベルで無条件実行され、process.exit(1) が呼ばれる
     * 修正後: ガード条件により main() は実行されず、process.exit は呼ばれない
     */
    // Dynamic import to trigger module evaluation
    await import("../cli.js");

    // Wait for any pending async operations (main().catch() is async)
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("Property 1: parseCompactFlag が副作用なしで利用可能である", async () => {
    const mod = await import("../cli.js");

    // Wait for any pending async operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    // parseCompactFlag should be available and functional
    expect(typeof mod.parseCompactFlag).toBe("function");
    expect(mod.parseCompactFlag(["--compact"])).toBe(true);
    expect(mod.parseCompactFlag([])).toBe(false);

    // No side effects should have occurred
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("Property 1: parseMode が副作用なしで利用可能である", async () => {
    const mod = await import("../cli.js");

    // Wait for any pending async operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    // parseMode should be available and functional
    expect(typeof mod.parseMode).toBe("function");
    expect(mod.parseMode(["--mode", "full"])).toEqual({ mode: "full", invalid: null });
    expect(mod.parseMode([])).toEqual({ mode: null, invalid: null });

    // No side effects should have occurred
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
