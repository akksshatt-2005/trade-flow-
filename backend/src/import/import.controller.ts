import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { ImportType, ImportPreviewResult, ImportCommitResult } from './dto/import.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CompanyScopeGuard } from '../companies/guards/company-scope.guard';
import { CurrentCompany } from '../companies/decorators/current-company.decorator';

@Controller('import')
@UseGuards(SupabaseAuthGuard, CompanyScopeGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /**
   * Preview uploaded file: extracts headers and first 5 sample rows without saving any data.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Body('import_type') importTypeBody: string,
    @Body() body: any,
  ): Promise<ImportPreviewResult> {
    const importType = (importTypeBody || body?.import_type) as ImportType;
    if (!importType || (importType !== ImportType.ITEMS && importType !== ImportType.PARTIES)) {
      throw new BadRequestException("import_type must be either 'items' or 'parties'.");
    }

    let buffer: Buffer | undefined;

    if (file && file.buffer) {
      buffer = file.buffer;
    } else if (body?.file_base64) {
      buffer = Buffer.from(body.file_base64, 'base64');
    }

    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('A valid .xlsx, .xls, or .csv file is required for preview.');
    }

    return this.importService.preview(importType, buffer);
  }

  /**
   * Commits the bulk import mapped columns to the company catalog or directory.
   */
  @Post('commit')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async commit(
    @CurrentCompany('id') companyId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('import_type') importTypeBody: string,
    @Body('column_mapping') columnMappingBody: any,
    @Body() body: any,
  ): Promise<ImportCommitResult> {
    const importType = (importTypeBody || body?.import_type) as ImportType;
    if (!importType || (importType !== ImportType.ITEMS && importType !== ImportType.PARTIES)) {
      throw new BadRequestException("import_type must be either 'items' or 'parties'.");
    }

    // Parse column_mapping if stringified in multipart form data
    let columnMapping: Record<string, string>;
    const rawMapping = columnMappingBody || body?.column_mapping;

    if (typeof rawMapping === 'string') {
      try {
        columnMapping = JSON.parse(rawMapping);
      } catch {
        throw new BadRequestException('Invalid JSON format in column_mapping field.');
      }
    } else if (typeof rawMapping === 'object' && rawMapping !== null) {
      columnMapping = rawMapping;
    } else {
      throw new BadRequestException('column_mapping object is required.');
    }

    let buffer: Buffer | undefined;
    let directRows: Record<string, any>[] | undefined;

    if (file && file.buffer) {
      buffer = file.buffer;
    } else if (body?.file_base64) {
      buffer = Buffer.from(body.file_base64, 'base64');
    } else if (body?.rows && Array.isArray(body.rows)) {
      directRows = body.rows;
    }

    if (!buffer && (!directRows || directRows.length === 0)) {
      throw new BadRequestException('File or rows data must be provided to commit import.');
    }

    return this.importService.commit(
      companyId,
      importType,
      columnMapping,
      buffer,
      directRows,
    );
  }
}
