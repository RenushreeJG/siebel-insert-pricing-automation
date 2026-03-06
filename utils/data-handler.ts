import * as fs from 'fs';
import * as path from 'path';
import { readCSVData, writeCSVStatus, RowWithStatus } from './csv-handler';
import { readExcelData, writeExcelStatus } from './excel-handler';

export { RowData, RowWithStatus } from './csv-handler';

export type DataSourceType = 'csv' | 'excel' | 'auto';

export interface DataHandlerConfig {
  /** Preferred data source format (default: 'csv') */
  dataSource: DataSourceType;
  /** Base file path without extension */
  baseFilePath: string;
}

/**
 * Get the actual file path based on configuration and file availability
 * @param config - Data handler configuration
 * @returns Object with file path and format used
 */
export function getDataFilePath(config: DataHandlerConfig): { filePath: string; format: 'csv' | 'excel' } {
  const csvPath = `${config.baseFilePath}.csv`;
  const excelPath = `${config.baseFilePath}.xlsx`;
  
  // If specific format is requested
  if (config.dataSource === 'csv') {
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }
    return { filePath: csvPath, format: 'csv' };
  }
  
  if (config.dataSource === 'excel') {
    if (!fs.existsSync(excelPath)) {
      throw new Error(`Excel file not found: ${excelPath}`);
    }
    return { filePath: excelPath, format: 'excel' };
  }
  
  // Auto mode: CSV preferred, Excel as fallback
  if (fs.existsSync(csvPath)) {
    return { filePath: csvPath, format: 'csv' };
  }
  
  if (fs.existsSync(excelPath)) {
    console.log('⚠️  CSV file not found, using Excel file as fallback');
    return { filePath: excelPath, format: 'excel' };
  }
  
  throw new Error(`No data file found. Looking for: ${csvPath} or ${excelPath}`);
}

/**
 * Read data from configured source
 * @param config - Data handler configuration
 * @returns Array of rows with data and metadata
 */
export async function readData(config: DataHandlerConfig): Promise<RowWithStatus[]> {
  const { filePath, format } = getDataFilePath(config);
  
  if (format === 'csv') {
    return readCSVData(filePath);
  } else {
    return readExcelData(filePath);
  }
}

/**
 * Write status back to configured source
 * @param config - Data handler configuration
 * @param results - Array of rows with status and error messages
 */
export async function writeStatus(config: DataHandlerConfig, results: RowWithStatus[]): Promise<void> {
  const { filePath, format } = getDataFilePath(config);
  
  if (format === 'csv') {
    await writeCSVStatus(filePath, results);
  } else {
    await writeExcelStatus(filePath, results);
  }
}

/**
 * Auto-detect file format from extension and read data
 * @param filePath - Complete file path with extension
 * @returns Array of rows with data and metadata
 */
export async function readDataFromPath(filePath: string): Promise<RowWithStatus[]> {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.csv') {
    return readCSVData(filePath);
  } else if (ext === '.xlsx' || ext === '.xls') {
    return readExcelData(filePath);
  } else {
    throw new Error(`Unsupported file format: ${ext}. Use .csv or .xlsx`);
  }
}

/**
 * Auto-detect file format from extension and write status
 * @param filePath - Complete file path with extension
 * @param results - Array of rows with status and error messages
 */
export async function writeStatusToPath(filePath: string, results: RowWithStatus[]): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.csv') {
    await writeCSVStatus(filePath, results);
  } else if (ext === '.xlsx' || ext === '.xls') {
    await writeExcelStatus(filePath, results);
  } else {
    throw new Error(`Unsupported file format: ${ext}. Use .csv or .xlsx`);
  }
}
