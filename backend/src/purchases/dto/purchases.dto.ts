import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseInvoiceLineDto {
  @IsNotEmpty({ message: 'Item ID is required' })
  @IsString()
  item_id: string;

  @IsNotEmpty({ message: 'Quantity is required' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Quantity must be a valid number' })
  @Min(0.0001, { message: 'Quantity must be greater than zero' })
  quantity: number;

  @IsNotEmpty({ message: 'Rate is required' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Rate must be a valid number' })
  @Min(0, { message: 'Rate cannot be negative' })
  rate: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'GST rate must be a valid number' })
  @Min(0)
  @Max(100)
  gst_rate?: number = 0;
}

export class CreatePurchaseDto {
  @IsNotEmpty({ message: 'Vendor / Party ID is required' })
  @IsString()
  party_id: string;

  @IsNotEmpty({ message: 'Invoice number is required' })
  @IsString()
  invoice_number: string;

  @IsOptional()
  @IsString()
  invoice_date?: string;

  @IsOptional()
  @IsString()
  walkin_name?: string;

  @IsOptional()
  @IsString()
  walkin_phone?: string;

  @IsOptional()
  @IsString()
  walkin_address?: string;

  @IsArray({ message: 'Lines must be an array of items' })
  @ArrayMinSize(1, { message: 'Purchase invoice must have at least one line item' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceLineDto)
  lines: PurchaseInvoiceLineDto[];
}
