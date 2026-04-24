import type { 
  RegistroNormalizado
} from '../types';

export class ProcessingEngine {
  private baseGeneral: Map<string, any[]> = new Map();
  private movCausalToPerfilMap: Map<string, string> = new Map();
  private terMotivoToCVSMap: Map<string, string> = new Map();
  
  private colIdxContrato = -1;
  private colIdxProducto = -1;
  private colIdxCedula = 14; 
  private colIdxNombre = -1;

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

  private masterCleanMotivo(val: string): string {
    if(!val) return "";
    // Elimina radicalmente GAS, BRILLA, EFIGAS, etc al principio (incluso si tienen espacio antes de la coma)
    let clean = val.replace(/^(GAS|BRILLA|EFIGAS|SURTIGAS|STG|GASES|EMDECOB)\s*,?\s*/i, "").trim();
    // Quita comas o guiones sueltos restantes al inicio
    return clean.replace(/^[\s,.-]+/, '').trim();
  }

  public async indexBaseGeneral(data: any[][], _onProgress: any) {
    if (!data || data.length === 0) return;
    
    let headerIdx = -1;
    for (let i = 0; i < Math.min(data.length, 500); i++) {
        const rowData = data[i] || [];
        const rowStr = rowData.map(v => this.normalize(v));
        if (rowStr.some(v => v.includes('contrat') || v.includes('product') || v.includes('cuenta') || v.includes('cedula'))) {
            headerIdx = i;
            rowStr.forEach((val, idx) => {
                const pure = val.replace(/\s+/g, '');
                if (pure.includes('contrato')) this.colIdxContrato = idx;
                if (pure.includes('producto') || pure.includes('cuenta')) this.colIdxProducto = idx;
                if (pure.includes('cedula') || pure.includes('identificacion') || idx === 14) this.colIdxCedula = idx;
                if (pure.includes('nombre') || pure.includes('cliente')) this.colIdxNombre = idx;
            });
            break;
        }
    }

    if (this.colIdxCedula === -1) this.colIdxCedula = 14;
    
    for (let i = headerIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;
        
        const possibleKeys = [
            this.normalizeProductKey(row[this.colIdxProducto]),
            this.normalizeProductKey(row[this.colIdxContrato]),
            this.normalizeProductKey(row[0]) // Columna A como último recurso
        ].filter(k => k.length > 3);

        possibleKeys.forEach(k => {
            if (!this.baseGeneral.has(k)) this.baseGeneral.set(k, row);
        });
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
    const m = s.match(/(\d{3,5})/);
    return m ? m[1] : '';
  }

  private getVal(row: any, keys: string[]): any {
    if (!row) return undefined;
    const rowKeys = Object.keys(row);
    for (const key of keys) {
      const normKey = this.normalize(key);
      const found = rowKeys.find(rk => this.normalize(rk) === normKey);
      if (found) return row[found];
    }
    return undefined;
  }

  public processAll(mov: any[], ter: any[], start?: string, end?: string): RegistroNormalizado[] {
    const resultados: RegistroNormalizado[] = [];
    
    // MOVILIDAD
    if (mov) mov.forEach(row => {
        const rawProduct = this.safeStr(this.getVal(row, ["Producto", "CUENTA", "CONTRATO"]));
        const productKey = this.normalizeProductKey(rawProduct);
        const causalRaw = this.safeStr(this.getVal(row, ["Causal", "Motivo"]));
        if (!productKey || !causalRaw || causalRaw === '0') return;

        const base = this.baseGeneral.get(productKey);
        const idCausal = this.extractCode(causalRaw);
        const observacion = this.safeStr(this.getVal(row, ["Observacion", "OBSERVACIONES", "DETALLE"])).toUpperCase();
        const telMarcado = this.safeStr(this.getVal(row, ["Celular de persona que atendió", "Celular", "Telefono"]));

        // Motivo Único y Limpio (v14.1)
        const motivoNP = this.collectCleanUniqueMobilityMotive(row);
        const cleanLabel = this.masterCleanMotivo(causalRaw.replace(idCausal, '').replace(/^-/, '').trim()).toUpperCase();
        const perfilMaestro = this.movCausalToPerfilMap.get(idCausal) || this.movCausalToPerfilMap.get(this.normalize(causalRaw));

        resultados.push({
            id_sistema: `MOV-${productKey}-${Math.random()}`,
            contrato: base ? this.safeStr(base[this.colIdxContrato]) : '',
            producto: rawProduct.toString().replace(/\.0$/, ''),
            cliente: base ? (this.safeStr(base[this.colIdxNombre]) || 'CLIENTE EFIGAS') : '',
            direccion: base ? this.safeStr(base[this.colIdxNombre + 1] || base[2]) : '',
            cedula_maestra: base ? this.safeStr(base[this.colIdxCedula]) : '',
            telefono_maestro: telMarcado,
            causal: observacion || cleanLabel,
            codigo_causal: idCausal,
            motivo_no_pago_original: causalRaw,
            motivo_no_pago_consolidado: (motivoNP || cleanLabel || 'SIN MOTIVO').toUpperCase(),
            fecha_gestion: this.formatDate(this.getVal(row, ["Fecha", "Completada"])) || '',
            perfil_maestro: (perfilMaestro || cleanLabel || 'REVISIÓN MANUAL').toUpperCase(),
            identificacion_valida: !!base,
            fuente_principal: 'movilidad',
            estado_cruce: 'automatico', estado_homologacion: perfilMaestro ? 'exitosa' : 'pendiente', editado_manualmente: false, comentarios_concatenados: '', motivo_error: '', tipo_comentario: '', codigo_tipo_comentario: ''
        });
    });

    // TERRENO
    if (ter) ter.forEach(row => {
        const rawProduct = this.safeStr(this.getVal(row, ["PRODUCTO", "CONTRATO", "CUENTA"]));
        const productKey = this.normalizeProductKey(rawProduct);
        const motivoRaw = this.safeStr(this.getVal(row, ["MOTIVO DE NO PAGO", "MOTIVO"]));
        const observacion = this.safeStr(this.getVal(row, ["OBSERVACION", "OBSERVACIONES", "DETALLE"])).toUpperCase();
        const telMarcado = this.safeStr(this.getVal(row, ["TELEFONO NUEVO", "Telefono"]));
        const date = this.formatDate(this.getVal(row, ["Timestamp", "Fecha"])) || '';
        
        if (!productKey || !motivoRaw || motivoRaw === '0') return;
        if (start && date && date < start) return;
        if (end && date && date > end) return;

        const base = this.baseGeneral.get(productKey);
        const idCausal = this.extractCode(motivoRaw);
        // Limpieza Terreno (v14.1)
        const cleanCausal = this.masterCleanMotivo(motivoRaw.replace(idCausal, '').trim()).toUpperCase();
        const perfilMaestro = this.movCausalToPerfilMap.get(idCausal) || this.movCausalToPerfilMap.get(this.normalize(motivoRaw));

        resultados.push({
            id_sistema: `TER-${productKey}-${Math.random()}`,
            contrato: base ? this.safeStr(base[this.colIdxContrato]) : '',
            producto: rawProduct.toString().replace(/\.0$/, ''),
            cliente: base ? (this.safeStr(base[this.colIdxNombre]) || 'CLIENTE EFIGAS') : '',
            direccion: base ? this.safeStr(base[this.colIdxNombre + 1] || base[2]) : '',
            cedula_maestra: base ? this.safeStr(base[this.colIdxCedula]) : '',
            telefono_maestro: telMarcado,
            causal: observacion || cleanCausal,
            codigo_causal: idCausal,
            motivo_no_pago_original: motivoRaw,
            motivo_no_pago_consolidado: cleanCausal || motivoRaw.toUpperCase(),
            fecha_gestion: date,
            perfil_maestro: (perfilMaestro || 'REVISIÓN MANUAL').toUpperCase(),
            identificacion_valida: !!base,
            fuente_principal: 'terreno',
            estado_cruce: 'automatico', estado_homologacion: perfilMaestro ? 'exitosa' : 'pendiente', editado_manualmente: false, comentarios_concatenados: '', motivo_error: '', tipo_comentario: '', codigo_tipo_comentario: ''
        });
    });

    return resultados;
  }

  private collectCleanUniqueMobilityMotive(row: any): string {
    const uniqueVals = new Set<string>();
    Object.entries(row).forEach(([k, v]) => {
        const nk = this.normalize(k);
        if (nk.includes('tipocomentario') || nk.includes('tipo')) {
            const val = this.safeStr(v);
            if (val.length > 2 && val !== '0' && val !== '-') {
                let clean = this.masterCleanMotivo(val);
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
        if(!s || s==='0' || s==='-') return '';
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
      'motivonopago': r.motivo_no_pago_consolidado,
      'numeromarcado': r.telefono_maestro,
      'identificacion': r.cedula_maestra,
      'cuenta': r.producto,
      'valorprome': '', 'fechaprome': '', 'cuota': ''
    }));
  }
}
