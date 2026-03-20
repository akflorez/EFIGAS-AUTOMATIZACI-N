import type { 
  RegistroNormalizado, 
  BaseGeneralRaw
} from '../types';

export class ProcessingEngine {
  private baseGeneral: Map<string, BaseGeneralRaw> = new Map();
  private movCausalToPerfilMap: Map<string, string> = new Map();
  private terMotivoToPerfilMap: Map<string, string> = new Map();
  private terMotivoToCVSMap: Map<string, string> = new Map();
  
  constructor() {
  }

  private getFieldValue(row: any, searchTerms: string[]): any {
    if (!row) return undefined;
    const keys = Object.keys(row);
    const foundKey = keys.find(k => {
      const cleanK = k.toLowerCase().replace(/\s/g, '').trim();
      return searchTerms.some(term => {
        const cleanTerm = term.toLowerCase().replace(/\s/g, '').trim();
        return cleanK === cleanTerm || cleanK.includes(cleanTerm);
      });
    });
    return foundKey ? row[foundKey] : undefined;
  }

  public async indexBaseGeneral(data: BaseGeneralRaw[], onProgress: (p: number) => void) {
    if (!data || !Array.isArray(data)) { onProgress(100); return; }
    const total = data.length;
    if (total === 0) { onProgress(100); return; }
    
    const chunkSize = 10000;
    for (let i = 0; i < total; i += chunkSize) {
      const end = Math.min(i + chunkSize, total);
      for (let j = i; j < end; j++) {
        const row = data[j];
        if (!row) continue;
        const key = (this.getFieldValue(row, ["PRODUCTO", "CUENTA"]) || '').toString().trim();
        if (key) this.baseGeneral.set(key, row);
      }
      onProgress(Math.floor((i / total) * 100));
      await new Promise(r => setTimeout(r, 0));
    }
    onProgress(100);
  }

  public indexMasters(maestroData: any[]) {
    this.movCausalToPerfilMap.clear();
    this.terMotivoToPerfilMap.clear();
    this.terMotivoToCVSMap.clear();

    maestroData.forEach(row => {
      const per = (this.getFieldValue(row, ['MEJOR PERFIL EN CVS', 'MEJOR PERFIL']) || '').toString().toUpperCase().trim();
      const mot = (this.getFieldValue(row, ['MOTIVO DE NO PAGO CVS']) || '').toString().toUpperCase().trim();

      // Recolectar TODAS las celdas de esta fila para buscar códigos y textos
      const allVals = Object.values(row).map(v => v?.toString() || "");
      
      allVals.forEach(raw => {
        const code = this.extractCode(raw);
        const text = this.normalizeText(raw.replace(code, ''));
        
        if (code) {
          if (per) this.movCausalToPerfilMap.set(code, per);
          if (mot) this.terMotivoToCVSMap.set(code, mot);
        }
        
        if (text) {
          if (per) this.movCausalToPerfilMap.set(text, per);
          if (mot) this.terMotivoToCVSMap.set(text, mot);
        }
      });
    });
  }


  public consolidateMovilidadComments(row: any): string {
    const commentFields = Object.keys(row).filter(k => {
      const sk = k.toLowerCase();
      // Solo campos que digan "comentario" y NUNCA "observacion"
      return sk.includes('comentario') && !sk.includes('observacion') && !sk.includes('observación');
    });
    const comments: string[] = [];
    for (const field of commentFields) {
      const val = row[field]?.toString().trim();
      if (val && val !== 'null' && val !== 'undefined' && val !== '0' && val !== '-' && val.length > 0) {
        // Quitar códigos del frente (ej: "892-Direccion" -> "Direccion")
        const cleanVal = val.replace(/^\d+[- ]+/, '');
        comments.push(cleanVal);
      }
    }
    return comments.join(', ').toUpperCase();
  }

  private formatDate(val: any): string {
    if (!val) return '';
    let date: Date | null = null;
    
    if (val instanceof Date) {
      date = val;
    } else {
      const dStr = val.toString().trim();
      if (!dStr || dStr === '-' || dStr === '0' || dStr.toLowerCase() === 'null') return '';
      
      const numVal = Number(dStr);
      if (!isNaN(numVal) && numVal > 40000 && numVal < 60000) {
        date = new Date(Math.round((numVal - 25569) * 86400 * 1000));
      } else {
        // Remover horas, minutos, segundos si existen (ej: 10/03/2026 14:30)
        const dateOnly = dStr.split(/\s+/)[0];
        
        // Regex para DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
        const dmyRegex = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/;
        // Regex para YYYY/MM/DD o YYYY-MM-DD
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
          } else {
            date = new Date(dStr);
          }
        }
      }
    }
    
    if (!date || isNaN(date.getTime())) {
      const str = val.toString();
      const numbers = str.match(/\d+/g);
      if (numbers && numbers.length >= 3) {
        let d, m, y;
        if (numbers[0].length === 4) { [y, m, d] = (numbers as any); }
        else { [d, m, y] = (numbers as any); if (y.length === 2) y = "20" + y; }
        date = new Date(Number(y), Number(m) - 1, Number(d));
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
    return str.toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ñ/g, "n")
      .replace(/Ñ/g, "N")
      .toUpperCase()
      .trim();
  }

  private normalizeText(s: string): string {
    if (!s) return "";
    return s.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
  }

  private extractCode(causal: string): string {
    if (!causal) return '';
    const s = causal.toString().trim();
    // Buscar cualquier secuencia de 3 a 5 números
    const match = s.match(/(\d{3,5})/);
    return match ? match[1] : '';
  }

  private extractDateFromRow(row: any): string | null {
    const keys = Object.keys(row);
    // Priorizamos la columna exacta si existe
    const priorityKey = keys.find(k => {
      const lk = k.toLowerCase();
      return lk === 'fecha completada' || lk === 'fecha_gestion' || lk === 'fecha de gestion' || lk.includes('completación');
    });
    if (priorityKey && row[priorityKey] && row[priorityKey] !== '-') return this.formatDate(row[priorityKey]);

    // Ignorar columnas irrelevantes que contienen "fecha"
    const relevantKeys = keys.filter(k => {
      const lk = k.toLowerCase();
      const isHistorical = lk.includes('penultima') || lk.includes('nacimiento') || lk.includes('creacion') || lk.includes('vencimiento');
      return (lk.includes('fecha') || lk.includes('time') || lk.includes('gestion') || lk.includes('compromiso')) && !isHistorical;
    });

    // Si hay múltiples, buscar la que tenga un valor válido de fecha de este año o el pasado
    for (const k of relevantKeys) {
      const d = this.formatDate(row[k]);
      if (d && (d.startsWith('2025') || d.startsWith('2026'))) return d;
    }

    const dateKey = relevantKeys.find(k => k.toLowerCase().includes('gestion') || k.toLowerCase().includes('completada')) 
                  || relevantKeys[0];
                  
    return dateKey ? this.formatDate(row[dateKey]) : null;
  }

  private homologateMovilidad(row: any): RegistroNormalizado {
    const product = (this.getFieldValue(row, ["Producto", "CUENTA"]) || '').toString().trim();
    const base = this.baseGeneral.get(product);
    const comments = this.consolidateMovilidadComments(row);
    const causalRaw = (this.getFieldValue(row, ["Causal"]) || '').toString().trim();
    const observacion = (this.getFieldValue(row, ["Observación", "Observacion"]) || '').toString().trim();
    
    const idCausal = this.extractCode(causalRaw);
    const causalLabel = causalRaw.replace(idCausal, '').replace(/^[- ]+/, '').trim().toUpperCase();
    const normText = this.normalizeText(causalRaw.replace(idCausal, ''));
    
    // Perfil Movilidad: Según audio, es el campo de causal (usamos el label limpio)
    // Intentamos buscarlo en el maestro para el "Mejor Perfil", si no, el label de la causal
    let perfil = this.movCausalToPerfilMap.get(idCausal) || this.movCausalToPerfilMap.get(normText) || causalLabel || 'REVISIÓN MANUAL';
    
    // Motivo de No Pago: CONCAT(Tipo Comentarios) + Código (v46 audio)
    const motivoNP = `${comments} ${idCausal}`.trim().toUpperCase();

    return {
      id_sistema: `MOV-${product}-${Date.now()}`,
      contrato: (this.getFieldValue(base, ["CONTRATO"]) || '').toString(),
      producto: product,
      cliente: (this.getFieldValue(base, ["NOMBRE"]) || '').toString(),
      direccion: (this.getFieldValue(base, ["DIRECCION"]) || '').toString(),
      causal: observacion.toUpperCase(), // Gestión = Observación pura
      codigo_causal: idCausal,
      tipo_comentario: '',
      codigo_tipo_comentario: '',
      motivo_no_pago_original: comments,
      motivo_no_pago_consolidado: motivoNP,
      fecha_gestion: this.extractDateFromRow(row) || '',
      estado_cruce: 'automatico',
      estado_homologacion: this.movCausalToPerfilMap.has(idCausal) || this.movCausalToPerfilMap.has(normText) ? 'exitosa' : 'pendiente',
      editado_manualmente: false,
      fuente_principal: 'movilidad',
      identificacion_valida: !!base,
      perfil_maestro: perfil,
      cedula_maestra: (this.getFieldValue(base, ["CEDULA"]) || '').toString(),
      telefono_maestro: (this.getFieldValue(row, ["celular personal", "celular_personal", "numeromarcado", "telefono"]) || '').toString(),
      comentarios_concatenados: comments
    };
  }

  private homologateTerreno(row: any): RegistroNormalizado {
    const product = (this.getFieldValue(row, ["PRODUCTO", "CUENTA"]) || '').toString().trim();
    const base = this.baseGeneral.get(product);
    const motivoNP = (this.getFieldValue(row, ["MOTIVO DE NO PAGO ", "MOTIVO DE NO PAGO", "Motivo"]) || '').toString().trim();
    const observacion = (this.getFieldValue(row, ["OBSERVACIONES", "Observacion", "Observación"]) || '').toString().trim();

    const codeM = this.extractCode(motivoNP);
    const normM = this.normalizeText(motivoNP.replace(codeM, ''));

    // Perfil Terreno: SÍ cruzado con el maestro (Trae MEJOR PERFIL EN CVS)
    let perfil = this.movCausalToPerfilMap.get(codeM) || this.movCausalToPerfilMap.get(normM) || 'REVISIÓN MANUAL';
    
    // Motivo Terreno: Si existe en el maestro (MOTIVO PAGO CVS), lo usamos. Si no, literal.
    let motivoCVS = this.terMotivoToCVSMap.get(codeM) || this.terMotivoToCVSMap.get(normM) || motivoNP.toUpperCase();

    return {
      id_sistema: `TER-${product}-${Date.now()}`,
      contrato: (this.getFieldValue(base, ["CONTRATO"]) || this.getFieldValue(row, ["CONTRATO"]) || '').toString(),
      producto: product,
      cliente: (this.getFieldValue(base, ["NOMBRE"]) || '').toString(),
      direccion: (this.getFieldValue(base, ["DIRECCION"]) || '').toString(),
      causal: observacion.toUpperCase(), // Gestión = Observación pura
      codigo_causal: codeM,
      tipo_comentario: '',
      codigo_tipo_comentario: '',
      motivo_no_pago_original: motivoNP,
      motivo_no_pago_consolidado: motivoCVS,
      fecha_gestion: this.extractDateFromRow(row) || '',
      estado_cruce: 'automatico',
      estado_homologacion: this.terMotivoToCVSMap.has(codeM) || this.terMotivoToCVSMap.has(normM) ? 'exitosa' : 'pendiente',
      editado_manualmente: false,
      fuente_principal: 'terreno',
      identificacion_valida: !!base,
      perfil_maestro: perfil,
      cedula_maestra: (this.getFieldValue(base, ["CEDULA"]) || '').toString(),
      telefono_maestro: (this.getFieldValue(row, ["TELEFONO NUEVO", "telefono"]) || '').toString(),
      comentarios_concatenados: observacion
    };
  }

  public processAll(movilidadData: any[], terrenoData: any[], start?: string, end?: string): RegistroNormalizado[] {
    const results: RegistroNormalizado[] = [];
    
    movilidadData.forEach(row => {
      const comments = this.consolidateMovilidadComments(row);
      if (!comments) return;
      const dateStr = this.extractDateFromRow(row);
      if (start && dateStr && dateStr < start) return;
      if (end && dateStr && dateStr > end) return;
      results.push(this.homologateMovilidad(row));
    });

    terrenoData.forEach(row => {
      const dateStr = this.extractDateFromRow(row);
      if (start && dateStr && dateStr < start) return;
      if (end && dateStr && dateStr > end) return;
      results.push(this.homologateTerreno(row));
    });

    return results;
  }

  public createExportData(resultados: RegistroNormalizado[]): any[] {
    return resultados.map(r => ({
      'gestion': this.removeAccents(r.causal || ''), // Gestión = Observación pura
      'usuario': 'jairo.quintero132',
      'fechagestion': r.fecha_gestion,
      'accion': 'VISITA',
      'perfil': this.removeAccents(r.perfil_maestro || ''),
      'motivonopago': this.removeAccents(r.motivo_no_pago_consolidado || ''), // Motivo = Concatenación/Código
      'numeromarcado': r.telefono_maestro || '',
      'identificacion': r.cedula_maestra || '',
      'cuenta': r.producto || '',
      'valorprome': '',
      'fechaprome': '',
      'cuota': ''
    }));
  }
}
