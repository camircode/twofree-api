import { describe, expect, it, vi } from "vitest";
import { ValidationPipe } from "@nestjs/common";

import type { RuntimeApplication } from "@camircode/twofree-application";

import { createApiComposition } from "@/composition.js";
import { loadApiConfig } from "@/config.js";
import { TransactionDto } from "@/finance.dto.js";
import { CreditCardDto, productDtoByKind } from "@/product.dto.js";
import { ProductService } from "@/product.service.js";
import { FinanceService } from "@/finance.service.js";
import { createApiApplication } from "@/main.js";

const config = loadApiConfig({
  BETTER_AUTH_SECRET: "nest-api-test-secret-with-more-than-32-bytes",
  APP_PROFILE: "ci",
});

describe("Nest finance service", () => {
  it("keeps version public, finance routes authenticated, and retired market routes absent", async () => {
    const app = await createApiApplication(createApiComposition(config));
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}`;

    try {
      const version = await fetch(`${origin}/version`, {
        headers: { origin: "http://localhost:3000" },
      });
      expect(version.status).toBe(200);
      expect(version.headers.get("access-control-allow-credentials")).toBe("true");
      await expect(version.json()).resolves.toMatchObject({ application: "2free", target: "api" });

      const transactions = await fetch(`${origin}/transactions`);
      expect(transactions.status).toBe(401);
      expect((await fetch(`${origin}/budgets`)).status).toBe(401);
      expect((await fetch(`${origin}/market/alpha-vantage/quote/VT`)).status).toBe(404);
      expect((await fetch(`${origin}/investments`)).status).toBe(404);
      expect((await fetch(`${origin}/cetes`)).status).toBe(404);

      const session = await fetch(`${origin}/api/auth/get-session`);
      expect(session.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("rejects PAN fields at the strict DTO boundary", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        {
          accountId: "account-1",
          cutoffDay: 1,
          dueDay: 20,
          catAnnualPercent: "50",
          annualFee: { currency: "MXN", coefficient: "0", scale: 2 },
          minimumUseFee: { currency: "MXN", coefficient: "0", scale: 2 },
          minimumUseThreshold: { currency: "MXN", coefficient: "0", scale: 2 },
          minimumUsePeriod: "monthly",
          annualInterestPercent: "40",
          creditLimit: { currency: "MXN", coefficient: "10000", scale: 2 },
          creditUsed: { currency: "MXN", coefficient: "0", scale: 2 },
          cardNumber: "4111111111111111",
        },
        { type: "body", metatype: CreditCardDto },
      ),
    ).rejects.toThrow();
  });

  it("keeps generic product updates owner scoped", async () => {
    const updateProduct = vi.fn().mockResolvedValue({ id: "budget-1" });
    const service = new ProductService({ updateProduct } as never);
    await expect(
      service.update("owner-1", "budget", "budget-1", { category: "Casa" }),
    ).resolves.toEqual({ record: { id: "budget-1" } });
    expect(updateProduct).toHaveBeenCalledWith({ ownerId: "owner-1" }, "budget", "budget-1", {
      category: "Casa",
    });
    expect(productDtoByKind["notification-rule"]).toBeDefined();
  });

  it("validates the transaction contract and rejects client-supplied ownership", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        {
          accountId: "account-1",
          amount: { currency: "MXN", coefficient: "1999", scale: 2 },
          metadata: { category: "groceries", description: "Market" },
        },
        { type: "body", metatype: TransactionDto },
      ),
    ).resolves.toBeInstanceOf(TransactionDto);
    await expect(
      pipe.transform(
        {
          ownerId: "attacker-selected-owner",
          accountId: "account-1",
          amount: { currency: "MXN", coefficient: "19.99", scale: 2 },
          date: "2026-07-24",
        },
        { type: "body", metatype: TransactionDto },
      ),
    ).rejects.toThrow();
  });

  it("derives every transaction scope from the authenticated owner", async () => {
    const createTransaction = vi.fn().mockResolvedValue({ id: "transaction-1" });
    const application = { createTransaction } as unknown as RuntimeApplication;
    const service = new FinanceService(application, config);

    await expect(
      service.createTransaction(
        "user-1",
        {
          accountId: "account-1",
          amount: { currency: "MXN", coefficient: "1999", scale: 2 },
          metadata: { category: "groceries", description: "Market" },
        },
        "request-1",
      ),
    ).resolves.toEqual({ transaction: { id: "transaction-1" } });
    expect(createTransaction).toHaveBeenCalledWith(
      { ownerId: "user-1" },
      expect.objectContaining({ accountId: "account-1" }),
      "request-1",
    );
  });

  it("keeps finance updates and deletes owner scoped", async () => {
    const updateAccount = vi.fn().mockResolvedValue({ id: "account-1" });
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    const updateTransaction = vi.fn().mockResolvedValue({ id: "transaction-1" });
    const deleteTransaction = vi.fn().mockResolvedValue(undefined);
    const service = new FinanceService(
      {
        updateAccount,
        deleteAccount,
        updateTransaction,
        deleteTransaction,
      } as unknown as RuntimeApplication,
      config,
    );
    const account = { type: "debit" as const, label: "Daily", currency: "MXN" };
    const transaction = {
      accountId: "account-1",
      amount: { currency: "MXN", coefficient: "1000", scale: 2 },
    };

    await service.updateAccount("owner-1", "account-1", account);
    await service.deleteAccount("owner-1", "account-1");
    await service.updateTransaction("owner-1", "transaction-1", transaction);
    await service.deleteTransaction("owner-1", "transaction-1");

    expect(updateAccount).toHaveBeenCalledWith({ ownerId: "owner-1" }, "account-1", account);
    expect(deleteAccount).toHaveBeenCalledWith({ ownerId: "owner-1" }, "account-1");
    expect(updateTransaction).toHaveBeenCalledWith(
      { ownerId: "owner-1" },
      "transaction-1",
      transaction,
    );
    expect(deleteTransaction).toHaveBeenCalledWith({ ownerId: "owner-1" }, "transaction-1");
  });

  it("rejects a missing idempotency key before provider access", async () => {
    const createTransaction = vi.fn();
    const service = new FinanceService(
      { createTransaction } as unknown as RuntimeApplication,
      config,
    );

    await expect(
      service.createTransaction(
        "user-1",
        {
          accountId: "account-1",
          amount: { currency: "MXN", coefficient: "1", scale: 0 },
        },
        undefined,
      ),
    ).rejects.toThrow("Idempotency-Key must be a non-empty value");
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
