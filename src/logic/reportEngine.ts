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

    // 2. Use the original template sheet directly
    const targetSheet = originalSheet;
    
    // 3. Process Sheet (A partir de fila 8)
    // baseGeneralRaw index 0 might be headers if not skipped. 
    // Usually user says "a partir de fila 8" in template, but base general is just data.
    baseGeneralRaw.forEach((baseRow, index) => {
      // Skip headers in base if present (assuming index 0 is header)
      if (index === 0) return;
      
      const templateRowNumber = 8 + (index - 1);
      const targetRow = targetSheet.getRow(templateRowNumber);

      // --- Main Mapping: Base B:BI (indices 1-60) -> Template A:BH (indices 1-60) ---
      for (let col = 1; col <= 60; col++) {
        // La columna O de la base es índice 14. La columna N de la plantilla es índice 14.
        // Forzamos que si es la columna 14 (N), traiga siempre la O (14).
        const val = baseRow[col];
        if (val !== undefined) targetRow.getCell(col).value = val;
      }

      // --- Especial: Asegurar Cédula desde Columna O (índice 14) ---
      const cedulaVal = baseRow[14];
      if (cedulaVal) targetRow.getCell(14).value = cedulaVal;

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

      // --- BO (67) Extraer código de BN (66). Evitar Cédulas (más de 5 dígitos) ---
      let bnValue = baseRow[81]?.toString() || '';
      // Corrección específica: 1474 -> 1473
      bnValue = bnValue.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
      
      const bnMatch = bnValue.match(/\b\d{1,5}\b/g); // Busca números de 1 a 5 dígitos únicamente
      if (bnMatch) {
        targetRow.getCell(67).value = bnMatch[bnMatch.length - 1];
      }

      // --- BQ (69) Extraer código de BP ---
      // BP (68) mantiene el texto completo de Base CC (80)
      let bpBaseValue = baseRow[80]?.toString() || '';
      // Corrección específica: 1474 -> 1473
      bpBaseValue = bpBaseValue.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
      
      targetRow.getCell(68).value = bpBaseValue; 
      
      const bpMatch = bpBaseValue.match(/\b\d{1,5}\b/g); 
      if (bpMatch) {
        targetRow.getCell(69).value = bpMatch[bpMatch.length - 1]; // BQ solo con número
      }

      targetRow.commit();
    });

    // 5. Update COMENTARIOS MASIVO (Preserving Formulas)
    if (commentsSheet) {
      for (let i = 0; i < baseGeneralRaw.length - 1; i++) {
        const sourceRow = targetSheet.getRow(8 + i);
        const targetRow = commentsSheet.getRow(3 + i);

        // A (1): numero de orden ← G (7)
        targetRow.getCell(1).value = sourceRow.getCell(7).value;
        // B (2): codigo de comentario ← BO (67)
        targetRow.getCell(2).value = sourceRow.getCell(67).value;
        // C (3): observacion ← BR (70)
        targetRow.getCell(3).value = sourceRow.getCell(70).value;

        targetRow.commit();
      }
    }

    // 6. Generate TXT content for COMENTARIOS MASIVO
    let txtContent = '';
    if (commentsSheet) {
      for (let i = 0; i < baseGeneralRaw.length - 1; i++) {
        const sourceRow = targetSheet.getRow(8 + i);
        // A (1): Orden, B (2): Código, C (3): Observación
        const orden = sourceRow.getCell(7).value?.toString() || '';
        const codigo = targetSheet.getRow(8 + i).getCell(67).value?.toString() || '';
        const observacion = targetSheet.getRow(8 + i).getCell(70).value?.toString() || '';

        if (orden) {
          // Limpieza solicitada: eliminar {}, " y usar //
          const cleanOrden = orden.replace(/[{}]/g, '').replace(/"/g, '').trim();
          const cleanCodigo = codigo.replace(/[{}]/g, '').replace(/"/g, '').trim();
          const cleanObservacion = observacion.replace(/[{}]/g, '').replace(/"/g, '').trim();
          
          txtContent += `${cleanOrden} // ${cleanCodigo} // ${cleanObservacion}\n`;
        }
      }
    }

    return {
      excelBuffer: await workbook.xlsx.writeBuffer(),
      txtContent
    };
  }
}
