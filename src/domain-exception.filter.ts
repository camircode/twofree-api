import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch } from "@nestjs/common";
import { ValidationError } from "@camircode/twofree-data-provider";
import type { Response } from "express";

@Catch(ValidationError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: ValidationError, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(400).json({
      error: "validation_failed",
      message: error.message,
    });
  }
}
