import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/refactoring-suggester.prompt.js';

/**
 * Identifies structural, readability, and modernization improvements for a
 * source file without changing its behavior.
 */
export const refactoringSuggester: AgentDefinition = {
  description:
    'Identifies opportunities to improve code structure, readability, and modernize patterns in a source file without changing its behavior. Use this agent whenever a changed file needs refactoring suggestions.',
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  prompt: REFACTORING_SUGGESTER_PROMPT,
  model: 'inherit'
};
