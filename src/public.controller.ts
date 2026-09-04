import { Controller, Get, Inject, Res } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";

import type { RuntimeConfig } from "@camircode/twofree-application";
import { databaseReady } from "@camircode/twofree-database";

import { healthResponse } from "./health.js";
import { API_CONFIG } from "./tokens.js";

@AllowAnonymous()
@Controller()
export class PublicController {
  constructor(@Inject(API_CONFIG) private readonly config: RuntimeConfig) {}

  @Get("health")
  async health(@Res({ passthrough: true }) response: Response) {
    const body = healthResponse(this.config, await databaseReady(this.config.databaseUrl));
    response.status(body.status === "ready" ? 200 : 503);
    return body;
  }

  @Get("version")
  version() {
    return {
      application: this.config.appName,
      version: this.config.appVersion,
      build: this.config.buildSha,
      target: "api",
      profile: this.config.profile,
    };
  }
}
