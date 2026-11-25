import { describe, expect, it, vi } from 'vitest';
import { NonInteractiveApprovalError, SecurityBoundaryError } from '../../src/errors/index.js';
import { runReviewGate, type PromptAdapter } from '../../src/review/index.js';

function createCapturedStdout() {
  let out = '';
  return {
    io: {
      stdout: (text: string) => {
        out += text;
      },
    },
    getOut: () => out,
  };
}

describe('runReviewGate', () => {
  const sampleReport = '# bugbundle Diagnostic Report\n\nSanitized content.\n';

  it('approves when user explicitly answers y or yes', async () => {
    for (const answer of ['y', 'Y', 'yes', ' YES ']) {
      const capture = createCapturedStdout();
      const prompt: PromptAdapter = {
        isInteractive: () => true,
        ask: vi.fn(async () => answer),
      };

      const result = await runReviewGate({
        markdownReport: sampleReport,
        destinationPath: 'bugbundle-report.md',
        securityValidated: true,
        io: capture.io,
        prompt,
        now: () => new Date('2026-11-25T15:00:00.000Z'),
      });

      expect(result).toEqual({
        approved: true,
        approval: {
          approved: true,
          mode: 'interactive',
          reviewedAt: '2026-11-25T15:00:00.000Z',
        },
      });
      expect(capture.getOut()).toContain('DIAGNOSTIC REPORT PREVIEW');
      expect(capture.getOut()).toContain('Sanitized content.');
      expect(prompt.ask).toHaveBeenCalledWith(
        'Save this diagnostic report to ./bugbundle-report.md? (y/N): ',
      );
    }
  });

  it('declines when user answers n, empty response, or invalid response (default No)', async () => {
    for (const answer of ['n', 'no', '', '   ', 'maybe', '1']) {
      const capture = createCapturedStdout();
      const prompt: PromptAdapter = {
        isInteractive: () => true,
        ask: vi.fn(async () => answer),
      };

      const result = await runReviewGate({
        markdownReport: sampleReport,
        destinationPath: 'bugbundle-report.md',
        securityValidated: true,
        io: capture.io,
        prompt,
      });

      expect(result).toEqual({
        approved: false,
        reason: 'declined',
      });
    }
  });

  it('handles Ctrl+C or closed stdin safely without approving', async () => {
    const capture = createCapturedStdout();
    const prompt: PromptAdapter = {
      isInteractive: () => true,
      ask: vi.fn(async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }),
    };

    const result = await runReviewGate({
      markdownReport: sampleReport,
      destinationPath: 'bugbundle-report.md',
      securityValidated: true,
      io: capture.io,
      prompt,
    });

    expect(result).toEqual({
      approved: false,
      reason: 'interrupted',
    });
  });

  it('refuses export in non-interactive mode without --yes', async () => {
    const capture = createCapturedStdout();
    const prompt: PromptAdapter = {
      isInteractive: () => false,
      ask: vi.fn(async () => 'y'),
    };

    await expect(
      runReviewGate({
        markdownReport: sampleReport,
        destinationPath: 'bugbundle-report.md',
        securityValidated: true,
        io: capture.io,
        prompt,
      }),
    ).rejects.toThrow(NonInteractiveApprovalError);
    expect(prompt.ask).not.toHaveBeenCalled();
  });

  it('approves in non-interactive mode when --yes is supplied', async () => {
    const capture = createCapturedStdout();
    const prompt: PromptAdapter = {
      isInteractive: () => false,
      ask: vi.fn(async () => 'n'),
    };

    const result = await runReviewGate({
      markdownReport: sampleReport,
      destinationPath: 'bugbundle-report.md',
      securityValidated: true,
      nonInteractiveApprove: true,
      io: capture.io,
      prompt,
      now: () => new Date('2026-11-25T15:00:00.000Z'),
    });

    expect(result).toEqual({
      approved: true,
      approval: {
        approved: true,
        mode: 'non-interactive-flag',
        reviewedAt: '2026-11-25T15:00:00.000Z',
      },
    });
    expect(prompt.ask).not.toHaveBeenCalled();
    expect(capture.getOut()).toContain('DIAGNOSTIC REPORT PREVIEW');
  });

  it('refuses to run review gate when securityValidated is false', async () => {
    const capture = createCapturedStdout();
    const prompt: PromptAdapter = {
      isInteractive: () => true,
      ask: vi.fn(async () => 'y'),
    };

    await expect(
      runReviewGate({
        markdownReport: sampleReport,
        destinationPath: 'bugbundle-report.md',
        securityValidated: false,
        nonInteractiveApprove: true,
        io: capture.io,
        prompt,
      }),
    ).rejects.toThrow(SecurityBoundaryError);
    expect(capture.getOut()).toBe('');
    expect(prompt.ask).not.toHaveBeenCalled();
  });
});
