import type { 
  RegistroNormalizado
} from '../types';

export class ProcessingEngine {
  private baseGeneral: Map<string, any[]> = new Map();
  private movCausalToPerfilMap: Map<string, string> = new Map();
  
  private colIdxContrato = 4; // Columna E
  private colIdxProducto = 5; // Columna F
  private colIdxCedula = 14;  // Columna O
  private colIdxNombre = 13;  // Columna N

  public stats = {
    movTotal: 0, movConCausal: 0, movEnFecha: 0,
    terTotal: 0, terConMotivo: 0, terEnFecha: 0
  };

  private normalize(s: any): string {
    if (!s) return "";
    return s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '').trim();
  }

  private normalizeProductKey(s: any): string {
    if (!s) return "";
    return s.toString().trim().replace(/\.0$/, '').replace(/^0+/, '');
  }

  private safeStr(val: any): string {
    return (val || "").toString().trim();
  }

  public async indexBaseGeneral(data: any[][], _onProgress: any) {
    if (!data || data.length === 0) return;
    
    let headerIdx = -1;
    // Buscamos en todo el archivo la fila que parezca cabecera
    for (let i = 0; i < Math.min(data.length, 1000); i++) {
        const rowData = data[i] || [];
        const rowStr = rowData.map(v => this.normalize(v));
        if (rowStr.some(v => v.includes('contrato') || v.includes('producto') || v.includes('cuenta') || v.includes('suscriptor'))) {
            headerIdx = i;
            rowStr.forEach((val, idx) => {
                const pure = val.replace(/\s+/g, '');
                if (pure.includes('contrato')) this.colIdxContrato = idx;
                if (pure.includes('producto') || pure.includes('cuenta')) this.colIdxProducto = idx;
                if (pure.includes('cedula') || pure.includes('identificacion')) this.colIdxCedula = idx;
                if (pure.includes('nombre') || pure.includes('cliente')) this.colIdxNombre = idx;
            });
            // Si después de buscar, los índices siguen siendo por defecto o no se encontraron, se mantienen los fijos (5 y 14)
            break;
        }
    }

    if (this.colIdxCedula === -1) this.colIdxCedula = 14;

    for (let i = headerIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;
        const keyProduct = this.normalizeProductKey(row[this.colIdxProducto]);
        const keyContract = this.normalizeProductKey(row[this.colIdxContrato]);
        
        if (keyProduct) this.baseGeneral.set(keyProduct, row);
        if (keyContract) this.baseGeneral.set(keyContract, row);
    }
  }

  public indexMasters(maestroData: any[]) {
    if (!maestroData) return;
    maestroData.forEach(row => {
      const motivo = this.safeStr(this.getVal(row, ["MOTIVO DE NO PAGO CVS", "MOTIVO"]));
      const perfil = this.safeStr(this.getVal(row, ["MEJOR PERFIL EN CVS", "PERFIL"]));
      const code = this.extractCode(motivo);
      if (motivo) {
          const norm = this.normalize(motivo);
          if (perfil) {
            this.movCausalToPerfilMap.set(norm, perfil.toUpperCase());
            if (code) this.movCausalToPerfilMap.set(code, perfil.toUpperCase());
          }
      }
    });
  }

  private extractCode(s: string): string {
    if (!s) return '';
    const m = s.toString().match(/(\d{3,5})/);
    return m ? m[1] : '';
  }

  private getVal(row: any, keys: string[]): any {
    if (!row) return undefined;
    const rKeys = Object.keys(row);
    for (const key of keys) {
      const nk = this.normalize(key);
      const found = rKeys.find(rk => this.normalize(rk).includes(nk));
      if (found) return row[found];
    }
    return undefined;
  }

  public processAll(mov: any[], ter: any[], start?: string, end?: string): RegistroNormalizado[] {
    const resultados: RegistroNormalizado[] = [];
    
    // MOVILIDAD: Basado en estructura real detectada
    if (mov) mov.forEach(row => {
        const rawProduct = this.safeStr(this.getVal(row, ["Producto", "Contrato", "CUENTA"]));
        const productKey = this.normalizeProductKey(rawProduct);
        const causalRaw = this.safeStr(this.getVal(row, ["Causal", "Motivo"]));
        
        // REGLA: Si no hay causal (gestión), se salta el registro
        if (!productKey || !causalRaw || causalRaw === '0') return;

        const base = this.baseGeneral.get(productKey);
        const idCausal = this.extractCode(causalRaw);
        const observacion = this.safeStr(this.getVal(row, ["Observación", "Detalle"])).toUpperCase();
        
        // Columna Exacta: "Celular de persona que atendió"
        const telMarcado = this.safeStr(row["Celular de persona que atendió"] || this.getVal(row, ["Celular", "Telefono"]));

        // Concatenación de "Tipo de comentario" y volteo
        const motivoNP = this.collectCleanUniqueMobilityMotive(row);

        resultados.push({
            id_sistema: `MOV-${productKey}-${Math.random()}`,
            contrato: base ? this.safeStr(base[this.colIdxContrato]) : '',
            producto: rawProduct.toString().replace(/\.0$/, ''),
            cliente: base ? this.safeStr(base[this.colIdxNombre] || 'CLIENTE EFIGAS') : 'PRODUCTO NO ENCONTRADO EN MASTER',
            direccion: base ? this.safeStr(base[this.colIdxProducto + 1] || base[5] || base[2]) : '',
            cedula_maestra: base ? this.safeStr(base[this.colIdxCedula]) : '',
            telefono_maestro: telMarcado,
            causal: observacion || motivoNP,
            codigo_causal: idCausal,
            motivo_no_pago_original: causalRaw,
            motivo_no_pago_consolidado: motivoNP,
            fecha_gestion: this.formatDate(this.getVal(row, ["Fecha de Ejecutada", "Completada"])) || '',
            perfil_maestro: (this.movCausalToPerfilMap.get(idCausal) || 'REVISIÓN MANUAL').toUpperCase(),
            identificacion_valida: !!base,
            fuente_principal: 'movilidad',
            estado_cruce: 'automatico', estado_homologacion: 'pendiente', editado_manualmente: false, comentarios_concatenados: '', motivo_error: '', tipo_comentario: '', codigo_tipo_comentario: ''
        });
    });

    // TERRENO: Basado en estructura real detectada
    if (ter) ter.forEach(row => {
        const rawProduct = this.safeStr(this.getVal(row, ["PRODUCTO", "Contrato", "CUENTA"]));
        const productKey = this.normalizeProductKey(rawProduct);
        const motivoRaw = this.safeStr(this.getVal(row, ["Motivo de no pago", "MOTIVO"]));
        const observacion = this.safeStr(this.getVal(row, ["Observación", "Detalle"])).toUpperCase();
        
        // Columna Exacta: "TELEFONO NUEVO"
        const telMarcado = this.safeStr(row["TELEFONO NUEVO"] || this.getVal(row, ["Telefono"]));
        const date = this.formatDate(this.getVal(row, ["Timestamp", "Fecha"])) || '';
        
        if (!productKey) return;
        if (start && date && date < start) return;
        if (end && date && date > end) return;

        const base = this.baseGeneral.get(productKey);
        const idCausal = this.extractCode(motivoRaw);
        const perfilMaestro = this.movCausalToPerfilMap.get(idCausal) || this.movCausalToPerfilMap.get(this.normalize(motivoRaw));

        resultados.push({
            id_sistema: `TER-${productKey}-${Math.random()}`,
            contrato: base ? this.safeStr(base[this.colIdxContrato]) : '',
            producto: rawProduct.toString().replace(/\.0$/, ''),
            cliente: base ? this.safeStr(base[this.colIdxNombre] || 'CLIENTE EFIGAS') : 'PRODUCTO NO ENCONTRADO EN MASTER',
            direccion: base ? this.safeStr(base[this.colIdxProducto + 1] || base[5] || base[2]) : '',
            cedula_maestra: base ? this.safeStr(base[this.colIdxCedula]) : '',
            telefono_maestro: telMarcado,
            causal: observacion || motivoRaw,
            codigo_causal: idCausal,
            motivo_no_pago_original: motivoRaw,
            motivo_no_pago_consolidado: motivoRaw.toUpperCase(),
            fecha_gestion: this.formatDate(this.getVal(row, ["Timestamp", "Fecha"])) || '',
            perfil_maestro: (perfilMaestro || 'REVISIÓN MANUAL').toUpperCase(),
            identificacion_valida: !!base,
            fuente_principal: 'terreno',
            estado_cruce: 'automatico', estado_homologacion: 'pendiente', editado_manualmente: false, comentarios_concatenados: '', motivo_error: '', tipo_comentario: '', codigo_tipo_comentario: ''
        });
    });

    return resultados;
  }

  private collectCleanUniqueMobilityMotive(row: any): string {
    const uniqueVals = new Set<string>();
    Object.entries(row).forEach(([k, v]) => {
        if (k.toLowerCase().includes('tipo de comentario')) {
            const val = this.safeStr(v);
            if (val.length > 2 && val !== '0' && val !== '-') {
                // De 1478-Negociacion a NEGOCIACION 1478
                let clean = val.replace(/^(GAS|BRILLA|EFIGAS|SURTIGAS)\s*,?\s*/i, "").trim();
                const match = clean.match(/^(\d+)[-\s]+(.+)$/);
                if (match) uniqueVals.add(`${match[2].trim()} ${match[1].trim()}`);
                else uniqueVals.add(clean.toUpperCase());
            }
        }
    });
    return Array.from(uniqueVals).join(', ');
  }

  private formatDate(val: any): string {
    if (!val) return '';
    let d: Date | null = null;
    if (val instanceof Date) d = val;
    else {
        const s = this.safeStr(val);
        const n = Number(s);
        if(!isNaN(n) && n > 40000) d = new Date(Math.round((n - 25569) * 86400 * 1000));
        else d = new Date(s);
    }
    if(!d || isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
  }

  public createExportData(resultados: RegistroNormalizado[]): any[] {
    return resultados.map(r => ({
      'gestion': r.causal,
      'usuario': 'jairo.quintero132',
      'fechagestion': r.fecha_gestion,
      'accion': 'VISITA',
      'perfil': r.perfil_maestro,
      'motivonopago': r.motivo_no_pago_consolidado || r.motivo_no_pago_original,
      'numeromarcado': r.telefono_maestro,
      'identificacion': r.cedula_maestra,
      'cuenta': r.producto,
      'valorprome': '', 'fechaprome': '', 'cuota': ''
    }));
  }
}
