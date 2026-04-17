import ExcelJS from 'exceljs';

export class ReportEngine {
  /**
   * Generates the Management Report Excel file
   * @param baseGeneralRaw Array of arrays from BASE GENERAL sheet (using header: 1)
   * @param convRaw Array of arrays from CONV sheet (using header: 1)
   * @param templateUrl URL or path to the template file
   */
  public async generateReport(baseGeneralRaw: any[][], _convRaw: any[][], templateUrl: string): Promise<any> {
    const workbook = new ExcelJS.Workbook();
    
    // 1. Load Template
    const response = await fetch(templateUrl);
    const arrayBuffer = await response.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const originalSheetName = 'plantilla Informe de Gestión';
    const originalSheet = workbook.getWorksheet(originalSheetName);
    const commentsSheet = workbook.getWorksheet('COMENTARIOS MASIVO');

    if (!originalSheet) throw new Error(`No se encontró la pestaña "${originalSheetName}" en la plantilla.`);

    // 2. Duplicate Sheet
    const newSheetName = 'Informe Procesado';
    const newSheet = workbook.addWorksheet(newSheetName);
    this.copyWorksheet(originalSheet, newSheet);
    
    // 3. Process New Sheet (A partir de fila 8)
    // baseGeneralRaw index 0 might be headers if not skipped. 
    // Usually user says "a partir de fila 8" in template, but base general is just data.
    baseGeneralRaw.forEach((baseRow, index) => {
      // Skip headers in base if present (assuming index 0 is header)
      if (index === 0) return;
      
      const templateRowNumber = 8 + (index - 1);
      const targetRow = newSheet.getRow(templateRowNumber);

      // --- Main Mapping: Base B:BI (indices 1-60) -> Template A:BH (indices 1-60) ---
      for (let col = 1; col <= 60; col++) {
        const val = baseRow[col]; // Base B is index 1
        if (val !== undefined) targetRow.getCell(col).value = val;
      }

      // --- Special Mappings ---
      // BK(63) ← Base BM(64)
      targetRow.getCell(63).value = baseRow[64];
      // BL(64) ← Base BN(65)
      targetRow.getCell(64).value = baseRow[65];
      // BM(65) ← Base BS(70)
      targetRow.getCell(65).value = baseRow[70];
      // BN(66) ← Base CD(81)
      targetRow.getCell(66).value = baseRow[81];
      // BP(68) ← Base CC(80)
      targetRow.getCell(68).value = baseRow[80];
      // BR(70) ← Base CJ(87)
      targetRow.getCell(70).value = baseRow[87];
      // BS(71) ← Base CM(90)
      targetRow.getCell(71).value = baseRow[90];
      // BT(72) ← Base CN(91)
      targetRow.getCell(72).value = baseRow[91];
      // BU(73) ← Base CO(92)
      targetRow.getCell(73).value = baseRow[92];

      // --- BO (67) Extract code from BN (66) ---
      const bnValue = baseRow[81]?.toString() || '';
      const bnMatch = bnValue.match(/(\d+)/g);
      if (bnMatch) {
        targetRow.getCell(67).value = bnMatch[bnMatch.length - 1]; // Toma el último número (el código)
      }

      // --- BQ (69) Extraer código de BP ---
      // Primero nos aseguramos de que BP (68) tenga solo el número si viene de Base CC (80)
      const bpBaseValue = baseRow[80]?.toString() || '';
      const bpMatch = bpBaseValue.match(/(\d+)/g);
      if (bpMatch) {
        const code = bpMatch[bpMatch.length - 1];
        targetRow.getCell(68).value = code; // BP solo con número
        targetRow.getCell(69).value = code; // BQ solo con número
      }

      targetRow.commit();
    });

    // 5. Update COMENTARIOS MASIVO (Preserving Formulas)
    if (commentsSheet) {
      // Data starts usually at row 2
      // Source: New Tab G(7), BO(67), BR(70)
      for (let i = 0; i < baseGeneralRaw.length - 1; i++) {
        const sourceRow = newSheet.getRow(8 + i);
        const targetRow = commentsSheet.getRow(3 + i);

        // A (1): numero de orden ← G (7)
        targetRow.getCell(1).value = sourceRow.getCell(7).value;
        // B (2): codigo de comentario ← BO (67)
        targetRow.getCell(2).value = sourceRow.getCell(67).value;
        // C (3): observacion ← BR (70)
        targetRow.getCell(3).value = sourceRow.getCell(70).value;

        // D (4) has a formula. We DO NOT touch it.
        targetRow.commit();
      }
    }

    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Deep copy of a worksheet including styles and merges
   */
  private copyWorksheet(source: ExcelJS.Worksheet, target: ExcelJS.Worksheet) {
    // Copy column widths
    source.columns?.forEach((col, i) => {
      if (col.width) target.getColumn(i + 1).width = col.width;
    });

    // Copy rows and cells
    source.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const targetRow = target.getRow(rowNumber);
      targetRow.height = row.height;
      
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const targetCell = targetRow.getCell(colNumber);
        targetCell.value = cell.value;
        targetCell.style = JSON.parse(JSON.stringify(cell.style)); // Deep copy style
      });
      targetRow.commit();
    });

    // Copy merges
    // source._merges is internal, we use model.merges if available or loop through known ranges
    const merges = (source as any).model.merges || [];
    merges.forEach((m: string) => {
      target.mergeCells(m);
    });
  }
}
