const XLSX = require('xlsx');

function diagnoseDetailed(movName, terName, start, end) {
    console.log(`--- DIAGNÓSTICO DE CONTEO ---`);
    let movCount = 0;
    let terCount = 0;

    try {
        const wbMov = XLSX.readFile(movName);
        const movData = XLSX.utils.sheet_to_json(wbMov.Sheets[wbMov.SheetNames[0]]);
        movData.forEach((row, i) => {
            const causal = (row["Causal"] || row["Motivo"] || "").toString().trim();
            const product = (row["Producto"] || row["Producto "] || "").toString().trim();
            if (product && causal && causal !== '0') {
                movCount++;
            }
        });
        console.log(`Movilidad: ${movCount} registros válidos con Causal.`);

        const wbTer = XLSX.readFile(terName);
        const terData = XLSX.utils.sheet_to_json(wbTer.Sheets[wbTer.SheetNames[0]]);
        terData.forEach((row, i) => {
            const product = (row["PRODUCTO"] || row["Producto"] || "").toString().trim();
            const dateVal = row["Timestamp"] || row["Fecha"];
            // Aquí simplificamos el filtro de fecha para el diagnóstico
            if (product) {
                terCount++;
            }
        });
        console.log(`Terreno: ${terCount} registros totales.`);
        console.log(`TOTAL CALCULADO: ${movCount + terCount}`);
        
        // Verificamos si hay encabezados que se colaron como datos
        const sampleMov = movData.slice(0, 5);
        console.log("\nPrimeros registros de Movilidad detectados:");
        console.log(JSON.stringify(sampleMov, null, 2));

    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

// Usamos el rango de fechas de tu captura anterior si es posible, o uno genérico
diagnoseDetailed('export (19) MOVILIDAD AL 17 MARZO.xlsx', 'GESTION TERRENO EFIGAS 2.0 (Responses) (11).xlsx');
