export type ReviewStatus =
  | 'queued'
  | 'running'
  | 'needs_scope'
  | 'needs_input'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ReviewScope {
  categories: string[];
  description: string;
  confirmed: boolean;
}

export interface ReviewRun {
  id: string;
  workspaceId: string;
  policyId: string;
  quotationIds: string[];
  task: string;
  scope: ReviewScope | null;
  status: ReviewStatus;
  phase: string;
  error: string | null;
  revision: number;
  answers: Record<string, string>;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  reviewerModel: string;
  auditorModel: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewFinding {
  id: string;
  title: string;
  category: string;
  direction: 'policy_to_quotation' | 'quotation_to_policy';
  status: 'aligned' | 'different' | 'not_found' | 'needs_input' | 'unverified';
  explanation: string;
  evidenceIds: string[];
  question: string | null;
  verified: boolean;
  verification: string;
  userAnswer: string | null;
}

export interface ReviewReport {
  findings: ReviewFinding[];
  sourceUnits: number;
  inventoriedUnits: number;
  auditedUnits: number;
  limitations: string[];
  complete: boolean;
}

export interface ReviewDetail {
  run: ReviewRun;
  report: ReviewReport | null;
  trace: {
    key: string;
    role: string;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    createdAt: string;
  }[];
}
