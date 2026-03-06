import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export interface RowData {
  [key: string]: string;
}

export interface RowWithStatus {
  rowNumber: number;
  data: RowData;
  status?: 'Success' | 'Failed';
  errorMessage?: string;
}

/**
 * Read all rows from CSV file
 * @param filePath - Absolute path to CSV file
 * @returns Array of rows with data and metadata
 */
export async function readCSVData(filePath: string): Promise<RowWithStatus[]> {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const rows: RowWithStatus[] = [];
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const rowData: RowData = {};
    
    // Convert all values to strings and filter out empty columns
    for (const [key, value] of Object.entries(record)) {
      if (key && key !== 'Status' && key !== 'Error Message') { // Keep helper columns, exclude only output columns
        rowData[key] = String(value || '').trim();
      }
    }
    
    // Only add rows that have at least one non-empty value
    if (Object.values(rowData).some(v => v !== '')) {
      rows.push({
        rowNumber: i + 2, // +2 because row 1 is header, and we're 0-indexed
        data: rowData,
      });
    }
  }
  
  return rows;
}

/**
 * Write status back to CSV file
 * @param filePath - Absolute path to CSV file
 * @param results - Array of rows with status and error messages
 */
export async function writeCSVStatus(filePath: string, results: RowWithStatus[]): Promise<void> {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: false,
    trim: true,
  }) as Record<string, string>[];

  // Update status for each row
  for (const result of results) {
    const recordIndex = result.rowNumber - 2; // -2 because row 1 is header
    if (recordIndex >= 0 && recordIndex < records.length) {
      const record = records[recordIndex];
      record['Status'] = result.status || '';
      if (result.errorMessage) {
        record['Error Message'] = result.errorMessage;
      }
    }
  }

  // Convert back to CSV
  const headers = Object.keys(records[0] || {});
  
  // Add Status column if it doesn't exist
  if (!headers.includes('Status')) {
    headers.push('Status');
    records.forEach(record => {
      if (!record['Status']) {
        record['Status'] = '';
      }
    });
  }
  
  // Add Error Message column if it doesn't exist
  if (!headers.includes('Error Message')) {
    headers.push('Error Message');
    records.forEach(record => {
      if (!record['Error Message']) {
        record['Error Message'] = '';
      }
    });
  }
  
  const csvContent = stringify(records, {
    header: true,
    columns: headers,
  });
  
  fs.writeFileSync(filePath, csvContent, 'utf-8');
}
