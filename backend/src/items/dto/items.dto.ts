import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateItemDto {
  @IsNotEmpty({ message: 'Item name is required' })
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  hsn_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'GST rate must be a valid number' })
  @Min(0, { message: 'GST rate cannot be negative' })
  @Max(100, { message: 'GST rate cannot exceed 100%' })
  gst_rate?: number = 0;

  @IsOptional()
  @IsString()
  unit?: string = 'pcs';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Opening stock must be a valid number' })
  @Min(0, { message: 'Opening stock cannot be negative' })
  opening_stock?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Reorder threshold must be a valid number' })
  @Min(0, { message: 'Reorder threshold cannot be negative' })
  reorder_threshold?: number = 0;
}

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  hsn_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  gst_rate?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorder_threshold?: number;
}

export class AdjustStockDto {
  @IsNotEmpty({ message: 'Adjustment type is required' })
  @IsIn(['adjustment_in', 'adjustment_out', 'in', 'out'], {
    message: "Adjustment type must be 'adjustment_in' or 'adjustment_out'",
  })
  adjustment_type: 'adjustment_in' | 'adjustment_out' | 'in' | 'out';

  @IsNotEmpty({ message: 'Quantity is required' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Quantity must be a valid number' })
  @Min(0.0001, { message: 'Quantity must be greater than 0' })
  quantity: number;

  @IsNotEmpty({ message: 'Reason is required for manual stock adjustments' })
  @IsString()
  reason: string;
}
