import "reflect-metadata";

import { pathToFileURL } from "node:url";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { loadApiConfig } from "./config.js";
import { createApiComposition, type ApiComposition } from "./composition.js";

export async function createApiApplication(
  composition: ApiComposition = createApiComposition(loadApiConfig()),
) {
  await composition.prepare();
  const app = await NestFactory.create(AppModule.register(composition), { bodyParser: false });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  return app;
}

async function bootstrap(): Promise<void> {
  const config = loadApiConfig();
  const app = await createApiApplication(createApiComposition(config));
  await app.listen(config.apiPort, config.apiHost);
  console.log(`2 Free API listening on http://${config.apiHost}:${config.apiPort}`);
}

// argv[1] is compared through pathToFileURL rather than by string-splicing
// "file://" in front of it. The container is started with a relative script path
// (`node dist/main.js` from WORKDIR /app), and "file://dist/main.js" never
// equals import.meta.url — the guard would silently be false, the process would
// exit 0 having served nothing, and the pod would look like a clean shutdown.
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  bootstrap().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "API startup failed");
    process.exitCode = 1;
  });
}
