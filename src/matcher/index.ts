/**
 * Pull matcher public surface — keep UI-free for headless tests.
 */

export type {
  PullLocation,
  PullAction,
  StatOp,
  StatConstraint,
  PullCriteria,
  PullKind,
  PullClause,
  PullMatch,
  MatchResult,
  NameSearchHit,
} from "./types.js";

export { parsePullClauses, parseTargetCriteria } from "./parse.js";
export { cardMatchesCriteria } from "./criteria.js";
export {
  searchCardsByName,
  findPullMatches,
  findPullMatchesById,
  clauseIsMatchable,
} from "./match.js";
