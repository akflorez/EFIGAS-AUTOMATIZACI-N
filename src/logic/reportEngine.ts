import ExcelJS from 'exceljs';

export class ReportEngine {
  /**
   * Generates the Management Report Excel file
   * @param baseGeneralRaw Array of arrays from BASE GENERAL sheet (using header: 1)
   * @param convRaw Array of arrays from CONV sheet (using header: 1)
   * @param templateUrl URL or path to the template file
   * @param filterIds Optional Set of products/accounts to filter the report
   */
  public async generateReport(baseGeneralRaw: any[][], _convRaw: any[][], templateUrl: string, filterIds?: Set<string>): Promise<any> {
    const workbook = new ExcelJS.Workbook();
    
    // 1. Load Template
    const response = await fetch(templateUrl);
    const arrayBuffer = await response.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const originalSheetName = 'plantilla Informe de Gestión';
    const originalSheet = workbook.getWorksheet(originalSheetName);
    const commentsSheet = workbook.getWorksheet('COMENTARIOS MASIVO');

    if (!originalSheet) throw new Error(`No se encontró la pestaña "${originalSheetName}" en la plantilla.`);

    const targetSheet = originalSheet;
    
    console.log('Iniciando limpieza optimizada de plantilla...');
    for (let r = 8; r <= 15000; r++) {
      const row = targetSheet.getRow(r);
      if (row && row.hasValues) {
        for (let c = 1; c <= 75; c++) {
          row.getCell(c).value = null;
        }
      }
    }
    
    if (commentsSheet) {
      for (let r = 3; r <= 15000; r++) {
        const row = commentsSheet.getRow(r);
        if (row && row.hasValues) {
          row.getCell(1).value = null;
          row.getCell(2).value = null;
          row.getCell(3).value = null;
          row.getCell(4).value = null;
        }
      }
    }

    // 4. Procesamiento con Filtro Inteligente
    let txtContent = '';
    let processedCount = 0;
    
    // Normalizar los IDs del filtro para comparación robusta
    const normalizedFilters = new Set<string>();
    if (filterIds) {
      filterIds.forEach(id => {
        const clean = id.toString().trim().replace(/\.0$/, '');
        if (clean) normalizedFilters.add(clean);
      });
    }

    console.log(`Filtrando base general contra ${normalizedFilters.size} gestiones únicas...`);

    // Buscamos el índice de la columna producto en el encabezado de la base
    const headers = baseGeneralRaw[0] || [];
    let prodColIdx = headers.findIndex((h: any) => {
      const nh = (h || '').toString().toLowerCase();
      return nh.includes('producto') || nh.includes('cuenta');
    });
    if (prodColIdx === -1) prodColIdx = 2; // Default a Col C

    for (let i = 1; i < baseGeneralRaw.length; i++) {
      const baseRow = baseGeneralRaw[i];
      if (!baseRow || baseRow.length === 0) continue;

      // FILTRO: Solo si el producto coincide con lo gestionado hoy
      if (normalizedFilters.size > 0) {
         // Intentamos encontrar el producto en las columnas probables (B o C)
         const productA = (baseRow[1] || '').toString().trim().replace(/\.0$/, ''); 
         const productB = (baseRow[2] || '').toString().trim().replace(/\.0$/, '');
         const productC = (baseRow[prodColIdx] || '').toString().trim().replace(/\.0$/, '');

         if (!normalizedFilters.has(productA) && 
             !normalizedFilters.has(productB) && 
             !normalizedFilters.has(productC)) {
           continue; 
         }
      }

      const templateRowNumber = 8 + processedCount;
      processedCount++;
      const targetRow = targetSheet.getRow(templateRowNumber);

      // --- Mapeo de Base (B:BI -> A:BH) ---
      for (let col = 1; col <= 65; col++) {
        const val = baseRow[col];
        if (val !== undefined) targetRow.getCell(col).value = val;
      }

      // --- Mapeos Especiales ---
      targetRow.getCell(14).value = baseRow[14]; // Cédula en O
      targetRow.getCell(63).value = baseRow[64]; // BK(63) ← Base BM(64)
      targetRow.getCell(64).value = baseRow[65]; // BL(64) ← Base BN(65)
      targetRow.getCell(65).value = baseRow[70]; // BM(65) ← Base BS(70)
      targetRow.getCell(66).value = baseRow[81]; // BN(66) ← Base CD(81)
      targetRow.getCell(68).value = baseRow[80]; // BP(68) ← Base CC(80)
      targetRow.getCell(70).value = baseRow[87]; // BR(70) ← Base CJ(87)

      // --- BO (67) Código BNF ---
      let bnValue = baseRow[81]?.toString() || '';
      bnValue = bnValue.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
      const bnMatch = bnValue.match(/\b\d{1,5}\b/g); 
      if (bnMatch) targetRow.getCell(67).value = bnMatch[bnMatch.length - 1];

      // --- BQ (69) Código BPV ---
      let bpBaseValue = baseRow[80]?.toString() || '';
      bpBaseValue = bpBaseValue.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
      const bpMatch = bpBaseValue.match(/\b\d{1,5}\b/g); 
      if (bpMatch) targetRow.getCell(69).value = bpMatch[bpMatch.length - 1];

      targetRow.commit();

      // --- Sincronización a COMENTARIOS MASIVO ---
      if (commentsSheet) {
        const commentRow = commentsSheet.getRow(3 + (processedCount - 1));
        const orden = targetRow.getCell(7).value;
        const codigo = targetRow.getCell(67).value;
        const observacion = targetRow.getCell(70).value;

        commentRow.getCell(1).value = orden;
        commentRow.getCell(2).value = codigo;
        commentRow.getCell(3).value = observacion;
        
        if (orden) {
           const cleanO = orden.toString().trim();
           const cleanC = (codigo?.toString() || '').trim();
           const cleanObs = (observacion?.toString() || '').trim();
           commentRow.getCell(4).value = `${cleanO} // ${cleanC} // ${cleanObs}`;
           txtContent += `${cleanO} // ${cleanC} // ${cleanObs}\n`;
        }
        commentRow.commit();
      }
    }

    console.log(`Informe terminado. Total registros escritos: ${processedCount}`);

    return {
      excelBuffer: await workbook.xlsx.writeBuffer(),
      txtContent
    };
  }
}
