import type { 
  RegistroNormalizado
} from '../types';

export class ProcessingEngine {
  private baseGeneral: Map<string, any[]> = new Map();
  private movCausalToPerfilMap: Map<string, string> = new Map();
  private terMotivoToCVSMap: Map<string, string> = new Map();
  
  // Índices dinámicos para el Master
  private colIdxContrato = -1;
  private colIdxNombre = -1;
  private colIdxCedula = -1;
  private colIdxDireccion = -1;

  public stats = {
    movTotal: 0, movConCausal: 0, movEnFecha: 0,
    terTotal: 0, terConMotivo: 0, terEnFecha: 0
  };

  private normalize(s: any): string {
    if (!s) return "";
    return s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '').trim();
  }

  private safeStr(val: any): string {
    return (val || "").toString().trim();
  }

  public async indexBaseGeneral(data: any[][], _onProgress: any) {
    if (!data || data.length === 0) return;
    
    // 1. Encontrar la cabecera del Master de forma más agresiva
    let headerIdx = -1;
    for (let i = 0; i < Math.min(data.length, 100); i++) {
        const row = data[i].map(v => this.normalize(v));
        if (row.some(v => v.includes('producto') || v.includes('contrato') || v.includes('cuenta'))) {
            headerIdx = i;
            row.forEach((val, idx) => {
                if (val.includes('contrato')) this.colIdxContrato = idx;
                if (val.includes('nombre') || val.includes('cliente')) this.colIdxNombre = idx;
                if (val.includes('cedula') || val.includes('identificacion') || idx === 14) this.colIdxCedula = idx;
                if (val.includes('direccion')) this.colIdxDireccion = idx;
            });
            break;
        }
    }

    // 2. Indexar datos
    for (let i = headerIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;
        const key = this.safeStr(row[this.colIdxContrato !== -1 ? this.colIdxContrato : 1]).replace(/\.0$/, '');
        if (key) this.baseGeneral.set(key, row);
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
          this.terMotivoToCVSMap.set(norm, motivo.toUpperCase());
          if (code) this.terMotivoToCVSMap.set(code, motivo.toUpperCase());
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
    const results: RegistroNormalizado[] = [];
    
    // PROCESAR MOVILIDAD
    if (mov) mov.forEach(row => {
        const product = this.safeStr(this.getVal(row, ["Producto", "CUENTA", "CONTRATO"])).replace(/\.0$/, '');
        const causalRaw = this.safeStr(this.getVal(row, ["Causal", "Motivo"]));
        if (!product || !causalRaw || causalRaw === '0') return;

        const base = this.baseGeneral.get(product);
        const idCausal = this.extractCode(causalRaw);
        const cleanLabel = causalRaw.replace(idCausal, '').replace(/^[-\s]+/, '').trim().toUpperCase();
        
        const perfilMaestro = this.movCausalToPerfilMap.get(idCausal) || this.movCausalToPerfilMap.get(this.normalize(causalRaw));
        const comments = this.collectComments(row);

        results.push({
            id_sistema: `MOV-${product}-${Math.random()}`,
            contrato: base ? this.safeStr(base[this.colIdxContrato]) : '',
            producto: product,
            cliente: base ? this.safeStr(base[this.colIdxNombre]) : '',
            direccion: base ? this.safeStr(base[this.colIdxDireccion]) : '',
            cedula_maestra: base ? this.safeStr(base[this.colIdxCedula]) : '',
            telefono_maestro: this.safeStr(this.getVal(row, ["celular", "telefono"])),
            causal: comments || cleanLabel,
            codigo_causal: idCausal,
            motivo_no_pago_original: causalRaw,
            motivo_no_pago_consolidado: `${comments} ${idCausal}`.trim().toUpperCase(),
            fecha_gestion: this.formatDate(this.getVal(row, ["Fecha", "Completada"])) || '',
            perfil_maestro: (perfilMaestro || cleanLabel || 'REVISIÓN MANUAL').toUpperCase(),
            identificacion_valida: !!base,
            fuente_principal: 'movilidad',
            estado_cruce: 'automatico', estado_homologacion: perfilMaestro ? 'exitosa' : 'pendiente', editado_manualmente: false, comentarios_concatenados: comments, motivo_error: '', tipo_comentario: '', codigo_tipo_comentario: ''
        });
    });

    // PROCESAR TERRENO
    if (ter) ter.forEach(row => {
        const product = this.safeStr(this.getVal(row, ["PRODUCTO", "CONTRATO"])).replace(/\.0$/, '');
        const motivoRaw = this.safeStr(this.getVal(row, ["MOTIVO DE NO PAGO", "MOTIVO"]));
        const date = this.formatDate(this.getVal(row, ["Timestamp", "Fecha"])) || '';
        
        if (!product || !motivoRaw || motivoRaw === '0') return;
        if (start && date && date < start) return;
        if (end && date && date > end) return;

        const base = this.baseGeneral.get(product);
        const idCausal = this.extractCode(motivoRaw);
        const cleanLabel = motivoRaw.replace(idCausal, '').replace(/^[-\s]+/, '').trim().toUpperCase();
        const perfilMaestro = this.movCausalToPerfilMap.get(idCausal) || this.movCausalToPerfilMap.get(this.normalize(motivoRaw));
        const mappedMotivo = this.terMotivoToCVSMap.get(idCausal) || this.terMotivoToCVSMap.get(this.normalize(motivoRaw));

        results.push({
            id_sistema: `TER-${product}-${Math.random()}`,
            contrato: base ? this.safeStr(base[this.colIdxContrato]) : '',
            producto: product,
            cliente: base ? this.safeStr(base[this.colIdxNombre]) : '',
            direccion: base ? this.safeStr(base[this.colIdxDireccion]) : '',
            cedula_maestra: base ? this.safeStr(base[this.colIdxCedula]) : '',
            telefono_maestro: this.safeStr(this.getVal(row, ["celular", "telefono"])),
            causal: this.safeStr(this.getVal(row, ["OBSERVACIONES", "DETALLE"])).toUpperCase() || cleanLabel,
            codigo_causal: idCausal,
            motivo_no_pago_original: motivoRaw,
            motivo_no_pago_consolidado: (mappedMotivo || `${cleanLabel} ${idCausal}`).trim().toUpperCase(),
            fecha_gestion: date,
            perfil_maestro: (perfilMaestro || 'REVISIÓN MANUAL').toUpperCase(),
            identificacion_valida: !!base,
            fuente_principal: 'terreno',
            estado_cruce: 'automatico', estado_homologacion: perfilMaestro ? 'exitosa' : 'pendiente', editado_manualmente: false, comentarios_concatenados: '', motivo_error: '', tipo_comentario: '', codigo_tipo_comentario: ''
        });
    });

    return results;
  }

  private collectComments(row: any): string {
    const vals = Object.entries(row)
        .filter(([k]) => {
            const nk = this.normalize(k);
            return (nk.includes('obs') || nk.includes('detalle') || nk.includes('gestion') || nk.includes('coment')) && !nk.includes('causal');
        })
        .map(([_, v]) => this.safeStr(v))
        .filter(v => v.length > 2 && v !== '0' && v !== '-');
    return vals.join(', ').toUpperCase();
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
