import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ValidationError } from "@camircode/twofree-data-provider";

import { DomainExceptionFilter } from "../src/domain-exception.filter.js";

describe("DomainExceptionFilter", () => {
  it("returns a controlled 400 response for invalid domain data", () => {
    const json = vi.fn();
    const response = { status: vi.fn(() => ({ json })) };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    new DomainExceptionFilter().catch(new ValidationError("invalid value"), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: "validation_failed",
      message: "invalid value",
    });
  });
});
