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
  Database, ClipboardList, AlertCircle, Settings, Play, Download
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
    setFiles(prev => ({ ...prev, [type]: { ...prev[type], name: file.name, loaded: false, error: 'Cargando...' } }));
    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result as string;
        try {
          const wb = XLSX.read(bstr, { type: 'binary' });
          if (type === 'master') {
            const convSheet = wb.SheetNames.find(n => n.toUpperCase().includes('CONV'));
            const baseSheet = wb.SheetNames.find(n => n.toUpperCase().includes('BASE GENERAL'));
            if (!convSheet || !baseSheet) { alert('Error: El Master debe tener pestañas CONV y BASE GENERAL'); return; }
            setFiles(prev => ({
              ...prev,
              master: { loaded: true, name: file.name, data: XLSX.utils.sheet_to_json(wb.Sheets[convSheet]), secondaryData: XLSX.utils.sheet_to_json(wb.Sheets[baseSheet], { header: 1 }), error: undefined }
            }));
          } else {
            let data: any[] = [];
            for (const sName of wb.SheetNames) {
              const tempData = XLSX.utils.sheet_to_json(wb.Sheets[sName]);
              if (tempData.length > 0) { data = tempData; break; }
            }
            setFiles(prev => ({ ...prev, [type]: { loaded: true, name: file.name, data, error: undefined } }));
          }
        } catch (err: any) { alert('Error leyendo Excel: ' + err.message); }
      };
      reader.readAsBinaryString(file);
    } catch (e) { alert('Error de archivo'); }
  };

  const processData = async () => {
    if (!files.movilidad.loaded || !files.terreno.loaded || !files.master.loaded) return alert('Suba los archivos: Movilidad, Terreno y Master.');
    setResultados([]); setProcessing(true); setStatusMessage('Procesando Visitas...');
    try {
      const engine = new ProcessingEngine();
      if (files.maestro.loaded) engine.indexMasters(files.maestro.data);
      await engine.indexBaseGeneral(files.master.secondaryData as any[], () => {});
      const results = engine.processAll(files.movilidad.data, files.terreno.data, fechaInicio, fechaFin);
      setResultados(results); setStatusMessage('Proceso finalizado');
      setTimeout(() => setProcessing(false), 500);
    } catch (err: any) { alert(err.message); setProcessing(false); }
  };

  const exportCSV = () => {
    if (!resultados.length) return;
    const ws = XLSX.utils.json_to_sheet(new ProcessingEngine().createExportData(resultados));
    const blob = new Blob(["\uFEFF" + XLSX.utils.sheet_to_csv(ws, { FS: ";" })], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = 'visitas.csv'; link.click();
  };

  const downloadReport = async () => {
    if (!files.master.loaded) return alert('Cargue el archivo Master primero.');
    setProcessing(true); setStatusMessage('Generando Informe de Gestión...');
    try {
       const engine = new ReportEngine();
       const result = await engine.generateReport(files.master.secondaryData || [], files.master.data || [], '/templates/plantilla_gestion.xlsx');
       const blob = new Blob([result.excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
       const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'INFORME_GESTION.xlsx'; link.click();
       setProcessing(false);
    } catch(err: any) { alert('Error en Reporte: ' + err.message); setProcessing(false); }
  };

  const downloadLegalization = async () => {
    if (!files.master.loaded) return alert('Cargue la base general en el espacio de Master.');
    setProcessing(true); setStatusMessage('Generando Legalización...');
    try {
       const res = await fetch('/templates/Plantilla_Legalizacion_masiva.xls');
       const buffer = await res.arrayBuffer();
       const result = await new LegalizationEngine().processLegalization(files.master.secondaryData || [], selectedLegalizationTipo, buffer);
       const blob = new Blob([result.excelBuffer], { type: 'application/vnd.ms-excel' });
       const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'LEGALIZACION.xlsx'; link.click();
       setProcessing(false);
    } catch(err: any) { alert('Error en Legalización: ' + err.message); setProcessing(false); }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar - Fix for Performance: Simple Transitions */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-72'} bg-[#0f172a] text-white flex flex-col p-6 fixed h-full z-20 shadow-2xl transition-all duration-200 border-r border-white/5`}>
        <div className="mb-10 px-2 flex justify-between items-center h-10">
          {!isSidebarCollapsed && <h1 className="text-xl font-bold tracking-tight">EMDECOB</h1>}
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2 text-white/50 hover:text-white"><ChevronRight size={20} className={isSidebarCollapsed ? '' : 'rotate-180'} /></button>
        </div>
        <nav className="flex-1 space-y-1">
          <NavItem active={activeTab === 'procesar'} onClick={() => setActiveTab('procesar')} icon={<Map size={20} />} label="Visitas Terreno" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'reporte'} onClick={() => setActiveTab('reporte')} icon={<FileCheck size={20} />} label="Informe Gestión" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'legalizacion'} onClick={() => setActiveTab('legalizacion')} icon={<CircleDollarSign size={20} />} label="Legalizaciones" collapsed={isSidebarCollapsed} />
        </nav>
        <div className="mt-auto pt-4 border-t border-white/10">
          <button onClick={onLogout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white w-full"><LogOut size={20} /> {!isSidebarCollapsed && <span className="text-sm font-bold">Cerrar Sesión</span>}</button>
        </div>
      </aside>

      <main className={`flex-1 ${isSidebarCollapsed ? 'ml-20' : 'ml-72'} p-10 transition-all duration-200 overflow-y-auto`}>
        <header className="flex justify-between items-center mb-8">
          <div><h2 className="text-3xl font-black">Efigas Dashboard v11.0</h2><p className="text-emerald-600 font-bold text-sm tracking-tight">Optimizado para velocidad y estabilidad</p></div>
          <div className="flex items-center gap-3 bg-white p-2 px-5 rounded-2xl border text-sm font-bold"><UserIcon size={18} /> Efigas Senior</div>
        </header>

        {activeTab === 'procesar' ? (
          <div className="space-y-6">
            <div className="bg-white border rounded-3xl p-6 shadow-sm">
                <p className="text-[10px] font-black text-emerald-600 uppercase mb-3">Filtro de Gestión Terreno (Timestamp)</p>
                <div className="flex gap-4">
                  <input type="date" value={fechaInicio} className="flex-1 border-2 border-slate-50 rounded-xl px-4 py-3 text-sm focus:border-emerald-500" onChange={(e) => setFechaInicio(e.target.value)} />
                  <input type="date" value={fechaFin} className="flex-1 border-2 border-slate-50 rounded-xl px-4 py-3 text-sm focus:border-emerald-500" onChange={(e) => setFechaFin(e.target.value)} />
                </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
               <FileCard title="Movilidad" icon={<Database size={20}/>} status={files.movilidad} onUpload={(e) => handleFileUpload(e, 'movilidad')} onRemove={() => setFiles(p => ({...p, movilidad: {loaded:false,name:'',data:[]}}))} accent="blue" />
               <FileCard title="Terreno" icon={<ClipboardList size={20}/>} status={files.terreno} onUpload={(e) => handleFileUpload(e, 'terreno')} onRemove={() => setFiles(p => ({...p, terreno: {loaded:false,name:'',data:[]}}))} accent="green" />
               <FileCard title="Master" icon={<AlertCircle size={20}/>} status={files.master} onUpload={(e) => handleFileUpload(e, 'master')} onRemove={() => setFiles(p => ({...p, master: {loaded:false,name:'',data:[],secondaryData:[]}}))} accent="amber" />
               <FileCard title="CVS/Perfiles" icon={<Settings size={20}/>} status={files.maestro} onUpload={(e) => handleFileUpload(e, 'maestro')} onRemove={() => setFiles(p => ({...p, maestro: {loaded:false,name:'',data:[]}}))} accent="slate" />
            </div>
            <section className="bg-white border rounded-[2rem] p-10 text-center shadow-sm">
               {!resultados.length ? (
                  <div className="max-w-md mx-auto py-4">
                     {processing ? <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div> : (
                       <>
                         <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5 text-emerald-600"><Play size={28} /></div>
                         <h3 className="text-xl font-bold mb-2">Validación de Visitas</h3>
                         <p className="text-slate-400 text-sm mb-8 italic">Movilidad total + Terreno filtrado</p>
                         <button onClick={processData} className="px-10 py-5 bg-emerald-500 text-slate-900 font-bold rounded-2xl shadow-lg hover:scale-105 transition-all text-lg">Procesar Cruce Ahora</button>
                       </>
                     )}
                  </div>
               ) : (
                  <div className="text-left w-full">
                     <div className="flex justify-between items-center mb-10 bg-slate-50 p-6 rounded-2xl">
                        <div className="flex gap-12">
                           <KPI label="Total" value={resultados.length} />
                           <KPI label="Encontrados" value={resultados.filter(r => r.identificacion_valida).length} color="text-emerald-500" />
                        </div>
                        <div className="flex gap-4">
                           <button onClick={() => setResultados([])} className="px-5 py-3 border font-bold rounded-xl text-slate-500">Limpiar</button>
                           <button onClick={exportCSV} className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-xl hover:bg-slate-800 flex items-center gap-2"><Download size={18} /> Exportar Visitas</button>
                        </div>
                     </div>
                     <ReviewTable data={resultados} onUpdate={(id, updates) => setResultados(prev => prev.map(r => r.id_sistema === id ? { ...r, ...updates } : r))} />
                  </div>
               )}
            </section>
          </div>
        ) : activeTab === 'reporte' ? (
          <div className="bg-white border rounded-[2rem] p-10 shadow-sm space-y-8">
             <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600"><FileCheck size={28} /></div>
                <div><h3 className="text-2xl font-bold">Informe de Gestión de Causales</h3><p className="text-slate-400 text-sm">Basado en el archivo Seguimiento (Master)</p></div>
             </div>
             <FileCard title="Archivo Master Requerido" icon={<Database size={24} />} status={files.master} onUpload={(e) => handleFileUpload(e, 'master')} onRemove={() => setFiles(p => ({...p, master: {loaded:false,name:'',data:[],secondaryData:[]}}))} accent="amber" />
             <div className="bg-[#0f172a] rounded-[1.5rem] p-10 text-white flex justify-between items-center">
                <div><h4 className="text-xl font-bold mb-1 underline decoration-emerald-500 underline-offset-8">Generar Libro Oficial</h4><p className="text-slate-400 text-sm">Este proceso es 100% independiente de las visitas.</p></div>
                <button 
                  onClick={downloadReport}
                  disabled={processing}
                  className="px-10 py-5 bg-emerald-500 text-slate-900 font-black rounded-xl shadow-xl hover:scale-105 transition-all text-lg"
                >{processing ? 'Procesando...' : 'Descargar Excel'}</button>
             </div>
          </div>
        ) : (
          <div className="bg-white border rounded-[2rem] p-10 shadow-sm max-w-4xl mx-auto space-y-8">
             <div className="flex items-center gap-4"><div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600"><CircleDollarSign size={24} /></div><h3 className="text-2xl font-bold">Legalizaciones Masivas</h3></div>
             <div className="grid grid-cols-4 gap-3">
                {['1367', '1368', '1369', 'TODOS'].map(t => <button key={t} onClick={() => setSelectedLegalizationTipo(t === 'TODOS' ? ['1367', '1368', '1369'] : [t])} className={`p-4 rounded-xl font-bold border-2 transition-all ${selectedLegalizationTipo.includes(t) || (t === 'TODOS' && selectedLegalizationTipo.length === 3) ? 'bg-amber-500 border-amber-600 text-slate-900 shadow-md' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>{t}</button>)}
             </div>
             <FileCard title="Archivo Base General (Cargar en Master)" icon={<Database size={24} />} status={files.master} onUpload={(e) => handleFileUpload(e, 'master')} onRemove={() => setFiles(p => ({...p, master: {loaded:false,name:'',data:[],secondaryData:[]}}))} accent="amber" />
             <button onClick={downloadLegalization} className="w-full py-6 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all text-xl shadow-2xl">Descargar Legalización</button>
          </div>
        )}
      </main>
      
      {/* Overlay de procesamiento unificado y simple */}
      {processing && (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-[2px] z-[100] flex items-center justify-center">
           <div className="bg-white p-8 rounded-3xl shadow-2xl text-center border-4 border-emerald-500">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="font-bold text-slate-800">{statusMessage}</p>
           </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: ReactNode, label: string, collapsed: boolean }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all duration-150 ${active ? 'bg-emerald-500 text-slate-900 font-bold shadow-md' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
      {icon} {!collapsed && <span className="text-sm font-bold">{label}</span>}
    </div>
  );
}

function FileCard({ title, icon, status, onUpload, onRemove, accent }: { title: string, icon: ReactNode, status: FileStatus, onUpload: (e: any) => void, onRemove: () => void, accent: string }) {
  const color = accent === 'blue' ? 'emerald' : accent === 'green' ? 'emerald' : accent === 'amber' ? 'amber' : 'slate';
  return (
    <div className={`bg-white p-6 rounded-3xl border shadow-sm transition-all ${status.loaded ? `ring-4 ring-${color}-500/10 border-${color}-200` : 'border-slate-100'}`}>
       <div className={`w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-3 text-slate-500`}>{icon}</div>
       <h4 className="font-bold text-slate-800 text-sm mb-1">{title}</h4>
       <p className="text-[10px] text-slate-400 font-bold uppercase mb-4 truncate">{status.loaded ? status.name : 'Vacio'}</p>
       {!status.loaded ? <label className="cursor-pointer"><input type="file" className="hidden" onChange={onUpload} /><div className="bg-slate-50 border py-2 rounded-xl text-center text-[10px] font-black text-slate-500 hover:bg-slate-100 transition-all">SELECCIONAR</div></label> : <button onClick={onRemove} className="w-full bg-red-50 text-red-500 py-2 rounded-xl text-[10px] font-black">X ELIMINAR</button>}
    </div>
  );
}

function KPI({ label, value, color = "text-slate-900" }: { label: string, value: number, color?: string }) {
  return (
    <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</p><p className={`text-2xl font-black ${color}`}>{value.toLocaleString()}</p></div>
  );
}
