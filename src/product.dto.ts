import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

import { MoneyDto } from "./finance.dto.js";

import type { ProductKind } from "@camircode/twofree-core/product-domain.js";

export class BudgetDto {
  @IsString() @IsNotEmpty() category!: string;
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])$/u) month!: string;
  @ValidateNested() @Type(() => MoneyDto) limit!: MoneyDto;
  @ValidateNested() @Type(() => MoneyDto) actual!: MoneyDto;
  @IsOptional() @Matches(/^\d+(?:\.\d+)?$/u) riskPercent?: string;
  @IsOptional() @IsString() description?: string;
}
export class SavingsGoalDto {
  @IsString() @IsNotEmpty() name!: string;
  @ValidateNested() @Type(() => MoneyDto) target!: MoneyDto;
  @ValidateNested() @Type(() => MoneyDto) saved!: MoneyDto;
  @IsOptional() @IsDateString() targetDate?: string;
}
export class SharedGroupDto {
  @IsString() @IsNotEmpty() name!: string;
}
export class WeightedSplitDto {
  @IsString() @IsNotEmpty() userId!: string;
  @Matches(/^[1-9]\d*$/u) weight!: string;
}
export class SharedExpenseDto {
  @IsString() @IsNotEmpty() groupId!: string;
  @IsString() @IsNotEmpty() description!: string;
  @ValidateNested() @Type(() => MoneyDto) amount!: MoneyDto;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeightedSplitDto)
  splits!: WeightedSplitDto[];
}
class CardDatesDto {
  @IsInt() @Min(1) @Max(31) cutoffDay!: number;
  @IsInt() @Min(1) @Max(31) dueDay!: number;
}
class CardMovementDto {
  @IsIn(["purchase", "payment", "cash-advance", "transfer"]) type!:
    | "purchase"
    | "payment"
    | "cash-advance"
    | "transfer";
  @ValidateNested() @Type(() => MoneyDto) amount!: MoneyDto;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() description?: string;
}
class LimitHistoryDto {
  @IsDateString() effectiveAt!: string;
  @ValidateNested() @Type(() => MoneyDto) limit!: MoneyDto;
}
export class CreditCardDto extends CardDatesDto {
  @IsString() @IsNotEmpty() accountId!: string;
  @Matches(/^\d+(?:\.\d+)?$/u) catAnnualPercent!: string;
  @ValidateNested() @Type(() => MoneyDto) annualFee!: MoneyDto;
  @ValidateNested() @Type(() => MoneyDto) minimumUseFee!: MoneyDto;
  @ValidateNested() @Type(() => MoneyDto) minimumUseThreshold!: MoneyDto;
  @IsIn(["monthly", "annual"]) minimumUsePeriod!: "monthly" | "annual";
  @IsOptional() @IsInt() @Min(1) @Max(31) minimumUseWarningDays?: number;
  @Matches(/^\d+(?:\.\d+)?$/u) annualInterestPercent!: string;
  @ValidateNested() @Type(() => MoneyDto) creditLimit!: MoneyDto;
  @ValidateNested() @Type(() => MoneyDto) creditUsed!: MoneyDto;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LimitHistoryDto)
  limitHistory?: LimitHistoryDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardMovementDto)
  movements?: CardMovementDto[];
}
export class ChargeCardDto extends CardDatesDto {
  @IsString() @IsNotEmpty() accountId!: string;
  @ValidateNested() @Type(() => MoneyDto) annualFee!: MoneyDto;
  @ValidateNested() @Type(() => MoneyDto) lateFee!: MoneyDto;
  @IsBoolean() @IsIn([true]) fullStatementPaymentRequired!: true;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardMovementDto)
  movements?: CardMovementDto[];
}
export class DebitProfileDto {
  @IsString() @IsNotEmpty() accountId!: string;
  @IsInt() @Min(0) freeTransferCount!: number;
  @ValidateNested() @Type(() => MoneyDto) freeTransferAmount!: MoneyDto;
  @ValidateNested() @Type(() => MoneyDto) excessTransferFee!: MoneyDto;
}
export class YieldAccountDto {
  @IsString() @IsNotEmpty() accountId!: string;
  @ValidateNested() @Type(() => MoneyDto) investmentCap!: MoneyDto;
  @Matches(/^\d+(?:\.\d+)?$/u) belowCapAnnualPercent!: string;
  @Matches(/^\d+(?:\.\d+)?$/u) aboveCapAnnualPercent!: string;
  @IsIn([360, 365]) dayBasis!: 360 | 365;
}
export class NotificationRuleDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() source!: string;
  @IsString() @IsNotEmpty() field!: string;
  @IsIn(["gt", "gte", "lt", "lte", "eq"]) comparator!: "gt" | "gte" | "lt" | "lte" | "eq";
  @Matches(/^-?\d+(?:\.\d+)?$/u) threshold!: string;
  @IsOptional() @IsIn(["payment-due", "cutoff", "budget", "card", "yield"]) condition?:
    | "payment-due"
    | "cutoff"
    | "budget"
    | "card"
    | "yield";
  @IsBoolean() enabled!: boolean;
}
export class EvaluationDto {
  @IsObject() observations!: Record<string, Record<string, string>>;
}
export class YieldCalculationDto {
  @ValidateNested() @Type(() => MoneyDto) balance!: MoneyDto;
}

export const productDtoByKind = {
  budget: BudgetDto,
  "savings-goal": SavingsGoalDto,
  "shared-group": SharedGroupDto,
  "shared-expense": SharedExpenseDto,
  "credit-card": CreditCardDto,
  "charge-card": ChargeCardDto,
  "debit-profile": DebitProfileDto,
  "yield-account": YieldAccountDto,
  "notification-rule": NotificationRuleDto,
} as const satisfies Record<ProductKind, new () => object>;
