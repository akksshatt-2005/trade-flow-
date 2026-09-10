import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

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
}
