import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsIn,
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
  address?: string;

  @IsOptional()
  @IsString()
  gst_number?: string;
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
  address?: string;

  @IsOptional()
  @IsString()
  gst_number?: string;
}
