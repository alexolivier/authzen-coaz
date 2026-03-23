import type {
  EvaluationRequest,
  EvaluationResponse,
  EvaluationsRequest,
  EvaluationsResponse,
} from "./types.js";

interface AuthZenConfiguration {
  access_evaluation_endpoint?: string;
  access_evaluations_endpoint?: string;
  [key: string]: unknown;
}

export class AuthZenClient {
  private evaluationEndpoint: string | undefined;
  private evaluationsEndpoint: string | undefined;
  private discoveryDone = false;

  constructor(private baseUrl: string) { }

  async discover(): Promise<void> {
    if (this.discoveryDone) return;

    const discoveryUrl = `${this.baseUrl}/.well-known/authzen-configuration`;
    console.log(`[PDP] Discovering AuthZEN endpoints at ${discoveryUrl}`);
    const response = await fetch(discoveryUrl);

    if (!response.ok) {
      throw new Error(
        `AuthZEN discovery failed at ${discoveryUrl}: ${response.status}`,
      );
    }

    const config = (await response.json()) as AuthZenConfiguration;
    this.evaluationEndpoint = config.access_evaluation_endpoint;
    this.evaluationsEndpoint = config.access_evaluations_endpoint;
    this.discoveryDone = true;

    console.log(`[PDP] evaluation:  ${this.evaluationEndpoint ?? "not available"}`);
    console.log(`[PDP] evaluations: ${this.evaluationsEndpoint ?? "not available"}`);
  }

  get supportsEvaluations(): boolean {
    return this.evaluationsEndpoint !== undefined;
  }

  async evaluate(request: EvaluationRequest): Promise<EvaluationResponse> {
    await this.discover();
    if (!this.evaluationEndpoint) {
      throw new Error("PDP does not advertise access_evaluation_v1 endpoint");
    }
    return this.post<EvaluationResponse>(this.evaluationEndpoint, request);
  }

  async evaluations(
    request: EvaluationsRequest,
  ): Promise<EvaluationsResponse> {
    await this.discover();
    if (!this.evaluationsEndpoint) {
      throw new Error(
        "PDP does not advertise access_evaluations_v1 endpoint",
      );
    }
    return this.post<EvaluationsResponse>(this.evaluationsEndpoint, request);
  }

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `AuthZEN PDP returned ${response.status}: ${await response.text()}`,
      );
    }

    return response.json() as Promise<T>;
  }
}
