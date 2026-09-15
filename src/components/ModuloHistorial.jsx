import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, limit, orderBy, query, runTransaction, startAfter, where } from 'firebase/firestore';
import { Clock, BarChart3, DollarSign, Package, AlertCircle, Printer } from 'lucide-react';
import ModalDocumento from './ModalDocumento';
import { esAnulado, normalizarDocumentoParaImpresion } from '../utils/documentos';

const normalizarMoneda = (valor) => {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return 0;
  return Math.round((numero + Number.EPSILON) * 100) / 100;
};

const esCotizacion = (documento) => `${documento?.tipo || ''}`.toLowerCase().includes('cotiza');
const esCredito = (factura) => factura?.formaPago === 'Credito';
// Una cotización nunca es cuenta por cobrar: no hubo venta, no hay deuda que cobrar.
const esCuentaPorCobrar = (factura) => !esCotizacion(factura) && !esAnulado(factura) && esCredito(factura);
const obtenerTotal = (factura) => normalizarMoneda(factura?.total || 0);
const obtenerAbonoInicial = (factura) => normalizarMoneda(factura?.abonoInicial || 0);

const obtenerTotalPagado = (factura) => {
  if (typeof factura?.totalPagado === 'number') return normalizarMoneda(factura.totalPagado);
  if (esCuentaPorCobrar(factura)) {
    if (factura?.estadoPago === 'Pagado' || factura?.estadoPago === 'Saldado') return obtenerTotal(factura);
    return obtenerAbonoInicial(factura);
  }
  return obtenerTotal(factura);
};

const obtenerSaldoPendiente = (factura) => {
  if (!esCuentaPorCobrar(factura)) return 0;
  if (typeof factura?.saldoPendiente === 'number') return Math.max(0, normalizarMoneda(factura.saldoPendiente));
  return Math.max(0, normalizarMoneda(obtenerTotal(factura) - obtenerTotalPagado(factura)));
};

const obtenerEstadoCredito = (factura) => {
  if (!esCuentaPorCobrar(factura)) return '-';
  return obtenerSaldoPendiente(factura) === 0 ? 'Saldado' : 'Pendiente';
};

const resolverHistorialAbonos = (factura) => {
  if (Array.isArray(factura?.historialAbonos)) return { campo: 'historialAbonos', lista: factura.historialAbonos };
  if (Array.isArray(factura?.historialPagos)) return { campo: 'historialPagos', lista: factura.historialPagos };
  return { campo: 'historialAbonos', lista: [] };
};

const resolverMensajeErrorHistorial = (error) => {
  if (error?.code === 'monto-invalido') return error.message;
  if (error?.code === 'not-found') return 'La factura ya no existe o fue eliminada.';
  if (error?.code === 'failed-precondition') return 'No se pudo completar la operación por conflicto de datos.';
  if (error?.code === 'permission-denied') return 'No tienes permisos para actualizar este documento.';
  if (error?.code === 'unavailable') return 'Firestore no está disponible. Revisa tu conexión e intenta nuevamente.';
  return 'Ocurrió un error al procesar la operación.';
};

// normalizarDocumentoParaImpresion vive ahora en src/utils/documentos.js

// El historial crece con cada acción del sistema: se lee por páginas, de lo más nuevo a lo más viejo.
const PAGINA_HISTORIAL = 200;

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
  const [errorCarga, setErrorCarga] = useState('');
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [guardandoAbono, setGuardandoAbono] = useState(false);
  const [ultimoLog, setUltimoLog] = useState(null);
  const [hayMasLogs, setHayMasLogs] = useState(false);
  const [clientesCargados, setClientesCargados] = useState(false);

  // Antes se bajaban completas historial, facturas y clientes, y otra vez en cada cambio de
  // pestaña. Ahora cada pestaña lee solo lo que muestra, y una sola vez.
  const cargarHistorial = async (desde = null) => {
    setCargandoDatos(true);
    try {
      const partes = [orderBy('fecha', 'desc')];
      if (desde) partes.push(startAfter(desde));
      partes.push(limit(PAGINA_HISTORIAL));
      const snap = await getDocs(query(collection(db, 'historial'), ...partes));
      const nuevos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLogs((actuales) => (desde ? [...actuales, ...nuevos] : nuevos));
      setUltimoLog(snap.docs[snap.docs.length - 1] || desde);
      setHayMasLogs(snap.docs.length === PAGINA_HISTORIAL);
      setErrorCarga('');
    } catch (error) {
      console.error('Error cargando historial:', error);
      setErrorCarga(resolverMensajeErrorHistorial(error));
    } finally {
      setCargandoDatos(false);
    }
  };

  const cargarClientes = async () => {
    setCargandoDatos(true);
    try {
      const snap = await getDocs(collection(db, 'clientes'));
      setClientes(snap.docs.map((d) => ({
        id: d.id,
        nombre: `${d.data().nombres || ''} ${d.data().apellidos || ''}`.trim()
      })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setClientesCargados(true);
      setErrorCarga('');
    } catch (error) {
      console.error('Error cargando clientes:', error);
      setErrorCarga(resolverMensajeErrorHistorial(error));
    } finally {
      setCargandoDatos(false);
    }
  };

  // Solo los documentos del cliente elegido. Los antiguos sin idCliente se encuentran por
  // nombre, igual que antes; el filtro de docsCliente descarta los que son de otro cliente.
  const cargarFacturasCliente = async (cliente) => {
    if (!cliente) {
      setFacturas([]);
      return;
    }
    setCargandoDatos(true);
    try {
      const [porId, porNombre] = await Promise.all([
        getDocs(query(collection(db, 'facturas'), where('idCliente', '==', cliente.id))),
        cliente.nombre
          ? getDocs(query(collection(db, 'facturas'), where('cliente', '==', cliente.nombre)))
          : Promise.resolve({ docs: [] })
      ]);
      const unicos = new Map();
      [...porId.docs, ...porNombre.docs].forEach((d) => unicos.set(d.id, { id: d.id, ...d.data() }));
      setFacturas([...unicos.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      setErrorCarga('');
    } catch (error) {
      console.error('Error cargando documentos del cliente:', error);
      setErrorCarga(resolverMensajeErrorHistorial(error));
    } finally {
      setCargandoDatos(false);
    }
  };

  useEffect(() => { cargarHistorial(); }, []);

  useEffect(() => {
    if (pestaña === 'bi' && !clientesCargados) cargarClientes();
  }, [pestaña, clientesCargados]);

  useEffect(() => {
    cargarFacturasCliente(clientes.find((c) => c.id === clienteSel) || null);
  }, [clienteSel, clientes]);

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
    if (!facturaActual?.id) return;

    const valorIngresado = Number(montoAbono);

    if (Number.isNaN(valorIngresado) || valorIngresado <= 0) {
      setErrorAbono('El abono debe ser mayor que C$ 0.00.');
      return;
    }

    const monto = normalizarMoneda(valorIngresado);

    setGuardandoAbono(true);
    try {
      await runTransaction(db, async (transaction) => {
        const facturaRef = doc(db, "facturas", facturaActual.id);
        const facturaSnap = await transaction.get(facturaRef);

        if (!facturaSnap.exists()) {
          const error = new Error('No se encontró la factura para aplicar el abono.');
          error.code = 'not-found';
          throw error;
        }

        const facturaVigente = { id: facturaSnap.id, ...facturaSnap.data() };
        const saldoActual = obtenerSaldoPendiente(facturaVigente);
        if (monto > saldoActual) {
          const error = new Error(`El abono no puede superar el saldo pendiente (C$ ${saldoActual.toLocaleString('en-US', { minimumFractionDigits: 2 })}).`);
          error.code = 'monto-invalido';
          throw error;
        }

        const totalDocumento = obtenerTotal(facturaVigente);
        const totalPagadoActual = obtenerTotalPagado(facturaVigente);
        const nuevoTotalPagado = normalizarMoneda(Math.min(totalDocumento, totalPagadoActual + monto));
        const nuevoSaldoPendiente = normalizarMoneda(Math.max(0, totalDocumento - nuevoTotalPagado));
        const nuevoEstado = nuevoSaldoPendiente === 0 ? 'Saldado' : 'Pendiente';

        const { campo, lista } = resolverHistorialAbonos(facturaVigente);
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

        if (typeof facturaVigente.abonoInicial !== 'number') {
          payload.abonoInicial = obtenerAbonoInicial(facturaVigente);
        }

        transaction.update(facturaRef, payload);
      });
      await cargarFacturasCliente(clientes.find((c) => c.id === clienteSel) || null);
      cerrarModalAbono();
    } catch (error) {
      setErrorAbono(resolverMensajeErrorHistorial(error));
    } finally {
      setGuardandoAbono(false);
    }
  };

  // Cálculos de BI para el cliente seleccionado
  // El cruce se hace por idCliente para que renombrar un cliente no borre su
  // historial. El match por nombre queda solo para documentos antiguos sin id.
  const clienteActivo = clientes.find((c) => c.id === clienteSel) || null;
  const docsCliente = clienteActivo
    ? facturas.filter((f) => (f.idCliente ? f.idCliente === clienteActivo.id : f.cliente === clienteActivo.nombre))
    : [];
  const totalComprado = docsCliente
    .filter(f => f.tipo === 'Factura' && !esAnulado(f))
    .reduce((sum, factura) => sum + obtenerTotal(factura), 0);
  const deudaPendiente = docsCliente
    .filter(factura => esCuentaPorCobrar(factura))
    .reduce((sum, factura) => sum + obtenerSaldoPendiente(factura), 0);
  
  // Encontrar el producto más comprado
  let contadorProd = {};
  docsCliente.filter(f => f.tipo === 'Factura' && !esAnulado(f)).forEach(f => {
    f.items?.forEach(i => { contadorProd[i.desc] = (contadorProd[i.desc] || 0) + i.cant; });
  });
  const prodEstrella = Object.keys(contadorProd).length > 0 ? Object.keys(contadorProd).reduce((a, b) => contadorProd[a] > contadorProd[b] ? a : b) : 'Ninguno aún';
  const documentoSeleccionado = modalDocumento.factura ? normalizarDocumentoParaImpresion(modalDocumento.factura) : null;

  return (
    <>
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-auto md:h-[calc(100vh-4rem)] flex flex-col overflow-visible md:overflow-hidden print:hidden">
      
      {/* TABS HEADER */}
      <div className="flex flex-col sm:flex-row border-b bg-slate-50 px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 gap-2 sm:gap-6 shrink-0">
        <button onClick={() => setPestaña('general')} className={`pb-2.5 sm:pb-3 px-2 font-bold text-sm sm:text-base flex items-center justify-center sm:justify-start border-b-2 transition-colors ${pestaña === 'general' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Clock size={18} className="mr-2"/> Historial en Vivo</button>
        <button onClick={() => setPestaña('bi')} className={`pb-2.5 sm:pb-3 px-2 font-bold text-sm sm:text-base flex items-center justify-center sm:justify-start border-b-2 transition-colors ${pestaña === 'bi' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><BarChart3 size={18} className="mr-2"/> Análisis por Cliente</button>
      </div>

      <div className="p-3 sm:p-4 md:p-6 flex-1 overflow-y-visible md:overflow-y-auto bg-white">
        {cargandoDatos && (
          <div className="mb-4 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg">
            Cargando datos...
          </div>
        )}

        {errorCarga && (
          <div className="mb-4 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {errorCarga}
          </div>
        )}
        
        {/* PESTAÑA 1: HISTORIAL GENERAL */}
        {pestaña === 'general' && (
          <ul className="space-y-3">
            {logs.map(log => (
              <li key={log.id} className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm flex flex-col hover:border-emerald-100 transition-colors">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-2">
                  <div className="flex items-center flex-wrap gap-y-1">
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
        {pestaña === 'general' && hayMasLogs && !cargandoDatos && (
          <div className="text-center mt-4">
            <button onClick={() => cargarHistorial(ultimoLog)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-600 hover:bg-slate-100">
              Cargar actividad anterior
            </button>
          </div>
        )}
        {pestaña === 'general' && !hayMasLogs && logs.length > 0 && !cargandoDatos && (
          <p className="text-center text-[11px] text-slate-400 mt-4">No hay más actividad registrada.</p>
        )}

        {/* PESTAÑA 2: BUSINESS INTELLIGENCE */}
        {pestaña === 'bi' && (
          <div>
            <div className="mb-6 flex flex-col md:flex-row items-center justify-between bg-slate-800 p-4 sm:p-5 md:p-6 rounded-xl text-white">
              <div className="w-full md:w-1/2">
                <label className="block text-xs text-slate-300 uppercase tracking-widest mb-2 font-bold">Seleccionar Cliente a Analizar</label>
                <select value={clienteSel} onChange={e => setClienteSel(e.target.value)} className="w-full bg-slate-700 border-none outline-none p-3 rounded-lg text-white font-bold cursor-pointer appearance-none">
                  <option value="">-- Elige un cliente del CRM --</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>

            {clienteActivo ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex items-center"><div className="bg-green-100 p-3 rounded-full mr-4 text-green-600"><DollarSign size={24}/></div><div><p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Comprado</p><p className="text-2xl font-black text-slate-800">C$ {totalComprado.toLocaleString('en-US', {minimumFractionDigits:2})}</p></div></div>
                  <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex items-center"><div className="bg-red-100 p-3 rounded-full mr-4 text-red-600"><AlertCircle size={24}/></div><div><p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Deuda Pendiente</p><p className="text-2xl font-black text-red-600">C$ {deudaPendiente.toLocaleString('en-US', {minimumFractionDigits:2})}</p></div></div>
                  <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex items-center"><div className="bg-blue-100 p-3 rounded-full mr-4 text-blue-600"><Package size={24}/></div><div><p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Producto Favorito</p><p className="text-sm font-bold text-slate-800 truncate w-32" title={prodEstrella}>{prodEstrella}</p></div></div>
                </div>

                <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Desglose de Operaciones</h3>
                <div className="md:hidden space-y-3">
                  {docsCliente.length === 0 ? (
                    <div className="border border-slate-200 rounded-xl p-5 text-center text-sm text-slate-400">
                      No hay registros para este cliente.
                    </div>
                  ) : docsCliente.map((factura) => (
                    <div key={factura.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-700 text-sm">{factura.tipo} {factura.numeroDocumento ? `#${factura.numeroDocumento}` : ''}</p>
                          <p className="text-xs text-slate-500">{new Date(factura.fecha).toLocaleDateString()}</p>
                        </div>
                        <span className="text-sm font-black text-slate-800">C$ {obtenerTotal(factura).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[11px] font-bold">{factura.formaPago}</span>
                        {esCuentaPorCobrar(factura) ? (
                          obtenerEstadoCredito(factura) === 'Pendiente'
                            ? <button onClick={() => abrirModalAbono(factura)} className="bg-red-100 text-red-600 px-2.5 py-1 rounded-full text-[11px] font-bold hover:bg-red-200">Pendiente (Abonar)</button>
                            : <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[11px] font-bold">Saldado</span>
                        ) : <span className="text-slate-400 text-[11px] font-semibold">Sin crédito</span>}
                      </div>

                      {esCuentaPorCobrar(factura) && (
                        <p className="text-[11px] text-slate-500 font-semibold">
                          Saldo: C$ {obtenerSaldoPendiente(factura).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      )}

                      <button onClick={() => abrirModalDocumento(factura)} className="w-full inline-flex items-center justify-center gap-1 text-xs font-bold bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-900">
                        <Printer size={14} /> Ver / Reimprimir
                      </button>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="p-3">Fecha</th><th className="p-3">Documento</th><th className="p-3">Monto</th><th className="p-3 text-center">Método</th><th className="p-3 text-center">Estado (Créditos)</th><th className="p-3 text-center">Acciones</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {docsCliente.length === 0 ? (<tr><td colSpan="6" className="p-6 text-center text-slate-400">No hay registros para este cliente.</td></tr>) : 
                       docsCliente.map(factura => (
                        <tr key={factura.id} className="hover:bg-slate-50">
                          <td className="p-3 text-slate-500">{new Date(factura.fecha).toLocaleDateString()}</td>
                          <td className="p-3 font-bold text-slate-700">
                            {factura.tipo} {factura.numeroDocumento ? `#${factura.numeroDocumento}` : ''}
                            {esAnulado(factura) && <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">Anulada</span>}
                          </td>
                          <td className="p-3 font-medium">C$ {obtenerTotal(factura).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="p-3 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{factura.formaPago}</span></td>
                          <td className="p-3 text-center">
                            {esCuentaPorCobrar(factura) ? (
                              obtenerEstadoCredito(factura) === 'Pendiente' ? 
                                <button onClick={() => abrirModalAbono(factura)} className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-red-200">Pendiente (Abonar)</button> : 
                                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Saldado</span>
                            ) : <span className="text-slate-300">-</span>}
                            {esCuentaPorCobrar(factura) && (
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

      {/* El modal del documento se monta fuera de este contenedor para que la impresión
          no herede el print:hidden del panel. */}

      {modalAbono.abierto && modalAbono.factura && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 p-2 sm:p-4 flex items-center justify-center">
          <div className="w-full max-w-xl max-h-[95vh] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-800 text-white flex justify-between items-center">
              <h4 className="text-lg font-bold">Registrar Abono</h4>
              <button onClick={cerrarModalAbono} className="text-slate-200 hover:text-white font-bold text-xl leading-none" aria-label="Cerrar modal">×</button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
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

            <div className="px-4 sm:px-6 py-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-2 bg-slate-50">
              <button onClick={cerrarModalAbono} disabled={guardandoAbono} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 disabled:opacity-50 w-full sm:w-auto">Cancelar</button>
              <button onClick={registrarAbono} disabled={guardandoAbono} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 w-full sm:w-auto">
                {guardandoAbono ? 'Guardando...' : 'Guardar Abono'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    {modalDocumento.abierto && documentoSeleccionado && (
      <ModalDocumento documento={documentoSeleccionado} onCerrar={cerrarModalDocumento} />
    )}
    </>
  );
}
