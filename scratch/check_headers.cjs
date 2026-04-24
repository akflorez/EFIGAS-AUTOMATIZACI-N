const XLSX = require('xlsx');

function checkFile(name) {
    console.log(`--- ANALIZANDO: ${name} ---`);
    try {
        const wb = XLSX.readFile(name);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        console.log("Cabeceras encontradas:");
        console.log(data[0]); 
        console.log("Primera fila de datos:");
        console.log(data[1]);
    } catch (e) {
        console.log(`Error leyendo ${name}: ${e.message}`);
    }
}

// Analizamos los archivos reales proporcionados por el usuario
checkFile('export (19) MOVILIDAD AL 17 MARZO.xlsx');
checkFile('GESTION TERRENO EFIGAS 2.0 (Responses) (11).xlsx');
checkFile('BASE GENERAL SEGUIMIENTO ESTRATEGICA MARZO 2026 RESIDENCIAL.xlsx');
