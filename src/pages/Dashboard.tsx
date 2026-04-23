import { useState, type ChangeEvent, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { ProcessingEngine } from '../logic/engine';
import type { RegistroNormalizado } from '../types';
import ReviewTable from '../components/ReviewTable';
import { ReportEngine } from '../logic/reportEngine';
import { LegalizationEngine } from '../logic/legalizationEngine';
import { 
  FileCheck, 
  ChevronRight, LogOut,
  User as UserIcon,
  CircleDollarSign, Map
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

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>, type: 'movilidad' | 'terreno' | 'master' | 'maestro') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFiles((prev: DashboardFiles) => ({
      ...prev,
      [type]: { ...prev[type], name: file.name, loaded: false, error: 'Leyendo...' }
    }));

    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result as string;
        setTimeout(() => {
          try {
            const wb = XLSX.read(bstr, { type: 'binary' });
            if (type === 'master') {
              const sheetNames = wb.SheetNames;
              const convSheetName = sheetNames.find(n => n.toUpperCase().includes('CONV'));
              const baseSheetName = sheetNames.find(n => n.toUpperCase().includes('BASE GENERAL'));
              if (!convSheetName || !baseSheetName) throw new Error('Master incompleto');
              setFiles((prev: DashboardFiles) => ({
                ...prev,
                master: { loaded: true, name: file.name, data: XLSX.utils.sheet_to_json(wb.Sheets[convSheetName]), secondaryData: XLSX.utils.sheet_to_json(wb.Sheets[baseSheetName], { header: 1 }), error: undefined }
              }));
            } else if (type === 'terreno' || type === 'movilidad') {
              let data: any[] = [];
              for (const sName of wb.SheetNames) {
                const tempData = XLSX.utils.sheet_to_json(wb.Sheets[sName]);
                if (tempData.length > 0) { data = tempData; break; }
              }
              setFiles((prev: DashboardFiles) => ({ ...prev, [type]: { loaded: true, name: file.name, data, error: undefined } }));
            } else if (type === 'maestro') {
              setFiles((prev: DashboardFiles) => ({ ...prev, maestro: { loaded: true, name: file.name, data: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]), error: undefined } }));
            }
          } catch (e: any) { alert(e.message); }
        }, 100);
      };
      reader.readAsBinaryString(file);
    } catch (err) { console.error(err); }
  };

  const processData = async () => {
    if (!files.movilidad.loaded || !files.terreno.loaded || !files.master.loaded) return alert('Suba los archivos');
    setResultados([]); setProcessing(true); setStatusMessage('Motor v46.10.3...');
    try {
      const engine = new ProcessingEngine();
      if (files.maestro.loaded) engine.indexMasters(files.maestro.data);
      await engine.indexBaseGeneral(files.master.secondaryData as any[], () => {});
      const results = engine.processAll(files.movilidad.data, files.terreno.data, fechaInicio, fechaFin);
      setResultados(results); setStatusMessage('¡Completado!');
      setTimeout(() => setProcessing(false), 1000);
    } catch (err: any) { alert(err.message); setProcessing(false); }
  };

  const removeFile = (type: 'movilidad' | 'terreno' | 'master' | 'maestro') => {
    setFiles((prev: DashboardFiles) => ({ ...prev, [type]: { loaded: false, name: '', data: [], secondaryData: type === 'master' ? [] : undefined } }));
  };

  const updateRegistro = (id: string, updates: Partial<RegistroNormalizado>) => {
    setResultados((prev: RegistroNormalizado[]) => prev.map(r => r.id_sistema === id ? { ...r, ...updates } : r));
  };

  const exportCSV = () => {
    if (!resultados.length) return;
    const ws = XLSX.utils.json_to_sheet(new ProcessingEngine().createExportData(resultados));
    const blob = new Blob(["\uFEFF" + XLSX.utils.sheet_to_csv(ws, { FS: ";" })], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `visitas.csv`; link.click();
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {processing && activeTab === 'reporte' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center">
           <div className="bg-white p-12 rounded-3xl text-center">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
              <h3 className="text-xl font-black">Generando Reporte</h3>
              <p className="text-emerald-600 font-bold uppercase">{statusMessage}</p>
           </div>
        </div>
      )}

      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-72'} bg-[#0a1118] text-white flex flex-col p-6 fixed h-full z-20 transition-all`}>
        <div className="mb-12 flex justify-between items-center text-xl font-black uppercase tracking-tighter">
          {!isSidebarCollapsed && 'EMDECOB'}
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2 text-white/50"><ChevronRight className={isSidebarCollapsed ? '' : 'rotate-180'} /></button>
        </div>
        <nav className="flex-1 space-y-2">
          <NavItem active={activeTab === 'procesar'} onClick={() => setActiveTab('procesar')} icon={<Map size={20} />} label="Visitas" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'reporte'} onClick={() => setActiveTab('reporte')} icon={<FileCheck size={20} />} label="Reportes" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'legalizacion'} onClick={() => setActiveTab('legalizacion')} icon={<CircleDollarSign size={20} />} label="Finanzas" collapsed={isSidebarCollapsed} />
        </nav>
        <div className="mt-auto pt-6 border-t border-white/5">
          <button onClick={onLogout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white w-full"><LogOut size={20} /> {!isSidebarCollapsed && 'Cerrar Sesión'}</button>
        </div>
      </aside>

      <main className={`flex-1 ${isSidebarCollapsed ? 'ml-20' : 'ml-72'} p-10 transition-all`}>
        <header className="flex justify-between items-center mb-10 text-slate-800">
          <div><h2 className="text-3xl font-black">Efigas v46.10.3</h2><p className="text-emerald-600 font-bold uppercase text-xs">Motor Selectivo</p></div>
          <div className="flex items-center gap-3 border rounded-2xl p-2 px-4 bg-white"><UserIcon size={20} /> <span className="font-bold">Efigas User</span></div>
        </header>

        {activeTab === 'procesar' ? (
          <div className="space-y-8">
            <div className="bg-white border rounded-3xl p-6">
                <p className="text-[10px] font-black text-emerald-600 uppercase mb-4">Filtro Terreno (Timestamp)</p>
                <div className="flex gap-6">
                  <input type="date" value={fechaInicio} className="border rounded-xl px-4 py-3 w-full" onChange={(e: any) => setFechaInicio(e.target.value)} />
                  <input type="date" value={fechaFin} className="border rounded-xl px-4 py-3 w-full" onChange={(e: any) => setFechaFin(e.target.value)} />
                </div>
            </div>
            <div className="grid grid-cols-4 gap-6">
               <FileCard title="Movilidad" status={files.movilidad} onUpload={(e: any) => handleFileUpload(e, 'movilidad')} onRemove={() => removeFile('movilidad')} accent="blue" />
               <FileCard title="Terreno" status={files.terreno} onUpload={(e: any) => handleFileUpload(e, 'terreno')} onRemove={() => removeFile('terreno')} accent="green" />
               <FileCard title="Master" status={files.master} onUpload={(e: any) => handleFileUpload(e, 'master')} onRemove={() => removeFile('master')} accent="amber" />
               <FileCard title="Maestro" status={files.maestro} onUpload={(e: any) => handleFileUpload(e, 'maestro')} onRemove={() => removeFile('maestro')} accent="slate" />
            </div>
            <section className="bg-white p-12 text-center rounded-3xl border">
               {!resultados.length ? (
                 <div className="max-w-xl mx-auto">
                    {processing ? <div className="animate-spin w-10 h-10 border-4 border-emerald-500 rounded-full mx-auto"></div> : <button onClick={processData} className="btn-premium px-12 py-5 text-xl">Iniciar Validación</button>}
                 </div>
               ) : (
                 <div className="text-left">
                    <div className="flex justify-between items-center mb-8">
                       <div className="flex gap-10">
                          <KPI label="Total" value={resultados.length} />
                          <KPI label="Validados" value={resultados.filter(r => r.identificacion_valida).length} color="text-emerald-500" />
                       </div>
                       <button onClick={exportCSV} className="btn-premium px-8">Exportar CSV</button>
                    </div>
                    <ReviewTable data={resultados} onUpdate={updateRegistro} />
                 </div>
               )}
            </section>
          </div>
        ) : activeTab === 'reporte' ? (
          <div className="bg-white border rounded-3xl p-10">
             <h3 className="text-2xl font-black mb-8">Informe de Gestión</h3>
             <FileCard title="Master" status={files.master} onUpload={(e: any) => handleFileUpload(e, 'master')} onRemove={() => removeFile('master')} accent="amber" />
             <div className="mt-8 bg-slate-900 p-10 rounded-3xl text-white flex justify-between items-center">
                <div><h4 className="text-xl font-black underline decoration-emerald-500">¿Descargar Reporte?</h4><p className="text-slate-400 text-sm">Usa los datos del Master cargado arriba.</p></div>
                <button onClick={async () => {
                   if (!files.master.loaded) return alert('Sube el Master');
                   try {
                      setProcessing(true);
                      const result = await new ReportEngine().generateReport(files.master.secondaryData || [], files.master.data || [], '/templates/plantilla_gestion.xlsx');
                      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([result.excelBuffer])); link.download = 'REPORTE.xlsx'; link.click();
                      setProcessing(false);
                   } catch(e) { setProcessing(false); }
                }} className="btn-premium px-12 py-5 text-xl">Ejecutar Ahora</button>
             </div>
          </div>
        ) : (
          <div className="bg-white p-10 rounded-3xl border">
             <h3 className="text-2xl font-black mb-8">Finanzas & Legalización</h3>
             <div className="grid grid-cols-4 gap-4 mb-8">
               {['1367', '1368', '1369', 'TODOS'].map(t => <button key={t} onClick={() => setSelectedLegalizationTipo(t === 'TODOS' ? ['1367', '1368', '1369'] : [t])} className={`p-4 rounded-xl font-bold border ${selectedLegalizationTipo.includes(t) ? 'bg-amber-500 text-white' : 'bg-slate-50'}`}>{t}</button>)}
             </div>
             <FileCard title="Base" status={files.master} onUpload={(e: any) => handleFileUpload(e, 'master')} onRemove={() => removeFile('master')} accent="amber" />
             <button onClick={async () => {
                if (!files.master.loaded) return alert('Suba la base');
                setProcessing(true);
                try {
                   const res = await fetch('/templates/Plantilla_Legalizacion_masiva.xls');
                   const result = await new LegalizationEngine().processLegalization(files.master.secondaryData || [], selectedLegalizationTipo, await res.arrayBuffer());
                   const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([result.excelBuffer])); link.download = 'LEGALIZACION.xlsx'; link.click();
                   setProcessing(false);
                } catch(e) { setProcessing(false); }
             }} className="w-full mt-8 py-5 bg-slate-900 text-white font-black rounded-2xl">Descargar Legalización</button>
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: ReactNode, label: string, collapsed: boolean }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>
      {icon} {!collapsed && <span className="font-bold text-sm tracking-tight">{label}</span>}
    </div>
  );
}

function FileCard({ title, status, onUpload, onRemove, accent }: any) {
  return (
    <div className={`bg-white p-6 rounded-3xl border ${status.loaded ? 'ring-2 ring-emerald-500 border-transparent shadow-lg' : 'border-slate-100'}`}>
       <div className={`w-2 h-2 rounded-full mb-4 ${accent === 'blue' ? 'bg-blue-500' : accent === 'green' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
       <h4 className="font-black text-slate-800 text-sm mb-1">{title}</h4>
       <p className="text-[10px] text-slate-400 font-bold uppercase mb-4 truncate">{status.loaded ? status.name : 'Pendiente'}</p>
       {!status.loaded ? <label className="cursor-pointer"><input type="file" className="hidden" onChange={onUpload} /><div className="bg-slate-50 border py-2 rounded-xl text-center text-xs font-black text-slate-600">SUBIR</div></label> : <button onClick={onRemove} className="w-full bg-red-50 text-red-500 py-2 rounded-xl text-xs font-black">CAMBIAR</button>}
    </div>
  );
}

function KPI({ label, value, color = "text-slate-900" }: { label: string, value: number, color?: string }) {
  return (
    <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</p><p className={`text-2xl font-black ${color}`}>{value}</p></div>
  );
}
