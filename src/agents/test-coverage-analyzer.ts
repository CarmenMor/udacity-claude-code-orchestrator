import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/test-coverage-analyzer.prompt.js';

/**
 * Estimates test coverage for a source file by statically comparing it
 * against related test files, and suggests specific missing test cases.
 */
export const testCoverageAnalyzer: AgentDefinition = {
  description:
    'Evaluates how well a source file is tested by comparing it against related test files, and suggests specific, actionable test cases for untested paths. Use this agent whenever a changed file needs a test coverage review.',
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  prompt: TEST_COVERAGE_ANALYZER_PROMPT,
  model: 'inherit'
};
