import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, withTimeout, ReviewError, ErrorCodes, isReviewError, formatError } from '../src/utils/error-handler';
import { RateLimiter } from '../src/utils/rate-limiter';
import { ReportGenerator } from '../src/utils/report-generator';
import type { ReviewReport } from '../src/types/report-types';

describe('withRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 10);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries with exponential backoff and eventually succeeds', async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, 3, 10);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws a ReviewError with RETRY_EXHAUSTED after all retries fail', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    const promise = withRetry(fn, 2, 10);
    const assertion = expect(promise).rejects.toMatchObject({ code: ErrorCodes.RETRY_EXHAUSTED });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('withTimeout', () => {
  it('resolves with the result when the function completes before the timeout', async () => {
    const result = await withTimeout(() => Promise.resolve('fast'), 100);
    expect(result).toBe('fast');
  });

  it('rejects with a ReviewError AGENT_TIMEOUT when the function is too slow', async () => {
    const slowFn = () => new Promise(resolve => setTimeout(resolve, 200));
    await expect(withTimeout(slowFn, 10, 'took too long')).rejects.toMatchObject({
      code: ErrorCodes.AGENT_TIMEOUT,
      message: 'took too long'
    });
  });
});

describe('isReviewError / formatError', () => {
  it('identifies ReviewError instances', () => {
    expect(isReviewError(new ReviewError('boom', ErrorCodes.UNKNOWN_ERROR))).toBe(true);
    expect(isReviewError(new Error('boom'))).toBe(false);
  });

  it('formats a ReviewError with its code prefix', () => {
    const error = new ReviewError('boom', ErrorCodes.AGENT_TIMEOUT);
    expect(formatError(error)).toBe('[AGENT_TIMEOUT] boom');
  });

  it('formats a plain Error using its message', () => {
    expect(formatError(new Error('plain failure'))).toBe('plain failure');
  });
});

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests to proceed immediately when under all limits', () => {
    const limiter = new RateLimiter({ maxConcurrent: 5, maxRequestsPerMinute: 10, maxTokensPerMinute: 10000 });
    expect(limiter.canProceed(100)).toBe(true);
  });

  it('blocks new requests once the concurrent limit is reached', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1, maxRequestsPerMinute: 10, maxTokensPerMinute: 10000 });
    await limiter.acquire();
    expect(limiter.canProceed()).toBe(false);
    limiter.release();
    expect(limiter.canProceed()).toBe(true);
  });

  it('blocks once the requests-per-minute limit is reached and tracks the sliding window', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 10, maxRequestsPerMinute: 1, maxTokensPerMinute: 10000 });
    await limiter.acquire();
    limiter.release();

    expect(limiter.canProceed()).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(limiter.canProceed()).toBe(true);
  });

  it('prunes requests older than 60 seconds from the status window', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 10, maxRequestsPerMinute: 10, maxTokensPerMinute: 10000 });
    await limiter.acquire(500);
    expect(limiter.getStatus().requestsInWindow).toBe(1);

    vi.advanceTimersByTime(61_000);
    expect(limiter.getStatus().requestsInWindow).toBe(0);
  });

  it('blocks once the tokens-per-minute limit would be exceeded', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 10, maxRequestsPerMinute: 10, maxTokensPerMinute: 1000 });
    await limiter.acquire(900);
    expect(limiter.canProceed(200)).toBe(false);
    expect(limiter.canProceed(50)).toBe(true);
  });
});

describe('ReportGenerator', () => {
  const report: ReviewReport = {
    pullRequest: { owner: 'octocat', repo: 'Hello-World', number: 1 },
    fileReviews: [
      {
        file: 'src/foo.ts',
        codeQuality: { file: 'src/foo.ts', issues: [], overallScore: 90, summary: 'Good.' },
        testCoverage: { file: 'src/foo.ts', hasTests: true, testFiles: [], untestedPaths: [], coverageEstimate: 80, summary: 'Fine.' },
        refactorings: { file: 'src/foo.ts', suggestions: [], summary: 'None needed.' }
      }
    ],
    summary: { totalFiles: 1, overallScore: 90, criticalIssues: 0, highPriorityTests: 0, refactoringOpportunities: 0 },
    recommendations: [],
    metadata: { analyzedAt: '2026-01-01T00:00:00.000Z', duration: 500, agentVersions: {} }
  };

  it('generates a JSON report that round-trips the input data', () => {
    const generator = new ReportGenerator();
    const json = generator.generateJSONReport(report);
    expect(JSON.parse(json)).toEqual(report);
  });

  it('generates a Markdown report containing the summary metrics', () => {
    const generator = new ReportGenerator();
    const markdown = generator.generateMarkdownReport(report);
    expect(markdown).toContain('90/100');
    expect(markdown).toContain('src/foo.ts');
  });

  it('generates an HTML report containing the overall score', () => {
    const generator = new ReportGenerator();
    const html = generator.generateHTMLReport(report);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('90');
  });
});
