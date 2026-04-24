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
  Database, Layers, Calendar, Download
} from 'lucide-react';

interface FileStatus {
  loaded: boolean;
  name: string;
  data: any[];
  secondaryData?: any[]; 
}

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'procesar' | 'reporte' | 'legalizacion'>('procesar');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  const [globalDate, setGlobalDate] = useState<string>('');
  
  const [files, setFiles] = useState<{ [key: string]: FileStatus }>({
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

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result as string;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        if (type === 'master') {
          // Búsqueda inteligente de pestañas
          const convSheetName = wb.SheetNames.find(n => n.toUpperCase().includes('CONV')) || wb.SheetNames[1];
          const baseSheetName = wb.SheetNames.find(n => n.toUpperCase().includes('BASE') || n.toUpperCase().includes('GENERAL') || n.toUpperCase().includes('EFIGAS')) || wb.SheetNames[0];
          
          const convData = XLSX.utils.sheet_to_json(wb.Sheets[convSheetName || '']);
          const baseData = XLSX.utils.sheet_to_json(wb.Sheets[baseSheetName || ''], { header: 1 });
          
          setFiles(prev => ({
            ...prev,
            master: { loaded: true, name: file.name, data: convData, secondaryData: baseData }
          }));
        } else {
          let data: any[] = [];
          for (const sName of wb.SheetNames) {
            const temp = XLSX.utils.sheet_to_json(wb.Sheets[sName]);
            if (temp.length > 0) { data = temp; break; }
          }
          setFiles(prev => ({ ...prev, [type]: { loaded: true, name: file.name, data } }));
        }
      } catch (err) { alert('Error al leer archivo: ' + file.name); }
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
      setResultados(results);
      setProcessing(false);
    } catch (e: any) { alert(e.message); setProcessing(false); }
  };

  const applyGlobalDate = () => {
    if (!globalDate) return alert('Selecciona una fecha');
    setResultados(prev => prev.map(r => (!r.fecha_gestion ? { ...r, fecha_gestion: globalDate } : r)));
    alert('Fechas actualizadas.');
  };

  const exportCSV = () => {
    if (!resultados.length) return;
    const engine = new ProcessingEngine();
    const exportData = engine.createExportData(resultados);
    const ws = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = 'visitas_efigas.csv'; link.click();
  };

  const download = (data: any, name: string, type: string) => {
    const blob = new Blob([data], { type });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click();
  };

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans text-slate-900">
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-72'} bg-[#0f172a] text-white flex flex-col p-6 fixed h-full z-20 shadow-2xl transition-all duration-300`}>
        <div className="mb-12 flex justify-between items-center">
          {!isSidebarCollapsed && <div className="flex items-center gap-3"><Layers className="text-emerald-500" size={24} /> <span className="font-black text-xl">EMDECOB</span></div>}
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2 hover:bg-white/10 rounded-lg"><ChevronRight className={isSidebarCollapsed ? '' : 'rotate-180'} /></button>
        </div>
        <nav className="flex-1 space-y-2">
          <NavItem active={activeTab === 'procesar'} onClick={() => setActiveTab('procesar')} icon={<Map size={20} />} label="Visitas Terreno" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'reporte'} onClick={() => setActiveTab('reporte')} icon={<FileCheck size={20} />} label="Informe Gestión" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'legalizacion'} onClick={() => setActiveTab('legalizacion')} icon={<CircleDollarSign size={20} />} label="Legalizaciones" collapsed={isSidebarCollapsed} />
        </nav>
        <button onClick={onLogout} className="mt-auto flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white transition-all"><LogOut size={20} /> {!isSidebarCollapsed && <span className="font-bold">Salir</span>}</button>
      </aside>

      <main className={`flex-1 ${isSidebarCollapsed ? 'ml-20' : 'ml-72'} p-10`}>
        <header className="flex justify-between items-center mb-10">
           <h2 className="text-3xl font-black">Efigas Dashboard v13.2</h2>
           <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3"><UserIcon size={18} /> <span className="font-bold text-sm">Operador Senior</span></div>
        </header>

        {activeTab === 'procesar' ? (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
               <div className="flex items-center gap-4"><Calendar className="text-emerald-500" /> <h3 className="font-black">Rango de Fecha (Terreno)</h3></div>
               <div className="flex gap-4">
                  <input type="date" value={fechaInicio} className="border rounded-lg px-3 py-2 text-sm" onChange={(e)=>setFechaInicio(e.target.value)} />
                  <input type="date" value={fechaFin} className="border rounded-lg px-3 py-2 text-sm" onChange={(e)=>setFechaFin(e.target.value)} />
               </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
               <FileCard title="Movilidad" status={files.movilidad} onUpload={(e: any)=>handleFileUpload(e,'movilidad')} color="blue" />
               <FileCard title="Terreno" status={files.terreno} onUpload={(e: any)=>handleFileUpload(e,'terreno')} color="emerald" />
               <FileCard title="Master (Base)" status={files.master} onUpload={(e: any)=>handleFileUpload(e,'master')} color="amber" />
               <FileCard title="Maestro (Perfiles)" status={files.maestro} onUpload={(e: any)=>handleFileUpload(e,'maestro')} color="slate" />
            </div>

            {!resultados.length ? (
               <div className="bg-white p-12 rounded-[2rem] text-center border-2 border-dashed border-slate-200 shadow-inner">
                  {processing ? <div className="space-y-4"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div><p className="font-black">{statusMessage}</p></div> : 
                  <button onClick={processData} className="px-10 py-4 bg-emerald-500 text-slate-900 font-black rounded-xl shadow-lg hover:bg-emerald-600 transition-all">Procesar Cruce de Datos</button>}
               </div>
            ) : (
               <div className="space-y-6">
                  <div className="bg-slate-900 text-white p-6 rounded-3xl flex justify-between items-center">
                     <div className="flex gap-8">
                        <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total</p><p className="text-2xl font-black">{resultados.length}</p></div>
                        <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Cruce Exitoso</p><p className="text-2xl font-black text-emerald-400">{resultados.filter(r=>r.identificacion_valida).length}</p></div>
                     </div>
                     <div className="flex items-center gap-4 bg-white/5 p-3 rounded-2xl border border-white/10">
                        <input type="date" value={globalDate} onChange={(e)=>setGlobalDate(e.target.value)} className="bg-transparent border-none text-white text-xs outline-none" />
                        <button onClick={applyGlobalDate} className="bg-emerald-500 text-slate-900 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase">Sellar Fechas</button>
                     </div>
                     <div className="flex gap-4">
                        <button onClick={()=>setResultados([])} className="text-xs font-bold text-slate-400">Limpiar</button>
                        <button onClick={exportCSV} className="bg-white text-slate-900 px-6 py-3 rounded-xl font-black flex items-center gap-2 shadow-lg hover:bg-slate-50 transition-all text-sm"><Download size={18}/> Exportar Reporte</button>
                     </div>
                  </div>
                  <ReviewTable data={resultados} onUpdate={(id,upd)=>setResultados(p=>p.map(r=>r.id_sistema===id?{...r,...upd}:r))} />
               </div>
            )}
          </div>
        ) : activeTab === 'reporte' ? (
          <div className="bg-white p-10 rounded-3xl shadow-sm border max-w-2xl mx-auto">
             <div className="flex items-center gap-4 mb-8 text-emerald-600"><FileCheck size={32}/> <h3 className="text-xl font-black text-slate-800">Generador Informe de Gestión</h3></div>
             <FileCard title="Archivo Master" status={files.master} onUpload={(e: any)=>handleFileUpload(e,'master')} color="amber" />
             <button onClick={async ()=>{
                if(!files.master.loaded) return alert('Carga el Master');
                setProcessing(true); setStatusMessage('Generando...');
                try {
                  const res = await new ReportEngine().generateReport(files.master.secondaryData||[], files.master.data||[], '/templates/plantilla_gestion.xlsx');
                  download(res.excelBuffer, 'GESTION.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                  if(res.txtContent) download(new TextEncoder().encode(res.txtContent), 'COMENTARIOS.txt', 'text/plain');
                  setProcessing(false);
                } catch(e) { alert('Error al generar reporte'); setProcessing(false); }
             }} className="w-full mt-8 py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-slate-800 transition-all">Generar Excel + TXT</button>
          </div>
        ) : (
          <div className="bg-white p-10 rounded-3xl shadow-sm border max-w-2xl mx-auto">
             <h3 className="text-xl font-black mb-6 flex items-center gap-3 text-amber-600"><CircleDollarSign size={28}/> Legalización Masiva</h3>
             <div className="flex flex-wrap gap-2 mb-8">
                {['1367', '1368', '1369', 'TODOS'].map(t=>(
                  <button key={t} onClick={()=>setSelectedLegalizationTipo(t==='TODOS'?['1367','1368','1369']:[t])} className={`px-5 py-2.5 rounded-xl font-bold border-2 transition-all text-xs ${selectedLegalizationTipo.includes(t)?'border-amber-500 bg-amber-50 text-amber-700':'border-slate-50 text-slate-400'}`}>{t}</button>
                ))}
             </div>
             <FileCard title="Base General (Master)" status={files.master} onUpload={(e: any)=>handleFileUpload(e,'master')} color="amber" />
             <button onClick={async ()=>{
                if(!files.master.loaded) return alert('Carga el Master');
                setProcessing(true); setStatusMessage('Procesando...');
                try {
                  const template = await(await fetch('/templates/Plantilla_Legalizacion_masiva.xls')).arrayBuffer();
                  const res = await new LegalizationEngine().processLegalization(files.master.secondaryData||[], selectedLegalizationTipo, template);
                  download(res.excelBuffer, 'LEGALIZACION.xlsx', 'application/vnd.ms-excel');
                  if(res.txtContent) download(new TextEncoder().encode(res.txtContent), 'LEGALIZACION.txt', 'text/plain');
                  setProcessing(false);
                } catch(e) { alert('Error en legalización'); setProcessing(false); }
             }} className="w-full mt-6 py-4 bg-amber-500 text-slate-900 font-black rounded-xl shadow-lg hover:bg-amber-600 transition-all uppercase tracking-wider">Procesar Legalizaciones</button>
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: ReactNode, label: string, collapsed: boolean }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-emerald-500 text-slate-900 font-black shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
      {icon} {!collapsed && <span>{label}</span>}
    </div>
  );
}

function FileCard({ title, status, onUpload, color }: { title: string, status: FileStatus, onUpload: (e: any) => void, color: string }) {
  const bg = color === 'blue' ? 'bg-blue-50 text-blue-500' : color === 'emerald' ? 'bg-emerald-50 text-emerald-500' : color === 'amber' ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-500';
  return (
    <div className={`p-4 rounded-2xl border border-slate-100 shadow-sm transition-all ${status.loaded ? 'ring-2 ring-emerald-500 bg-emerald-50/10' : 'bg-white'}`}>
       <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}><Database size={16}/></div>
       <h4 className="font-black text-slate-800 text-[10px] mb-1 leading-none">{title}</h4>
       <p className="text-[8px] text-slate-400 font-bold uppercase truncate mb-3">{status.loaded ? status.name : 'Vacio'}</p>
       <label className="cursor-pointer font-black text-[9px] block bg-slate-50 py-1.5 rounded-lg text-center hover:bg-slate-100 transition-all text-slate-500"><input type="file" className="hidden" onChange={onUpload} /> {status.loaded ? 'CAMBIAR' : 'CARGAR'}</label>
    </div>
  );
}
