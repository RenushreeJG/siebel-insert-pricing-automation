import * as ExcelJS from 'exceljs';

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
 * Read all rows from Excel file
 * @param filePath - Absolute path to Excel file
 * @returns Array of rows with data and metadata
 */
export async function readExcelData(filePath: string): Promise<RowWithStatus[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  // Debug: Log worksheet information
  console.log(`📋 Total worksheets found: ${workbook.worksheets.length}`);
  if (workbook.worksheets.length > 0) {
    console.log(`📋 Worksheet names: ${workbook.worksheets.map(ws => ws.name).join(', ')}`);
  }
  
  // Try to get worksheet by index first, then by direct array access
  let worksheet = workbook.getWorksheet(1);
  
  if (!worksheet && workbook.worksheets.length > 0) {
    // Fallback: try to get the first worksheet directly
    worksheet = workbook.worksheets[0];
  }
  
  if (!worksheet) {
    const sheetNames = workbook.worksheets.map(ws => ws.name).join(', ');
    throw new Error(`No worksheet found in Excel file. Available sheets: ${sheetNames || 'none'}`);
  }
  
  console.log(`📋 Using worksheet: ${worksheet.name}`);
  
  const rows: RowWithStatus[] = [];
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  
  // Extract headers
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = cell.value?.toString() || '';
  });
  
  // Extract data rows (skip header row)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    const rowData: RowData = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber];
      if (header && header !== 'Status' && header !== 'Error Message') { // Keep helper columns, exclude only output columns
        const value = cell.value?.toString() || '';
        // Only add non-empty values
        if (value.trim()) {
          rowData[header] = value;
        }
      }
    });
    
    // Only add row if it has data
    if (Object.keys(rowData).length > 0) {
      rows.push({
        rowNumber,
        data: rowData
      });
    }
  });
  
  return rows;
}

// Write status back to Excel file
export async function writeExcelStatus(filePath: string, results: RowWithStatus[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  // Try to get worksheet by index first, then by direct array access
  let worksheet = workbook.getWorksheet(1);
  
  if (!worksheet && workbook.worksheets.length > 0) {
    worksheet = workbook.worksheets[0];
  }
  
  if (!worksheet) {
    const sheetNames = workbook.worksheets.map(ws => ws.name).join(', ');
    throw new Error(`No worksheet found in Excel file. Available sheets: ${sheetNames || 'none'}`);
  }
  
  // Find Status and Error Message column indexes
  const headerRow = worksheet.getRow(1);
  let statusColIndex = 0;
  let errorColIndex = 0;
  
  headerRow.eachCell((cell, colNumber) => {
    const header = cell.value?.toString();
    if (header === 'Status') {
      statusColIndex = colNumber;
    } else if (header === 'Error Message') {
      errorColIndex = colNumber;
    }
  });
  
  // If Status column doesn't exist, add it
  if (statusColIndex === 0) {
    const lastCol = headerRow.cellCount + 1;
    headerRow.getCell(lastCol).value = 'Status';
    statusColIndex = lastCol;
  }
  
  // If Error Message column doesn't exist, add it
  if (errorColIndex === 0) {
    const lastCol = headerRow.cellCount + 1;
    headerRow.getCell(lastCol).value = 'Error Message';
    errorColIndex = lastCol;
  }
  
  // Write status and error message for each row
  results.forEach(result => {
    const row = worksheet.getRow(result.rowNumber);
    row.getCell(statusColIndex).value = result.status || '';
    row.getCell(errorColIndex).value = result.errorMessage || '';
  });
  
  await workbook.xlsx.writeFile(filePath);
}
