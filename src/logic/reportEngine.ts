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
    
    // 3. Clear existing data in template to avoid "ghost" rows from previous uses
    // Clear targetSheet from Row 8 downwards
    for (let r = 8; r <= Math.min(targetSheet.rowCount, 5000); r++) {
      targetSheet.getRow(r).values = [];
    }
    // Clear commentsSheet from Row 3 downwards
    if (commentsSheet) {
      for (let r = 3; r <= Math.min(commentsSheet.rowCount, 5000); r++) {
        commentsSheet.getRow(r).values = [];
      }
    }

    // 4. Process and Sync Sheets (Single Loop)
    let txtContent = '';
    
    // We skip headers in baseGeneralRaw (index 0)
    for (let i = 1; i < baseGeneralRaw.length; i++) {
      const baseRow = baseGeneralRaw[i];
      const templateRowNumber = 8 + (i - 1);
      const targetRow = targetSheet.getRow(templateRowNumber);

      // --- Main Mapping: Base B:BI (indices 1-60) -> Template A:BH (indices 1-60) ---
      for (let col = 1; col <= 60; col++) {
        const val = baseRow[col];
        if (val !== undefined) targetRow.getCell(col).value = val;
      }

      // --- Especial: Asegurar Cédula desde Columna O (índice 14) ---
      const cedulaVal = baseRow[14];
      if (cedulaVal) targetRow.getCell(14).value = cedulaVal;

      // --- Special Mappings ---
      targetRow.getCell(63).value = baseRow[64]; // BK(63) ← Base BM(64)
      targetRow.getCell(64).value = baseRow[65]; // BL(64) ← Base BN(65)
      targetRow.getCell(65).value = baseRow[70]; // BM(65) ← Base BS(70)
      targetRow.getCell(66).value = baseRow[81]; // BN(66) ← Base CD(81)
      targetRow.getCell(68).value = baseRow[80]; // BP(68) ← Base CC(80)
      targetRow.getCell(70).value = baseRow[87]; // BR(70) ← Base CJ(87)
      targetRow.getCell(71).value = baseRow[90]; // BS(71) ← Base CM(90)
      targetRow.getCell(72).value = baseRow[91]; // BT(72) ← Base CN(91)
      targetRow.getCell(73).value = baseRow[92]; // BU(73) ← Base CO(92)

      // --- BO (67) Extraer código de BN (66). Evitar Cédulas ---
      let bnValue = baseRow[81]?.toString() || '';
      bnValue = bnValue.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
      const bnMatch = bnValue.match(/\b\d{1,5}\b/g); 
      if (bnMatch) {
        targetRow.getCell(67).value = bnMatch[bnMatch.length - 1];
      }

      // --- BQ (69) Extraer código de BP ---
      let bpBaseValue = baseRow[80]?.toString() || '';
      bpBaseValue = bpBaseValue.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
      const bpMatch = bpBaseValue.match(/\b\d{1,5}\b/g); 
      if (bpMatch) {
        targetRow.getCell(69).value = bpMatch[bpMatch.length - 1];
      }

      targetRow.commit();

      // --- Sync to COMENTARIOS MASIVO ---
      if (commentsSheet) {
        const commentRow = commentsSheet.getRow(3 + (i - 1));
        const orden = targetRow.getCell(7).value;
        const codigo = targetRow.getCell(67).value; // BO
        const observacion = targetRow.getCell(70).value; // BR

        commentRow.getCell(1).value = orden;
        commentRow.getCell(2).value = codigo;
        commentRow.getCell(3).value = observacion;
        commentRow.commit();

        // --- Sync to TXT Content ---
        if (orden) {
          const cleanOrden = orden.toString().replace(/[{}]/g, '').replace(/"/g, '').trim();
          const cleanCodigo = (codigo?.toString() || '').replace(/[{}]/g, '').replace(/"/g, '').trim();
          const cleanObservacion = (observacion?.toString() || '').replace(/[{}]/g, '').replace(/"/g, '').trim();
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
