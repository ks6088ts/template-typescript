import type { ServerResponse } from "node:http";

export class HttpProblem extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;

  constructor(status: number, code: string, title: string, detail: string) {
    super(detail);
    this.status = status;
    this.code = code;
    this.title = title;
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  contentType = "application/json",
): void {
  response.writeHead(status, {
    "content-type": `${contentType}; charset=utf-8`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

export function sendProblem(
  response: ServerResponse,
  problem: HttpProblem,
  requestId: string,
): void {
  sendJson(
    response,
    problem.status,
    {
      type: `urn:template-typescript:problem:${problem.code}`,
      title: problem.title,
      status: problem.status,
      detail: problem.message,
      requestId,
    },
    "application/problem+json",
  );
}
