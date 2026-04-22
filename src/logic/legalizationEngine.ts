import * as XLSX from 'xlsx';

export interface LegalizationResult {
  excelBuffer: any;
  txtContent: string;
}

export class LegalizationEngine {
  async processLegalization(
    baseData: any[][], 
    tipoSeleccionado: string[], 
    templateArrayBuffer: ArrayBuffer
  ): Promise<LegalizationResult> {
    // 1. Read Template
    // Note: Community version of sheetjs handles .xlsx much better than .xls for writing.
    const templateWorkbook = XLSX.read(templateArrayBuffer, { cellFormula: true });
    const sheetName = 'GENERAL';
    const sheet = templateWorkbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`No se encontró la pestaña "${sheetName}" en la plantilla.`);
    }

    // 2. Dynamic Column Discovery
    const headers = baseData[0] || [];
    const findIdx = (names: string[]) => {
      // 1. Try exact match first
      const exact = headers.findIndex((h: any) => 
        h && names.some(name => h.toString().trim().toUpperCase() === name.toUpperCase())
      );
      if (exact !== -1) return exact;

      // 2. Try partial match if no exact match found
      return headers.findIndex((h: any) => 
        h && names.some(name => {
          const val = h.toString().trim().toUpperCase();
          const target = name.toUpperCase();
          // Exclude false positives
          if (target === 'TIPO' && val.includes('PRODUCTO')) return false;
          return val.includes(target);
        })
      );
    };

    const colIdx = {
      PORTAFOLIO: findIdx(['PORTAFOLIO']),
      CARTERA: findIdx(['CARTERA']),
      OT: findIdx(['OT', 'ORDEN', 'NÚMERO DE ORDEN']),
      PAGO2: findIdx(['PAGO2', 'PAGO 2']), // Try PAGO2 first
      CRUCE: findIdx(['TIPO']), // Try TIPO specifically first
      LEGALIZACION: findIdx(['LEGALIZACION', 'FRASE', 'LEGALIZACION DE PAGOS CIERRRE']),
      ACTIVIDAD: findIdx(['ACTIVIDAD']),
    };

    // Second pass for fallbacks if primary ones not found
    if (colIdx.CRUCE === -1) colIdx.CRUCE = findIdx(['CRUCE ARCHIVO DE PAGOS']);
    if (colIdx.PAGO2 === -1) colIdx.PAGO2 = findIdx(['CRUCE ARCHIVO DE PAGOS']);

    // Fallback to old indexes if dynamic discovery fails
    if (colIdx.PAGO2 === -1) colIdx.PAGO2 = 67; // BP
    if (colIdx.CRUCE === -1) colIdx.CRUCE = 71; // BT
    if (colIdx.OT === -1) colIdx.OT = 7; // H (OT is 7 in 0-indexed)
    if (colIdx.LEGALIZACION === -1) colIdx.LEGALIZACION = 78; // CA
    if (colIdx.ACTIVIDAD === -1) colIdx.ACTIVIDAD = 128; // DY
    if (colIdx.CARTERA === -1) colIdx.CARTERA = 1; // B
    if (colIdx.PORTAFOLIO === -1) colIdx.PORTAFOLIO = 0; // A

    // 2.5 Extract "Datos adicionales" from template if available (H2)
    // Column H corresponds to index 7
    let defaultDatosAdicionales = '13861';
    if (sheet && sheet['H2']) {
      defaultDatosAdicionales = sheet['H2'].v?.toString() || defaultDatosAdicionales;
    }

    // 3. Filter Records (Strict)
    const filteredRecords = baseData.slice(1).filter(row => {
      const pago2Value = row[colIdx.PAGO2]?.toString().trim();
      const typeValue = row[colIdx.CRUCE]?.toString().trim();
      
      const isValidPayment = pago2Value !== '0' && pago2Value !== '' && pago2Value !== '-' && pago2Value !== undefined;
      const matchesSelected = tipoSeleccionado.includes(typeValue);
      const isNotEmptyType = typeValue !== '0' && typeValue !== '';

      return isValidPayment && matchesSelected && isNotEmptyType;
    });

    const tipoToCausal: Record<string, string> = {
      '1367': '9813',
      '1368': '9814',
      '1369': '9816'
    };

    // 4. Prepare Data for Insertion
    const dataToInsert = filteredRecords.map(row => {
      const currentType = row[colIdx.CRUCE]?.toString().trim();
      
      const valA = row[colIdx.CARTERA] || '';
      const valB = row[colIdx.OT] || '';
      const valC = row[colIdx.ACTIVIDAD] || '';
      const valD = 's';
      const valE = tipoToCausal[currentType] || '';
      // F: Persona logic: EFIGAS COMERCIALES -> 13697, others -> 13681
      // checking the CARTERA field specifically as requested
      const fieldToCheck = row[colIdx.CARTERA]?.toString().trim();
      const valF = fieldToCheck === 'EFIGAS COMERCIALES' ? '13697' : '13681';
      const valG = currentType; 
      const valH = defaultDatosAdicionales; 
      const valI = row[colIdx.LEGALIZACION] || '';

      // Formula logic for TXT/Col J
      const dValue = valD.toLowerCase() === 's' ? '1' : '0';
      const lineJ = `${valB}|${valE}|${valF}|${valH}|${valC}>${dValue};;;;|||${valG};${valI}`;

      return [valA, valB, valC, valD, valE, valF, valG, valH, valI, lineJ];
    });

    // 5. Clean and Update same sheet to preserve formats/metadata
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:J100');

    // 5.1 Remove comments from headers (Row 1, R=0)
    for (let C = 0; C <= 9; ++C) {
      const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (sheet[cellAddr]) {
        delete sheet[cellAddr].c; // Remove comments/notes
        delete sheet[cellAddr].t; // Ensure it is treated correctly if it was part of a comment object
        // Restore common properties if accidentally cleared, though delete .c should be enough
      }
    }

    // 5.2 Clear everything from row 2 downwards
    for (let R = 1; R <= range.e.r; ++R) {
        for (let C = 0; C <= 9; ++C) { // Up to Column J
            const cellAddr = XLSX.utils.encode_cell({r: R, c: C});
            delete sheet[cellAddr];
        }
    }
    
    // Add new data starting at A2 (1, 0)
    if (dataToInsert.length > 0) {
        XLSX.utils.sheet_add_aoa(sheet, dataToInsert, { origin: 'A2' });
    }

    // 6. Generate TXT Content (from Col J)
    const txtContent = dataToInsert.map(row => row[9]).join('\n');

    // 7. Export as XLSX for stability
    const excelOutput = XLSX.write(templateWorkbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      excelBuffer: excelOutput,
      txtContent: txtContent
    };
  }
}
