import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: unknown[]) => queryMock(...args)
}));

const { CodeReviewOrchestrator } = await import('../src/orchestrator');

function asyncIterableOf(messages: unknown[]) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () =>
          i < messages.length ? { value: messages[i++], done: false } : { value: undefined, done: true }
      };
    }
  };
}

const validReviewReport = {
  pullRequest: { owner: 'octocat', repo: 'Hello-World', number: 1 },
  fileReviews: [
    {
      file: 'src/foo.ts',
      codeQuality: {
        file: 'src/foo.ts',
        issues: [],
        overallScore: 90,
        summary: 'Looks good.'
      },
      testCoverage: {
        file: 'src/foo.ts',
        hasTests: true,
        testFiles: ['tests/foo.test.ts'],
        untestedPaths: [],
        coverageEstimate: 80,
        summary: 'Well tested.'
      },
      refactorings: {
        file: 'src/foo.ts',
        suggestions: [],
        summary: 'No changes needed.'
      }
    }
  ],
  summary: {
    totalFiles: 1,
    overallScore: 90,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0
  },
  recommendations: [],
  metadata: {
    analyzedAt: new Date().toISOString(),
    duration: 1000,
    agentVersions: { 'code-quality-analyzer': '1.0' }
  }
};

describe('CodeReviewOrchestrator', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_MODEL = 'test-model';
    queryMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Configuration', () => {
    it('should initialize with default options', () => {
      expect(() => new CodeReviewOrchestrator()).not.toThrow();
    });

    it('should accept custom rate limit configuration', () => {
      expect(
        () =>
          new CodeReviewOrchestrator({
            rateLimits: { maxConcurrent: 1, maxRequestsPerMinute: 5, maxTokensPerMinute: 1000 }
          })
      ).not.toThrow();
    });
  });

  describe('reviewPullRequest', () => {
    it('should fetch PR data via GitHub MCP tools and register all three subagents with the Task tool', async () => {
      queryMock.mockReturnValue(
        asyncIterableOf([{ type: 'result', subtype: 'success', structured_output: validReviewReport }])
      );

      const orchestrator = new CodeReviewOrchestrator();
      await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      expect(queryMock).toHaveBeenCalledTimes(1);
      const [{ options }] = queryMock.mock.calls[0];

      expect(options.allowedTools).toContain('Task');
      expect(options.allowedTools).toContain('mcp__github__get_pull_request');
      expect(options.allowedTools).toContain('mcp__github__get_pull_request_files');
      expect(Object.keys(options.agents)).toEqual([
        'code-quality-analyzer',
        'test-coverage-analyzer',
        'refactoring-suggester'
      ]);
    });

    it('should aggregate the structured output into a ReviewReport', async () => {
      queryMock.mockReturnValue(
        asyncIterableOf([{ type: 'result', subtype: 'success', structured_output: validReviewReport }])
      );

      const orchestrator = new CodeReviewOrchestrator();
      const report = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      expect(report).toEqual(validReviewReport);
    });

    it('should configure structured output using a json_schema outputFormat', async () => {
      queryMock.mockReturnValue(
        asyncIterableOf([{ type: 'result', subtype: 'success', structured_output: validReviewReport }])
      );

      const orchestrator = new CodeReviewOrchestrator();
      await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      const [{ options }] = queryMock.mock.calls[0];
      expect(options.outputFormat.type).toBe('json_schema');
      expect(options.outputFormat.schema).toBeTypeOf('object');
    });

    it('should validate output with the Zod schema and reject structured output that fails validation', async () => {
      vi.useFakeTimers();
      queryMock.mockReturnValue(
        asyncIterableOf([{ type: 'result', subtype: 'success', structured_output: { not: 'a valid report' } }])
      );

      const orchestrator = new CodeReviewOrchestrator();
      const promise = orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);
      const assertion = expect(promise).rejects.toThrow(/schema validation/);
      await vi.runAllTimersAsync();
      await assertion;
    });

    it('should throw a clear error when ANTHROPIC_MODEL is not configured', async () => {
      delete process.env.ANTHROPIC_MODEL;
      vi.useFakeTimers();

      const orchestrator = new CodeReviewOrchestrator();
      const promise = orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);
      const assertion = expect(promise).rejects.toThrow(/ANTHROPIC_MODEL/);
      await vi.runAllTimersAsync();
      await assertion;

      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  describe('Integration', () => {
    // These tests require actual API keys and should be skipped in CI
    it.skip('should review a real small PR', async () => {
      // NOTE: Only run manually with valid API keys, e.g.:
      // const orchestrator = new CodeReviewOrchestrator();
      // const report = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);
      // expect(report.pullRequest).toEqual({ owner: 'octocat', repo: 'Hello-World', number: 1 });
    });
  });
});
