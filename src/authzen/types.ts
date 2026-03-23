export interface EvaluationRequest {
  subject: Record<string, unknown>;
  action: Record<string, unknown>;
  resource: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface EvaluationResponse {
  decision: boolean;
  context?: { reason?: string };
}

export interface EvaluationsRequest {
  subject?: Record<string, unknown>;
  action?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  context?: Record<string, unknown>;
  evaluations: Array<{
    subject?: Record<string, unknown>;
    action?: Record<string, unknown>;
    resource?: Record<string, unknown>;
    context?: Record<string, unknown>;
  }>;
}

export interface EvaluationsResponse {
  evaluations: EvaluationResponse[];
}
