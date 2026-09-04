import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

export class MoneyDto {
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsString()
  @Matches(/^-?(?:0|[1-9]\d*)$/u)
  coefficient!: string;

  @IsInt()
  @Min(0)
  scale!: number;
}

export class AccountDto {
  @IsIn(["debit", "yield", "revolving-credit", "charge-card"])
  type!: "debit" | "yield" | "revolving-credit" | "charge-card";

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  statementBalance?: MoneyDto;
}

export class TransactionDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @ValidateNested()
  @Type(() => MoneyDto)
  amount!: MoneyDto;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
