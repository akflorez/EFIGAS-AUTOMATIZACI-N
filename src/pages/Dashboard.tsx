import { useState, type ChangeEvent, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { ProcessingEngine } from '../logic/engine';
import type { RegistroNormalizado } from '../types';
import ReviewTable from '../components/ReviewTable';
import { ReportEngine } from '../logic/reportEngine';
import { LegalizationEngine } from '../logic/legalizationEngine';
import { 
  FileCheck, LogOut, ChevronRight,
  User as UserIcon, CircleDollarSign, Map,
  Database, ClipboardList, AlertCircle, Settings, Play, Download,
  Layers, Calendar
} from 'lucide-react';

interface FileStatus {
  loaded: boolean;
  name: string;
  data: any[];
  secondaryData?: any[]; 
  error?: string;
}

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'procesar' | 'reporte' | 'legalizacion'>('procesar');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  
  type DashboardFiles = {
    movilidad: FileStatus;
    terreno: FileStatus;
    master: FileStatus;
    maestro: FileStatus;
  };

  const [files, setFiles] = useState<DashboardFiles>({
    movilidad: { loaded: false, name: '', data: [] },
    terreno: { loaded: false, name: '', data: [] },
    master: { loaded: false, name: '', data: [], secondaryData: [] },
    maestro: { loaded: false, name: '', data: [] },
  });

  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [resultados, setResultados] = useState<RegistroNormalizado[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedLegalizationTipo, setSelectedLegalizationTipo] = useState<string[]>(['1367']);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>, type: keyof DashboardFiles) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFiles(prev => ({ ...prev, [type]: { ...prev[type], name: file.name, loaded: false, error: 'Procesando...' } }));
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result as string;
        const wb = XLSX.read(bstr, { type: 'binary' });
        if (type === 'master') {
          const convSheet = wb.SheetNames.find(n => n.toUpperCase().includes('CONV'));
          const baseSheet = wb.SheetNames.find(n => n.toUpperCase().includes('BASE GENERAL'));
          if (!convSheet || !baseSheet) throw new Error('Master inválido (Faltan hojas)');
          setFiles(prev => ({
            ...prev,
            master: { loaded: true, name: file.name, data: XLSX.utils.sheet_to_json(wb.Sheets[convSheet]), secondaryData: XLSX.utils.sheet_to_json(wb.Sheets[baseSheet], { header: 1 }), error: undefined }
          }));
        } else {
          let data: any[] = [];
          for (const sName of wb.SheetNames) {
            const temp = XLSX.utils.sheet_to_json(wb.Sheets[sName]);
            if (temp.length > 0) { data = temp; break; }
          }
          setFiles(prev => ({ ...prev, [type]: { loaded: true, name: file.name, data, error: undefined } }));
        }
      } catch (err: any) { alert(err.message); }
    };
    reader.readAsBinaryString(file);
  };

  const processData = async () => {
    if (!files.movilidad.loaded || !files.terreno.loaded || !files.master.loaded) return alert('⚠️ Archivos incompletos.');
    setProcessing(true); setStatusMessage('Analizando Datos...');
    try {
      const engine = new ProcessingEngine();
      if (files.maestro.loaded) engine.indexMasters(files.maestro.data);
      await engine.indexBaseGeneral(files.master.secondaryData as any[], () => {});
      const results = engine.processAll(files.movilidad.data, files.terreno.data, fechaInicio, fechaFin);
      setResultados(results); setStatusMessage('¡Listo!');
      setTimeout(() => setProcessing(false), 500);
    } catch (e: any) { alert(e.message); setProcessing(false); }
  };

  const downloadReport = async () => {
    if (!files.master.loaded) return alert('Cargue el Master.');
    setProcessing(true); setStatusMessage('Inyectando datos en Plantilla...');
    try {
       const result = await new ReportEngine().generateReport(files.master.secondaryData || [], files.master.data || [], '/templates/plantilla_gestion.xlsx');
       const blob = new Blob([result.excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
       const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'INFORME_GESTION_OFICIAL.xlsx'; link.click();
       setProcessing(false);
    } catch(e: any) { alert('Error: ' + e.message); setProcessing(false); }
  };

  const removeFile = (type: keyof DashboardFiles) => {
    setFiles(prev => ({ ...prev, [type]: { loaded: false, name: '', data: [], secondaryData: type === 'master' ? [] : undefined } }));
  };

  const exportCSV = () => {
    if (!resultados.length) return;
    const ws = XLSX.utils.json_to_sheet(new ProcessingEngine().createExportData(resultados));
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = 'visitas_efigas.csv'; link.click();
  };

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans text-slate-900">
      {/* Sidebar - Diseño Premium Original */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-72'} bg-[#0f172a] text-white flex flex-col p-6 fixed h-full z-20 shadow-2xl transition-all duration-300 border-r border-white/5`}>
        <div className="mb-12 flex justify-between items-center">
          {!isSidebarCollapsed && (
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><Layers className="text-slate-900" size={24} /></div>
                <div><h1 className="text-xl font-black tracking-tighter">EMDECOB</h1><p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest leading-none">Automación</p></div>
             </div>
          )}
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2 hover:bg-white/10 rounded-lg text-white/50"><ChevronRight className={isSidebarCollapsed ? '' : 'rotate-180'} /></button>
        </div>

        <nav className="flex-1 space-y-2">
          {!isSidebarCollapsed && <p className="px-4 text-[10px] font-black text-white/30 uppercase tracking-widest mb-4">Herramientas</p>}
          <NavItem active={activeTab === 'procesar'} onClick={() => setActiveTab('procesar')} icon={<Map size={20} />} label="Visitas Terreno" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'reporte'} onClick={() => setActiveTab('reporte')} icon={<FileCheck size={20} />} label="Informe Gestión" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'legalizacion'} onClick={() => setActiveTab('legalizacion')} icon={<CircleDollarSign size={20} />} label="Legalizaciones" collapsed={isSidebarCollapsed} />
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5">
           <button onClick={onLogout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all w-full"><LogOut size={20} /> {!isSidebarCollapsed && <span className="font-bold text-sm">Cerrar Sesión</span>}</button>
        </div>
      </aside>

      <main className={`flex-1 ${isSidebarCollapsed ? 'ml-20' : 'ml-72'} p-10 transition-all duration-300`}>
        <header className="flex justify-between items-center mb-10">
          <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Efigas Dashboard v12.0</h2><p className="text-emerald-600 font-bold text-sm uppercase tracking-tight">Motor de Alto Rendimiento</p></div>
          <div className="flex items-center gap-4 bg-white p-2 pr-5 rounded-2xl shadow-sm border border-slate-100">
             <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500"><UserIcon size={20} /></div>
             <div className="leading-none text-left"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Operador Senior</p><p className="text-sm font-black text-slate-800">Efigas User</p></div>
          </div>
        </header>

        {activeTab === 'procesar' ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white border-2 border-slate-50 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6"><div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600"><Calendar size={18} /></div><p className="text-xs font-black text-slate-400 uppercase tracking-widest">Filtro Terreno (Timestamp)</p></div>
                <div className="flex gap-6">
                  <div className="flex-1"><label className="block text-xs font-bold text-slate-400 uppercase mb-2">Desde</label><input type="date" value={fechaInicio} className="w-full border-2 border-slate-100 rounded-xl px-4 py-3" onChange={(e) => setFechaInicio(e.target.value)} /></div>
                  <div className="flex-1"><label className="block text-xs font-bold text-slate-400 uppercase mb-2">Hasta</label><input type="date" value={fechaFin} className="w-full border-2 border-slate-100 rounded-xl px-4 py-3" onChange={(e) => setFechaFin(e.target.value)} /></div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
               <FileCard title="Movilidad" icon={<Database size={24} />} status={files.movilidad} onUpload={(e) => handleFileUpload(e, 'movilidad')} onRemove={() => setFiles(p=>({...p, movilidad:{loaded:false,name:'',data:[]}}))} accent="blue" />
               <FileCard title="Terreno" icon={<ClipboardList size={24} />} status={files.terreno} onUpload={(e) => handleFileUpload(e, 'terreno')} onRemove={() => setFiles(p=>({...p, terreno:{loaded:false,name:'',data:[]}}))} accent="emerald" />
               <FileCard title="Master" icon={<AlertCircle size={24} />} status={files.master} onUpload={(e) => handleFileUpload(e, 'master')} onRemove={() => setFiles(p=>({...p, master:{loaded:false,name:'',data:[],secondaryData:[]}}))} accent="amber" />
               <FileCard title="Maestro" icon={<Settings size={24} />} status={files.maestro} onUpload={(e) => handleFileUpload(e, 'maestro')} onRemove={() => setFiles(p=>({...p, maestro:{loaded:false,name:'',data:[]}}))} accent="slate" />
            </div>

            <section className="bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] p-12 text-center relative overflow-hidden shadow-inner">
               {!resultados.length ? (
                  <div className="max-w-md mx-auto">
                    {processing ? (
                      <div className="space-y-6">
                         <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                         <h3 className="text-xl font-bold">{statusMessage}</h3>
                      </div>
                    ) : (
                      <>
                        <div className="w-20 h-20 bg-emerald-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-emerald-600 shadow-xl shadow-emerald-500/10"><Play size={32} /></div>
                        <h3 className="text-2xl font-black mb-3">Motor de Validación</h3>
                        <p className="text-slate-400 mb-8 font-medium italic">Cruce masivo de Movilidad y Terreno con identificaciones.</p>
                        <button onClick={processData} className="px-12 py-5 bg-emerald-500 text-slate-900 font-black rounded-2xl shadow-xl shadow-emerald-500/30 hover:scale-105 transition-all text-xl">Iniciar Proceso</button>
                      </>
                    )}
                  </div>
               ) : (
                  <div className="text-left w-full animate-in fade-in duration-500">
                     <div className="flex justify-between items-end mb-10 bg-slate-50 p-8 rounded-3xl">
                        <div className="flex gap-16">
                           <KPI label="Total Procesado" value={resultados.length} />
                           <KPI label="Registros Válidos" value={resultados.filter(r => r.identificacion_valida).length} color="text-emerald-500" />
                        </div>
                        <div className="flex gap-4">
                           <button onClick={() => setResultados([])} className="px-6 py-4 border-2 border-white rounded-2xl font-bold hover:bg-white/50 transition-all">Nueva Carga</button>
                           <button onClick={exportCSV} className="px-8 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-2xl hover:bg-slate-800 transition-all flex items-center gap-3"><Download size={20} /> Exportar Libro CSV</button>
                        </div>
                     </div>
                     <ReviewTable data={resultados} onUpdate={(id, updates) => setResultados(prev => prev.map(r => r.id_sistema === id ? { ...r, ...updates } : r))} />
                  </div>
               )}
            </section>
          </div>
        ) : activeTab === 'reporte' ? (
          <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
             <div className="bg-white border rounded-[2.5rem] p-10 shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-4 mb-8">
                   <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-900"><FileCheck size={32} /></div>
                   <div><h3 className="text-2xl font-black">Generador de Informe de Gestión</h3><p className="text-slate-500 font-medium">Inyecta datos del Master en la Plantilla EMDECOB.</p></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                   <FileCard title="Archivo Master" icon={<Database size={24} />} status={files.master} onUpload={(e) => handleFileUpload(e, 'master')} onRemove={() => setFiles(p=>({...p, master:{loaded:false,name:'',data:[],secondaryData:[]}}))} accent="amber" />
                   <div className="p-8 rounded-[2rem] border-2 border-dashed border-slate-100 bg-[#fafafa] flex items-center justify-center text-center"><p className="text-sm font-bold text-slate-400 italic">Plantilla Oficial Lista.<br/>Se completarán 15,000 filas de memoria.</p></div>
                </div>
                <div className="bg-[#0f172a] rounded-[2.5rem] p-10 text-white flex justify-between items-center shadow-2xl">
                   <div><h4 className="text-2xl font-black mb-2 underline decoration-emerald-500 decoration-4 underline-offset-8">Reporte de Causales</h4><p className="text-slate-400 font-medium text-sm">Este módulo no requiere procesar visitas terreno previas.</p></div>
                   <button 
                     onClick={downloadReport}
                     className="px-12 py-5 bg-emerald-500 text-slate-900 font-black rounded-2xl shadow-xl hover:scale-105 transition-all text-xl"
                   >{processing ? 'Generando...' : 'Descargar Excel Ahora'}</button>
                </div>
             </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-right-4 duration-500">
             <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200">
                <div className="flex items-center gap-4 mb-10"><div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-900"><CircleDollarSign size={24} /></div><h3 className="text-2xl font-black">Legalizaciones Masivas</h3></div>
                <div className="grid grid-cols-4 gap-4 mb-10">
                   {['1367', '1368', '1369', 'TODOS'].map(t => (
                     <button key={t} onClick={() => setSelectedLegalizationTipo(t === 'TODOS' ? ['1367', '1368', '1369'] : [t])} className={`p-5 rounded-2xl font-black transition-all border-2 ${selectedLegalizationTipo.includes(t) ? 'bg-amber-500 border-amber-600 text-slate-900 shadow-xl' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>{t}</button>
                   ))}
                </div>
                <FileCard title="Base General (Cargar en Master)" icon={<Database size={24} />} status={files.master} onUpload={(e) => handleFileUpload(e, 'master')} onRemove={() => setFiles(p=>({...p, master:{loaded:false,name:'',data:[],secondaryData:[]}}))} accent="amber" />
                <button 
                  onClick={async () => {
                    if (!files.master.loaded) return alert('Carga la base');
                    setProcessing(true); setStatusMessage('Creando Legalización...');
                    try {
                       const res = await fetch('/templates/Plantilla_Legalizacion_masiva.xls');
                       const buffer = await res.arrayBuffer();
                       const result = await new LegalizationEngine().processLegalization(files.master.secondaryData || [], selectedLegalizationTipo, buffer);
                       const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([result.excelBuffer])); link.download = 'LEGALIZACION.xlsx'; link.click();
                       setProcessing(false);
                    } catch(e) { alert('Error'); setProcessing(false); }
                  }}
                  className="w-full mt-10 py-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-slate-800 transition-all text-xl shadow-2xl"
                >Procesar y Descargar</button>
             </div>
          </div>
        )}
      </main>

      {processing && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-md z-[100] flex items-center justify-center animate-in fade-in duration-300">
           <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-w-lg w-full text-center border-b-8 border-emerald-500">
              <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
              <h3 className="text-2xl font-black mb-2 tracking-tight">Acción en Curso</h3>
              <p className="text-emerald-600 font-bold uppercase tracking-widest text-xs">{statusMessage}</p>
           </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: ReactNode, label: string, collapsed: boolean }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 ${active ? 'bg-emerald-500 text-slate-900 font-black shadow-xl shadow-emerald-500/20 scale-[1.02]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
      {icon} {!collapsed && <span className="text-sm">{label}</span>}
    </div>
  );
}

function FileCard({ title, icon, status, onUpload, onRemove, accent }: { title: string, icon: ReactNode, status: FileStatus, onUpload: (e: any) => void, onRemove: () => void, accent: string }) {
  const bgC = accent === 'blue' ? 'bg-blue-50 text-blue-500' : accent === 'emerald' ? 'bg-emerald-50 text-emerald-500' : accent === 'amber' ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-500';
  return (
    <div className={`bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm transition-all hover:shadow-lg ${status.loaded ? 'ring-2 ring-emerald-500 shadow-xl shadow-emerald-500/5' : ''}`}>
       <div className={`w-12 h-12 ${bgC} rounded-2xl flex items-center justify-center mb-4 shadow-sm`}>{icon}</div>
       <h4 className="font-black text-slate-800 text-sm mb-1">{title}</h4>
       <p className="text-[10px] text-slate-400 font-bold uppercase mb-4 truncate">{status.loaded ? status.name : 'Vacio'}</p>
       {!status.loaded ? (
         <label className="cursor-pointer"><input type="file" className="hidden" onChange={onUpload} /><div className="bg-slate-50 border py-2.5 rounded-xl text-center text-xs font-black text-slate-500 hover:bg-slate-200 transition-all">SUBIR</div></label>
       ) : (
         <button onClick={onRemove} className="w-full bg-red-50 text-red-500 py-2.5 rounded-xl text-xs font-black shadow-sm">ELIMINAR</button>
       )}
    </div>
  );
}

function KPI({ label, value, color = "text-slate-900" }: { label: string, value: number, color?: string }) {
  return (
    <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">{label}</p><p className={`text-4xl font-black ${color} tracking-tighter`}>{value.toLocaleString()}</p></div>
  );
}
