import * as XLSX from 'xlsx';

export interface LegalizationResult {
  excelBuffer: any;
  txtContent: string;
}

export class LegalizationEngine {
  async processLegalization(
    baseData: any[][], 
    tipoSeleccionado: string, 
    templateArrayBuffer: ArrayBuffer
  ): Promise<LegalizationResult> {
    // 1. Read Template (.xls)
    const templateWorkbook = XLSX.read(templateArrayBuffer, { cellFormula: true, cellStyles: true });
    const sheetName = 'GENERAL';
    const sheet = templateWorkbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`No se encontró la pestaña "${sheetName}" en la plantilla.`);
    }

    // 2. Identify Headers in Base Data
    
    const getIndex = (letter: string) => {
      let val = 0;
      for (let i = 0; i < letter.length; i++) {
        val = val * 26 + (letter.charCodeAt(i) - 64);
      }
      return val - 1;
    };

    const colIdx = {
      PORTAFOLIO: getIndex('A'),
      CARTERA: getIndex('B'),
      OT: getIndex('H'),
      PAGO2: getIndex('BP'),
      CRUCE: getIndex('BO'),
      TIPO: getIndex('BT'),
      LEGALIZACION: getIndex('CA'),
      ACTIVIDAD: getIndex('DY'),
      CATEGORIA: getIndex('AC')
    };

    // 3. Filter Records
    const filteredRecords = baseData.slice(1).filter(row => {
      const pago2 = row[colIdx.PAGO2]?.toString().trim();
      const cruce = row[colIdx.CRUCE]?.toString().trim();
      
      // Filter: BP != 0, empty, "-"
      const isValidBP = pago2 !== '0' && pago2 !== '' && pago2 !== '-';
      
      // Filter: Tipo seleccionado (1367, 1368, 1369 or TODOS)
      // Check column BO (CRUCE)
      const matchesTipo = tipoSeleccionado === 'TODOS' 
        ? ['1367', '1368', '1369'].includes(cruce)
        : cruce === tipoSeleccionado;

      // Filter: Tipo (Base) != 0
      const isNotZeroTipo = cruce !== '0';

      return isValidBP && matchesTipo && isNotZeroTipo;
    });

    // 4. Mapping to GENERAL sheet (starting Row 2 -> Index 1)
    // We'll clear the sheet from row 1 (index 1) onwards or just overwrite
    
    let txtLines: string[] = [];

    const tipoToCausal: Record<string, string> = {
      '1367': '9813',
      '1368': '9814',
      '1369': '9816'
    };

    filteredRecords.forEach((row, index) => {
      const baseA = row[colIdx.PORTAFOLIO]?.toString().trim();
      const baseCruce = row[colIdx.CRUCE]?.toString().trim();
      
      // Mapping values
      const valA = row[colIdx.CARTERA];
      const valB = row[colIdx.OT];
      const valC = row[colIdx.ACTIVIDAD];
      const valD = 's';
      const valE = tipoToCausal[baseCruce] || '';
      const valF = baseA === 'EFIGAS COMERCIALES' ? '13697' : '13681';
      const valG = row[colIdx.TIPO];
      const valH = '13861'; // Based on example persona
      const valI = row[colIdx.LEGALIZACION];

      // Update sheet cells
      const rowIndex = 2 + index; // Starting row 2
      
      // Set values in sheet
      const setCell = (col: string, val: any) => {
        sheet[XLSX.utils.encode_cell({ c: getIndex(col), r: rowIndex - 1 })] = { v: val, t: typeof val === 'number' ? 'n' : 's' };
      };

      setCell('A', valA);
      setCell('B', valB);
      setCell('C', valC);
      setCell('D', valD);
      setCell('E', valE);
      setCell('F', valF);
      setCell('G', valG);
      setCell('H', valH);
      setCell('I', valI);

      // 5. Calculate TXT (Formula Col J): B|E|F|H|C>IF(D="s",1,0);;;;|||G;I
      // Formula: B2&"|"&E2&"|"&F2&"|"&H2&"|"&C2&">"&IF(D2="S",1,0)&";;;;|||"&G2&";"&I2
      // We use lowercase 's' as requested, Excel comparison is usually case-insensitive.
      const dValue = valD.toLowerCase() === 's' ? '1' : '0';
      const lineJ = `${valB}|${valE}|${valF}|${valH}|${valC}>${dValue};;;;|||${valG};${valI}`;
      txtLines.push(lineJ);

      // Update Column J in Sheet just in case they download the Excel
      setCell('J', lineJ);
    });

    // Update range
    const maxRow = 1 + filteredRecords.length;
    sheet['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 9, r: Math.max(1, maxRow) } });

    // 6. Generate Buffers
    const excelOutput = XLSX.write(templateWorkbook, { type: 'buffer', bookType: 'xls' });
    const txtOutput = txtLines.join('\n');

    return {
      excelBuffer: excelOutput,
      txtContent: txtOutput
    };
  }
}
