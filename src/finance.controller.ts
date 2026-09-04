import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  ValidationPipe,
} from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";

import { AccountDto, TransactionDto } from "./finance.dto.js";
import { FinanceService } from "./finance.service.js";

type AuthenticatedSession = UserSession & { user: { id: string } };
const dtoValidation = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;
const accountValidation = new ValidationPipe({ ...dtoValidation, expectedType: AccountDto });
const transactionValidation = new ValidationPipe({
  ...dtoValidation,
  expectedType: TransactionDto,
});

@Controller()
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly finance: FinanceService) {}

  @Get("snapshot")
  snapshot(@Session() session: AuthenticatedSession) {
    return this.finance.snapshot(session.user.id);
  }

  @Get("accounts")
  accounts(@Session() session: AuthenticatedSession) {
    return this.finance.accounts(session.user.id);
  }

  @Post("accounts")
  createAccount(
    @Session() session: AuthenticatedSession,
    @Body(accountValidation) body: AccountDto,
  ) {
    return this.finance.createAccount(session.user.id, body);
  }

  @Patch("accounts/:id")
  updateAccount(
    @Session() session: AuthenticatedSession,
    @Param("id") id: string,
    @Body(accountValidation) body: AccountDto,
  ) {
    return this.finance.updateAccount(session.user.id, id, body);
  }

  @Delete("accounts/:id")
  @HttpCode(204)
  deleteAccount(@Session() session: AuthenticatedSession, @Param("id") id: string) {
    return this.finance.deleteAccount(session.user.id, id);
  }

  @Get("transactions")
  transactions(@Session() session: AuthenticatedSession) {
    return this.finance.transactions(session.user.id);
  }

  @Post("transactions")
  createTransaction(
    @Session() session: AuthenticatedSession,
    @Body(transactionValidation) body: TransactionDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.finance.createTransaction(session.user.id, body, idempotencyKey);
  }

  @Patch("transactions/:id")
  updateTransaction(
    @Session() session: AuthenticatedSession,
    @Param("id") id: string,
    @Body(transactionValidation) body: TransactionDto,
  ) {
    return this.finance.updateTransaction(session.user.id, id, body);
  }

  @Delete("transactions/:id")
  @HttpCode(204)
  deleteTransaction(@Session() session: AuthenticatedSession, @Param("id") id: string) {
    return this.finance.deleteTransaction(session.user.id, id);
  }

  @Get("dashboard")
  dashboard(@Session() session: AuthenticatedSession) {
    return this.finance.dashboard(session.user.id);
  }

  @Get("export")
  export(@Session() session: AuthenticatedSession) {
    return this.finance.export(session.user.id);
  }

  @Post("import")
  @HttpCode(200)
  import(@Session() session: AuthenticatedSession, @Body() body: unknown) {
    return this.finance.import(session.user.id, body);
  }

  @Post("seed")
  @HttpCode(200)
  seed(@Session() session: AuthenticatedSession) {
    return this.finance.seed(session.user.id);
  }

  @Post("reset")
  @HttpCode(200)
  reset(@Session() session: AuthenticatedSession) {
    return this.finance.reset(session.user.id);
  }
}
