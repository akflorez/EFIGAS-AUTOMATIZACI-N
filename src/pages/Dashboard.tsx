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

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'procesar' | 'reporte' | 'legalizacion'>('procesar');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  const [globalDate, setGlobalDate] = useState<string>('');
  
  const [files, setFiles] = useState<{ [key: string]: any }>({
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
          // DETECCIÓN POR VOLUMEN: La hoja con más filas es la Base General real
          let bestSheet = wb.SheetNames[0];
          let maxRows = 0;
          
          wb.SheetNames.forEach(name => {
            const sheet = wb.Sheets[name];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            if (data.length > maxRows) {
              maxRows = data.length;
              bestSheet = name;
            }
          });

          const convSheetName = wb.SheetNames.find(n => n.toUpperCase().includes('CONV')) || wb.SheetNames[1] || bestSheet;
          const baseData = XLSX.utils.sheet_to_json(wb.Sheets[bestSheet], { header: 1 });
          const convData = XLSX.utils.sheet_to_json(wb.Sheets[convSheetName]);

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
           <h2 className="text-3xl font-black">Efigas Dashboard v14.21</h2>
           <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3"><UserIcon size={18} /> <span className="font-bold text-sm">Operador Senior</span></div>
        </header>

        {activeTab === 'procesar' ? (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
               <div className="flex items-center gap-4"><Calendar className="text-emerald-500" /> <h3 className="font-black text-sm uppercase">Filtro de Fecha (Movilidad y Terreno)</h3></div>
               <div className="flex gap-4">
                  <input type="date" value={fechaInicio} className="border rounded-lg px-3 py-1.5 text-xs font-bold" onChange={(e)=>setFechaInicio(e.target.value)} />
                  <input type="date" value={fechaFin} className="border rounded-lg px-3 py-1.5 text-xs font-bold" onChange={(e)=>setFechaFin(e.target.value)} />
               </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
               <FileCard title="Movilidad" status={files.movilidad} onUpload={(e: any)=>handleFileUpload(e,'movilidad')} color="blue" />
               <FileCard title="Terreno" status={files.terreno} onUpload={(e: any)=>handleFileUpload(e,'terreno')} color="emerald" />
               <FileCard title="Master (Base)" status={files.master} onUpload={(e: any)=>handleFileUpload(e,'master')} color="amber" />
               <FileCard title="Maestro (Perfiles)" status={files.maestro} onUpload={(e: any)=>handleFileUpload(e,'maestro')} color="slate" />
            </div>

            {!resultados.length ? (
               <div className="bg-white p-16 rounded-[2.5rem] text-center border-2 border-dashed border-slate-200 shadow-inner">
                  {processing ? <div className="space-y-4"><div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div><p className="font-black text-slate-600">{statusMessage}</p></div> : 
                  <button onClick={processData} className="px-12 py-5 bg-emerald-500 text-slate-950 font-black rounded-2xl shadow-xl hover:bg-emerald-400 transform hover:scale-105 transition-all">Procesar Cruce Nacional</button>}
               </div>
            ) : (
               <div className="space-y-6">
                  <div className="bg-slate-900 text-white p-6 rounded-3xl flex justify-between items-center shadow-xl">
                     <div className="flex gap-10">
                         <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Total Procesados</p><p className="text-3xl font-black">{resultados.length}</p></div>
                         <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Movilidad</p><p className="text-3xl font-black text-blue-400">{resultados.filter(r=>r.fuente_principal==='movilidad').length}</p></div>
                         <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Terreno</p><p className="text-3xl font-black text-emerald-400">{resultados.filter(r=>r.fuente_principal==='terreno').length}</p></div>
                         <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Identificados</p><p className="text-3xl font-black text-amber-400">{resultados.filter(r=>r.identificacion_valida).length}</p></div>
                     </div>
                     <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                        <input type="date" value={globalDate} onChange={(e)=>setGlobalDate(e.target.value)} className="bg-transparent border-none text-white text-xs font-bold outline-none cursor-pointer" />
                        <button onClick={applyGlobalDate} className="bg-emerald-500 text-slate-950 px-4 py-2 rounded-xl font-black text-[10px] uppercase hover:bg-emerald-400 transition-all">Sellar Vacíos</button>
                     </div>
                     <div className="flex gap-4">
                        <button onClick={()=>setResultados([])} className="px-4 text-xs font-bold text-slate-500 hover:text-white transition-all">Limpiar</button>
                        <button onClick={exportCSV} className="bg-white text-slate-950 px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-2xl hover:bg-slate-100 transform hover:scale-105 transition-all text-sm"><Download size={20}/> Descargar CSV</button>
                     </div>
                  </div>
                  <ReviewTable data={resultados} onUpdate={(id,upd)=>setResultados(p=>p.map(r=>r.id_sistema===id?{...r,...upd}:r))} />
               </div>
            )}
          </div>
        ) : activeTab === 'reporte' ? (
          <div className="bg-white p-10 rounded-3xl shadow-sm border max-w-2xl mx-auto mt-10">
             <div className="flex items-center gap-4 mb-10 text-blue-600"><FileCheck size={40}/> <h3 className="text-2xl font-black text-slate-800 tracking-tight">Informe de Gestión Mensual</h3></div>
             <FileCard title="Archivo Master" status={files.master} onUpload={(e: any)=>handleFileUpload(e,'master')} color="amber" />
             <button onClick={async ()=>{
                if(!files.master.loaded) return alert('Carga el Master');
                setProcessing(true); setStatusMessage('Generando Informe...');
                try {
                  const res = await new ReportEngine().generateReport(files.master.secondaryData||[], files.master.data||[], '/templates/plantilla_gestion.xlsx');
                  download(res.excelBuffer, 'INFORME_GESTION.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                  if(res.txtContent) download(new TextEncoder().encode(res.txtContent), 'COMENTARIOS.txt', 'text/plain');
                  setProcessing(false);
                } catch(e) { alert('Error: ' + e); setProcessing(false); }
             }} className="w-full mt-10 py-6 bg-slate-900 text-white font-black rounded-3xl shadow-2xl hover:bg-slate-800 transition-all text-lg flex items-center justify-center gap-3"><Download size={24}/> Iniciar Generación</button>
          </div>
        ) : (
          <div className="bg-white p-12 rounded-3xl shadow-sm border max-w-2xl mx-auto mt-10">
             <h3 className="text-2xl font-black mb-8 flex items-center gap-4 text-amber-500"><CircleDollarSign size={36}/> Legalización Masiva Automática</h3>
             <div className="flex gap-3 mb-10 overflow-x-auto pb-2">
                {['1367', '1368', '1369', 'TODOS'].map(t=>(
                  <button key={t} onClick={()=>setSelectedLegalizationTipo(t==='TODOS'?['1367','1368','1369']:[t])} className={`px-6 py-3 rounded-2xl font-black border-2 transition-all text-xs whitespace-nowrap ${selectedLegalizationTipo.includes(t)?'border-amber-500 bg-amber-50 text-amber-700 shadow-md':'border-slate-50 text-slate-400 hover:border-slate-200'}`}>{t}</button>
                ))}
             </div>
             <FileCard title="Base General (Master)" status={files.master} onUpload={(e: any)=>handleFileUpload(e,'master')} color="amber" />
             <button onClick={async ()=>{
                if(!files.master.loaded) return alert('Carga el Master');
                setProcessing(true); setStatusMessage('Procesando Masivo...');
                try {
                  const template = await(await fetch('/templates/Plantilla_Legalizacion_masiva.xls')).arrayBuffer();
                  const res = await new LegalizationEngine().processLegalization(files.master.secondaryData||[], selectedLegalizationTipo, template);
                  download(res.excelBuffer, 'REPORTES_LEGALIZACION.xlsx', 'application/vnd.ms-excel');
                  if(res.txtContent) download(new TextEncoder().encode(res.txtContent), 'PLANILLA_EXTERNA.txt', 'text/plain');
                  setProcessing(false);
                } catch(e) { alert('Error inesperado'); setProcessing(false); }
             }} className="w-full mt-10 py-5 bg-amber-500 text-slate-950 font-black rounded-2xl shadow-xl hover:bg-amber-400 transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-3"><Download size={20}/> Procesar y Descargar</button>
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: ReactNode, label: string, collapsed: boolean }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer transition-all ${active ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400/20' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}>
      {icon} {!collapsed && <span>{label}</span>}
    </div>
  );
}

function FileCard({ title, status, onUpload, color }: { title: string, status: any, onUpload: (e: any) => void, color: string }) {
  const bg = color === 'blue' ? 'bg-blue-50 text-blue-500' : color === 'emerald' ? 'bg-emerald-50 text-emerald-500' : color === 'amber' ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-500';
  return (
    <div className={`p-5 rounded-3xl border border-slate-100 shadow-sm transition-all group ${status.loaded ? 'ring-2 ring-emerald-500 bg-emerald-50/10' : 'bg-white hover:shadow-md'}`}>
       <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3 transform group-hover:scale-110 transition-transform`}><Database size={20}/></div>
       <h4 className="font-black text-slate-800 text-[11px] mb-1.5 leading-none tracking-tight">{title}</h4>
       <p className="text-[9px] text-slate-400 font-bold uppercase truncate mb-4">{status.loaded ? status.name : 'Pendiente'}</p>
       <label className="cursor-pointer font-black text-[10px] block bg-slate-50 py-2 rounded-xl text-center hover:bg-slate-900 hover:text-white transition-all text-slate-600 shadow-sm"><input type="file" className="hidden" onChange={onUpload} /> {status.loaded ? 'REEMPLAZAR' : 'CARGAR ARCHIVO'}</label>
    </div>
  );
}
