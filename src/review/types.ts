export interface ReviewApproval {
  readonly approved: true;
  readonly mode: 'interactive' | 'non-interactive-flag';
  readonly reviewedAt: string;
}

export type ReviewGateResult =
  | {
      readonly approved: true;
      readonly approval: ReviewApproval;
    }
  | {
      readonly approved: false;
      readonly reason: 'declined' | 'interrupted';
    };

export interface ReviewIo {
  readonly stdout: (text: string) => void;
}

export interface PromptAdapter {
  isInteractive(): boolean;
  ask(question: string): Promise<string>;
}

export interface ReviewGateOptions {
  readonly markdownReport: string;
  readonly destinationPath: string;
  readonly securityValidated: boolean;
  readonly nonInteractiveApprove?: boolean | undefined;
  readonly io?: ReviewIo | undefined;
  readonly prompt?: PromptAdapter | undefined;
  readonly now?: (() => Date) | undefined;
}
