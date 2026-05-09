import type { PromptMode, ParsedTask } from "./promptGenerator.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** auto モード判定の結果 */
export interface AutoModeDecision {
  requestedMode: "auto";
  resolvedMode: PromptMode;
  score: number;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Keyword definitions
// ---------------------------------------------------------------------------

interface KeywordEntry {
  keyword: string;
  lang: "en" | "ja";
}

/** Full_Keyword: score +1 each */
const FULL_KEYWORDS: KeywordEntry[] = [
  { keyword: "設計", lang: "ja" },
  { keyword: "architecture", lang: "en" },
  { keyword: "リファクタ", lang: "ja" },
  { keyword: "refactor", lang: "en" },
  { keyword: "新機能", lang: "ja" },
  { keyword: "feature", lang: "en" },
  { keyword: "API", lang: "en" },
  { keyword: "DB", lang: "en" },
  { keyword: "schema", lang: "en" },
  { keyword: "認証", lang: "ja" },
  { keyword: "auth", lang: "en" },
  { keyword: "migration", lang: "en" },
  { keyword: "破壊的変更", lang: "ja" },
  { keyword: "breaking", lang: "en" },
  { keyword: "複数ファイル", lang: "ja" },
  { keyword: "テスト追加", lang: "ja" },
  { keyword: "品質ゲート", lang: "ja" },
  { keyword: "property", lang: "en" },
  { keyword: "fast-check", lang: "en" },
];

/** Minimal_Keyword: score -1 each */
const MINIMAL_KEYWORDS: KeywordEntry[] = [
  { keyword: "typo", lang: "en" },
  { keyword: "誤字", lang: "ja" },
  { keyword: "文言修正", lang: "ja" },
  { keyword: "README", lang: "en" },
  { keyword: "コメント修正", lang: "ja" },
  { keyword: "小修正", lang: "ja" },
  { keyword: "1ファイル", lang: "ja" },
  { keyword: "継続", lang: "ja" },
  { keyword: "微修正", lang: "ja" },
];

/** Safety_Keyword: force full regardless of score */
const SAFETY_KEYWORDS: KeywordEntry[] = [
  { keyword: "schema", lang: "en" },
  { keyword: "auth", lang: "en" },
  { keyword: "migration", lang: "en" },
  { keyword: "breaking", lang: "en" },
  { keyword: "refactor", lang: "en" },
  { keyword: "リファクタ", lang: "ja" },
];

// ---------------------------------------------------------------------------
// Keyword matching helpers
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a keyword matches in the given text.
 * - English keywords: word boundary match, case-insensitive
 * - Japanese keywords: substring match
 */
function matchesKeyword(text: string, entry: KeywordEntry): boolean {
  if (entry.lang === "en") {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.keyword)}\\b`, "i");
    return pattern.test(text);
  }
  // Japanese: substring match (text is already original case)
  return text.includes(entry.keyword);
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

/**
 * task.md の内容からキーワードスコアリングでプロンプトモードを決定する。
 *
 * スコアリングルール:
 * - Full_Keyword にマッチ → score +1（各キーワードごと）
 * - Minimal_Keyword にマッチ → score -1（各キーワードごと）
 * - Safety_Keyword にマッチ → score に関係なく full を強制
 *
 * 閾値:
 * - score >= 4 → "full"
 * - 1 <= score < 4 → "compact"
 * - score <= 0 → "minimal"
 *
 * キーワードマッチング:
 * - 英語キーワード: \b（単語境界）で囲んでマッチ（大文字小文字無視）
 * - 日本語キーワード: 部分文字列マッチ
 *
 * reasons は絶対に空にならない:
 * - キーワードヒット時: マッチしたキーワードの説明を追加
 * - キーワードヒットなし時: "no keyword matched → default compact" を追加
 */
export function selectPromptModeFromTask(task: ParsedTask): AutoModeDecision {
  // nonGoals は「やらないこと」を記述するセクションなのでスコアリング対象外
  const combinedText = task.goal + "\n" + task.scope;

  let score = 0;
  const reasons: string[] = [];
  let forceFull = false;

  // Full_Keyword matching: score +1 each
  for (const entry of FULL_KEYWORDS) {
    if (matchesKeyword(combinedText, entry)) {
      score += 1;
      reasons.push(`Full_Keyword: ${entry.keyword} (+1)`);
    }
  }

  // Minimal_Keyword matching: score -1 each
  for (const entry of MINIMAL_KEYWORDS) {
    if (matchesKeyword(combinedText, entry)) {
      score -= 1;
      reasons.push(`Minimal_Keyword: ${entry.keyword} (-1)`);
    }
  }

  // Safety_Keyword check: force full
  for (const entry of SAFETY_KEYWORDS) {
    if (matchesKeyword(combinedText, entry)) {
      forceFull = true;
      break;
    }
  }

  // Mode decision
  let resolvedMode: PromptMode;

  if (reasons.length === 0) {
    // No keywords matched at all → safe default compact
    reasons.push("no keyword matched → default compact");
    resolvedMode = "compact";
  } else if (forceFull) {
    resolvedMode = "full";
  } else if (score >= 4) {
    resolvedMode = "full";
  } else if (score >= 1) {
    resolvedMode = "compact";
  } else {
    resolvedMode = "minimal";
  }

  return {
    requestedMode: "auto",
    resolvedMode,
    score,
    reasons,
  };
}
