import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Clock, BarChart3, DollarSign, Package, AlertCircle, Printer } from 'lucide-react';
import PlantillaDocumentoComercial from './PlantillaDocumentoComercial';

const normalizarMoneda = (valor) => {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return 0;
  return Math.round((numero + Number.EPSILON) * 100) / 100;
};

const esCredito = (factura) => factura?.formaPago === 'Credito';
const obtenerTotal = (factura) => normalizarMoneda(factura?.total || 0);
const obtenerAbonoInicial = (factura) => normalizarMoneda(factura?.abonoInicial || 0);

const obtenerTotalPagado = (factura) => {
  if (typeof factura?.totalPagado === 'number') return normalizarMoneda(factura.totalPagado);
  if (esCredito(factura)) {
    if (factura?.estadoPago === 'Pagado' || factura?.estadoPago === 'Saldado') return obtenerTotal(factura);
    return obtenerAbonoInicial(factura);
  }
  return obtenerTotal(factura);
};

const obtenerSaldoPendiente = (factura) => {
  if (!esCredito(factura)) return 0;
  if (typeof factura?.saldoPendiente === 'number') return Math.max(0, normalizarMoneda(factura.saldoPendiente));
  return Math.max(0, normalizarMoneda(obtenerTotal(factura) - obtenerTotalPagado(factura)));
};

const obtenerEstadoCredito = (factura) => {
  if (!esCredito(factura)) return '-';
  return obtenerSaldoPendiente(factura) === 0 ? 'Saldado' : 'Pendiente';
};

const resolverHistorialAbonos = (factura) => {
  if (Array.isArray(factura?.historialAbonos)) return { campo: 'historialAbonos', lista: factura.historialAbonos };
  if (Array.isArray(factura?.historialPagos)) return { campo: 'historialPagos', lista: factura.historialPagos };
  return { campo: 'historialAbonos', lista: [] };
};

const normalizarDocumentoParaImpresion = (factura) => {
  const itemsNormalizados = Array.isArray(factura?.items)
    ? factura.items.map((item, index) => {
      const cantidad = normalizarMoneda(item?.cant ?? item?.cantidad ?? item?.cantVenta ?? 0);
      const precio = normalizarMoneda(item?.precio ?? item?.precioSel ?? item?.precioUnitario ?? 0);
      const subtotal = item?.subtotal != null
        ? normalizarMoneda(item.subtotal)
        : normalizarMoneda(cantidad * precio);

      return {
        id: item?.id || `${factura?.id || 'doc'}-item-${index}`,
        codigo: item?.codigo || item?.cod || '',
        descripcion: item?.desc || item?.descripcion || 'Sin descripción',
        cantVenta: cantidad,
        precioSel: precio,
        subtotal
      };
    })
    : [];

  const totalItems = normalizarMoneda(itemsNormalizados.reduce((sum, item) => sum + item.subtotal, 0));

  return {
    tipo: factura?.tipo || 'Factura',
    numeroDocumento: factura?.numeroDocumento || '',
    fecha: factura?.fecha || new Date().toISOString(),
    formaPago: factura?.formaPago || 'Efectivo',
    cliente: factura?.cliente || 'Cliente Mostrador',
    telefono: factura?.telefono || '',
    ruc: factura?.ruc || '',
    notas: factura?.notas || '',
    total: factura?.total != null ? normalizarMoneda(factura.total) : totalItems,
    items: itemsNormalizados
  };
};

export default function ModuloHistorial() {
  const [pestaña, setPestaña] = useState('general');
  const [logs, setLogs] = useState([]);
  
  // Estados para BI
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [clienteSel, setClienteSel] = useState('');
  const [modalAbono, setModalAbono] = useState({ abierto: false, factura: null });
  const [modalDocumento, setModalDocumento] = useState({ abierto: false, factura: null });
  const [montoAbono, setMontoAbono] = useState('');
  const [notaAbono, setNotaAbono] = useState('');
  const [errorAbono, setErrorAbono] = useState('');
  const [guardandoAbono, setGuardandoAbono] = useState(false);

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

  const abrirModalAbono = (factura) => {
    setModalAbono({ abierto: true, factura });
    setMontoAbono('');
    setNotaAbono('');
    setErrorAbono('');
  };

  const abrirModalDocumento = (factura) => {
    setModalDocumento({ abierto: true, factura });
  };

  const cerrarModalAbono = () => {
    if (guardandoAbono) return;
    setModalAbono({ abierto: false, factura: null });
    setMontoAbono('');
    setNotaAbono('');
    setErrorAbono('');
  };

  const cerrarModalDocumento = () => {
    setModalDocumento({ abierto: false, factura: null });
  };

  const registrarAbono = async () => {
    const facturaActual = modalAbono.factura;
    if (!facturaActual) return;

    const saldoActual = obtenerSaldoPendiente(facturaActual);
    const valorIngresado = Number(montoAbono);

    if (Number.isNaN(valorIngresado) || valorIngresado <= 0) {
      setErrorAbono('El abono debe ser mayor que C$ 0.00.');
      return;
    }

    const monto = normalizarMoneda(valorIngresado);
    if (monto > saldoActual) {
      setErrorAbono(`El abono no puede superar el saldo pendiente (C$ ${saldoActual.toLocaleString('en-US', { minimumFractionDigits: 2 })}).`);
      return;
    }

    setGuardandoAbono(true);
    try {
      const totalDocumento = obtenerTotal(facturaActual);
      const totalPagadoActual = obtenerTotalPagado(facturaActual);
      const nuevoTotalPagado = normalizarMoneda(Math.min(totalDocumento, totalPagadoActual + monto));
      const nuevoSaldoPendiente = normalizarMoneda(Math.max(0, totalDocumento - nuevoTotalPagado));
      const nuevoEstado = nuevoSaldoPendiente === 0 ? 'Saldado' : 'Pendiente';

      const { campo, lista } = resolverHistorialAbonos(facturaActual);
      const movimiento = {
        fecha: new Date().toISOString(),
        monto,
        tipo: 'Abono',
        nota: notaAbono.trim() || ''
      };

      const payload = {
        totalPagado: nuevoTotalPagado,
        saldoPendiente: nuevoSaldoPendiente,
        estadoPago: nuevoEstado,
        [campo]: [...lista, movimiento]
      };

      if (typeof facturaActual.abonoInicial !== 'number') {
        payload.abonoInicial = obtenerAbonoInicial(facturaActual);
      }

      await updateDoc(doc(db, "facturas", facturaActual.id), payload);
      await cargarDatos();
      cerrarModalAbono();
    } finally {
      setGuardandoAbono(false);
    }
  };

  // Cálculos de BI para el cliente seleccionado
  const docsCliente = facturas.filter(f => f.cliente === clienteSel);
  const totalComprado = docsCliente
    .filter(f => f.tipo === 'Factura')
    .reduce((sum, factura) => sum + obtenerTotal(factura), 0);
  const deudaPendiente = docsCliente
    .filter(factura => esCredito(factura))
    .reduce((sum, factura) => sum + obtenerSaldoPendiente(factura), 0);
  
  // Encontrar el producto más comprado
  let contadorProd = {};
  docsCliente.filter(f=>f.tipo==='Factura').forEach(f => {
    f.items?.forEach(i => { contadorProd[i.desc] = (contadorProd[i.desc] || 0) + i.cant; });
  });
  const prodEstrella = Object.keys(contadorProd).length > 0 ? Object.keys(contadorProd).reduce((a, b) => contadorProd[a] > contadorProd[b] ? a : b) : 'Ninguno aún';
  const documentoSeleccionado = modalDocumento.factura ? normalizarDocumentoParaImpresion(modalDocumento.factura) : null;

  return (
    <>
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-[calc(100vh-4rem)] flex flex-col overflow-hidden print:hidden">
      
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
                    <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="p-3">Fecha</th><th className="p-3">Documento</th><th className="p-3">Monto</th><th className="p-3 text-center">Método</th><th className="p-3 text-center">Estado (Créditos)</th><th className="p-3 text-center">Acciones</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {docsCliente.length === 0 ? (<tr><td colSpan="6" className="p-6 text-center text-slate-400">No hay registros para este cliente.</td></tr>) : 
                       docsCliente.map(factura => (
                        <tr key={factura.id} className="hover:bg-slate-50">
                          <td className="p-3 text-slate-500">{new Date(factura.fecha).toLocaleDateString()}</td>
                          <td className="p-3 font-bold text-slate-700">{factura.tipo} {factura.numeroDocumento ? `#${factura.numeroDocumento}` : ''}</td>
                          <td className="p-3 font-medium">C$ {obtenerTotal(factura).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="p-3 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{factura.formaPago}</span></td>
                          <td className="p-3 text-center">
                            {esCredito(factura) ? (
                              obtenerEstadoCredito(factura) === 'Pendiente' ? 
                                <button onClick={() => abrirModalAbono(factura)} className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-red-200">Pendiente (Abonar)</button> : 
                                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Saldado</span>
                            ) : <span className="text-slate-300">-</span>}
                            {esCredito(factura) && (
                              <p className="text-[10px] text-slate-500 font-semibold mt-1">
                                Saldo: C$ {obtenerSaldoPendiente(factura).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button onClick={() => abrirModalDocumento(factura)} className="inline-flex items-center gap-1 text-xs font-bold bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-900">
                              <Printer size={14} /> Ver / Reimprimir
                            </button>
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

      {modalDocumento.abierto && modalDocumento.factura && documentoSeleccionado && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-6xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-800 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h4 className="text-lg font-bold">Vista de Documento Comercial</h4>
                <p className="text-xs text-slate-200">
                  {documentoSeleccionado.tipo} {documentoSeleccionado.numeroDocumento ? `#${documentoSeleccionado.numeroDocumento}` : ''} • {documentoSeleccionado.cliente}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white font-bold hover:bg-emerald-600">
                  <Printer size={16} /> Imprimir / Guardar PDF
                </button>
                <button onClick={cerrarModalDocumento} className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold hover:bg-slate-100">
                  Cerrar
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-100">
              <div className="max-h-[70vh] overflow-auto border border-slate-300 rounded-lg bg-slate-300 p-4">
                <PlantillaDocumentoComercial documento={documentoSeleccionado} />
              </div>
            </div>
          </div>
        </div>
      )}

      {modalAbono.abierto && modalAbono.factura && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-800 text-white flex justify-between items-center">
              <h4 className="text-lg font-bold">Registrar Abono</h4>
              <button onClick={cerrarModalAbono} className="text-slate-200 hover:text-white font-bold text-xl leading-none" aria-label="Cerrar modal">×</button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Cliente</p><p className="font-bold text-slate-700">{modalAbono.factura.cliente}</p></div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Documento</p><p className="font-bold text-slate-700">{modalAbono.factura.tipo} {modalAbono.factura.numeroDocumento ? `#${modalAbono.factura.numeroDocumento}` : ''}</p></div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Total</p><p className="font-bold text-slate-700">C$ {obtenerTotal(modalAbono.factura).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Saldo Pendiente</p><p className="font-bold text-red-600">C$ {obtenerSaldoPendiente(modalAbono.factura).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Monto del Abono (C$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={montoAbono}
                  onChange={(e) => {
                    const valor = e.target.value.replace(',', '.');
                    if (/^\d*(\.\d{0,2})?$/.test(valor) || valor === '') {
                      setMontoAbono(valor);
                      setErrorAbono('');
                    }
                  }}
                  className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:border-emerald-500 font-bold text-slate-700"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Nota del Abono (Opcional)</label>
                <input
                  type="text"
                  value={notaAbono}
                  onChange={(e) => setNotaAbono(e.target.value)}
                  className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:border-emerald-500 text-slate-700"
                  placeholder="Ej: Abono por transferencia"
                />
              </div>

              {errorAbono && <p className="text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg p-2">{errorAbono}</p>}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button onClick={cerrarModalAbono} disabled={guardandoAbono} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
              <button onClick={registrarAbono} disabled={guardandoAbono} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50">
                {guardandoAbono ? 'Guardando...' : 'Guardar Abono'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    {modalDocumento.abierto && documentoSeleccionado && (
      <PlantillaDocumentoComercial documento={documentoSeleccionado} soloImpresion />
    )}
    </>
  );
}
