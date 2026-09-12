import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsArray } from 'class-validator';

export enum ImportType {
  ITEMS = 'items',
  PARTIES = 'parties',
}

export class ImportPreviewDto {
  @IsEnum(ImportType)
  @IsNotEmpty()
  import_type: ImportType;
}

export class ImportCommitDto {
  @IsEnum(ImportType)
  @IsNotEmpty()
  import_type: ImportType;

  @IsObject()
  @IsNotEmpty()
  column_mapping: Record<string, string>;

  @IsOptional()
  @IsArray()
  rows?: Record<string, any>[];
}

export interface SkippedRowDetail {
  row_index: number;
  row_data: Record<string, any>;
  reason: string;
}

export interface ImportPreviewResult {
  import_type: ImportType;
  headers: string[];
  sample_rows: Record<string, any>[];
  total_rows: number;
}

export interface ImportCommitResult {
  import_type: ImportType;
  total_rows: number;
  success_count: number;
  skipped_count: number;
  skipped_rows: SkippedRowDetail[];
}
