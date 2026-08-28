import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/code-quality-analyzer.prompt.js';

/**
 * Analyzes a source file for security, performance, maintainability, and
 * best-practice issues. Uses the Skill tool to invoke language-specific
 * analysis skills (e.g. javascript-best-practices).
 */
export const codeQualityAnalyzer: AgentDefinition = {
  description:
    'Analyzes a source file for security vulnerabilities, performance issues, maintainability concerns, and best-practice violations. Use this agent whenever a changed file needs a code quality review.',
  tools: ['Read', 'Grep', 'Glob', 'Skill', 'mcp__eslint__lint-files'],
  prompt: CODE_QUALITY_ANALYZER_PROMPT,
  model: 'inherit'
};
