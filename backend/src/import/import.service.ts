import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ImportType,
  ImportPreviewResult,
  ImportCommitResult,
  SkippedRowDetail,
} from './dto/import.dto';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Parses uploaded Excel (.xlsx, .xls) or CSV buffer.
   * Returns detected headers and all non-empty row objects.
   */
  public parseBuffer(buffer: Buffer): { headers: string[]; rows: Record<string, any>[] } {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty.');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: true,
        raw: false,
      });
    } catch (err: any) {
      this.logger.error(`Failed to parse file buffer: ${err?.message}`);
      throw new BadRequestException('Invalid or corrupt file format. Please upload a valid .xlsx or .csv file.');
    }

    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) {
      throw new BadRequestException('The uploaded spreadsheet contains no worksheets.');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      throw new BadRequestException('Could not read the active worksheet from the uploaded file.');
    }

    // Extract raw 2D array of rows to inspect headers
    const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
    if (!rawRows || rawRows.length === 0) {
      throw new BadRequestException('Uploaded file contains no data or headers.');
    }

    // Header row is the first row
    const rawHeaderRow = rawRows[0] || [];
    const headers: string[] = rawHeaderRow
      .map((col) => (col !== undefined && col !== null ? String(col).trim() : ''))
      .filter((col) => col.length > 0);

    if (headers.length === 0) {
      throw new BadRequestException('Malformed file: No column headers detected in the first row.');
    }

    // Extract all rows as objects mapped by detected column headers
    const rawObjects = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

    // Filter out completely blank rows
    const rows = rawObjects.filter((row) => {
      return Object.values(row).some((val) => val !== null && val !== undefined && String(val).trim() !== '');
    });

    if (rows.length === 0) {
      throw new BadRequestException('Uploaded file contains no data rows.');
    }

    return { headers, rows };
  }

  /**
   * Generates a preview with column headers and first 5 sample rows without database side-effects.
   */
  async preview(importType: ImportType, buffer: Buffer): Promise<ImportPreviewResult> {
    const { headers, rows } = this.parseBuffer(buffer);

    return {
      import_type: importType,
      headers,
      sample_rows: rows.slice(0, 5),
      total_rows: rows.length,
    };
  }

  /**
   * Commits the bulk import, executing row-level validation and persisting valid records.
   * Duplicate or invalid rows are captured as skipped with specific reasons.
   */
  async commit(
    companyId: string,
    importType: ImportType,
    columnMapping: Record<string, string>,
    buffer?: Buffer,
    directRows?: Record<string, any>[],
  ): Promise<ImportCommitResult> {
    let rows: Record<string, any>[] = [];

    if (buffer && buffer.length > 0) {
      const parsed = this.parseBuffer(buffer);
      rows = parsed.rows;
    } else if (directRows && Array.isArray(directRows)) {
      rows = directRows;
    } else {
      throw new BadRequestException('No data or file provided for import commit.');
    }

    if (rows.length === 0) {
      throw new BadRequestException('Import file has no data rows to import.');
    }

    // Validate required column mappings
    if (!columnMapping || typeof columnMapping !== 'object') {
      throw new BadRequestException('Column mapping object is required.');
    }

    const admin = this.supabaseService.getAdminClient();
    const skippedRows: SkippedRowDetail[] = [];
    let successCount = 0;

    if (importType === ImportType.ITEMS) {
      // Items require mapping for 'name' and 'sku'
      if (!columnMapping.name || !columnMapping.name.trim()) {
        throw new BadRequestException('Missing required column mapping for "Item Name" (name).');
      }
      if (!columnMapping.sku || !columnMapping.sku.trim()) {
        throw new BadRequestException('Missing required column mapping for "Item Code / SKU" (sku).');
      }

      // Fetch all existing SKUs for this company to check duplicates in O(1)
      const { data: existingItems, error: existingError } = await admin
        .from('items')
        .select('sku')
        .eq('company_id', companyId);

      if (existingError) {
        this.logger.error(`Failed to fetch existing items for duplicate check: ${existingError.message}`);
        throw new InternalServerErrorException('Failed to verify existing inventory items.');
      }

      const existingSkus = new Set<string>();
      for (const item of existingItems || []) {
        if (item.sku) {
          existingSkus.add(item.sku.trim().toUpperCase());
        }
      }

      const batchSeenSkus = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // Excel row numbering (Row 1 is header)

        const rawName = row[columnMapping.name];
        const rawSku = row[columnMapping.sku];
        const rawHsn = columnMapping.hsn_code ? row[columnMapping.hsn_code] : '';
        const rawGst = columnMapping.gst_rate ? row[columnMapping.gst_rate] : '0';
        const rawUnit = columnMapping.unit ? row[columnMapping.unit] : 'pcs';
        const rawStock = columnMapping.opening_stock ? row[columnMapping.opening_stock] : '0';
        const rawThreshold = columnMapping.reorder_threshold ? row[columnMapping.reorder_threshold] : '0';

        const name = rawName !== undefined && rawName !== null ? String(rawName).trim() : '';
        const sku = rawSku !== undefined && rawSku !== null ? String(rawSku).trim() : '';

        // Validate required Name
        if (!name) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: missing required item name`,
          });
          continue;
        }

        // Validate required SKU
        if (!sku) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: missing required SKU / Item Code`,
          });
          continue;
        }

        const skuNormalized = sku.toUpperCase();

        // Check for duplicate SKU in DB or in current batch
        if (existingSkus.has(skuNormalized)) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: duplicate SKU '${sku}' already exists in this company`,
          });
          continue;
        }

        if (batchSeenSkus.has(skuNormalized)) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: duplicate SKU '${sku}' found multiple times in the uploaded file`,
          });
          continue;
        }

        // Parse numerical fields
        const gstParsed = Number(String(rawGst).replace(/[^0-9.]/g, '')) || 0;
        const stockParsed = Number(String(rawStock).replace(/[^0-9.]/g, '')) || 0;
        const thresholdParsed = Number(String(rawThreshold).replace(/[^0-9.]/g, '')) || 0;
        const unitParsed = rawUnit && String(rawUnit).trim() ? String(rawUnit).trim() : 'pcs';
        const hsnParsed = rawHsn && String(rawHsn).trim() ? String(rawHsn).trim() : null;

        const insertPayload: any = {
          company_id: companyId,
          name: name,
          sku: sku,
          hsn_code: hsnParsed,
          gst_rate: gstParsed,
          unit: unitParsed,
          opening_stock: stockParsed,
          reorder_threshold: thresholdParsed,
        };

        let { data: insertedItem, error: insertError } = await admin
          .from('items')
          .insert(insertPayload)
          .select()
          .maybeSingle();

        if (insertError?.message?.includes('reorder_threshold')) {
          delete insertPayload.reorder_threshold;
          const retry = await admin
            .from('items')
            .insert(insertPayload)
            .select()
            .single();
          insertedItem = retry.data;
          insertError = retry.error;
        }

        if (insertError || !insertedItem) {
          this.logger.warn(`Failed to insert item at row ${rowNum}: ${insertError?.message}`);
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: database error (${insertError?.message || 'Insert failed'})`,
          });
          continue;
        }

        // Insert opening stock ledger entry if opening_stock > 0
        if (stockParsed > 0) {
          const { error: ledgerError } = await admin.from('stock_ledger').insert({
            company_id: companyId,
            item_id: insertedItem.id,
            movement_type: 'adjustment_in',
            quantity: stockParsed,
            reference_type: 'opening_stock',
            reference_id: insertedItem.id,
          });

          if (ledgerError) {
            this.logger.error(
              `Failed to record opening stock ledger entry for item ${insertedItem.id}: ${ledgerError.message}`,
            );
          }
        }

        // Mark SKU as seen
        batchSeenSkus.add(skuNormalized);
        existingSkus.add(skuNormalized);
        successCount++;
      }
    } else if (importType === ImportType.PARTIES) {
      // Parties require mapping for 'name'
      if (!columnMapping.name || !columnMapping.name.trim()) {
        throw new BadRequestException('Missing required column mapping for "Party / Vendor Name" (name).');
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const rawName = row[columnMapping.name];
        const rawPhone = columnMapping.phone ? row[columnMapping.phone] : '';
        const rawAddress = columnMapping.address ? row[columnMapping.address] : '';
        const rawState = columnMapping.state ? row[columnMapping.state] : '';
        const rawGstin = columnMapping.gst_number ? row[columnMapping.gst_number] : '';
        const rawType = columnMapping.type ? row[columnMapping.type] : '';

        const name = rawName !== undefined && rawName !== null ? String(rawName).trim() : '';

        if (!name) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: missing required party name`,
          });
          continue;
        }

        // Normalize party type (default: 'vendor')
        let partyType: 'customer' | 'vendor' | 'both' = 'vendor';
        if (rawType) {
          const typeStr = String(rawType).trim().toLowerCase();
          if (typeStr.includes('customer') || typeStr.includes('buyer') || typeStr.includes('client')) {
            partyType = 'customer';
          } else if (typeStr.includes('both')) {
            partyType = 'both';
          } else {
            partyType = 'vendor';
          }
        }

        const phone = rawPhone && String(rawPhone).trim() ? String(rawPhone).trim() : null;
        let address = rawAddress && String(rawAddress).trim() ? String(rawAddress).trim() : null;
        const state = rawState && String(rawState).trim() ? String(rawState).trim() : null;
        const gstNumber = rawGstin && String(rawGstin).trim() ? String(rawGstin).trim().toUpperCase() : null;

        if (state) {
          if (!address) {
            address = state;
          } else if (!address.toLowerCase().includes(state.toLowerCase())) {
            address = `${address}, ${state}`;
          }
        }

        const partyPayload: any = {
          company_id: companyId,
          name: name,
          type: partyType,
          phone: phone,
          address: address,
          gst_number: gstNumber,
        };

        let { error: insertError } = await admin.from('parties').insert(partyPayload);

        if (insertError) {
          this.logger.warn(`Failed to insert party at row ${rowNum}: ${insertError.message}`);
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: database error (${insertError.message})`,
          });
          continue;
        }

        successCount++;
      }
    } else {
      throw new BadRequestException(`Unsupported import_type: ${importType}. Must be 'items' or 'parties'.`);
    }

    return {
      import_type: importType,
      total_rows: rows.length,
      success_count: successCount,
      skipped_count: skippedRows.length,
      skipped_rows: skippedRows,
    };
  }
}
