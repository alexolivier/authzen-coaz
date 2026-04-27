import { log } from "../log.js";
import type { EvaluationsRequest, EvaluationsResponse } from "./types.js";

interface AuthZenConfiguration {
  access_evaluations_endpoint?: string;
  [key: string]: unknown;
}

export class AuthZenClient {
  private evaluationsEndpoint!: string;

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
    if (!config.access_evaluations_endpoint) {
      throw new Error(
        `AuthZEN PDP at ${this.baseUrl} does not advertise access_evaluations_endpoint`,
      );
    }
    this.evaluationsEndpoint = config.access_evaluations_endpoint;

    log("PDP", `discovery <- ${response.status}`, config);
    log("PDP", `evaluations: ${this.evaluationsEndpoint}`);
  }

  async evaluations(
    request: EvaluationsRequest,
  ): Promise<EvaluationsResponse> {
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
