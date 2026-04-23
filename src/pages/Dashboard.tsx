import { useState, type ChangeEvent, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { ProcessingEngine } from '../logic/engine';
import type { RegistroNormalizado } from '../types';
import ReviewTable from '../components/ReviewTable';
import { ReportEngine } from '../logic/reportEngine';
import { LegalizationEngine } from '../logic/legalizationEngine';
import { 
  FileCheck, AlertCircle, Play, 
  Settings, Database, ClipboardList,
  ChevronRight,
  Layers, User as UserIcon, Calendar,
  CircleDollarSign, Map
} from 'lucide-react';

interface FileStatus {
  loaded: boolean;
  name: string;
  data: any[];
  secondaryData?: any[]; 
  error?: string;
}

export default function Dashboard() {
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
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [resultados, setResultados] = useState<RegistroNormalizado[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedLegalizationTipo, setSelectedLegalizationTipo] = useState<string[]>(['1367']);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>, type: 'movilidad' | 'terreno' | 'master' | 'maestro') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFiles((prev: DashboardFiles) => {
      const next = { ...prev };
      if (type === 'movilidad') next.movilidad = { ...next.movilidad, name: file.name, loaded: false, error: 'Leyendo archivo...' };
      if (type === 'terreno') next.terreno = { ...next.terreno, name: file.name, loaded: false, error: 'Leyendo archivo...' };
      if (type === 'master') next.master = { ...next.master, name: file.name, loaded: false, error: 'Leyendo archivo...' };
      if (type === 'maestro') next.maestro = { ...next.maestro, name: file.name, loaded: false, error: 'Leyendo archivo...' };
      return next;
    });

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
              
              if (!convSheetName || !baseSheetName) {
                const errorMsg = `Error: No se encontró pestaña clave`;
                setFiles((prev: DashboardFiles) => ({
                  ...prev,
                  master: { ...prev.master, loaded: false, error: errorMsg, name: file.name }
                }));
                alert(errorMsg);
                return;
              }
              
              const convData = XLSX.utils.sheet_to_json(wb.Sheets[convSheetName]);
              const baseData = XLSX.utils.sheet_to_json(wb.Sheets[baseSheetName], { header: 1 });
              
              setFiles((prev: DashboardFiles) => ({
                ...prev,
                master: { loaded: true, name: file.name, data: convData, secondaryData: baseData, error: undefined }
              }));
            } else if (type === 'terreno' || type === 'movilidad') {
              let data: any[] = [];
              for (const sName of wb.SheetNames) {
                const tempData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sName]);
                if (tempData.length > 0) { data = tempData; break; }
              }
              
              if (data.length === 0) {
                 setFiles((prev: DashboardFiles) => ({
                   ...prev,
                   [type]: { ...prev[type], name: file.name, error: 'Archivo vacío' }
                 }));
                 return;
              }

              setFiles((prev: DashboardFiles) => ({
                ...prev,
                [type]: { loaded: true, name: file.name, data, error: undefined }
              }));
            } else if (type === 'maestro') {
              let data: any[] = [];
              for (const sName of wb.SheetNames) {
                const tempData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sName]);
                if (tempData.length > 0) { data = tempData; break; }
              }
              setFiles((prev: DashboardFiles) => ({
                ...prev,
                maestro: { loaded: true, name: file.name, data, error: undefined }
              }));
            }
          } catch (e) {
             setFiles((prev: DashboardFiles) => ({ ...prev, [type]: { ...prev[type], error: 'Error Excel' } }));
          }
        }, 100);
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      setFiles((prev: DashboardFiles) => ({ ...prev, [type]: { ...prev[type], error: 'Error' } }));
    }
  };

  const processData = async () => {
    const missing = [];
    if (!files.movilidad.loaded) missing.push("Movilidad");
    if (!files.terreno.loaded) missing.push("Terreno");
    if (!files.master.loaded) missing.push("Master");
    if (missing.length > 0) { alert('Faltan archivos'); return; }

    setResultados([]);
    setProcessing(true);
    setProgress(2);
    setStatusMessage('Motor v46.10.2...');

    try {
      const engine = new ProcessingEngine();
      if (files.maestro.loaded) engine.indexMasters(files.maestro.data);
      await engine.indexBaseGeneral(files.master.secondaryData as any[], (p) => setProgress(5 + Math.floor(p * 0.15)));
      
      const results = engine.processAll(files.movilidad.data, files.terreno.data, fechaInicio, fechaFin);
      const { movTotal, movConCausal, terTotal, terEnFecha } = engine.stats;

      if (results.length === 0) {
        setStatusMessage(`Cero resultados. Diagnóstico: [Mov: ${movTotal}, ${movConCausal} causal] | [Ter: ${terTotal}, ${terEnFecha} fecha]`);
      } else {
        setStatusMessage(`¡Éxito! ${results.length} hallados.`);
      }
      
      setResultados(results);
      setProgress(100);
      setTimeout(() => setProcessing(false), 1000);
    } catch (err: any) {
      setStatusMessage(`ERROR: ${err.message}`);
      setProcessing(false);
    }
  };

  const removeFile = (type: 'movilidad' | 'terreno' | 'master' | 'maestro') => {
    setFiles((prev: DashboardFiles) => ({
      ...prev,
      [type]: { loaded: false, name: '', data: [], secondaryData: type === 'master' ? [] : undefined }
    }));
  };

  const updateRegistro = (id: string, updates: Partial<RegistroNormalizado>) => {
    setResultados((prev: RegistroNormalizado[]) => prev.map(r => r.id_sistema === id ? { ...r, ...updates } : r));
  };

  const exportCSV = () => {
    if (!resultados.length) return;
    const engine = new ProcessingEngine();
    const exportData = engine.createExportData(resultados);
    const ws = XLSX.utils.json_to_sheet(exportData);
    const csvContent = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `visitas.csv`;
    link.click();
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {processing && activeTab === 'reporte' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center">
           <div className="bg-white p-12 rounded-3xl shadow-2xl max-w-lg w-full text-center">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
              <h3 className="text-2xl font-black text-slate-900">Generando Informe</h3>
              <p className="text-emerald-600 font-bold text-sm uppercase mb-6">{statusMessage}</p>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }}></div></div>
           </div>
        </div>
      )}

      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-72'} bg-[#0a1118] text-white flex flex-col p-6 fixed h-full z-20 transition-all`}>
        <div className="mb-12 px-2 flex items-center justify-between">
          {!isSidebarCollapsed && (
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center"><Layers size={24} /></div>
                <div><h1 className="text-xl font-black">EMDECOB</h1><p className="text-[10px] text-emerald-400 font-bold uppercase">Masivo</p></div>
             </div>
          )}
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2 hover:bg-white/10 rounded-lg text-white/50">
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronRight size={20} className="rotate-180" />}
          </button>
        </div>
        <nav className="flex-1 space-y-2">
          <NavItem active={activeTab === 'procesar'} onClick={() => setActiveTab('procesar')} icon={<Map size={20} />} label="Visitas Terreno" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'reporte'} onClick={() => setActiveTab('reporte')} icon={<FileCheck size={20} />} label="Informe de Causales" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === 'legalizacion'} onClick={() => setActiveTab('legalizacion')} icon={<CircleDollarSign size={20} />} label="Legalizaciones" collapsed={isSidebarCollapsed} />
        </nav>
      </aside>

      <main className={`flex-1 ${isSidebarCollapsed ? 'ml-20' : 'ml-72'} p-10 transition-all`}>
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-black text-slate-900">Generador v46.10.2</h2>
            <p className="text-efigas-primary font-bold text-sm mt-1">Motor Independiente</p>
          </div>
          <div className="flex items-center gap-4 bg-white p-2 pr-5 rounded-2xl border">
             <UserIcon size={20} className="text-slate-600" />
             <p className="text-sm font-black text-slate-800">Operador Senior</p>
          </div>
        </header>

        {activeTab === 'procesar' ? (
          <div className="space-y-8">
            <div className="bg-white border rounded-3xl p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1"><label className="block text-xs font-bold uppercase mb-2">Fecha Desde</label><input type="date" value={fechaInicio} className="border rounded-xl px-4 py-3 w-full" onChange={(e: ChangeEvent<HTMLInputElement>) => setFechaInicio(e.target.value)} /></div>
                  <div className="flex-1"><label className="block text-xs font-bold uppercase mb-2">Fecha Hasta</label><input type="date" value={fechaFin} className="border rounded-xl px-4 py-3 w-full" onChange={(e: ChangeEvent<HTMLInputElement>) => setFechaFin(e.target.value)} /></div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <FileCard title="Movilidad" icon={<Database size={24} />} status={files.movilidad} onUpload={(e: ChangeEvent<HTMLInputElement>) => handleFileUpload(e, 'movilidad')} onRemove={() => removeFile('movilidad')} accent="blue" />
              <FileCard title="Terreno" icon={<ClipboardList size={24} />} status={files.terreno} onUpload={(e: ChangeEvent<HTMLInputElement>) => handleFileUpload(e, 'terreno')} onRemove={() => removeFile('terreno')} accent="green" />
              <FileCard title="Master" icon={<AlertCircle size={24} />} status={files.master} onUpload={(e: ChangeEvent<HTMLInputElement>) => handleFileUpload(e, 'master')} onRemove={() => removeFile('master')} accent="amber" />
              <FileCard title="Maestro" icon={<Settings size={24} />} status={files.maestro} onUpload={(e: ChangeEvent<HTMLInputElement>) => handleFileUpload(e, 'maestro')} onRemove={() => removeFile('maestro')} accent="slate" />
            </div>

            <section className="bg-white p-12 text-center rounded-3xl border">
               {!resultados.length ? (
                 <div className="max-w-2xl mx-auto">
                    {processing ? (
                      <div><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div><h3 className="text-xl font-bold">{statusMessage}</h3></div>
                    ) : (
                      <>
                        <h3 className="text-2xl font-black text-slate-900 mb-4">Validar Visitas</h3>
                        <p className="text-slate-500 mb-8">Pestaña de validación cruzada para Movilidad y Terreno.</p>
                        <button onClick={processData} className="btn-premium px-12 py-5 text-xl">Iniciar Proceso</button>
                      </>
                    )}
                 </div>
               ) : (
                 <div className="text-left w-full">
                    <div className="flex justify-between items-end mb-8">
                       <div className="flex gap-10">
                          <KPI label="Total" value={resultados.length} />
                          <KPI label="Válidos" value={resultados.filter(r => r.identificacion_valida).length} color="text-emerald-500" />
                       </div>
                       <div className="flex gap-4"><button onClick={processData} className="btn-secondary px-6">Actualizar</button><button onClick={exportCSV} className="btn-premium px-8">Exportar CSV</button></div>
                    </div>
                    <ReviewTable data={resultados} onUpdate={updateRegistro} />
                 </div>
               )}
            </section>
          </div>
        ) : activeTab === 'reporte' ? (
          <div className="space-y-8">
             <div className="bg-white border rounded-3xl p-10">
                <div className="flex items-center gap-4 mb-8">
                   <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white"><FileCheck size={32} /></div>
                   <div><h3 className="text-2xl font-black">Módulo de Informe de Gestión</h3><p className="text-slate-500">Carga el Master y genera el informe.</p></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                  <FileCard title="Archivo Master" icon={<Database size={24} />} status={files.master} onUpload={(e: ChangeEvent<HTMLInputElement>) => handleFileUpload(e, 'master')} onRemove={() => removeFile('master')} accent="amber" />
                </div>
                <div className="bg-slate-900 rounded-3xl p-10 text-white flex justify-between items-center">
                   <div><h4 className="text-xl font-black">¿Generar Informe?</h4><p className="text-slate-400">Proceso autónomo basado en Master.</p></div>
                   <button 
                     onClick={async () => {
                        if (!files.master.loaded) return alert('Carga el Master');
                        setProcessing(true);
                        try {
                           const engine = new ReportEngine();
                           const result = await engine.generateReport(files.master.secondaryData || [], files.master.data || [], '/templates/plantilla_gestion.xlsx');
                           const blob = new Blob([result.excelBuffer], { type: 'application/octet-stream' });
                           const url = URL.createObjectURL(blob);
                           const link = document.createElement('a');
                           link.href = url; link.download = `INFORME_GESTION.xlsx`; link.click();
                           setProcessing(false);
                        } catch (err: any) { alert(err.message); setProcessing(false); }
                     }}
                     disabled={!files.master.loaded || processing}
                     className="btn-premium px-12 py-5 text-xl"
                   >Generar Ahora</button>
                </div>
             </div>
          </div>
        ) : (
          <div className="space-y-8">
             <div className="bg-white p-10 border rounded-3xl">
                <h3 className="text-2xl font-black mb-8">Legalizaciones</h3>
                <div className="grid grid-cols-4 gap-4 mb-8">
                   {['1367', '1368', '1369', 'TODOS'].map(t => (
                     <button key={t} onClick={() => setSelectedLegalizationTipo(t === 'TODOS' ? ['1367', '1368', '1369'] : [t])} className={`p-4 rounded-xl font-bold border ${selectedLegalizationTipo.includes(t) || (t === 'TODOS' && selectedLegalizationTipo.length === 3) ? 'bg-amber-500 text-white' : 'bg-slate-50'}`}>{t}</button>
                   ))}
                </div>
                <FileCard title="Base General" icon={<Database size={24} />} status={files.master} onUpload={(e: ChangeEvent<HTMLInputElement>) => { handleFileUpload(e, 'master'); }} onRemove={() => removeFile('master')} accent="amber" />
                <button 
                  onClick={async () => {
                    if (!files.master.loaded) return alert('Sube la base');
                    setProcessing(true);
                    try {
                      const engine = new LegalizationEngine();
                      const response = await fetch('/templates/Plantilla_Legalizacion_masiva.xls');
                      const templateBuffer = await response.arrayBuffer();
                      const result = await engine.processLegalization(files.master.secondaryData || [], selectedLegalizationTipo, templateBuffer);
                      const blob = new Blob([result.excelBuffer], { type: 'application/octet-stream' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url; link.download = `LEGALIZACION.xlsx`; link.click();
                      setProcessing(false);
                    } catch (e: any) { alert(e.message); setProcessing(false); }
                  }}
                  className="w-full mt-8 py-5 bg-slate-900 text-white font-black rounded-2xl"
                >Procesar Legalización</button>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: ReactNode, label: string, collapsed: boolean }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>
      {icon} {!collapsed && <span className="font-bold text-sm">{label}</span>}
    </div>
  );
}

function FileCard({ title, icon, status, onUpload, onRemove, accent }: any) {
  return (
    <div className={`bg-white p-6 rounded-3xl border ${status.loaded ? 'ring-2 ring-emerald-500/20' : ''}`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${accent === 'blue' ? 'bg-blue-50 text-blue-500' : accent === 'green' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100'}`}>{icon}</div>
      <h4 className="font-black text-slate-800 text-sm mb-1">{title}</h4>
      <p className="text-[10px] text-slate-400 font-bold uppercase mb-4 truncate">{status.loaded ? status.name : 'Pendiente'}</p>
      {!status.loaded ? (
        <label className="cursor-pointer"><input type="file" className="hidden" onChange={onUpload} /><div className="bg-slate-50 border py-2 rounded-xl text-center text-xs font-black">SUBIR</div></label>
      ) : (
        <button onClick={onRemove} className="w-full bg-red-50 text-red-500 py-2 rounded-xl text-xs font-black">CAMBIAR</button>
      )}
    </div>
  );
}

function KPI({ label, value, color = "text-slate-900" }: { label: string, value: number, color?: string }) {
  return (
    <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</p><p className={`text-2xl font-black ${color}`}>{value}</p></div>
  );
}
