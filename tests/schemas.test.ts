import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
  CodeQualityResultJSONSchema,
  TestCoverageResultJSONSchema,
  RefactoringSuggestionJSONSchema
} from '../src/types/analysis-results';
import { ReviewReportSchema, ReviewReportJSONSchema } from '../src/types/report-types';

const validCodeQuality = {
  file: 'src/foo.ts',
  issues: [
    {
      line: 12,
      severity: 'high' as const,
      category: 'security' as const,
      description: 'Unsanitized input passed to eval()',
      suggestion: 'Remove the eval() call and parse input safely'
    }
  ],
  overallScore: 72,
  summary: 'A few security concerns, otherwise solid.'
};

const validTestCoverage = {
  file: 'src/foo.ts',
  hasTests: true,
  testFiles: ['tests/foo.test.ts'],
  untestedPaths: [
    {
      type: 'branch' as const,
      location: 'foo() empty-array branch',
      priority: 'high' as const,
      reasoning: 'The empty-array branch is never exercised by existing tests',
      suggestedTest: 'Call foo([]) and assert it returns an empty result'
    }
  ],
  coverageEstimate: 65,
  summary: 'Core paths tested; edge cases missing.'
};

const validRefactoring = {
  file: 'src/foo.ts',
  suggestions: [
    {
      type: 'modernize' as const,
      location: 'foo(), line 10',
      impact: 'medium' as const,
      description: 'Uses var instead of const/let',
      before: 'var x = 1;',
      after: 'const x = 1;',
      benefits: 'Prevents accidental reassignment and improves scoping clarity'
    }
  ],
  summary: 'A few modernization opportunities.'
};

const validReviewReport = {
  pullRequest: { owner: 'octocat', repo: 'Hello-World', number: 1 },
  fileReviews: [
    {
      file: 'src/foo.ts',
      codeQuality: validCodeQuality,
      testCoverage: validTestCoverage,
      refactorings: validRefactoring
    }
  ],
  summary: {
    totalFiles: 1,
    overallScore: 72,
    criticalIssues: 1,
    highPriorityTests: 1,
    refactoringOpportunities: 1
  },
  recommendations: [
    {
      priority: 'high' as const,
      category: 'security',
      description: 'Remove eval() usage',
      files: ['src/foo.ts']
    }
  ],
  metadata: {
    analyzedAt: new Date().toISOString(),
    duration: 12345,
    agentVersions: { 'code-quality-analyzer': '1.0' }
  }
};

describe('CodeQualityResultSchema', () => {
  it('parses valid data', () => {
    expect(() => CodeQualityResultSchema.parse(validCodeQuality)).not.toThrow();
  });

  it('rejects missing required fields', () => {
    const { summary, ...missingSummary } = validCodeQuality;
    expect(() => CodeQualityResultSchema.parse(missingSummary)).toThrow(z.ZodError);
  });

  it('rejects an invalid severity enum value', () => {
    const invalid = {
      ...validCodeQuality,
      issues: [{ ...validCodeQuality.issues[0], severity: 'catastrophic' }]
    };
    expect(() => CodeQualityResultSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('rejects an overallScore outside 0-100', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validCodeQuality, overallScore: 150 })).toThrow(z.ZodError);
    expect(() => CodeQualityResultSchema.parse({ ...validCodeQuality, overallScore: -1 })).toThrow(z.ZodError);
  });

  it('accepts boundary scores of 0 and 100', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validCodeQuality, overallScore: 0 })).not.toThrow();
    expect(() => CodeQualityResultSchema.parse({ ...validCodeQuality, overallScore: 100 })).not.toThrow();
  });

  it('accepts an empty issues array', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validCodeQuality, issues: [] })).not.toThrow();
  });
});

describe('TestCoverageResultSchema', () => {
  it('parses valid data', () => {
    expect(() => TestCoverageResultSchema.parse(validTestCoverage)).not.toThrow();
  });

  it('rejects an invalid priority enum value', () => {
    const invalid = {
      ...validTestCoverage,
      untestedPaths: [{ ...validTestCoverage.untestedPaths[0], priority: 'urgent' }]
    };
    expect(() => TestCoverageResultSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('rejects wrong types for hasTests', () => {
    expect(() => TestCoverageResultSchema.parse({ ...validTestCoverage, hasTests: 'yes' })).toThrow(z.ZodError);
  });

  it('accepts no test files and no untested paths', () => {
    expect(() =>
      TestCoverageResultSchema.parse({ ...validTestCoverage, testFiles: [], untestedPaths: [], hasTests: false })
    ).not.toThrow();
  });

  it('accepts boundary coverageEstimate of 0 and 100', () => {
    expect(() => TestCoverageResultSchema.parse({ ...validTestCoverage, coverageEstimate: 0 })).not.toThrow();
    expect(() => TestCoverageResultSchema.parse({ ...validTestCoverage, coverageEstimate: 100 })).not.toThrow();
  });
});

describe('RefactoringSuggestionSchema', () => {
  it('parses valid data', () => {
    expect(() => RefactoringSuggestionSchema.parse(validRefactoring)).not.toThrow();
  });

  it('rejects an invalid type enum value', () => {
    const invalid = {
      ...validRefactoring,
      suggestions: [{ ...validRefactoring.suggestions[0], type: 'rewrite-everything' }]
    };
    expect(() => RefactoringSuggestionSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('rejects an invalid impact enum value', () => {
    const invalid = {
      ...validRefactoring,
      suggestions: [{ ...validRefactoring.suggestions[0], impact: 'massive' }]
    };
    expect(() => RefactoringSuggestionSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('accepts an empty suggestions array', () => {
    expect(() => RefactoringSuggestionSchema.parse({ ...validRefactoring, suggestions: [] })).not.toThrow();
  });
});

describe('ReviewReportSchema', () => {
  it('parses valid data', () => {
    expect(() => ReviewReportSchema.parse(validReviewReport)).not.toThrow();
  });

  it('rejects missing pullRequest field', () => {
    const { pullRequest, ...missing } = validReviewReport;
    expect(() => ReviewReportSchema.parse(missing)).toThrow(z.ZodError);
  });

  it('rejects a recommendation with an invalid priority', () => {
    const invalid = {
      ...validReviewReport,
      recommendations: [{ ...validReviewReport.recommendations[0], priority: 'someday' }]
    };
    expect(() => ReviewReportSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('accepts an empty fileReviews and recommendations array', () => {
    expect(() =>
      ReviewReportSchema.parse({
        ...validReviewReport,
        fileReviews: [],
        recommendations: [],
        summary: { totalFiles: 0, overallScore: 0, criticalIssues: 0, highPriorityTests: 0, refactoringOpportunities: 0 }
      })
    ).not.toThrow();
  });
});

describe('JSON Schema exports', () => {
  it('produces a JSON schema object for each analysis result schema', () => {
    for (const schema of [CodeQualityResultJSONSchema, TestCoverageResultJSONSchema, RefactoringSuggestionJSONSchema]) {
      expect(schema).toBeTypeOf('object');
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeTypeOf('object');
    }
  });

  it('produces a JSON schema object for the review report schema', () => {
    expect(ReviewReportJSONSchema).toBeTypeOf('object');
    expect(ReviewReportJSONSchema.type).toBe('object');
    expect(ReviewReportJSONSchema.properties).toBeTypeOf('object');
  });

  it('marks required top-level properties on the code quality schema', () => {
    const required = CodeQualityResultJSONSchema.required as string[];
    expect(required).toContain('file');
    expect(required).toContain('issues');
    expect(required).toContain('overallScore');
    expect(required).toContain('summary');
  });

  it('does not leave any unresolved $ref pointers (root ref strategy)', () => {
    const serialized = JSON.stringify(ReviewReportJSONSchema);
    expect(serialized).not.toContain('"$ref"');
  });
});
