import ExcelJS from 'exceljs';

export class ReportEngine {
  /**
   * Generates the Management Report Excel file
   * @param baseGeneralData Array of objects from BASE GENERAL sheet
   * @param convData Array of objects from CONV sheet
   * @param templateUrl URL or path to the template file
   */
  public async generateReport(baseGeneralData: any[], convData: any[], templateUrl: string): Promise<any> {
    const workbook = new ExcelJS.Workbook();
    
    // In a browser environment, we fetch the template. 
    // In this context, we'll assume it's reachable via fetch or fs
    const response = await fetch(templateUrl);
    const arrayBuffer = await response.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const mainSheet = workbook.getWorksheet('plantilla Informe de Gestión');
    const commentsSheet = workbook.getWorksheet('COMENTARIOS MASIVO');

    if (!mainSheet) throw new Error('No se encontró la pestaña "plantilla Informe de Gestión" en la plantilla.');

    // 1. Process Main Sheet (A partir de fila 8)
    // Mapping: Base B:BI (indices 1 to 60) -> Template A:BH (indices 0 to 59)
    baseGeneralData.forEach((row, rowIndex) => {
      const templateRowNumber = 8 + rowIndex;
      const templateRow = mainSheet.getRow(templateRowNumber);
      
      // Get values as array (XLSX.utils.sheet_to_json usually gives objects, but if we have the raw array...)
      // However, if we receive objects, we need to know the keys or use the index-based approach if they were parsed with {header: 1}
      // Assuming for this specific engine we might want to use header: 1 for simplicity in mapping
      
      const rowValues = Array.isArray(row) ? row : Object.values(row);
      
      // Mapping the 60 columns
      for (let i = 0; i < 60; i++) {
        // Base B corresponds to index 1 in the raw row array (assuming A is index 0)
        // Base BI corresponds to index 60
        const baseValue = rowValues[i + 1];
        templateRow.getCell(i + 1).value = baseValue;
      }

      // 2. CONV Lookups (Columns BO and BQ)
      // BO is column 67, BQ is column 69
      // Logic from previous plan: "crúzandola con filas 150-172 de CONV"
      // We'll search for a match in convData if needed, or if it's a fixed range we use it.
      // Usually BO/BQ depend on some value in the row (like Account or Product)
      const lookupValue = rowValues[4]; // PRODUCTO (Template E, Base F?) - let's adjust if needed
      
      if (convData && convData.length > 0) {
        // Find match in CONV
        // Assuming CONV has a specific structure (e.g., column A match)
        const match = convData.find((c: any) => {
           const cVals = Object.values(c);
           return cVals[0]?.toString() === lookupValue?.toString();
        });

        if (match) {
           const matchVals = Object.values(match);
           templateRow.getCell(67).value = matchVals[1] as any; // BO
           templateRow.getCell(69).value = matchVals[2] as any; // BQ
        }
      }

      templateRow.commit();
    });

    // 3. Process COMENTARIOS MASIVO
    if (commentsSheet) {
      // Mapping for comments: A (Orden), B (Codigo), C (Observacion)
      // D has a formula that we MUST preserve. exceljs preserves it by default if we don't overwrite it.
      baseGeneralData.forEach((row, rowIndex) => {
        const rowNum = 2 + rowIndex; // Assuming data starts at row 2
        const cRow = commentsSheet.getRow(rowNum);
        const rowValues = Array.isArray(row) ? row : Object.values(row);

        // Columns A, B, C
        cRow.getCell(1).value = rowValues[3]; // Example: CONTRATO or ID
        cRow.getCell(2).value = rowValues[4]; // Example: Code
        cRow.getCell(3).value = 'GESTIÓN MASIVA REALIZADA'; // Default text or from row
        
        cRow.commit();
      });
    }

    return await workbook.xlsx.writeBuffer();
  }
}
