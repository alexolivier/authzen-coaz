import { log } from "../log.js";
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

  constructor(private baseUrl: string) {}

  async discover(): Promise<void> {
    const discoveryUrl = `${this.baseUrl}/.well-known/authzen-configuration`;
    log("PDP", `GET ${discoveryUrl}`);
    const response = await fetch(discoveryUrl);

    if (!response.ok) {
      const body = await response.text();
      log("PDP", `discovery <- ${response.status}`, body);
      throw new Error(
        `AuthZEN discovery failed at ${discoveryUrl}: ${response.status}`,
      );
    }

    const config = (await response.json()) as AuthZenConfiguration;
    this.evaluationEndpoint = config.access_evaluation_endpoint;
    this.evaluationsEndpoint = config.access_evaluations_endpoint;

    log("PDP", `discovery <- ${response.status}`, config);
    log("PDP", `evaluation:  ${this.evaluationEndpoint ?? "not available"}`);
    log("PDP", `evaluations: ${this.evaluationsEndpoint ?? "not available"}`);
  }

  get supportsEvaluations(): boolean {
    return this.evaluationsEndpoint !== undefined;
  }

  async evaluate(request: EvaluationRequest): Promise<EvaluationResponse> {
    if (!this.evaluationEndpoint) {
      throw new Error("PDP does not advertise access_evaluation_v1 endpoint");
    }
    return this.post<EvaluationResponse>(this.evaluationEndpoint, request);
  }

  async evaluations(
    request: EvaluationsRequest,
  ): Promise<EvaluationsResponse> {
    if (!this.evaluationsEndpoint) {
      throw new Error(
        "PDP does not advertise access_evaluations_v1 endpoint",
      );
    }
    return this.post<EvaluationsResponse>(this.evaluationsEndpoint, request);
  }

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    log("PDP", `POST ${endpoint} ->`, body);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      log("PDP", `POST ${endpoint} <- ${response.status}`, errBody);
      throw new Error(`AuthZEN PDP returned ${response.status}: ${errBody}`);
    }

    const json = (await response.json()) as T;
    log("PDP", `POST ${endpoint} <- ${response.status}`, json);
    return json;
  }
}
