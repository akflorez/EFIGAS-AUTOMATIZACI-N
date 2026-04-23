import type { 
  RegistroNormalizado, 
  BaseGeneralRaw
} from '../types';

export class ProcessingEngine {
  private baseGeneral: Map<string, BaseGeneralRaw> = new Map();
  private movCausalToPerfilMap: Map<string, string> = new Map();
  private terMotivoToPerfilMap: Map<string, string> = new Map();
  private terMotivoToCVSMap: Map<string, string> = new Map();
  private terMotivoToCodeMap: Map<string, string> = new Map();
  private colIndexCedula: number = 14;   // Default O (14)
  private colIndexNombre: number = 2;    // Default C (2)
  private colIndexDireccion: number = 5; // Default F (5)
  private colIndexContrato: number = 1;  // Default B (1)
  
  constructor() {
  }

  private getFieldValue(row: any, searchTerms: string[]): any {
    if (!row) return undefined;
    const keys = Object.keys(row);
    
    // Primero, buscar coincidencias EXACTAS (normalizadas) respetando la prioridad de searchTerms
    for (const term of searchTerms) {
      const cleanTerm = this.normalizeText(term).replace(/\s+/g, '');
      const foundKey = keys.find(k => {
        const ck = this.normalizeText(k).replace(/\s+/g, '');
        return ck === cleanTerm;
      });
      if (foundKey) return row[foundKey];
    }
    
    // Segundo, buscar si ALGUNA llave o encabezado CONTIENE el término (Fuzzy matching por inclusión)
    for (const term of searchTerms) {
      const cleanTerm = this.normalizeText(term).replace(/\s+/g, '');
      if (cleanTerm.length < 4) continue; 
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
    
    // 1. Detect Header and Map Column Indexes
    let headerRowIndex = -1;
    // Buscamos en las primeras 10 filas el encabezado
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i];
      if (!row || !Array.isArray(row)) continue;
      
      const rowStr = row.map(v => this.normalizeText(v?.toString() || ""));
      if (rowStr.includes('producto') || rowStr.includes('contrato') || rowStr.includes('nombre')) {
        headerRowIndex = i;
        
        // Mapear índices dinámicamente
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
          // Buscamos el producto/cuenta según el header detectado
          const headerRow = data[headerRowIndex];
          const prodIdx = (headerRow as any).findIndex((h: any) => {
             const nh = this.normalizeText(h?.toString() || "");
             return nh === 'producto' || nh === 'cuenta';
          });
          if (prodIdx !== -1) key = (row[prodIdx] || '').toString().trim();
          else key = (row[1] || '').toString().trim(); // Fallback a B
        } else {
          key = (row[1] || '').toString().trim(); // Default B
        }

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
    this.terMotivoToCodeMap.clear();

    if (!maestroData || maestroData.length === 0) return;

    maestroData.forEach(row => {
      // 1. Identificar columnas dinámicamente por contenido si los nombres fallan
      const keys = Object.keys(row);
      let causalLabel = this.getFieldValue(row, ['CAUSAL', 'MOTIVO', 'DESCRIPCION', 'CAUSAL GESTION', 'CAUSAL DE GESTIÓN']);
      let perVal = this.getFieldValue(row, ['MEJOR PERFIL EN CVS', 'PERFIL CVS', 'PERFIL', 'MEJOR PERFIL']);
      let motVal = this.getFieldValue(row, ['MOTIVO DE NO PAGO CVS', 'MOTIVO CVS', 'MOTIVO_NO_PAGO_CVS', 'MOTIVO DE NO PAGO']);

      // Heurística de respaldo: Escaneo de todas las celdas
      for (const k of keys) {
        const nk = k.toUpperCase();
        const val = (row[k] || '').toString();
        if (!causalLabel && (nk.includes('CAUSAL') || nk.includes('CONV'))) causalLabel = val;
        if (!perVal && nk.includes('PERFIL')) perVal = val;
        if (!motVal && (nk.includes('MOTIVO') && nk.includes('CVS'))) motVal = val;
      }

      if (causalLabel || motVal) {
        const per = (perVal || '').toString().trim().toUpperCase();
        const mot = (motVal || '').toString().trim().toUpperCase();
        
        // Indexar por Código de Causal
        const codeC = this.extractCode(causalLabel?.toString() || '');
        if (codeC && per) this.movCausalToPerfilMap.set(codeC, per);
        if (codeC && mot) this.terMotivoToCVSMap.set(codeC, mot);

        // Indexar por Texto de Causal Normalizada
        const normC = this.normalizeText(causalLabel?.toString() || '');
        if (normC && per) {
           if (!this.movCausalToPerfilMap.has(normC)) this.movCausalToPerfilMap.set(normC, per);
        }

        // Indexar por el MOTIVO CVS (CRUCIAL PARA TERRENO)
        // Ejemplo: "NEGOCIACION EN CAMPO 1478" -> "PROMESA DE PAGO"
        if (mot) {
          const normM = this.normalizeText(mot);
          const codeM = this.extractCode(mot);
          if (normM && per) this.movCausalToPerfilMap.set(normM, per);
          if (codeM && per) this.movCausalToPerfilMap.set(codeM, per); // Por si solo viene el número 1478
          if (normM && mot) this.terMotivoToCVSMap.set(normM, mot);
        }
      }
    });
  }


  public consolidateMovilidadComments(row: any): string {
    const commentFields = Object.keys(row).filter(k => {
      const sk = k.toLowerCase();
      return (sk.includes('comentario') || sk.includes('gestion') || sk.includes('detalle') || sk.includes('observaci')) 
             && !sk.includes('fecha') && !sk.includes('hora');
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
      const lk = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return lk === 'fecha completada' || lk === 'fecha_gestion' || lk === 'fecha de gestion' || lk.includes('completacio') || lk === 'fecha';
    });
    if (priorityKey && row[priorityKey] && row[priorityKey] !== '-') return this.formatDate(row[priorityKey]);

    const relevantKeys = keys.filter(k => {
      const lk = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const isHistorical = lk.includes('penultima') || lk.includes('nacimiento') || lk.includes('creacion') || lk.includes('vencimiento');
      return (lk.includes('fecha') || lk.includes('time') || lk.includes('gestion') || lk.includes('complet')) && !isHistorical;
    });

    for (const k of relevantKeys) {
      const d = this.formatDate(row[k]);
      if (d && (d.startsWith('2025') || d.startsWith('2026'))) return d;
    }
    
    return null;
  }

  private homologateMovilidad(row: any): RegistroNormalizado {
    const baseRow = {
      producto: (this.getFieldValue(row, ["Producto", "CUENTA", "CUENTA_CONTRATO"]) || '').toString().trim(),
      fecha: this.extractDateFromRow(row) || '',
      observacion: (this.getFieldValue(row, ["Observación", "Observacion", "OBSERVACIÓN", "OBSERVACION", "DETALLE", "COMENTARIO", "GESTIÓN"]) || '').toString().trim(),
    };
    
    const product = baseRow.producto;
    const base = this.baseGeneral.get(product);
    const comments = this.consolidateMovilidadComments(row);
    let causalRaw = (this.getFieldValue(row, ["Causal", "Causales", "Motivo", "Motivos", "Causal no pago", "Motivo no pago", "Comentario", "Comentarios", "COMENTARIO MASIVO", "COMENTARIOS MASIVOS", "Gestión", "Gestion", "Observacion", "Observación", "Observaciones", "RESULTADO", "DETALLE"]) || '').toString().trim();
    causalRaw = causalRaw.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
    
    const idCausal = this.extractCode(causalRaw);
    const normText = this.normalizeText(causalRaw.replace(idCausal, ''));
    const fullNorm = this.normalizeText(causalRaw);
    const cleanLabel = causalRaw.replace(idCausal, '').replace(/^[-\s]+/, '').trim().toUpperCase();
    
    // Perfil Movilidad: Tomar DIRECTAMENTE de la causal (sin cruce con maestro) y QUITAR CÓDIGOS
    let perfil = (cleanLabel || '').toString().replace(/\d+/g, '').replace(/^[-\s]+/, '').trim().toUpperCase() || 'REVISIÓN MANUAL';
    
    // Motivo de No Pago: BUSCARV con triple chequeo (Código, Full, Texto)
    const mappedMotDescription = this.terMotivoToCVSMap.get(idCausal) || this.terMotivoToCVSMap.get(fullNorm) || this.terMotivoToCVSMap.get(normText);
    const mappedMotCode = idCausal || this.terMotivoToCodeMap.get(fullNorm) || this.terMotivoToCodeMap.get(normText) || '';
    
    // Si lo encontró en el maestro, usamos esa descripción oficial.
    const motivoNP = (mappedMotDescription || `${cleanLabel} ${mappedMotCode}`).trim().toUpperCase();

    let error = '';
    if (!product) error = 'Producto/Cuenta vacío en archivo. ';
    if (!base) error += 'Producto no existe en Base General. ';
    if (perfil === 'REVISIÓN MANUAL') error += 'Causal no mapeada. ';

    return {
      id_sistema: `MOV-${product}-${Date.now()}`,
      contrato: (base ? base[this.colIndexContrato] : '').toString(),
      producto: product,
      cliente: (base ? base[this.colIndexNombre] : '').toString(),
      direccion: (base ? base[this.colIndexDireccion] : '').toString(),
      causal: baseRow.observacion.toUpperCase() || cleanLabel, 
      codigo_causal: mappedMotCode,
      tipo_comentario: '',
      codigo_tipo_comentario: '',
      motivo_no_pago_original: causalRaw || comments || '',
      motivo_no_pago_consolidado: motivoNP,
      fecha_gestion: baseRow.fecha,
      estado_cruce: 'automatico',
      estado_homologacion: perfil && perfil !== 'REVISIÓN MANUAL' ? 'exitosa' : 'pendiente',
      editado_manualmente: false,
      fuente_principal: 'movilidad',
      identificacion_valida: !!base,
      perfil_maestro: perfil,
      cedula_maestra: (base ? base[this.colIndexCedula] : '').toString(),
      telefono_maestro: (this.getFieldValue(row, ["celular de la persona que atendió", "Celular de persona que atendió", "celular", "telefono"]) || '').toString(),
      comentarios_concatenados: comments,
      motivo_error: error.trim()
    };
  }

  private homologateTerreno(row: any): RegistroNormalizado {
    const baseRow = {
      producto: (this.getFieldValue(row, ["PRODUCTO", "CUENTA", "SUSCRIPTOR"]) || '').toString().trim(),
      fecha: this.extractDateFromRow(row) || '',
      observacion: (this.getFieldValue(row, ["OBSERVACIONES DE CAMPO", "OBSERVACIONES", "OBSERVACION", "OBSERVACIÓN", "COMENTARIO", "GESTIÓN"]) || '').toString().trim(),
    };
    
    const product = baseRow.producto;
    const base = this.baseGeneral.get(product);
    let motivoNP = (this.getFieldValue(row, ["MOTIVO DE NO PAGO ", "MOTIVO DE NO PAGO", "Motivo", "Causal", "Gestión", "RESULTADO"]) || '').toString().trim();
    motivoNP = motivoNP.replace(/No Contesta - Numero Activo 1474/g, 'No Contesta - Numero Activo 1473');
    
    const codeM = this.extractCode(motivoNP);
    const normM = this.normalizeText(motivoNP.replace(codeM, ''));
    const fullNormM = this.normalizeText(motivoNP);

    // Perfil Terreno: CRUCE OBLIGATORIO con Maestro
    // Aquí buscamos por: Código, Texto Completo o Texto Normalizado del Motivo
    let perfil = this.movCausalToPerfilMap.get(codeM) || this.movCausalToPerfilMap.get(fullNormM) || this.movCausalToPerfilMap.get(normM);
    perfil = (perfil || '').toString().replace(/\d+/g, '').replace(/^[-\s]+/, '').trim().toUpperCase() || 'REVISIÓN MANUAL';
    
    // Motivo Terreno: BUSCARV oficial hacia "MOTIVO DE NO PAGO CVS"
    const mappedMotDescription = this.terMotivoToCVSMap.get(codeM) || this.terMotivoToCVSMap.get(fullNormM) || this.terMotivoToCVSMap.get(normM);
    const mappedMotCode = codeM || this.terMotivoToCodeMap.get(fullNormM) || this.terMotivoToCodeMap.get(normM) || '';
    const cleanLabel = motivoNP.replace(codeM, '').replace(/^[-\s]+/, '').trim().toUpperCase();
    
    const motivoCVS = (mappedMotDescription || `${cleanLabel} ${mappedMotCode}`).trim().toUpperCase();

    let error = '';
    if (!product) error = 'Producto vacío. ';
    if (perfil === 'REVISIÓN MANUAL') error += 'Motivo no mapeado en Maestro. ';

    return {
      id_sistema: `TER-${product}-${Date.now()}`,
      contrato: (base ? base[this.colIndexContrato] : (this.getFieldValue(row, ["CONTRATO"]) || '')).toString(),
      producto: product,
      cliente: (base ? base[this.colIndexNombre] : '').toString(),
      direccion: (base ? base[this.colIndexDireccion] : '').toString(),
      cedula_maestra: (base ? base[this.colIndexCedula] : '').toString(),
      telefono_maestro: (this.getFieldValue(row, ["telefono nuevo", "celular", "telefono"]) || '').toString(),
      causal: baseRow.observacion.toUpperCase() || cleanLabel,
      codigo_causal: mappedMotCode,
      tipo_comentario: '',
      codigo_tipo_comentario: '',
      motivo_no_pago_original: motivoNP,
      motivo_no_pago_consolidado: motivoCVS,
      fecha_gestion: baseRow.fecha,
      estado_cruce: 'automatico',
      estado_homologacion: perfil && perfil !== 'REVISIÓN MANUAL' ? 'exitosa' : 'pendiente',
      editado_manualmente: false,
      fuente_principal: 'terreno',
      identificacion_valida: !!base,
      perfil_maestro: perfil,
      comentarios_concatenados: baseRow.observacion,
      motivo_error: error.trim()
    };
  }

  public processAll(movilidadData: any[], terrenoData: any[], start?: string, end?: string): RegistroNormalizado[] {
    const results: RegistroNormalizado[] = [];
    
    movilidadData.forEach(row => {
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
