export class MailComError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MailComError";
  }
}

export class MailComApiError extends MailComError {
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly body: string | undefined;

  constructor(input: {
    message: string;
    status: number;
    method: string;
    url: string;
    body?: string | undefined;
  }) {
    super(input.message);
    this.name = "MailComApiError";
    this.status = input.status;
    this.method = input.method;
    this.url = input.url;
    this.body = input.body;
  }
}

export class MailComAuthError extends MailComError {
  constructor(message: string) {
    super(message);
    this.name = "MailComAuthError";
  }
}

export class MailComValidationError extends MailComError {
  constructor(message: string) {
    super(message);
    this.name = "MailComValidationError";
  }
}
