import type { 
  RegistroNormalizado, 
  BaseGeneralRaw
} from '../types';

export class ProcessingEngine {
  private baseGeneral: Map<string, BaseGeneralRaw> = new Map();
  private movCausalToPerfilMap: Map<string, string> = new Map();
  private terMotivoToCVSMap: Map<string, string> = new Map();
  private terMotivoToCodeMap: Map<string, string> = new Map();
  private colIndexCedula: number = 14;   
  private colIndexNombre: number = 2;    
  private colIndexDireccion: number = 5; 
  private colIndexContrato: number = 1;  
  
  constructor() {
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
    for (const term of searchTerms) {
      const cleanTerm = this.normalizeText(term).replace(/\s+/g, '');
      if (cleanTerm.length < 3) continue; 
      const foundKey = keys.find(k => {
        const ck = this.normalizeText(k).replace(/\s+/g, '');
        return ck.includes(cleanTerm) || cleanTerm.includes(ck);
      });
      if (foundKey) return row[foundKey];
    }
    return undefined;
  }

  public async indexBaseGeneral(data: BaseGeneralRaw[], onProgress: (p: number) => void) {
    const total = data.length;
    if (total === 0) { onProgress(100); return; }
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i];
      if (!row || !Array.isArray(row)) continue;
      const rowStr = row.map(v => this.normalizeText(v?.toString() || ""));
      if (rowStr.includes('producto') || rowStr.includes('contrato') || rowStr.includes('nombre')) {
        headerRowIndex = i;
        rowStr.forEach((val, idx) => {
          if (val === 'cedula' || val === 'identificacion' || val === 'documento') this.colIndexCedula = idx;
          if (val === 'nombre' || val === 'cliente') this.colIndexNombre = idx;
          if (val === 'direccion' || val === 'domicilio') this.colIndexDireccion = idx;
          if (val === 'contrato') this.colIndexContrato = idx;
        });
        break;
      }
    }

    const chunkSize = 10000;
    for (let i = 0; i < total; i += chunkSize) {
      const end = Math.min(i + chunkSize, total);
      for (let j = i; j < end; j++) {
        const row = data[j];
        if (!row || j <= headerRowIndex) continue;
        let key = '';
        if (headerRowIndex !== -1) {
          const headerRow = data[headerRowIndex];
          const prodIdx = (headerRow as any).findIndex((h: any) => {
             const nh = this.normalizeText(h?.toString() || "");
             return nh === 'producto' || nh === 'cuenta';
          });
          if (prodIdx !== -1) key = (row[prodIdx] || '').toString().trim();
          else key = (row[1] || '').toString().trim();
        } else {
          key = (row[1] || '').toString().trim();
        }
        if (key) this.baseGeneral.set(key.replace(/\.0$/, ''), row);
      }
      onProgress(Math.floor((i / total) * 100));
      await new Promise(r => setTimeout(r, 0));
    }
    onProgress(100);
  }

  public indexMasters(maestroData: any[]) {
    maestroData.forEach(row => {
      const original = (this.getFieldValue(row, ["MOTIVO DE NO PAGO CVS", "MOTIVO"]) || "").toString().trim();
      const mejorPerfil = (this.getFieldValue(row, ["MEJOR PERFIL EN CVS", "PERFIL"]) || "").toString().trim();
      const code = this.extractCode(original);
      if (original) {
        if (mejorPerfil) {
          this.terMotivoToCVSMap.set(original.toUpperCase(), original.toUpperCase()); 
          const fullNorm = this.normalizeText(original);
          this.terMotivoToCVSMap.set(fullNorm, original.toUpperCase());
          if (code) {
             this.movCausalToPerfilMap.set(code, mejorPerfil.toUpperCase());
             this.terMotivoToCVSMap.set(code, original.toUpperCase());
             this.terMotivoToCodeMap.set(fullNorm, code);
          }
        }
      }
    });
  }

  public consolidateMovilidadComments(row: any): string {
    const commentFields = Object.keys(row).filter(k => {
      const sk = k.toLowerCase();
      // Buscamos cualquier campo que pueda tener gestión
      return (sk.includes('comentario') || sk.includes('gestion') || sk.includes('detalle') || sk.includes('observaci') || sk.includes('resultado') || sk.includes('estado') || sk.includes('accion')) 
             && !sk.includes('fecha') && !sk.includes('hora');
    });
    const comments: string[] = [];
    for (const field of commentFields) {
      const val = row[field]?.toString().trim();
      if (val && val !== 'null' && val !== 'undefined' && val !== '0' && val !== '-') {
        const cleanVal = val.replace(/^\d+[- ]+/, '');
        comments.push(cleanVal);
      }
    }
    return comments.join(', ').toUpperCase();
  }

  private formatDate(val: any): string {
    if (!val) return '';
    let date: Date | null = null;
    if (val instanceof Date) { date = val; } 
    else {
      const dStr = val.toString().trim();
      if (!dStr || dStr === '-' || dStr === '0' || dStr.toLowerCase() === 'null') return '';
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
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private removeAccents(str: string): string {
    if (!str) return '';
    return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n").replace(/Ñ/g, "N").toUpperCase().trim();
  }

  private normalizeText(s: string): string {
    if (!s) return "";
    return s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractCode(causal: string): string {
    if (!causal) return '';
    const match = causal.toString().trim().match(/(\d{3,5})/);
    return match ? match[1] : '';
  }

  private extractDateFromRow(row: any): string | null {
    const keys = Object.keys(row);
    const priorityKey = keys.find(k => {
      const lk = this.normalizeText(k);
      return (lk.includes('fecha') && (lk.includes('gestion') || lk.includes('completada') || lk.includes('fin'))) 
             || lk === 'fechagestion' || lk === 'fecha';
    });
    if (priorityKey && row[priorityKey]) {
       const d = this.formatDate(row[priorityKey]);
       if (d) return d;
    }
    const dateKeys = keys.filter(k => {
      const lk = this.normalizeText(k);
      return (lk.includes('fecha') || lk.includes('time')) 
             && !lk.includes('nacimiento') && !lk.includes('creacion');
    });
    for (const k of dateKeys) {
      const d = this.formatDate(row[k]);
      if (d && (d.startsWith('2025') || d.startsWith('2026'))) return d;
    }
    return null;
  }

  private homologateMovilidad(row: any): RegistroNormalizado {
    const product = (this.getFieldValue(row, ["Producto", "CUENTA", "SUSCRIPTOR", "CONTRATO"]) || '').toString().trim().replace(/\.0$/, '');
    const base = this.baseGeneral.get(product);
    const date = this.extractDateFromRow(row) || '';
    const comments = this.consolidateMovilidadComments(row);
    let causalRaw = (this.getFieldValue(row, ["Causal", "Motivo", "ESTADO", "OBSERVACION", "RESULTADO"]) || '').toString().trim();
    causalRaw = causalRaw.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
    const idCausal = this.extractCode(causalRaw);
    const cleanLabel = causalRaw.replace(idCausal, '').replace(/^[-\s]+/, '').trim().toUpperCase();
    let perfil = (cleanLabel || '').toString().replace(/\d+/g, '').replace(/^[-\s]+/, '').trim().toUpperCase() || 'REVISIÓN MANUAL';
    const mappedMotDescription = this.terMotivoToCVSMap.get(idCausal) || this.terMotivoToCVSMap.get(this.normalizeText(causalRaw));
    const motivoNP = (mappedMotDescription || `${cleanLabel} ${idCausal}`).trim().toUpperCase();

    return {
      id_sistema: `MOV-${product}-${date || Date.now()}`,
      contrato: (base ? base[this.colIndexContrato] : '').toString(),
      producto: product,
      cliente: (base ? base[this.colIndexNombre] : '').toString(),
      direccion: (base ? base[this.colIndexDireccion] : '').toString(),
      causal: comments || cleanLabel,
      codigo_causal: idCausal,
      tipo_comentario: '',
      codigo_tipo_comentario: '',
      motivo_no_pago_original: causalRaw || comments || '',
      motivo_no_pago_consolidado: motivoNP,
      fecha_gestion: date,
      estado_cruce: 'automatico',
      estado_homologacion: perfil && perfil !== 'REVISIÓN MANUAL' ? 'exitosa' : 'pendiente',
      editado_manualmente: false,
      fuente_principal: 'movilidad',
      identificacion_valida: !!base,
      perfil_maestro: perfil,
      cedula_maestra: (base ? base[this.colIndexCedula] : '').toString(),
      telefono_maestro: (this.getFieldValue(row, ["celular", "telefono"]) || '').toString(),
      comentarios_concatenados: comments,
      motivo_error: ''
    };
  }

  private homologateTerreno(row: any): RegistroNormalizado {
    const product = (this.getFieldValue(row, ["PRODUCTO", "CUENTA", "SUSCRIPTOR", "CONTRATO"]) || '').toString().trim().replace(/\.0$/, '');
    const base = this.baseGeneral.get(product);
    const date = this.extractDateFromRow(row) || '';
    let motivoNP = (this.getFieldValue(row, ["MOTIVO DE NO PAGO ", "MOTIVO", "PROCESO", "ESTADO"]) || '').toString().trim();
    motivoNP = motivoNP.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
    const codeM = this.extractCode(motivoNP);
    let perfil = this.movCausalToPerfilMap.get(codeM) || this.movCausalToPerfilMap.get(this.normalizeText(motivoNP));
    perfil = (perfil || '').toString().replace(/\d+/g, '').replace(/^[-\s]+/, '').trim().toUpperCase() || 'REVISIÓN MANUAL';
    const mappedMotDescription = this.terMotivoToCVSMap.get(codeM) || this.terMotivoToCVSMap.get(this.normalizeText(motivoNP));
    const cleanLabel = motivoNP.replace(codeM, '').replace(/^[-\s]+/, '').trim().toUpperCase();
    const motivoCVS = (mappedMotDescription || `${cleanLabel} ${codeM}`).trim().toUpperCase();
    const obs = (this.getFieldValue(row, ["OBSERVACIONES DE CAMPO", "OBSERVACIONES", "OBSERVACION", "DETALLE"]) || '').toString().toUpperCase();

    return {
      id_sistema: `TER-${product}-${date || Date.now()}`,
      contrato: (base ? base[this.colIndexContrato] : '').toString(),
      producto: product,
      cliente: (base ? base[this.colIndexNombre] : '').toString(),
      direccion: (base ? base[this.colIndexDireccion] : '').toString(),
      cedula_maestra: (base ? base[this.colIndexCedula] : '').toString(),
      telefono_maestro: (this.getFieldValue(row, ["celular", "telefono"]) || '').toString(),
      causal: obs || cleanLabel,
      codigo_causal: codeM,
      tipo_comentario: '',
      codigo_tipo_comentario: '',
      motivo_no_pago_original: motivoNP,
      motivo_no_pago_consolidado: motivoCVS,
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
    
    // Filtro Universal: Si tiene Producto y ALGO en cualquier columna que parezca gestión, se incluye.
    movilidadData.forEach(row => {
      if (!row) return;
      const product = (this.getFieldValue(row, ["Producto", "CUENTA", "SUSCRIPTOR", "CONTRATO"]) || '').toString().trim().replace(/\.0$/, '');
      if (!product || product === '0') return;

      const date = this.extractDateFromRow(row);
      if (start && date && date < start) return;
      if (end && date && date > end) return;
      
      const registro = this.homologateMovilidad(row);
      // Incluir solo si tiene alguna gestión o motivo real
      if (registro.motivo_no_pago_original || registro.causal) {
         results.push(registro);
      }
    });

    terrenoData.forEach(row => {
      if (!row) return;
      const product = (this.getFieldValue(row, ["PRODUCTO", "CUENTA", "SUSCRIPTOR", "CONTRATO"]) || '').toString().trim().replace(/\.0$/, '');
      if (!product || product === '0') return;

      const date = this.extractDateFromRow(row);
      if (start && date && date < start) return;
      if (end && date && date > end) return;
      
      const registro = this.homologateTerreno(row);
      if (registro.motivo_no_pago_original || registro.causal) {
         results.push(registro);
      }
    });

    return results;
  }

  public createExportData(resultados: RegistroNormalizado[]): any[] {
    return resultados.map(r => ({
      'gestion': this.removeAccents(r.causal || ''),
      'usuario': 'jairo.quintero132',
      'fechagestion': r.fecha_gestion,
      'accion': 'VISITA',
      'perfil': this.removeAccents(r.perfil_maestro || ''),
      'motivonopago': this.removeAccents(r.motivo_no_pago_consolidado || ''),
      'numeromarcado': r.telefono_maestro || '',
      'identificacion': r.cedula_maestra || '',
      'cuenta': r.producto || '',
      'valorprome': '',
      'fechaprome': '',
      'cuota': ''
    }));
  }
}
