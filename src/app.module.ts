import {
  Inject,
  Injectable,
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { AuthModule } from "@thallesp/nestjs-better-auth";

import type { ApiComposition } from "./composition.js";
import { DomainExceptionFilter } from "./domain-exception.filter.js";
import { FinanceController } from "./finance.controller.js";
import { FinanceService } from "./finance.service.js";
import { PublicController } from "./public.controller.js";
import { ProductController } from "./product.controller.js";
import { ProductService } from "./product.service.js";
import { API_CONFIG, FINANCE_APPLICATION, PRISMA_CLIENT, PRODUCT_PROVIDER } from "./tokens.js";

@Injectable()
class PrismaLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: ApiComposition["prisma"]) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Module({})
export class AppModule {
  static register(composition: ApiComposition): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AuthModule.forRoot({
          auth: composition.auth,
        }),
      ],
      controllers: [PublicController, FinanceController, ProductController],
      providers: [
        FinanceService,
        ProductService,
        PrismaLifecycle,
        { provide: API_CONFIG, useValue: composition.config },
        { provide: FINANCE_APPLICATION, useValue: composition.application },
        { provide: PRISMA_CLIENT, useValue: composition.prisma },
        { provide: PRODUCT_PROVIDER, useValue: composition.products },
        { provide: APP_FILTER, useClass: DomainExceptionFilter },
      ],
    };
  }
}
