import { IsNotEmpty, IsString, IsOptional, MaxLength, IsNumber, Min } from 'class-validator';

export class CreateCompanyDto {
  @IsNotEmpty({ message: 'Company name is required' })
  @IsString()
  @MaxLength(255, { message: 'Company name cannot exceed 255 characters' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'GST number cannot exceed 50 characters' })
  gst_number?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Cash opening balance must be a non-negative number' })
  cash_opening_balance?: number;
}

export class UpdateCashOpeningBalanceDto {
  @IsNotEmpty({ message: 'cash_opening_balance is required' })
  @IsNumber()
  @Min(0, { message: 'Cash opening balance must be a non-negative number' })
  cash_opening_balance: number;
}
