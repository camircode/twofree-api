import { Inject, Injectable } from "@nestjs/common";

import {
  calculateDailyYield,
  domainMoney,
  moneyDto,
  type ProductKind,
  type YieldAccountProfile,
} from "@camircode/twofree-core/product-domain.js";
import type { FinanceScope, ProductDataProvider } from "@camircode/twofree-data-provider";

import { PRODUCT_PROVIDER } from "./tokens.js";

@Injectable()
export class ProductService {
  constructor(@Inject(PRODUCT_PROVIDER) private readonly products: ProductDataProvider) {}
  private scope(ownerId: string): FinanceScope {
    return Object.freeze({ ownerId });
  }
  async create(ownerId: string, kind: ProductKind, input: unknown) {
    return { record: await this.products.createProduct(this.scope(ownerId), kind, input) };
  }
  async update(ownerId: string, kind: ProductKind, id: string, input: unknown) {
    return { record: await this.products.updateProduct(this.scope(ownerId), kind, id, input) };
  }
  async list(ownerId: string, kind: ProductKind) {
    return { records: await this.products.listProducts(this.scope(ownerId), kind) };
  }
  async remove(ownerId: string, kind: ProductKind, id: string) {
    await this.products.deleteProduct(this.scope(ownerId), kind, id);
    return { deleted: true };
  }
  async addMember(ownerId: string, groupId: string, userId: string) {
    await this.products.addSharedMember(this.scope(ownerId), groupId, userId);
    return { added: true };
  }
  async evaluate(ownerId: string, observations: Record<string, Record<string, string>>) {
    return { events: await this.products.evaluateNotifications(this.scope(ownerId), observations) };
  }
  async yield(
    ownerId: string,
    id: string,
    balance: { currency: string; coefficient: string; scale: number },
  ) {
    const profile = (
      await this.products.listProducts<YieldAccountProfile>(this.scope(ownerId), "yield-account")
    ).find((item) => item.id === id);
    if (!profile) throw new Error("yield account not found");
    return { dailyYield: moneyDto(calculateDailyYield(domainMoney(balance), profile.value)) };
  }
  export(ownerId: string) {
    return this.products.exportProducts(this.scope(ownerId));
  }
  async import(ownerId: string, envelope: Parameters<ProductDataProvider["importProducts"]>[1]) {
    await this.products.importProducts(this.scope(ownerId), envelope);
    return { imported: true };
  }
}
