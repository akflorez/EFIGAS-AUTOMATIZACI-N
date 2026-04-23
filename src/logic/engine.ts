import type { 
  RegistroNormalizado, 
  BaseGeneralRaw
} from '../types';

export class ProcessingEngine {
  private baseGeneral: Map<string, any[]> = new Map();
  private movCausalToPerfilMap: Map<string, string> = new Map();
  private terMotivoToCVSMap: Map<string, string> = new Map();
  private colIndexCedula: number = 14;   
  private colIndexNombre: number = 2;    
  private colIndexDireccion: number = 5; 
  private colIndexContrato: number = 1;  
  
  constructor() {
  }

  private normalizeText(s: any): string {
    if (s === null || s === undefined) return "";
    return s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private safeString(val: any): string {
    if (val === null || val === undefined) return "";
    return val.toString().trim();
  }

  private getFieldValue(row: any, searchTerms: string[]): any {
    if (!row) return undefined;
    const keys = Object.keys(row);
    for (const term of searchTerms) {
      const cleanTerm = this.normalizeText(term).replace(/\s+/g, '');
      const foundKey = keys.find(k => {
        const ck = this.normalizeText(k).replace(/\s+/g, '');
        return ck === cleanTerm;
      });
      if (foundKey) return row[foundKey];
    }
    return undefined;
  }

  public async indexBaseGeneral(data: BaseGeneralRaw[], onProgress: (p: number) => void) {
    if (!data || data.length === 0) { onProgress(100); return; }
    
    const rawData = data as unknown as any[][];
    const total = rawData.length;
    let headerRowIndex = -1;
    
    for (let i = 0; i < Math.min(rawData.length, 30); i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(v => this.normalizeText(v));
        if (rowStr.some(v => v.includes('producto') || v.includes('contrato') || v.includes('cuenta'))) {
          headerRowIndex = i;
          rowStr.forEach((val, idx) => {
            if (val.includes('cedula') || val.includes('identificacion') || val.includes('documento')) this.colIndexCedula = idx;
            if (val.includes('nombre') || val.includes('cliente')) this.colIndexNombre = idx;
            if (val.includes('direccion') || val.includes('domicilio')) this.colIndexDireccion = idx;
            if (val.includes('contrato')) this.colIndexContrato = idx;
          });
          break;
        }
    }

    const chunkSize = 5000;
    for (let i = 0; i < total; i += chunkSize) {
      const end = Math.min(i + chunkSize, total);
      for (let j = i; j < end; j++) {
        if (j <= headerRowIndex) continue;
        const row = rawData[j];
        if (!row || !Array.isArray(row)) continue;
        
        let key = '';
        if (headerRowIndex !== -1) {
          const headerRow = rawData[headerRowIndex];
          const prodIdx = headerRow.findIndex((h: any) => {
             const nh = this.normalizeText(h);
             return nh.includes('producto') || nh.includes('cuenta') || nh.includes('contrato');
          });
          if (prodIdx !== -1) key = this.safeString(row[prodIdx]);
          else key = this.safeString(row[1]);
        } else {
          key = this.safeString(row[1]);
        }
        
        if (key) {
          this.baseGeneral.set(key.replace(/\.0$/, ''), row);
        }
      }
      onProgress(Math.floor((i / total) * 100));
      await new Promise(r => setTimeout(r, 0));
    }
    onProgress(100);
  }

  public indexMasters(maestroData: any[]) {
    if (!maestroData) return;
    maestroData.forEach(row => {
      const original = this.safeString(this.getFieldValue(row, ["MOTIVO DE NO PAGO CVS", "MOTIVO"]));
      const mejorPerfil = this.safeString(this.getFieldValue(row, ["MEJOR PERFIL EN CVS", "PERFIL"]));
      const code = this.extractCode(original);
      if (original) {
          const fullNorm = this.normalizeText(original);
          if (mejorPerfil) {
            this.movCausalToPerfilMap.set(fullNorm, mejorPerfil.toUpperCase());
            if (code) this.movCausalToPerfilMap.set(code, mejorPerfil.toUpperCase());
          }
          this.terMotivoToCVSMap.set(fullNorm, original.toUpperCase());
          if (code) this.terMotivoToCVSMap.set(code, original.toUpperCase());
      }
    });
  }

  private extractCode(causal: string): string {
    if (!causal) return '';
    const match = causal.toString().trim().match(/(\d{3,5})/);
    return match ? match[1] : '';
  }

  private formatDate(val: any): string {
    if (!val) return '';
    let date: Date | null = null;
    if (val instanceof Date) { date = val; } 
    else {
      const dStr = this.safeString(val);
      if (!dStr || dStr === '-' || dStr === '0') return '';
      const numVal = Number(dStr);
      if (!isNaN(numVal) && numVal > 40000 && numVal < 60000) {
        date = new Date(Math.round((numVal - 25569) * 86400 * 1000));
      } else {
        const dateOnly = dStr.split(/\s+/)[0];
        const dmyRegex = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/;
        const ymdRegex = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/;
        let match = dateOnly.match(dmyRegex);
        if (match) {
          let [_, d, m, y] = match;
          if (y.length === 2) y = "20" + y;
          date = new Date(Number(y), Number(m) - 1, Number(d));
        } else {
          match = dateOnly.match(ymdRegex);
          if (match) {
            const [_, y, m, d] = match;
            date = new Date(Number(y), Number(m) - 1, Number(d));
          } else { date = new Date(dStr); }
        }
      }
    }
    if (!date || isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  }

  public consolidateMovilidadComments(row: any): string {
    const keys = Object.keys(row);
    const commentFields = keys.filter(k => {
      const sk = this.normalizeText(k);
      return (sk.includes('observaci') || sk.includes('detalle') || sk.includes('gestion') || sk.includes('comentario')) 
             && !sk.includes('causal') && !sk.includes('fecha');
    });
    const comments: string[] = [];
    for (const field of commentFields) {
      const val = this.safeString(row[field]);
      if (val && val !== 'null' && val !== '0' && val !== '-' && val.length > 3) comments.push(val);
    }
    return comments.join(', ').toUpperCase();
  }

  private homologateMovilidad(row: any): RegistroNormalizado {
    const productFound = this.getFieldValue(row, ["Producto", "CUENTA", "SUSCRIPTOR", "CONTRATO"]);
    if (!productFound) return null as any;
    const product = this.safeString(productFound).replace(/\.0$/, '');

    const causalRaw = this.safeString(this.getFieldValue(row, ["Causal", "Motivo", "Causales"]));
    if (!causalRaw || causalRaw === '0' || causalRaw === '-' || causalRaw.length < 2) return null as any;

    const base = this.baseGeneral.get(product);
    const date = this.formatDate(this.getFieldValue(row, ["Fecha", "Fecha Gestion", "Fecha Completada"])) || '';
    const obsLarga = this.consolidateMovilidadComments(row);
    
    const idCausal = this.extractCode(causalRaw);
    const cleanLabel = causalRaw.replace(idCausal, '').replace(/^[-\s]+/, '').trim().toUpperCase();
    const normCausal = this.normalizeText(causalRaw);

    const perfilFromMaestro = this.movCausalToPerfilMap.get(idCausal) || this.movCausalToPerfilMap.get(normCausal);
    const perfil = (perfilFromMaestro || cleanLabel || 'REVISIÓN MANUAL').toString().toUpperCase().trim();

    const mappedMotDescription = this.terMotivoToCVSMap.get(idCausal) || this.terMotivoToCVSMap.get(normCausal);
    const motivoNP = (mappedMotDescription || `${cleanLabel} ${idCausal}`).trim().toUpperCase();

    return {
      id_sistema: `MOV-${product}-${date}-${Math.random()}`,
      contrato: base ? this.safeString(base[this.colIndexContrato]) : '',
      producto: product,
      cliente: base ? this.safeString(base[this.colIndexNombre]) : '',
      direccion: base ? this.safeString(base[this.colIndexDireccion]) : '',
      causal: obsLarga || cleanLabel,
      codigo_causal: idCausal,
      tipo_comentario: '',
      codigo_tipo_comentario: '',
      motivo_no_pago_original: causalRaw,
      motivo_no_pago_consolidado: motivoNP,
      fecha_gestion: date,
      estado_cruce: 'automatico',
      estado_homologacion: perfilFromMaestro ? 'exitosa' : 'pendiente',
      editado_manualmente: false,
      fuente_principal: 'movilidad',
      identificacion_valida: !!base,
      perfil_maestro: perfil,
      cedula_maestra: base ? this.safeString(base[this.colIndexCedula]) : '',
      telefono_maestro: this.safeString(this.getFieldValue(row, ["celular", "telefono"])),
      comentarios_concatenados: obsLarga,
      motivo_error: ''
    };
  }

  private homologateTerreno(row: any): RegistroNormalizado {
    const productFound = this.getFieldValue(row, ["PRODUCTO", "CUENTA", "SUSCRIPTOR", "CONTRATO"]);
    if (!productFound) return null as any;
    const product = this.safeString(productFound).replace(/\.0$/, '');

    let motivoRaw = this.safeString(this.getFieldValue(row, ["MOTIVO DE NO PAGO ", "MOTIVO", "PROCESO"]));
    if (!motivoRaw || motivoRaw === '0' || motivoRaw === '-') return null as any;

    const base = this.baseGeneral.get(product);
    const date = this.formatDate(this.getFieldValue(row, ["Fecha", "Gestionada", "Fecha Gestion"])) || '';
    const codeM = this.extractCode(motivoRaw);
    const normM = this.normalizeText(motivoRaw);
    const perfilRaw = this.movCausalToPerfilMap.get(codeM) || this.movCausalToPerfilMap.get(normM) || '';
    const perfil = (perfilRaw || 'REVISIÓN MANUAL').toString().toUpperCase().trim();
    
    const mappedMotDescription = this.terMotivoToCVSMap.get(codeM) || this.terMotivoToCVSMap.get(normM);
    const cleanLabel = motivoRaw.replace(codeM, '').replace(/^[-\s]+/, '').trim().toUpperCase();
    const motivoCVS = (mappedMotDescription || `${cleanLabel} ${codeM}`).trim().toUpperCase();
    const obs = this.safeString(this.getFieldValue(row, ["OBSERVACIONES", "DETALLE", "GESTION"])).toUpperCase();

    return {
      id_sistema: `TER-${product}-${date}-${Math.random()}`,
      contrato: base ? this.safeString(base[this.colIndexContrato]) : '',
      producto: product,
      cliente: base ? this.safeString(base[this.colIndexNombre]) : '',
      direccion: base ? this.safeString(base[this.colIndexDireccion]) : '',
      cedula_maestra: base ? this.safeString(base[this.colIndexCedula]) : '',
      telefono_maestro: this.safeString(this.getFieldValue(row, ["celular", "telefono"])),
      causal: obs || cleanLabel,
      codigo_causal: codeM,
      tipo_comentario: '',
      codigo_tipo_comentario: '',
      motivo_no_pago_original: motivoRaw,
      motivo_no_pago_consolidated: motivoCVS,
      fecha_gestion: date,
      estado_cruce: 'automatico',
      estado_homologacion: perfil && perfil !== 'REVISIÓN MANUAL' ? 'exitosa' : 'pendiente',
      editado_manualmente: false,
      fuente_principal: 'terreno',
      identificacion_valida: !!base,
      perfil_maestro: perfil,
      comentarios_concatenados: obs,
      motivo_error: ''
    };
  }

  public processAll(movilidadData: any[], terrenoData: any[], start?: string, end?: string): RegistroNormalizado[] {
    const results: RegistroNormalizado[] = [];
    
    const processRegistry = (registro: RegistroNormalizado) => {
      if (!registro) return;
      if ((start || end) && registro.fecha_gestion) {
        if (start && registro.fecha_gestion < start) return;
        if (end && registro.fecha_gestion > end) return;
      }
      results.push(registro);
    };

    if (movilidadData) movilidadData.forEach(row => processRegistry(this.homologateMovilidad(row)));
    if (terrenoData) terrenoData.forEach(row => processRegistry(this.homologateTerreno(row)));

    return results;
  }

  public createExportData(resultados: RegistroNormalizado[]): any[] {
    return resultados.map(r => ({
      'gestion': this.safeString(r.causal).toUpperCase(),
      'usuario': 'jairo.quintero132',
      'fechagestion': r.fecha_gestion,
      'accion': 'VISITA',
      'perfil': this.safeString(r.perfil_maestro).toUpperCase(),
      'motivonopago': this.safeString(r.motivo_no_pago_consolidado).toUpperCase(),
      'numeromarcado': r.telefono_maestro || '',
      'identificacion': r.cedula_maestra || '',
      'cuenta': r.producto || '',
      'valorprome': '', 'fechaprome': '', 'cuota': ''
    }));
  }
}
