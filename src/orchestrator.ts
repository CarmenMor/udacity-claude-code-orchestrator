import { query } from '@anthropic-ai/claude-agent-sdk';
import { ReviewReport, ReviewReportSchema, ReviewReportJSONSchema } from './types/report-types.js';
import { mcpServersConfig } from './config/mcp.config.js';
import { codeQualityAnalyzer, testCoverageAnalyzer, refactoringSuggester } from './agents/index.js';
import { buildOrchestratorPrompt } from './prompts/index.js';
import { logReviewStart, logReviewComplete, logReviewError } from './utils/logger.js';
import { RateLimiter, DEFAULT_RATE_LIMITS, RateLimiterConfig } from './utils/rate-limiter.js';
import { withRetry, withTimeout } from './utils/error-handler.js';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  /** Maximum number of conversation turns before the query stops (default: 60) */
  maxTurns?: number;
  /** Rate limit overrides applied to the orchestrator's internal RateLimiter */
  rateLimits?: Partial<RateLimiterConfig>;
  /** Overall timeout for a single review, in ms (default: 10 minutes) */
  timeoutMs?: number;
}

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 */
export class CodeReviewOrchestrator {
  private readonly maxTurns: number;
  private readonly timeoutMs: number;
  private readonly rateLimiter: RateLimiter;

  constructor(options: OrchestratorOptions = {}) {
    this.maxTurns = options.maxTurns ?? 60;
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    this.rateLimiter = new RateLimiter({ ...DEFAULT_RATE_LIMITS, ...options.rateLimits });
  }

  /**
   * Review a pull request using parallel subagent analysis
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Complete review report
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startedAt = Date.now();
    logReviewStart(owner, repo, prNumber);

    try {
      const parsed = await withRetry(
        () => withTimeout(
          () => this.runQuery(owner, repo, prNumber),
          this.timeoutMs,
          `Review of ${owner}/${repo}#${prNumber} timed out`
        ),
        3,
        2000
      );

      const duration = Date.now() - startedAt;
      logReviewComplete(owner, repo, prNumber, parsed.summary.overallScore, duration);

      return parsed;
    } catch (error) {
      logReviewError(owner, repo, prNumber, error as Error);
      throw error;
    }
  }

  /**
   * Run a single orchestrator query end-to-end: rate-limit, invoke the SDK,
   * collect the structured output, and validate it against the Zod schema.
   */
  private async runQuery(owner: string, repo: string, prNumber: number): Promise<ReviewReport> {
    const model = process.env.ANTHROPIC_MODEL;
    if (!model) {
      throw new Error('ANTHROPIC_MODEL environment variable is required');
    }

    await this.rateLimiter.acquire();

    let structuredOutput: unknown;
    try {
      const result = query({
        prompt: buildOrchestratorPrompt(owner, repo, prNumber),
        options: {
          model,
          maxTurns: this.maxTurns,
          mcpServers: mcpServersConfig,
          allowedTools: [
            'Task',
            'Read',
            'Grep',
            'Glob',
            'Skill',
            'mcp__github__get_pull_request',
            'mcp__github__get_pull_request_files',
            'mcp__eslint__lint-files'
          ],
          agents: {
            'code-quality-analyzer': codeQualityAnalyzer,
            'test-coverage-analyzer': testCoverageAnalyzer,
            'refactoring-suggester': refactoringSuggester
          },
          outputFormat: {
            type: 'json_schema',
            schema: ReviewReportJSONSchema
          }
        }
      });

      for await (const message of result) {
        if (message.type === 'result' && message.subtype === 'success') {
          structuredOutput = message.structured_output;
        }
      }
    } finally {
      this.rateLimiter.release();
    }

    const parsed = ReviewReportSchema.safeParse(structuredOutput);
    if (!parsed.success) {
      throw new Error(`Orchestrator output failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}
