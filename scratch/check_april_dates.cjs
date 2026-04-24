const XLSX = require('xlsx');

function checkDates(name) {
    console.log(`--- ANALIZANDO FECHAS EN: ${name} ---`);
    try {
        const wb = XLSX.readFile(name);
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        console.log(`Registros encontrados: ${data.length}`);
        
        for(let i=0; i<Math.min(data.length, 5); i++) {
            const row = data[i];
            const dateVal = row["Fecha de Completación"] || row["Fecha de Ejecutada"];
            console.log(`\nFila ${i}:`);
            console.log(`- Valor crudo: [${dateVal}]`);
            console.log(`- Tipo: [${typeof dateVal}]`);
            if (dateVal instanceof Date) {
               console.log(`- Es Date: ${dateVal.toISOString()}`);
            }
        }
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

checkDates('export (71) movilidad abril 24.xlsx');
