export interface MovilidadRaw {
  Producto: string | number;
  "ID de cliente (Cédula)": string | number;
  "Nombre del cliente": string;
  "Dirección de instalación": string;
  "Tipo de comentario 1"?: string;
  "Tipo de comentario 2"?: string;
  "Tipo de comentario 3"?: string;
  "Tipo de comentario 4"?: string;
  "Fecha de gestión": string;
  [key: string]: any;
}

export interface TerrenoRaw {
  CONTRATO: string | number;
  PRODUCTO: string | number;
  "MOTIVO DE NO PAGO ": string;
  "OBSERVACIONES": string;
  [key: string]: any;
}

export interface ConvRaw {
  CAUSAL: string;
  "CODIGO CAUSAL": string | number;
  "TIPO COMENTARIO": string;
  "CODIGO TIPO COMENTARIO": string | number;
}

export interface BaseGeneralRaw {
  PORTAFOLIO?: string;
  CONTRATO: string | number;
  PRODUCTO: string | number;
  "CEDULA ": string | number;
  "NOMBRE ": string;
  DIRECCION?: string;
  "Conv Mejor perfil"?: string;
  "MEJOR NUMERO MARCADO "?: string;
  [key: string]: any;
}

export interface ExportVisita {
  gestion: string;
  usuario: string;
  fechagestion: string;
  accion: string;
  perfil: string;
  motivonopago: string;
  numeromarcado: string;
  identificacion: string;
  cuenta: string;
  valorpromesa: string;
  fechapromesa: string;
  cuotas: string;
}

export interface RegistroNormalizado {
  id_sistema: string;
  contrato: string;
  producto: string;
  cliente: string;
  direccion: string;
  causal: string;
  codigo_causal: string;
  tipo_comentario: string;
  codigo_tipo_comentario: string;
  motivo_no_pago_original: string;
  motivo_no_pago_consolidado: string;
  fecha_gestion: string;
  estado_cruce: 'automatico' | 'manual' | 'no_encontrado';
  estado_homologacion: 'exitosa' | 'flexible' | 'pendiente';
  editado_manualmente: boolean;
  fuente_principal: 'movilidad' | 'terreno';
  // Nuevos campos de validación
  identificacion_valida?: boolean;
  perfil_maestro?: string;
  cedula_maestra?: string;
  telefono_maestro?: string;
  // Campos auxiliares para rastro
  comentarios_concatenados?: string;
}
