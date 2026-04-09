import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Clock, BarChart3, DollarSign, Package, AlertCircle } from 'lucide-react';

export default function ModuloHistorial() {
  const [pestaña, setPestaña] = useState('general');
  const [logs, setLogs] = useState([]);
  
  // Estados para BI
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [clienteSel, setClienteSel] = useState('');

  const cargarDatos = async () => {
    // Cargar Logs generales
    const snapLogs = await getDocs(collection(db, "historial"));
    setLogs(snapLogs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.fecha) - new Date(a.fecha)));
    
    // Cargar datos para BI (Facturas y CRM)
    const snapFac = await getDocs(collection(db, "facturas"));
    setFacturas(snapFac.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.fecha) - new Date(a.fecha)));
    
    const snapCli = await getDocs(collection(db, "clientes"));
    setClientes(snapCli.docs.map(d => `${d.data().nombres} ${d.data().apellidos}`));
  };

  useEffect(() => { cargarDatos(); }, [pestaña]);

  const marcarPagado = async (idFactura) => {
    if(window.confirm("¿Confirmas que el cliente ya pagó esta factura de crédito?")) {
      await updateDoc(doc(db, "facturas", idFactura), { estadoPago: 'Pagado' });
      cargarDatos();
    }
  };

  // Cálculos de BI para el cliente seleccionado
  const docsCliente = facturas.filter(f => f.cliente === clienteSel);
  const totalComprado = docsCliente.filter(f => f.tipo === 'Factura').reduce((sum, f) => sum + f.total, 0);
  const deudaPendiente = docsCliente.filter(f => f.formaPago === 'Credito' && f.estadoPago === 'Pendiente').reduce((sum, f) => sum + f.total, 0);
  
  // Encontrar el producto más comprado
  let contadorProd = {};
  docsCliente.filter(f=>f.tipo==='Factura').forEach(f => {
    f.items?.forEach(i => { contadorProd[i.desc] = (contadorProd[i.desc] || 0) + i.cant; });
  });
  const prodEstrella = Object.keys(contadorProd).length > 0 ? Object.keys(contadorProd).reduce((a, b) => contadorProd[a] > contadorProd[b] ? a : b) : 'Ninguno aún';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      
      {/* TABS HEADER */}
      <div className="flex border-b bg-slate-50 px-6 pt-4 space-x-6 shrink-0">
        <button onClick={() => setPestaña('general')} className={`pb-3 px-2 font-bold flex items-center border-b-2 transition-colors ${pestaña === 'general' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Clock size={18} className="mr-2"/> Historial en Vivo</button>
        <button onClick={() => setPestaña('bi')} className={`pb-3 px-2 font-bold flex items-center border-b-2 transition-colors ${pestaña === 'bi' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><BarChart3 size={18} className="mr-2"/> Análisis por Cliente</button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto bg-white">
        
        {/* PESTAÑA 1: HISTORIAL GENERAL */}
        {pestaña === 'general' && (
          <ul className="space-y-3">
            {logs.map(log => (
              <li key={log.id} className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex flex-col hover:border-emerald-100 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center">
                     <span className="font-black text-slate-800 text-xs uppercase tracking-widest mr-3">{log.tipo}</span>
                     <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">{log.usuario}</span>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">{new Date(log.fecha).toLocaleString()}</span>
                </div>
                <p className="text-slate-600 text-sm">{log.descripcion}</p>
              </li>
            ))}
          </ul>
        )}

        {/* PESTAÑA 2: BUSINESS INTELLIGENCE */}
        {pestaña === 'bi' && (
          <div>
            <div className="mb-6 flex flex-col md:flex-row items-center justify-between bg-slate-800 p-6 rounded-xl text-white">
              <div className="w-full md:w-1/2">
                <label className="block text-xs text-slate-300 uppercase tracking-widest mb-2 font-bold">Seleccionar Cliente a Analizar</label>
                <select value={clienteSel} onChange={e => setClienteSel(e.target.value)} className="w-full bg-slate-700 border-none outline-none p-3 rounded-lg text-white font-bold cursor-pointer appearance-none">
                  <option value="">-- Elige un cliente del CRM --</option>
                  {clientes.map((c, i) => <option key={i} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {clienteSel ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex items-center"><div className="bg-green-100 p-3 rounded-full mr-4 text-green-600"><DollarSign size={24}/></div><div><p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Comprado</p><p className="text-2xl font-black text-slate-800">C$ {totalComprado.toLocaleString('en-US', {minimumFractionDigits:2})}</p></div></div>
                  <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex items-center"><div className="bg-red-100 p-3 rounded-full mr-4 text-red-600"><AlertCircle size={24}/></div><div><p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Deuda Pendiente</p><p className="text-2xl font-black text-red-600">C$ {deudaPendiente.toLocaleString('en-US', {minimumFractionDigits:2})}</p></div></div>
                  <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex items-center"><div className="bg-blue-100 p-3 rounded-full mr-4 text-blue-600"><Package size={24}/></div><div><p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Producto Favorito</p><p className="text-sm font-bold text-slate-800 truncate w-32" title={prodEstrella}>{prodEstrella}</p></div></div>
                </div>

                <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Desglose de Operaciones</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="p-3">Fecha</th><th className="p-3">Documento</th><th className="p-3">Monto</th><th className="p-3 text-center">Método</th><th className="p-3 text-center">Estado (Créditos)</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {docsCliente.length === 0 ? (<tr><td colSpan="5" className="p-6 text-center text-slate-400">No hay registros para este cliente.</td></tr>) : 
                       docsCliente.map(doc => (
                        <tr key={doc.id} className="hover:bg-slate-50">
                          <td className="p-3 text-slate-500">{new Date(doc.fecha).toLocaleDateString()}</td>
                          <td className="p-3 font-bold text-slate-700">{doc.tipo}</td>
                          <td className="p-3 font-medium">C$ {doc.total.toLocaleString('en-US')}</td>
                          <td className="p-3 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{doc.formaPago}</span></td>
                          <td className="p-3 text-center">
                            {doc.formaPago === 'Credito' ? (
                              doc.estadoPago === 'Pendiente' ? 
                                <button onClick={()=>marcarPagado(doc.id)} className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-red-200">Pendiente (Abonar)</button> : 
                                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Saldado</span>
                            ) : <span className="text-slate-300">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-slate-400">Selecciona un cliente arriba para ver sus métricas y deudas.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}