import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  Matches,
} from 'class-validator';

export class CreatePartyDto {
  @IsNotEmpty({ message: 'Party name is required' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: "Party type is required ('customer', 'vendor', or 'both')" })
  @IsIn(['customer', 'vendor', 'both'], {
    message: "Party type must be 'customer', 'vendor', or 'both'",
  })
  type: 'customer' | 'vendor' | 'both';

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{8,15}$/, {
    message: 'Phone number must be between 8 and 15 digits (optional + country code)',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  gst_number?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  drug_license_number?: string;

  @IsOptional()
  @IsString()
  drug_license_expiry?: string;

  @IsOptional()
  @IsNumber()
  opening_balance?: number;

  @IsOptional()
  @IsIn(['dr', 'cr'])
  opening_balance_type?: 'dr' | 'cr';
}

export class UpdatePartyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['customer', 'vendor', 'both'], {
    message: "Party type must be 'customer', 'vendor', or 'both'",
  })
  type?: 'customer' | 'vendor' | 'both';

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{8,15}$/, {
    message: 'Phone number must be between 8 and 15 digits (optional + country code)',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  gst_number?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  drug_license_number?: string;

  @IsOptional()
  @IsString()
  drug_license_expiry?: string;

  @IsOptional()
  @IsNumber()
  opening_balance?: number;

  @IsOptional()
  @IsIn(['dr', 'cr'])
  opening_balance_type?: 'dr' | 'cr';
}
