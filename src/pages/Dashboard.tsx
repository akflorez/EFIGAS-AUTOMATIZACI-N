import { useState, type ChangeEvent, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { ProcessingEngine } from '../logic/engine';
import type { RegistroNormalizado, BaseGeneralRaw } from '../types';
import ReviewTable from '../components/ReviewTable';
import { 
  Upload, FileCheck, AlertCircle, Play, Download, 
  Settings, Database, ClipboardList, PackageCheck,
  Home, LogOut, ChevronRight, BarChart3,
  Layers, User as UserIcon, Calendar, AlertTriangle
} from 'lucide-react';

interface FileStatus {
  loaded: boolean;
  name: string;
  data: any[];
  secondaryData?: any[]; // Para BASE GENERAL
  error?: string;
}

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<string>('procesar');
  const [disponiblesFechas, setDisponiblesFechas] = useState<string[]>([]);
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
  const [ resultados, setResultados] = useState< RegistroNormalizado []>([]);
  const [showOnlyInvalid, setShowOnlyInvalid] = useState(false);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>, type: 'movilidad' | 'terreno' | 'master' | 'maestro') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Feedback inmediato de carga
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
        
        // Ejecutar en microtarea para no bloquear el renderizado inicial
        setTimeout(() => {
          try {
            const wb = XLSX.read(bstr, { type: 'binary' });
            
        if (type === 'master') {
          const convSheetName = wb.SheetNames.find(n => n.toUpperCase().includes('CONV'));
          const baseSheetName = wb.SheetNames.find(n => n.toUpperCase() === 'BASE GENERAL');
          
          const convData = convSheetName ? XLSX.utils.sheet_to_json(wb.Sheets[convSheetName]) : [];
          const baseData = baseSheetName ? XLSX.utils.sheet_to_json(wb.Sheets[baseSheetName]) : [];
          
          setFiles((prev: DashboardFiles) => ({
            ...prev,
            master: { 
              loaded: true, 
              name: file.name, 
              data: convData, 
              secondaryData: baseData, 
              error: convSheetName && baseSheetName ? undefined : 'Faltan pestañas requeridas (CONV o BASE GENERAL)' 
            }
          }));
        } else if (type === 'terreno' || type === 'movilidad') {
          // Buscar la primera hoja que tenga datos reales
          let data: any[] = [];
          for (const sName of wb.SheetNames) {
            const tempData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sName]);
            if (tempData.length > 0) {
              data = tempData;
              break;
            }
          }
          
          if (data.length === 0) {
             setFiles((prev: DashboardFiles) => ({
               ...prev,
               [type]: { ...prev[type], name: file.name, error: 'Archivo sin datos en ninguna pestaña' }
             }));
             return;
          }

          const uniqueDates = Array.from(new Set(data.map((row: any) => {
            const keys = Object.keys(row);
            const dateKey = keys.find(k => {
              const lk = k.toLowerCase();
              return lk.includes('fecha') || lk.includes('time') || lk.includes('gestion') || lk.includes('completada') || lk.includes('compromiso');
            });
            
            const dateValue = dateKey ? row[dateKey] : Object.values(row)[0];
            if (!dateValue) return '';

            let dateStr = dateValue.toString().split(' ')[0];
            if (!isNaN(Number(dateStr)) && dateStr.length < 8) {
              const d = new Date(Math.round((Number(dateStr) - 25569) * 86400 * 1000));
              dateStr = d.toISOString().split('T')[0];
            } else if (dateStr.includes('/')) {
              try {
                const parts = dateStr.split(/[/-]/);
                if (parts.length === 3) {
                  // Manejar DD/MM/YYYY y YYYY/MM/DD
                  let d, m, y;
                  if (parts[0].length === 4) { y = parts[0]; m = parts[1]; d = parts[2]; }
                  else { y = parts[2].length === 2 ? `20${parts[2]}` : parts[2]; m = parts[1]; d = parts[0]; }
                  dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                }
              } catch { /* ignore */ }
            } else if (dateStr.includes('-')) {
               dateStr = dateStr.split(' ')[0];
            }
            return dateStr;
          }))).filter(d => !!d).sort() as string[];

          setDisponiblesFechas((prev: string[]) => Array.from(new Set([...prev, ...uniqueDates])).sort());
          setFechaInicio('');
          setFechaFin('');

          setFiles((prev: DashboardFiles) => ({
            ...prev,
            [type]: { loaded: true, name: file.name, data, error: undefined }
          }));
        } else if (type === 'maestro') {
          // Buscar la primera hoja que tenga datos reales
          let data: any[] = [];
          for (const sName of wb.SheetNames) {
            const tempData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sName]);
            if (tempData.length > 0) {
              data = tempData;
              break;
            }
          }
          setFiles((prev: DashboardFiles) => ({
            ...prev,
            maestro: { loaded: true, name: file.name, data, error: undefined }
          }));
        }
          } catch (e) {
             setFiles((prev: DashboardFiles) => {
               const next = { ...prev };
               if (type === 'movilidad') next.movilidad = { ...next.movilidad, error: 'Error al parsear XLSX' };
               if (type === 'terreno') next.terreno = { ...next.terreno, error: 'Error al parsear XLSX' };
               if (type === 'master') next.master = { ...next.master, error: 'Error al parsear XLSX' };
               if (type === 'maestro') next.maestro = { ...next.maestro, error: 'Error al parsear XLSX' };
               return next;
             });
          }
        }, 100);
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      setFiles((prev: DashboardFiles) => {
        const next = { ...prev };
        if (type === 'movilidad') next.movilidad = { ...next.movilidad, error: 'Error al leer archivo' };
        if (type === 'terreno') next.terreno = { ...next.terreno, error: 'Error al leer archivo' };
        if (type === 'master') next.master = { ...next.master, error: 'Error al leer archivo' };
        if (type === 'maestro') next.maestro = { ...next.maestro, error: 'Error al leer archivo' };
        return next;
      });
    }
  };

  const processData = async () => {
    if (!files.movilidad.loaded || !files.terreno.loaded || !files.master.loaded) {
      alert('Por favor carga los tres archivos requeridos.');
      return;
    }
    
    setProcessing(true);
    setProgress(5);
    setStatusMessage('Iniciando Motor v46.9 (Efigas)...');

    try {
      // Instanciar motor
      const engine = new ProcessingEngine();
      
      // Fase 0: Indexar Maestro Homologación (v46)
      if (files.maestro.loaded) {
        setStatusMessage('Cargando Maestro de Homologación...');
        engine.indexMasters(files.maestro.data);
      }

      // Fase 1: Indexar Base General
      setStatusMessage('Analizando Base General...');
      await engine.indexBaseGeneral(files.master.secondaryData as BaseGeneralRaw[], (p) => {
        setProgress(5 + Math.floor(p * 0.1)); // 5% a 15%
      });

      // Fase 3: Procesamiento Total
      setStatusMessage('Procesando Orígenes (Movilidad + Terreno)...');
      
      const movWithComments = files.movilidad.data.filter((r: any) => engine.consolidateMovilidadComments(r)).length;
      const results = engine.processAll(files.movilidad.data, files.terreno.data, fechaInicio, fechaFin);
      
      const movFinal = results.filter(r => r.fuente_principal === 'movilidad').length;
      const terFinal = results.filter(r => r.fuente_principal === 'terreno').length;

      setProgress(90);
      setStatusMessage(`Resultados: Movilidad (${files.movilidad.data.length} total -> ${movWithComments} con comentarios -> ${movFinal} en fecha) | Terreno (${files.terreno.data.length} total -> ${terFinal} en fecha).`);
      
      if (results.length === 0) {
        setStatusMessage('ADVERTENCIA: No se encontraron registros que cumplan las condiciones.');
      }
      
      setResultados(results);
      setProgress(100);
      setProcessing(false);
    } catch (err: any) {
      console.error('Error en procesamiento:', err);
      setStatusMessage(`ERROR CRÍTICO: ${err.message || 'Error desconocido'}`);
      setProcessing(false);
      alert(`Ocurrió un error: ${err.message}`);
    }
  };

  const removeFile = (type: 'movilidad' | 'terreno' | 'master' | 'maestro') => {
    setFiles((prev: DashboardFiles) => ({
      ...prev,
      [type]: { loaded: false, name: '', data: [], secondaryData: type === 'master' ? [] : undefined }
    }));
    // Si borramos un fuente, también borramos resultados e historial de fechas
    if (type === 'movilidad' || type === 'terreno') {
      setResultados([]);
      setDisponiblesFechas([]);
      setFechaInicio('');
      setFechaFin('');
    }
  };

  const clearAll = () => {
    setFiles({
      movilidad: { loaded: false, name: '', data: [] },
      terreno: { loaded: false, name: '', data: [] },
      master: { loaded: false, name: '', data: [], secondaryData: [] },
      maestro: { loaded: false, name: '', data: [] },
    });
    setResultados([]);
    setDisponiblesFechas([]);
    setFechaInicio('');
    setFechaFin('');
    setStatusMessage('');
    setProgress(0);
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
    
    // Force UTF-8 BOM first, so Excel Latam opens it natively with columns correctly spaced
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `visitas_v46.9.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // exportAnomalias removed in v34

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <aside className="w-72 bg-[#0a1118] text-white flex flex-col p-6 fixed h-full z-20 shadow-2xl">
        <div className="mb-12 px-2">
          <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Layers className="text-black" size={24} />
             </div>
             <h1 className="text-xl font-black tracking-tighter">EMDECOB</h1>
          </div>
          <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest pl-1">Efigas Masivo</p>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem 
            active={activeTab === 'procesar'} 
            onClick={() => setActiveTab('procesar')} 
            icon={<Home size={20} />} 
            label="Procesamiento" 
          />
          <NavItem 
            active={activeTab === 'historial'} 
            onClick={() => setActiveTab('historial')} 
            icon={<BarChart3 size={20} />} 
            label="Estadísticas" 
          />
          <NavItem 
            active={activeTab === 'config'} 
            onClick={() => setActiveTab('config')} 
            icon={<Settings size={20} />} 
            label="Configuración" 
          />
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5">
          <button 
            onClick={onLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all w-full font-medium"
          >
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-72 p-10 animate-premium">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Generador de Visitas v46.9</h2>
            <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
               <span>Operaciones</span>
               <ChevronRight size={14} />
               <span className="text-efigas-primary font-bold">Motor v46 (Homologación Maestra Final) Activo</span>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white p-2 pr-5 rounded-2xl shadow-sm border border-slate-100">
             <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                <UserIcon size={20} className="text-slate-600" />
             </div>
             <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter leading-none mb-1">Usuario Efigas</p>
                <p className="text-sm font-black text-slate-800 leading-none">Operador Senior</p>
             </div>
             
             {Object.values(files).some(f => f.loaded) && (
               <button 
                 onClick={clearAll}
                 className="ml-4 p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                 title="Reiniciar Todo"
               >
                 <LogOut size={18} className="rotate-180" />
               </button>
             )}
          </div>
        </header>

        {activeTab === 'procesar' ? (
          <div className="space-y-8">
            {disponiblesFechas.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm animate-in slide-in-from-top duration-500">
                <div className="flex flex-col mb-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-efigas-primary/10 rounded-lg flex items-center justify-center text-efigas-primary">
                      <Calendar size={18} />
                    </div>
                    <h4 className="text-sm font-black text-slate-700 uppercase tracking-tight">Rango de Fechas (Movilidad y Terreno)</h4>
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-6 md:items-center">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Fecha Desde</label>
                      <input 
                        type="date" 
                        value={fechaInicio}
                        className="border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-efigas-primary w-full shadow-sm"
                        onChange={(e) => setFechaInicio(e.target.value)}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Fecha Hasta</label>
                      <input 
                        type="date" 
                        value={fechaFin}
                        className="border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-efigas-primary w-full shadow-sm"
                        onChange={(e) => setFechaFin(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center">
                  <div className="flex gap-2 text-xs text-slate-500 uppercase font-black tracking-widest">
                    <span>Filtro Actual:</span>
                    {(!fechaInicio && !fechaFin) ? (
                      <span className="text-efigas-primary">Todos los días (Se procesa TODO)</span>
                    ) : (
                      <span className="text-emerald-600">
                        {fechaInicio ? `Desde ${fechaInicio} ` : 'Desde el inicio '}
                        {fechaFin ? `Hasta ${fechaFin}` : 'Hasta el final'}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 flex justify-between items-center pt-4 border-t border-slate-50">
                   <p className="text-[10px] text-slate-400 font-bold italic">
                     *Si dejas ambos vacíos, se procesarán todas las fechas disponibles.
                   </p>
                   <div className="flex gap-4">
                     <button 
                       onClick={() => { setFechaInicio(''); setFechaFin(''); }}
                       className="text-[10px] text-slate-400 font-bold uppercase hover:text-slate-600 transition-colors"
                     >
                       Limpiar Filtro
                     </button>
                   </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <FileCard 
                title="Export Movilidad"
                icon={<Database size={24} />}
                status={files.movilidad}
                onUpload={(e: ChangeEvent<HTMLInputElement>) => handleFileUpload(e, 'movilidad')}
                onRemove={() => removeFile('movilidad')}
                accent="blue"
              />
              <FileCard 
                title="Gestión Terreno"
                icon={<ClipboardList size={24} />}
                status={files.terreno}
                onUpload={(e: ChangeEvent<HTMLInputElement>) => handleFileUpload(e, 'terreno')}
                onRemove={() => removeFile('terreno')}
                accent="green"
              />
              <FileCard 
                title="Base Seguimiento (Master)"
                icon={<AlertCircle size={24} />}
                status={files.master}
                onUpload={(e: ChangeEvent<HTMLInputElement>) => handleFileUpload(e, 'master')}
                onRemove={() => removeFile('master')}
                accent="amber"
                description="Debe contener CONV y BASE GENERAL"
              />
               <FileCard 
                 title="Maestro Homologación"
                 icon={<Settings size={24} />}
                 status={files.maestro}
                 onUpload={(e: ChangeEvent<HTMLInputElement>) => handleFileUpload(e, 'maestro')}
                 accent="slate"
                 description="MAESTROS PERFIL Y MOTIVOS NO PAGOS"
               />
            </div>

            <section className="glass-card p-12 text-center relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-efigas-primary via-emerald-500 to-efigas-primary"></div>
               
               {!resultados.length ? (
                 <div className="max-w-2xl mx-auto">
                    {processing ? (
                      <div className="animate-in fade-in zoom-in duration-500">
                        <div className="w-24 h-24 bg-efigas-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8 relative">
                           <div className="absolute inset-0 border-4 border-efigas-primary/20 rounded-3xl"></div>
                           <div 
                             className="absolute inset-0 border-4 border-efigas-primary rounded-3xl transition-all duration-500"
                             style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }}
                           ></div>
                           <Layers size={40} className="text-efigas-primary animate-pulse" />
                        </div>
                        
                        <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Procesando Inteligencia de Negocio</h3>
                        <p className="text-efigas-primary font-bold text-sm uppercase tracking-widest mb-8">{statusMessage}</p>
                        
                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner mb-4">
                           <div 
                             className="h-full bg-gradient-to-r from-efigas-primary to-emerald-500 transition-all duration-500 ease-out shadow-lg"
                             style={{ width: `${progress}%` }}
                           ></div>
                        </div>
                        <p className="text-slate-400 font-bold text-xs">{progress}% completado</p>
                      </div>
                    ) : (
                      <>
                        <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner shadow-blue-200/50">
                           <Play size={40} className="text-efigas-primary ml-1" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Validación Cruzada de Visitas</h3>
                        
                        {/* Selector de fechas reubicado arriba (v14) */}

                        <p className="text-slate-500 mb-10 leading-relaxed text-lg">
                           Cargue los archivos para validar productos y cédulas contra la <span className="font-bold text-emerald-600">Base General</span>. El sistema aplicará el nuevo formato de exportación del Libro de Visitas.
                        </p>
                        <button 
                          onClick={processData}
                          disabled={!files.movilidad.loaded || !files.terreno.loaded || !files.master.loaded}
                          className="btn-premium flex items-center gap-3 mx-auto px-10 py-5 text-xl group"
                        >
                           Iniciar Validación y Cruce
                           <ChevronRight className="group-hover:translate-x-1 transition-transform" />
                        </button>
                      </>
                    )}
                    {files.master.error && <p className="text-red-500 text-xs mt-4 font-bold">{files.master.error}</p>}
                 </div>
               ) : (
                 <div className="text-left w-full animate-premium">
                    <div className="flex flex-wrap justify-between items-end gap-6 mb-10">
                       <div className="flex gap-12">
                          <KPI label="Total Procesados" value={resultados.length} onClick={() => setShowOnlyInvalid(false)} active={!showOnlyInvalid} />
                          <KPI label="Validados en Base" value={resultados.filter(r => r.identificacion_valida).length} color="text-efigas-success" onClick={() => setShowOnlyInvalid(false)} />
                          <KPI label="No Encontrados" value={resultados.filter(r => !r.identificacion_valida).length} color="text-efigas-error" onClick={() => setShowOnlyInvalid(true)} active={showOnlyInvalid} />
                       </div>
                         <div className="flex gap-4">
                           <button 
                             onClick={processData}
                             className="btn-secondary flex items-center justify-center gap-3 px-8 border-efigas-primary text-efigas-primary hover:bg-efigas-primary/5"
                           >
                             <Play size={18} /> Actualizar con Nuevas Fechas
                           </button>
                           <button 
                             onClick={exportCSV}
                             className="btn-premium bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-emerald-500/20 flex items-center justify-center gap-3 px-8"
                           >
                             <Download size={20} /> Exportar Libro de Visitas CSV v46.9
                           </button>
                         </div>
                    </div>

                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6 flex items-center gap-4 mb-10">
                       <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/10">
                          <PackageCheck size={24} className="text-white" />
                       </div>
                       <div>
                          <p className="font-black text-emerald-900">Validación de Identidad Completada</p>
                          <p className="text-sm text-emerald-700/80 font-medium">Se han validado productos y cédulas extraídas de la Base General.</p>
                       </div>
                    </div>

                     {/* Resumen de Filtro Activo */}
          {showOnlyInvalid && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl animate-premium">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <AlertTriangle className="text-red-500" size={20} />
                </div>
                <div>
                  <h4 className="font-black text-red-900 leading-tight">Registros sin Cruce (Base General)</h4>
                  <p className="text-sm text-red-700 font-bold opacity-80">
                    Estos registros no tienen correspondencia de CONTRATO/PRODUCTO en la Base General.
                  </p>
                </div>
              </div>
            </div>
          )}

          <ReviewTable 
                       data={showOnlyInvalid ? resultados.filter(r => !r.identificacion_valida) : resultados} 
                       onUpdate={updateRegistro} 
                     />
                 </div>
               )}
            </section>
          </div>
        ) : (
          <div className="glass-card p-20 text-center">
             <BarChart3 size={60} className="text-slate-200 mx-auto mb-6" />
             <h3 className="text-xl font-bold text-slate-400 uppercase tracking-widest">Analítica de Gestión</h3>
             <p className="text-slate-400 mt-2">Próximamente: Histórico de cargas y efectividad de visitas.</p>
          </div>
        )}
      </main>
    </div>
  );
}

interface NavItemProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

function NavItem({ active, onClick, icon, label }: NavItemProps) {
  return (
    <div 
      onClick={onClick}
      className={active ? "sidebar-item-active" : "sidebar-item text-white/50 hover:bg-white/5"}
    >
      {icon}
      <span>{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 bg-efigas-primary rounded-full"></div>}
    </div>
  );
}

interface FileCardProps {
  title: string;
  icon: ReactNode;
  status: FileStatus;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  accent?: 'blue' | 'green' | 'amber' | 'slate';
  description?: string;
}

function FileCard({ title, icon, status, onUpload, onRemove, accent, description }: FileCardProps) {
  const accentClasses = {
    blue: 'border-blue-500/20 text-blue-600 bg-blue-50',
    green: 'border-emerald-500/20 text-emerald-600 bg-emerald-50',
    amber: 'border-amber-500/20 text-amber-600 bg-amber-50',
    slate: 'border-slate-500/20 text-slate-600 bg-slate-50',
  };

  const currentAccent = accent && accentClasses[accent] ? accentClasses[accent] : accentClasses.blue;

  return (
    <div className={`glass-card p-6 border-b-4 transition-all duration-500 hover:translate-y-[-4px] ${currentAccent} ${status.loaded ? 'ring-2 ring-emerald-500/30' : ''}`}>
      <div className={`w-14 h-14 ${currentAccent} rounded-2xl flex items-center justify-center mb-6 transition-all group-hover:scale-110 shadow-sm`}>
        {icon}
      </div>
      
      <h4 className="text-lg font-black text-slate-800 tracking-tight">{title}</h4>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter mt-1 mb-2">Información de Origen</p>
      {description && <p className="text-[10px] text-slate-400 font-medium mb-6 italic">{description}</p>}
      
      {!status.loaded ? (
        <label className="cursor-pointer">
          <input type="file" className="hidden" onChange={onUpload} accept=".xlsx,.xls,.csv" />
          <div className="flex items-center justify-center gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-all text-sm group-hover:border-slate-300">
            {status.error?.includes('Leyendo') ? (
              <>
                <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="text-blue-600">Procesando...</span>
              </>
            ) : (
              <>
                <Upload size={16} /> Subir Archivo
              </>
            )}
          </div>
        </label>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
            <FileCheck size={16} className="text-emerald-600" />
            <span className="text-xs font-bold text-emerald-700 truncate flex-1">{status.name}</span>
            <button 
              onClick={onRemove}
              className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors ml-2"
              title="Borrar archivo"
            >
              <LogOut size={12} className="rotate-180" />
            </button>
         </div>
      )}
    </div>
  );
}

interface KPIProps {
  label: string;
  value: number;
  color?: string;
  onClick?: () => void;
  active?: boolean;
}

function KPI({ label, value, color = "text-slate-900", onClick, active }: KPIProps) {
  return (
    <div 
      onClick={onClick}
      className={`cursor-pointer transition-all duration-300 p-2 rounded-xl ${active ? 'bg-efigas-primary/5 ring-1 ring-efigas-primary/20' : 'hover:bg-slate-50'}`}
    >
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-black ${color} tracking-tight tabular-nums`}>{value}</p>
    </div>
  );
}
