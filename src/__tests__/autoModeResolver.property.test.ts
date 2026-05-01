import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { selectPromptModeFromTask } from "../core/autoModeResolver.js";

/**
 * Property-based tests for autoModeResolver.
 *
 * Each property validates a universal invariant of selectPromptModeFromTask
 * across arbitrary ParsedTask inputs using fast-check.
 */
describe("autoModeResolver property tests", () => {
  // -----------------------------------------------------------------------
  // Arbitrary ParsedTask generator
  // -----------------------------------------------------------------------
  const arbParsedTask = fc.record({
    goal: fc.string(),
    scope: fc.string(),
    nonGoals: fc.string(),
  });

  // -----------------------------------------------------------------------
  // Safety keywords used in Properties 3 & 4
  // -----------------------------------------------------------------------
  const safetyKeywords = [
    "schema",
    "auth",
    "migration",
    "breaking",
    "refactor",
    "リファクタ",
  ];

  /**
   * Property 1: resolvedMode は常に有効な PromptMode
   *
   * For any arbitrary ParsedTask (goal, scope, nonGoals as arbitrary strings),
   * selectPromptModeFromTask(task).resolvedMode is always one of
   * "full", "compact", "minimal".
   *
   * **Validates: Requirements 9.7**
   */
  it("Feature: auto-prompt-mode, Property 1: resolvedMode は常に有効な PromptMode", () => {
    fc.assert(
      fc.property(arbParsedTask, (task) => {
        const decision = selectPromptModeFromTask(task);
        expect(["full", "compact", "minimal"]).toContain(
          decision.resolvedMode,
        );
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: reasons は絶対に空にならない
   *
   * For any arbitrary ParsedTask, selectPromptModeFromTask(task).reasons.length
   * is always >= 1.
   *
   * **Validates: Requirements 3.12**
   */
  it("Feature: auto-prompt-mode, Property 2: reasons は絶対に空にならない", () => {
    fc.assert(
      fc.property(arbParsedTask, (task) => {
        const decision = selectPromptModeFromTask(task);
        expect(decision.reasons.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: Safety/リファクタキーワード → full
   *
   * For any arbitrary ParsedTask where a Safety_Keyword is injected into the
   * goal, resolvedMode is always "full".
   *
   * **Validates: Requirements 3.7, 3.8, 9.9**
   */
  it("Feature: auto-prompt-mode, Property 3: Safety/リファクタキーワード → full", () => {
    fc.assert(
      fc.property(
        arbParsedTask,
        fc.constantFrom(...safetyKeywords),
        (task, keyword) => {
          const taskWithSafety = {
            ...task,
            goal: task.goal + " " + keyword + " ",
          };
          const decision = selectPromptModeFromTask(taskWithSafety);
          expect(decision.resolvedMode).toBe("full");
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: スコア閾値整合性
   *
   * For any arbitrary ParsedTask that does NOT contain Safety/refactor keywords,
   * the score and resolvedMode follow the threshold rules:
   *   score >= 4  → "full"
   *   1 <= score < 4 → "compact"
   *   score <= 0  → "minimal"
   * Exception: if no keywords matched at all (reasons contains only
   * "no keyword matched → default compact"), resolvedMode is "compact".
   *
   * **Validates: Requirements 3.4, 3.5, 3.6, 9.4, 9.8**
   */
  it("Feature: auto-prompt-mode, Property 4: スコア閾値整合性", () => {
    fc.assert(
      fc.property(arbParsedTask, (task) => {
        const decision = selectPromptModeFromTask(task);

        // Check if any safety/refactor keyword is present in the scoring text (goal + scope only)
        const scoringText =
          task.goal + "\n" + task.scope;

        const hasSafetyKeyword = safetyKeywords.some((kw) => {
          if (kw === "リファクタ") {
            return scoringText.includes(kw);
          }
          // English keywords: word-boundary, case-insensitive
          const pattern = new RegExp(`\\b${kw}\\b`, "i");
          return pattern.test(scoringText);
        });

        // Only check threshold consistency when no safety keyword is present
        if (!hasSafetyKeyword) {
          const isDefaultCompact =
            decision.reasons.length === 1 &&
            decision.reasons[0] === "no keyword matched → default compact";

          if (isDefaultCompact) {
            expect(decision.resolvedMode).toBe("compact");
          } else if (decision.score >= 4) {
            expect(decision.resolvedMode).toBe("full");
          } else if (decision.score >= 1) {
            expect(decision.resolvedMode).toBe("compact");
          } else {
            expect(decision.resolvedMode).toBe("minimal");
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: 大文字小文字無視
   *
   * For any English keyword from the Full_Keyword list (non-safety ones like
   * "architecture", "feature", "property"), when the keyword is randomly
   * case-varied and placed in a task goal, the reasons array should contain
   * a matching entry.
   *
   * **Validates: Requirements 2.2, 3.10**
   */
  it("Feature: auto-prompt-mode, Property 5: 大文字小文字無視", () => {
    // English Full_Keywords that are NOT safety keywords, so we can isolate
    // the case-insensitivity property without safety-force-full interference.
    const englishNonSafetyKeywords = [
      "architecture",
      "feature",
      "property",
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...englishNonSafetyKeywords),
        fc.array(fc.boolean(), {
          minLength: 20,
          maxLength: 20,
        }),
        (keyword, booleans) => {
          // Randomly vary the case of each character
          const caseVaried = keyword
            .split("")
            .map((c, i) =>
              booleans[i % booleans.length]
                ? c.toUpperCase()
                : c.toLowerCase(),
            )
            .join("");

          const task = {
            goal: "task with " + caseVaried + " keyword",
            scope: "",
            nonGoals: "",
          };
          const decision = selectPromptModeFromTask(task);

          // The reasons array should contain an entry mentioning this keyword
          const hasMatchingReason = decision.reasons.some((r) =>
            r.toLowerCase().includes(keyword.toLowerCase()),
          );
          expect(hasMatchingReason).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 6: nonGoals のみに Safety_Keyword がある場合は full にならない
   *
   * For any arbitrary ParsedTask where goal and scope contain no safety keywords,
   * but nonGoals contains a safety keyword, resolvedMode should NOT be forced to "full"
   * by the safety override.
   */
  it("Feature: auto-prompt-mode, Property 6: nonGoals のみの Safety_Keyword は full を強制しない", () => {
    // Generate goal/scope that definitely don't contain safety keywords
    const safeGoalArb = fc.string().filter((s) => {
      const lower = s.toLowerCase();
      return !safetyKeywords.some((kw) => {
        if (kw === "リファクタ") return s.includes(kw);
        const pattern = new RegExp(`\\b${kw}\\b`, "i");
        return pattern.test(lower);
      });
    });

    fc.assert(
      fc.property(
        safeGoalArb,
        safeGoalArb,
        fc.constantFrom(...safetyKeywords),
        (goal, scope, safetyKw) => {
          const task = {
            goal,
            scope,
            nonGoals: "do not change " + safetyKw + " at all",
          };
          const decision = selectPromptModeFromTask(task);

          // The safety keyword in nonGoals should NOT trigger forceFull
          // (resolvedMode may still be "full" if score >= 4 from other keywords,
          //  but it should not be forced by safety override from nonGoals)
          // We verify by checking that the reasons don't include the safety keyword
          const hasSafetyReason = decision.reasons.some((r) =>
            r.toLowerCase().includes(safetyKw.toLowerCase()),
          );
          expect(hasSafetyReason).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
