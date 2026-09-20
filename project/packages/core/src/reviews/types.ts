export type ReviewStatus =
  | 'queued'
  | 'running'
  | 'needs_scope'
  | 'needs_context'
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
  rolesResolved: boolean;
  messages: {
    text: string;
    purpose: 'context' | 'scope' | 'answers';
    revision: number;
  }[];
  scope: ReviewScope | null;
  status: ReviewStatus;
  phase: string;
  error: string | null;
  revision: number;
  answers: Record<string, string>;
  engineVersion: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  reviewerModel: string;
  auditorModel: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewEvent {
  id: string;
  runId: string;
  kind:
    | 'user'
    | 'assistant'
    | 'assistant_delta'
    | 'tool_start'
    | 'tool_result'
    | 'step_start'
    | 'step_result'
    | 'status';
  callId: string | null;
  title: string;
  data: Record<string, unknown>;
  createdAt: string;
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

export interface ReviewCheck {
  id: string;
  title: string;
  category: string;
  direction: ReviewFinding['direction'];
  state:
    'discovered' | 'ready' | 'comparing' | 'provisional' | 'verifying' | 'done';
  members: {
    id: string;
    title: string;
    documentId: string;
    evidenceIds: string[];
    references: string[];
  }[];
  workerId: string | null;
  finding: ReviewFinding | null;
}
export interface ReviewWorkItem {
  id: string;
  title: string;
  role: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'retry_wait';
  attempt: number;
  error: string | null;
}
export interface ReviewDetail {
  checks: ReviewCheck[];
  workers: ReviewWorkItem[];
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
