import React from 'react';
import type { RegistroNormalizado } from '../types';
import { Edit3, CheckCircle, AlertTriangle, Info, Search } from 'lucide-react';

interface Props {
  data: RegistroNormalizado[];
  onUpdate: (id: string, updates: Partial<RegistroNormalizado>) => void;
}

export default function ReviewTable({ data, onUpdate }: Props) {
  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredData = data.filter(r => 
    r.contrato.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.causal.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-premium">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black text-slate-800 tracking-tight">Registros de Visita</h3>
        
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text"
            placeholder="Buscar por contrato o cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-efigas-primary/20 transition-all outline-none text-slate-700"
          />
        </div>
      </div>

      <div className="table-container">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Diagnóstico</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Identificación</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente & Dirección</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo Original</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Perfil Maestro</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Causal Homologada</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Celular</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredData.map((reg) => (
              <tr key={reg.id_sistema} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-5">
                  <StatusBadge status={reg.estado_homologacion} />
                </td>
                <td className="px-6 py-5">
                  {reg.motivo_error ? (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                      <AlertTriangle size={12} />
                      {reg.motivo_error}
                    </div>
                  ) : (
                    <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                      Sin observaciones
                    </div>
                  )}
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col gap-1">
                    <div className="font-black text-slate-900 leading-tight flex items-center gap-2">
                       <EditableField 
                         value={reg.contrato} 
                         onSave={(v) => onUpdate(reg.id_sistema, { contrato: v, editado_manualmente: true })} 
                       />
                       {reg.identificacion_valida ? (
                         <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" title="Validado en Base General"></div>
                       ) : (
                         <div className="w-1.5 h-1.5 bg-red-400 rounded-full" title="No encontrado en Base General"></div>
                       )}
                    </div>
                    <div className="text-[10px] font-bold text-efigas-primary uppercase tracking-tighter">
                       <EditableField 
                         value={reg.producto} 
                         onSave={(v) => onUpdate(reg.id_sistema, { producto: v, editado_manualmente: true })} 
                       />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="text-sm font-bold text-slate-700 truncate max-w-[180px]">
                    {reg.cliente}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Cédula:</span>
                    <span className="text-[9px] font-mono font-bold text-slate-600">{reg.cedula_maestra || '---'}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[180px] mt-0.5">{reg.direccion || 'Sin dirección'}</div>
                </td>
                <td className="px-6 py-5">
                  <div className="text-xs text-slate-500 max-w-[220px] italic leading-relaxed line-clamp-2">
                    {reg.motivo_no_pago_consolidado || reg.motivo_no_pago_original || '---'}
                  </div>
                </td>
                <td className="px-6 py-5 border-l border-slate-50">
                   <div className="flex flex-col gap-1.5">
                    <EditableField 
                      value={reg.perfil_maestro || ''} 
                      onSave={(v) => onUpdate(reg.id_sistema, { perfil_maestro: v, editado_manualmente: true })} 
                    />
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Homologación v24</div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col gap-1.5">
                    <EditableField 
                      value={reg.causal} 
                      onSave={(v) => onUpdate(reg.id_sistema, { causal: v, editado_manualmente: true })} 
                    />
                    <div className="inline-flex items-center gap-1.5 py-0.5 px-2 bg-slate-100 rounded-md w-fit">
                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">COD:</span>
                       <span className="text-[9px] font-mono font-bold text-slate-600">{reg.codigo_causal || '--'}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col gap-1.5">
                    <EditableField 
                      value={reg.telefono_maestro || ''} 
                      onSave={(v) => onUpdate(reg.id_sistema, { telefono_maestro: v, editado_manualmente: true })} 
                    />
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Num. Marcado</div>
                  </div>
                </td>
                <td className="px-6 py-5 text-center">
                  <button className="p-2 text-slate-300 hover:text-efigas-primary hover:bg-white hover:shadow-sm rounded-xl transition-all group-hover:text-slate-500">
                    <Edit3 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredData.length === 0 && (
          <div className="py-24 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
               <Info size={24} className="text-slate-300" />
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No se encontraron registros</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    exitosa: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', icon: <CheckCircle size={10} />, label: 'Cruzado OK' },
    flexible: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100', icon: <Info size={10} />, label: 'Sugerido' },
    pendiente: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100', icon: <AlertTriangle size={10} />, label: 'Revisión' },
  };
  
  const config = configs[status] || configs.pendiente;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border ${config.bg} ${config.text} ${config.border}`}>
      {config.icon} {config.label}
    </span>
  );
}

function EditableField({ value, onSave }: { value: string, onSave: (v: string) => void }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [current, setCurrent] = React.useState(value);

  if (isEditing) {
    return (
      <div className="relative animate-in fade-in zoom-in duration-200">
        <input 
          autoFocus
          className="w-full py-1 px-2 text-sm bg-white border-2 border-efigas-primary rounded-lg outline-none shadow-sm font-bold text-slate-800"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          onBlur={() => { setIsEditing(false); onSave(current); }}
          onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <div 
      className={`group/field cursor-pointer flex items-center gap-2 transition-all ${!value ? 'text-red-400 font-black italic' : 'text-slate-800 font-black'}`}
      onClick={() => setIsEditing(true)}
    >
      <span className="border-b border-transparent group-hover/field:border-efigas-primary transition-all">
        {value || 'PENDIENTE'}
      </span>
      <Edit3 size={12} className="opacity-0 group-hover/field:opacity-100 text-efigas-primary transition-all" />
    </div>
  );
}
