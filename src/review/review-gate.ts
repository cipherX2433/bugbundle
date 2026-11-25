import { createInterface } from 'node:readline/promises';
import { NonInteractiveApprovalError, SecurityBoundaryError } from '../errors/index.js';
import type { PromptAdapter, ReviewGateOptions, ReviewGateResult } from './types.js';

const PREVIEW_DIVIDER = '='.repeat(50);

const defaultPromptAdapter: PromptAdapter = {
  isInteractive: () => Boolean(process.stdin.isTTY),
  async ask(question: string): Promise<string> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const controller = new AbortController();
    const onSigint = (): void => {
      controller.abort();
    };
    rl.on('SIGINT', onSigint);

    try {
      const answer = await rl.question(question, { signal: controller.signal });
      return answer;
    } finally {
      rl.off('SIGINT', onSigint);
      rl.close();
    }
  },
};

function isExplicitAffirmative(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

function formatPreviewDestination(destinationPath: string): string {
  const cleaned = destinationPath.replace(/^\.\//, '');
  return `./${cleaned}`;
}

export async function runReviewGate(options: ReviewGateOptions): Promise<ReviewGateResult> {
  if (!options.securityValidated) {
    throw new SecurityBoundaryError(
      'Cannot present or approve diagnostic report: security validation failed.',
    );
  }

  const io = options.io ?? { stdout: (text: string) => process.stdout.write(text) };
  const prompt = options.prompt ?? defaultPromptAdapter;
  const now = options.now ?? (() => new Date());

  const reportBody = options.markdownReport.endsWith('\n')
    ? options.markdownReport
    : `${options.markdownReport}\n`;

  io.stdout(`${PREVIEW_DIVIDER}\n`);
  io.stdout('DIAGNOSTIC REPORT PREVIEW\n');
  io.stdout(`${PREVIEW_DIVIDER}\n\n`);
  io.stdout(reportBody);
  io.stdout(`\n${PREVIEW_DIVIDER}\n\n`);

  if (options.nonInteractiveApprove) {
    return {
      approved: true,
      approval: {
        approved: true,
        mode: 'non-interactive-flag',
        reviewedAt: now().toISOString(),
      },
    };
  }

  if (!prompt.isInteractive()) {
    throw new NonInteractiveApprovalError(
      'Refusing to export in non-interactive mode without explicit approval. Re-run with "bugbundle collect --yes" to approve saving the sanitized report, or use "bugbundle inspect" for preview-only output.',
    );
  }

  const displayDest = formatPreviewDestination(options.destinationPath);
  let rawAnswer: string;
  try {
    rawAnswer = await prompt.ask(`Save this diagnostic report to ${displayDest}? (y/N): `);
  } catch {
    return {
      approved: false,
      reason: 'interrupted',
    };
  }

  if (!isExplicitAffirmative(rawAnswer)) {
    return {
      approved: false,
      reason: 'declined',
    };
  }

  return {
    approved: true,
    approval: {
      approved: true,
      mode: 'interactive',
      reviewedAt: now().toISOString(),
    },
  };
}
