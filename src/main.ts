import * as dotenv from 'dotenv';
import { mkdir, writeFile } from 'fs/promises';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator, formatError } from './utils/index.js';
import { logger } from './utils/logger.js';

// Load environment variables (override: the shell may already export stale
// ANTHROPIC_* values that should not take precedence over this project's .env)
dotenv.config({ override: true });

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev <owner> <repo> <pr-number>
 */
async function main() {
  const [owner, repo, prStr] = process.argv.slice(2);

  if (!owner || !repo || !prStr) {
    console.error('Usage: npm run dev -- <owner> <repo> <pr-number>');
    process.exit(1);
  }

  const prNumber = parseInt(prStr, 10);
  if (isNaN(prNumber) || prNumber <= 0) {
    console.error('PR number must be a positive integer');
    process.exit(1);
  }

  const hasAnthropicAPI = !!process.env.ANTHROPIC_API_KEY;
  const hasAWSCredentials = !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION
  );

  if (!hasAnthropicAPI && !hasAWSCredentials) {
    console.error('Authentication required. Set one of:');
    console.error('  - ANTHROPIC_API_KEY, or');
    console.error('  - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_REGION');
    process.exit(1);
  }

  console.log(`🔐 Using ${hasAnthropicAPI ? 'Anthropic API' : 'AWS Bedrock'} authentication`);

  if (!process.env.ANTHROPIC_MODEL) {
    console.error('ANTHROPIC_MODEL environment variable is required.');
    console.error('  - For Anthropic API: ANTHROPIC_MODEL=claude-sonnet-4-5-20250929');
    console.error('  - For AWS Bedrock: ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0');
    process.exit(1);
  }

  if (!process.env.GITHUB_TOKEN) {
    console.warn('⚠️  GITHUB_TOKEN not set — GitHub API calls will be unauthenticated and rate-limited.');
  }

  console.log(`🔍 Reviewing pull request ${owner}/${repo}#${prNumber}`);

  try {
    const orchestrator = new CodeReviewOrchestrator();
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    const reportGenerator = new ReportGenerator();
    const reportsDir = 'reports';
    await mkdir(reportsDir, { recursive: true });

    const baseName = `${owner}_${repo}_${prNumber}`;
    await Promise.all([
      writeFile(`${reportsDir}/${baseName}.json`, reportGenerator.generateJSONReport(report), 'utf-8'),
      writeFile(`${reportsDir}/${baseName}.md`, reportGenerator.generateMarkdownReport(report), 'utf-8'),
      writeFile(`${reportsDir}/${baseName}.html`, reportGenerator.generateHTMLReport(report), 'utf-8')
    ]);

    console.log(`✅ Review complete. Overall score: ${report.summary.overallScore}/100`);
    console.log(`📄 Reports saved to:`);
    console.log(`   ${reportsDir}/${baseName}.json`);
    console.log(`   ${reportsDir}/${baseName}.md`);
    console.log(`   ${reportsDir}/${baseName}.html`);
  } catch (error) {
    logger.error('Fatal error during review', { error: formatError(error) });
    console.error(`❌ Review failed: ${formatError(error)}`);
    process.exit(1);
  }
}

main();
