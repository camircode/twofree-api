import {
  createRuntimeApplication,
  type RuntimeApplication,
  type RuntimeConfig,
  type RuntimeProfile,
} from "@camircode/twofree-application";
import { createCoreAuth } from "@camircode/twofree-auth";
import {
  createPrismaProductProvider,
  DataEncryption,
  encryptLegacyFinanceData,
  createPrismaFinanceProviderFactory,
  getPrismaClient,
  type PrismaClient,
} from "@camircode/twofree-database";
import type { ProductDataProvider } from "@camircode/twofree-data-provider";

const destructiveDevelopmentProfiles: readonly RuntimeProfile[] = ["local-offline", "ci"];

export function isDestructiveDevelopmentRoutesEnabled(config: RuntimeConfig): boolean {
  return (
    config.destructiveDevelopmentRoutes && destructiveDevelopmentProfiles.includes(config.profile)
  );
}

export function createApplication(
  config: RuntimeConfig,
  prisma: PrismaClient = getPrismaClient(config.databaseUrl),
): RuntimeApplication {
  return createRuntimeApplication(
    createPrismaFinanceProviderFactory(
      prisma,
      undefined,
      DataEncryption.fromBase64(config.dataEncryptionKey, config.profile === "ci"),
    ),
  );
}

export type ApiComposition = Readonly<{
  config: RuntimeConfig;
  prisma: PrismaClient;
  application: RuntimeApplication;
  auth: ReturnType<typeof createCoreAuth>;
  products: ProductDataProvider;
  prepare(): Promise<void>;
}>;

export function createApiComposition(config: RuntimeConfig): ApiComposition {
  const prisma = getPrismaClient(config.databaseUrl);
  const encryption = DataEncryption.fromBase64(config.dataEncryptionKey, config.profile === "ci");
  return Object.freeze({
    config,
    prisma,
    application: createApplication(config, prisma),
    auth: createCoreAuth(
      prisma,
      config.auth.secret,
      config.auth.baseURL,
      config.auth.trustedOrigins,
    ),
    products: createPrismaProductProvider(prisma, encryption),
    prepare:
      config.profile === "ci"
        ? async () => undefined
        : async () => encryptLegacyFinanceData(prisma, encryption),
  });
}
