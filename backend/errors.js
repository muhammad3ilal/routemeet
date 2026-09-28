export class ServiceError extends Error {
  constructor(message, status = 502, code = "PROVIDER_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
