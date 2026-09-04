import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  ValidationPipe,
} from "@nestjs/common";
import { IsNotEmpty, IsString } from "class-validator";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";

import type { ProductKind } from "@camircode/twofree-core/product-domain.js";
import type { PortableProductEnvelope } from "@camircode/twofree-data-provider";

import {
  BudgetDto,
  ChargeCardDto,
  CreditCardDto,
  DebitProfileDto,
  EvaluationDto,
  NotificationRuleDto,
  SavingsGoalDto,
  SharedExpenseDto,
  SharedGroupDto,
  YieldAccountDto,
  YieldCalculationDto,
  productDtoByKind,
} from "./product.dto.js";
import { ProductService } from "./product.service.js";

type AuthenticatedSession = UserSession & { user: { id: string } };
class MemberDto {
  @IsString() @IsNotEmpty() userId!: string;
}
const productKinds = new Set<ProductKind>(Object.keys(productDtoByKind) as ProductKind[]);

function productKind(value: string): ProductKind {
  if (!productKinds.has(value as ProductKind))
    throw new BadRequestException("product kind is invalid");
  return value as ProductKind;
}

async function validateProductUpdate(kind: ProductKind, body: unknown): Promise<object> {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    expectedType: productDtoByKind[kind],
  }).transform(body, { type: "body", metatype: productDtoByKind[kind] });
}

@Controller()
export class ProductController {
  constructor(@Inject(ProductService) private readonly service: ProductService) {}
  private owner(session: AuthenticatedSession): string {
    return session.user.id;
  }

  @Get("budgets") budgets(@Session() s: AuthenticatedSession) {
    return this.service.list(this.owner(s), "budget");
  }
  @Post("budgets") createBudget(@Session() s: AuthenticatedSession, @Body() b: BudgetDto) {
    return this.service.create(this.owner(s), "budget", b);
  }
  @Get("savings-goals") goals(@Session() s: AuthenticatedSession) {
    return this.service.list(this.owner(s), "savings-goal");
  }
  @Post("savings-goals") createGoal(@Session() s: AuthenticatedSession, @Body() b: SavingsGoalDto) {
    return this.service.create(this.owner(s), "savings-goal", b);
  }
  @Get("shared-groups") groups(@Session() s: AuthenticatedSession) {
    return this.service.list(this.owner(s), "shared-group");
  }
  @Post("shared-groups") createGroup(
    @Session() s: AuthenticatedSession,
    @Body() b: SharedGroupDto,
  ) {
    return this.service.create(this.owner(s), "shared-group", b);
  }
  @Post("shared-groups/:id/members") addMember(
    @Session() s: AuthenticatedSession,
    @Param("id") id: string,
    @Body() b: MemberDto,
  ) {
    return this.service.addMember(this.owner(s), id, b.userId);
  }
  @Get("shared-expenses") expenses(@Session() s: AuthenticatedSession) {
    return this.service.list(this.owner(s), "shared-expense");
  }
  @Post("shared-expenses") createExpense(
    @Session() s: AuthenticatedSession,
    @Body() b: SharedExpenseDto,
  ) {
    return this.service.create(this.owner(s), "shared-expense", b);
  }
  @Get("credit-cards") creditCards(@Session() s: AuthenticatedSession) {
    return this.service.list(this.owner(s), "credit-card");
  }
  @Post("credit-cards") createCredit(@Session() s: AuthenticatedSession, @Body() b: CreditCardDto) {
    return this.service.create(this.owner(s), "credit-card", b);
  }
  @Get("charge-cards") chargeCards(@Session() s: AuthenticatedSession) {
    return this.service.list(this.owner(s), "charge-card");
  }
  @Post("charge-cards") createCharge(@Session() s: AuthenticatedSession, @Body() b: ChargeCardDto) {
    return this.service.create(this.owner(s), "charge-card", b);
  }
  @Get("debit-profiles") debit(@Session() s: AuthenticatedSession) {
    return this.service.list(this.owner(s), "debit-profile");
  }
  @Post("debit-profiles") createDebit(
    @Session() s: AuthenticatedSession,
    @Body() b: DebitProfileDto,
  ) {
    return this.service.create(this.owner(s), "debit-profile", b);
  }
  @Get("yield-accounts") yields(@Session() s: AuthenticatedSession) {
    return this.service.list(this.owner(s), "yield-account");
  }
  @Post("yield-accounts") createYield(
    @Session() s: AuthenticatedSession,
    @Body() b: YieldAccountDto,
  ) {
    return this.service.create(this.owner(s), "yield-account", b);
  }
  @Post("yield-accounts/:id/calculate") calculate(
    @Session() s: AuthenticatedSession,
    @Param("id") id: string,
    @Body() b: YieldCalculationDto,
  ) {
    return this.service.yield(this.owner(s), id, b.balance);
  }
  @Get("notification-rules") rules(@Session() s: AuthenticatedSession) {
    return this.service.list(this.owner(s), "notification-rule");
  }
  @Post("notification-rules") createRule(
    @Session() s: AuthenticatedSession,
    @Body() b: NotificationRuleDto,
  ) {
    return this.service.create(this.owner(s), "notification-rule", b);
  }
  @Post("notifications/evaluate") evaluate(
    @Session() s: AuthenticatedSession,
    @Body() b: EvaluationDto,
  ) {
    return this.service.evaluate(this.owner(s), b.observations);
  }
  @Get("portable/products") export(@Session() s: AuthenticatedSession) {
    return this.service.export(this.owner(s));
  }
  @Post("portable/products") import(
    @Session() s: AuthenticatedSession,
    @Body() b: PortableProductEnvelope,
  ) {
    return this.service.import(this.owner(s), b);
  }
  @Patch("products/:kind/:id") async update(
    @Session() s: AuthenticatedSession,
    @Param("kind") rawKind: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const kind = productKind(rawKind);
    return this.service.update(this.owner(s), kind, id, await validateProductUpdate(kind, body));
  }
  @Delete("products/:kind/:id") remove(
    @Session() s: AuthenticatedSession,
    @Param("kind") rawKind: string,
    @Param("id") id: string,
  ) {
    return this.service.remove(this.owner(s), productKind(rawKind), id);
  }
}
