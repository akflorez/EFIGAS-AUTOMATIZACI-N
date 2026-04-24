const XLSX = require('xlsx');

function checkMaster(name) {
    console.log(`--- ANALIZANDO MASTER: ${name} ---`);
    try {
        const wb = XLSX.readFile(name);
        wb.SheetNames.forEach(sName => {
            const ws = wb.Sheets[sName];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
            console.log(`\nHoja: [${sName}] - Filas: ${data.length}`);
            if (data.length > 0) {
                console.log("Muestra Columna F (Índice 5) y O (Índice 14):");
                for(let i=0; i<Math.min(data.length, 10); i++) {
                    const r = data[i] || [];
                    console.log(`Fila ${i}: F=[${r[5]}] | O=[${r[14]}]`);
                }
            }
        });
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

checkMaster('BASE GENERAL SEGUIMIENTO ESTRATEGICA MARZO 2026 RESIDENCIAL.xlsx');
