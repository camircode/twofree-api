import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  AccountCommand,
  RuntimeApplication,
  RuntimeConfig,
  TransactionCommand,
} from "@camircode/twofree-application";
import { requireIdempotencyKey, type FinanceScope } from "@camircode/twofree-data-provider";

import { isDestructiveDevelopmentRoutesEnabled } from "./composition.js";
import { API_CONFIG, FINANCE_APPLICATION } from "./tokens.js";

@Injectable()
export class FinanceService {
  constructor(
    @Inject(FINANCE_APPLICATION) private readonly application: RuntimeApplication,
    @Inject(API_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  private scope(ownerId: string): FinanceScope {
    return Object.freeze({ ownerId });
  }

  snapshot(ownerId: string) {
    return this.application.snapshot(this.scope(ownerId));
  }

  async accounts(ownerId: string) {
    return { accounts: await this.application.listAccounts(this.scope(ownerId)) };
  }

  async createAccount(ownerId: string, command: AccountCommand) {
    return { account: await this.application.createAccount(this.scope(ownerId), command) };
  }

  async updateAccount(ownerId: string, id: string, command: AccountCommand) {
    return { account: await this.application.updateAccount(this.scope(ownerId), id, command) };
  }

  async deleteAccount(ownerId: string, id: string) {
    await this.application.deleteAccount(this.scope(ownerId), id);
  }

  async transactions(ownerId: string) {
    return { transactions: await this.application.listTransactions(this.scope(ownerId)) };
  }

  async createTransaction(ownerId: string, command: TransactionCommand, key: unknown) {
    return {
      transaction: await this.application.createTransaction(
        this.scope(ownerId),
        command,
        requireIdempotencyKey(key),
      ),
    };
  }

  async updateTransaction(ownerId: string, id: string, command: TransactionCommand) {
    return {
      transaction: await this.application.updateTransaction(this.scope(ownerId), id, command),
    };
  }

  async deleteTransaction(ownerId: string, id: string) {
    await this.application.deleteTransaction(this.scope(ownerId), id);
  }

  dashboard(ownerId: string) {
    return this.application.dashboard(this.scope(ownerId));
  }

  async export(ownerId: string) {
    return JSON.parse(await this.application.export(this.scope(ownerId))) as Record<
      string,
      unknown
    >;
  }

  async import(ownerId: string, body: unknown) {
    const scope = this.scope(ownerId);
    await this.application.import(scope, JSON.stringify(body));
    return { imported: true, snapshot: await this.application.snapshot(scope) };
  }

  async seed(ownerId: string) {
    this.requireDestructiveRoutes();
    return this.application.seed(this.scope(ownerId));
  }

  async reset(ownerId: string) {
    this.requireDestructiveRoutes();
    return { reset: true, snapshot: await this.application.reset(this.scope(ownerId)) };
  }

  private requireDestructiveRoutes(): void {
    if (!isDestructiveDevelopmentRoutesEnabled(this.config)) throw new NotFoundException();
  }
}
