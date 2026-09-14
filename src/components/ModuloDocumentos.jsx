import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, doc, getDocs, limit, orderBy, query, runTransaction } from 'firebase/firestore';
import { FileText, Receipt, Search, RefreshCw, Eye, ArrowRight, CheckCircle2, Ban } from 'lucide-react';
import ModalDocumento from './ModalDocumento';
import {
  ESTADO_COTIZACION,
  ESTADO_DOCUMENTO,
  cotizacionFacturable,
  esAnulado,
  esCotizacion,
  formatearMonto,
  normalizarDocumentoParaImpresion,
  normalizarMoneda,
  obtenerEstadoCotizacion
} from '../utils/documentos';

const LIMITE_DOCUMENTOS = 300;

const textoBuscable = (documento) => [
  documento?.numeroDocumento,
  documento?.numeroFactura,
  documento?.cliente,
  documento?.empresa,
  documento?.ruc,
  documento?.telefono,
  documento?.usuarioCreador
].join(' ').toLowerCase();

// Las facturas emitidas antes de quitar el correlativo interno conservan
// numeroDocumento; se muestra como referencia hasta que tengan número de talonario.
const referenciaFactura = (documento) => {
  const fisico = (documento?.numeroFactura || '').trim();
  if (fisico) return `N° ${fisico}`;
  if (documento?.numeroDocumento) return `#${documento.numeroDocumento} (interno)`;
  return 'Sin N° registrado';
};

const formatearFecha = (valor) => {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-NI');
};

export default function ModuloDocumentos({ onFacturarCotizacion, rol, usuarioActual = '', registrarHistorial }) {
  const [pestaña, setPestaña] = useState('cotizaciones');
  const [documentos, setDocumentos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Abierta');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [documentoVisto, setDocumentoVisto] = useState(null);
  const [aviso, setAviso] = useState('');
  const [modalAnular, setModalAnular] = useState({ abierto: false, documento: null });
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [errorAnular, setErrorAnular] = useState('');
  const [anulando, setAnulando] = useState(false);

  const cargarDocumentos = useCallback(async () => {
    setCargando(true);
    try {
      const consulta = query(
        collection(db, 'facturas'),
        orderBy('fecha', 'desc'),
        limit(LIMITE_DOCUMENTOS)
      );
      const snap = await getDocs(consulta);
      setDocumentos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError('');
    } catch (errorCarga) {
      console.error('Error cargando documentos:', errorCarga);
      setError('No se pudieron cargar los documentos. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarDocumentos(); }, [cargarDocumentos]);

  const { cotizaciones, facturas } = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const coincide = (documento) => !texto || textoBuscable(documento).includes(texto);

    return {
      cotizaciones: documentos.filter((d) => esCotizacion(d) && coincide(d) && (
        filtroEstado === 'Todas' || obtenerEstadoCotizacion(d) === filtroEstado
      )),
      facturas: documentos.filter((d) => !esCotizacion(d) && coincide(d))
    };
  }, [documentos, busqueda, filtroEstado]);

  const pendientesPorFacturar = useMemo(
    () => documentos.filter((d) => cotizacionFacturable(d)).length,
    [documentos]
  );

  const abrirDocumento = (documento) => setDocumentoVisto(normalizarDocumentoParaImpresion(documento));

  const facturar = (cotizacion) => {
    setDocumentoVisto(null);
    onFacturarCotizacion?.(cotizacion);
  };

  const abrirAnulacion = (documento) => {
    setModalAnular({ abierto: true, documento });
    setMotivoAnulacion('');
    setErrorAnular('');
  };

  const cerrarAnulacion = () => {
    if (anulando) return;
    setModalAnular({ abierto: false, documento: null });
    setMotivoAnulacion('');
    setErrorAnular('');
  };

  // Anular no borra nada: devuelve el stock, marca el documento y deja el motivo.
  // Si la factura vino de una cotización, esa cotización vuelve a quedar abierta.
  const anular = async () => {
    const objetivo = modalAnular.documento;
    const motivo = motivoAnulacion.trim();

    if (!objetivo?.id) return;
    if (motivo.length < 5) {
      setErrorAnular('Escribe el motivo de la anulación (mínimo 5 caracteres).');
      return;
    }

    setAnulando(true);
    try {
      const resultado = await runTransaction(db, async (transaction) => {
        // ---------- LECTURAS ----------
        const documentoRef = doc(db, 'facturas', objetivo.id);
        const snap = await transaction.get(documentoRef);

        if (!snap.exists()) {
          const fallo = new Error('El documento ya no existe.');
          fallo.code = 'not-found';
          throw fallo;
        }

        const vigente = snap.data();
        if (vigente.estadoDocumento === ESTADO_DOCUMENTO.ANULADO) {
          const fallo = new Error('Este documento ya fue anulado.');
          fallo.code = 'ya-anulado';
          throw fallo;
        }

        const devuelveStock = !esCotizacion(vigente);
        const items = Array.isArray(vigente.items) ? vigente.items : [];
        const lecturas = [];

        if (devuelveStock) {
          for (const item of items) {
            if (!item?.idRepuesto) continue;
            const repuestoRef = doc(db, 'repuestos', item.idRepuesto);
            lecturas.push({ item, repuestoRef, repuestoSnap: await transaction.get(repuestoRef) });
          }
        }

        let cotizacionRef = null;
        if (devuelveStock && vigente.cotizacionId) {
          const posible = doc(db, 'facturas', vigente.cotizacionId);
          const cotizacionSnap = await transaction.get(posible);
          if (cotizacionSnap.exists()) cotizacionRef = posible;
        }

        // ---------- ESCRITURAS ----------
        let devueltos = 0;
        let faltantes = 0;

        for (const { item, repuestoRef, repuestoSnap } of lecturas) {
          if (!repuestoSnap.exists()) { faltantes += 1; continue; }
          const actual = Number(repuestoSnap.data().cantidad || 0);
          transaction.update(repuestoRef, {
            cantidad: Math.max(0, normalizarMoneda(actual + Number(item.cant || 0)))
          });
          devueltos += 1;
        }

        transaction.update(documentoRef, {
          estadoDocumento: ESTADO_DOCUMENTO.ANULADO,
          anulacion: {
            fecha: new Date().toISOString(),
            usuario: usuarioActual || '',
            motivo
          },
          saldoPendiente: 0,
          estadoPago: 'Anulado'
        });

        if (cotizacionRef) {
          transaction.update(cotizacionRef, {
            estadoCotizacion: ESTADO_COTIZACION.ABIERTA,
            facturaId: '',
            fechaFacturacion: ''
          });
        }

        return { devueltos, faltantes, reabrioCotizacion: Boolean(cotizacionRef) };
      });

      try {
        await registrarHistorial?.(
          'Anulación',
          `Anuló ${esCotizacion(objetivo) ? 'la cotización' : 'la factura'} de ${objetivo.cliente} por C$${formatearMonto(objetivo.total)}. Motivo: ${motivo}`
        );
      } catch (errorHistorial) {
        console.error('No se pudo registrar el historial de la anulación:', errorHistorial);
      }

      const partes = [];
      if (resultado.devueltos > 0) partes.push(`${resultado.devueltos} repuesto(s) devueltos al inventario`);
      if (resultado.faltantes > 0) partes.push(`${resultado.faltantes} ya no existen en inventario y no se pudieron devolver`);
      if (resultado.reabrioCotizacion) partes.push('la cotización de origen quedó abierta de nuevo');
      setAviso(`Documento anulado${partes.length ? `: ${partes.join(', ')}` : ''}.`);

      setModalAnular({ abierto: false, documento: null });
      setMotivoAnulacion('');
      await cargarDocumentos();
    } catch (errorAnulacion) {
      console.error('Error anulando documento:', errorAnulacion);
      setErrorAnular(
        errorAnulacion?.code === 'ya-anulado' || errorAnulacion?.code === 'not-found'
          ? errorAnulacion.message
          : 'No se pudo anular el documento. Verifica tus permisos e intenta de nuevo.'
      );
    } finally {
      setAnulando(false);
    }
  };

  const listaActiva = pestaña === 'cotizaciones' ? cotizaciones : facturas;

  const BotonFacturar = ({ cotizacion, className = '' }) => (
    <button
      onClick={() => facturar(cotizacion)}
      className={`inline-flex items-center justify-center gap-1 text-xs font-bold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 ${className}`}
    >
      Facturar <ArrowRight size={14} />
    </button>
  );

  const BotonAnular = ({ documento, className = '' }) => (
    <button
      onClick={() => abrirAnulacion(documento)}
      className={`inline-flex items-center justify-center gap-1 text-xs font-bold border border-red-200 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 ${className}`}
      title="Anular documento"
    >
      <Ban size={14} /> Anular
    </button>
  );

  const BotonVer = ({ documento, className = '' }) => (
    <button
      onClick={() => abrirDocumento(documento)}
      className={`inline-flex items-center justify-center gap-1 text-xs font-bold bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-900 ${className}`}
    >
      <Eye size={14} /> Ver
    </button>
  );

  const SelloEstado = ({ documento }) => {
    if (esAnulado(documento)) {
      return (
        <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[11px] font-bold">
          <Ban size={12} /> Anulada
        </span>
      );
    }
    const estado = obtenerEstadoCotizacion(documento);
    if (estado === ESTADO_COTIZACION.FACTURADA) {
      return (
        <span className="inline-flex items-center gap-1 bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full text-[11px] font-bold">
          <CheckCircle2 size={12} /> Facturada
        </span>
      );
    }
    return (
      <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-[11px] font-bold">Abierta</span>
    );
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="flex flex-col sm:flex-row border-b bg-slate-50 px-3 sm:px-6 pt-3 sm:pt-4 gap-2 sm:gap-6">
          <button
            onClick={() => setPestaña('cotizaciones')}
            className={`pb-2.5 sm:pb-3 px-2 font-bold text-sm sm:text-base flex items-center justify-center sm:justify-start border-b-2 transition-colors ${pestaña === 'cotizaciones' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <FileText size={18} className="mr-2" /> Cotizaciones
            {pendientesPorFacturar > 0 && (
              <span className="ml-2 bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full">{pendientesPorFacturar}</span>
            )}
          </button>
          <button
            onClick={() => setPestaña('facturas')}
            className={`pb-2.5 sm:pb-3 px-2 font-bold text-sm sm:text-base flex items-center justify-center sm:justify-start border-b-2 transition-colors ${pestaña === 'facturas' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Receipt size={18} className="mr-2" /> Facturas
          </button>
        </div>

        <div className="p-3 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
            <div className="flex items-center bg-white border border-slate-300 rounded-lg p-2 flex-1 focus-within:border-emerald-500 transition-colors">
              <Search className="text-slate-400 mr-2" size={20} />
              <input
                type="text"
                placeholder="Buscar por número, cliente, empresa o RUC..."
                className="w-full outline-none text-slate-700 text-sm"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            {pestaña === 'cotizaciones' && (
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="text-sm border border-slate-300 rounded-lg p-2.5 bg-slate-50 outline-none text-slate-600 font-medium"
              >
                <option value="Abierta">Solo abiertas</option>
                <option value="Facturada">Solo facturadas</option>
                <option value="Todas">Todas</option>
              </select>
            )}

            <button
              onClick={cargarDocumentos}
              disabled={cargando}
              className="inline-flex items-center justify-center gap-2 text-sm font-bold border border-slate-300 text-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>

          {error && (
            <div className="mb-4 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>
          )}

          {aviso && (
            <div className="mb-4 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg flex items-start justify-between gap-3">
              <span>{aviso}</span>
              <button onClick={() => setAviso('')} className="font-bold text-emerald-800">×</button>
            </div>
          )}

          {cargando && (
            <div className="mb-4 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg">Cargando documentos...</div>
          )}

          <div className="md:hidden space-y-3">
            {listaActiva.map((documento) => (
              <div key={documento.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">
                      {esCotizacion(documento)
                        ? `Cotización #${documento.numeroDocumento || '—'}`
                        : `Factura ${referenciaFactura(documento)}`}
                    </p>
                    <p className="text-xs text-slate-500">{formatearFecha(documento.fecha)}</p>
                  </div>
                  <span className="text-sm font-black text-slate-800">C$ {formatearMonto(documento.total)}</span>
                </div>

                <p className="text-sm text-slate-700 font-medium">{documento.cliente}</p>
                {documento.empresa && <p className="text-xs text-slate-500">{documento.empresa}</p>}

                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[11px] font-bold">{documento.formaPago}</span>
                  {(esCotizacion(documento) || esAnulado(documento)) && <SelloEstado documento={documento} />}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <BotonVer documento={documento} className="flex-1" />
                  {cotizacionFacturable(documento) && <BotonFacturar cotizacion={documento} className="flex-1" />}
                  {rol === 'admin' && !esAnulado(documento) && <BotonAnular documento={documento} className="flex-1" />}
                </div>
              </div>
            ))}
            {listaActiva.length === 0 && !cargando && (
              <p className="text-sm text-slate-400 text-center py-8">No hay documentos que coincidan.</p>
            )}
          </div>

          <div className="hidden md:block border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3">{pestaña === 'cotizaciones' ? 'N° Cotización' : 'N° Factura'}</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-center">Pago</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listaActiva.map((documento) => (
                  <tr key={documento.id} className={`hover:bg-slate-50 ${esAnulado(documento) ? 'text-slate-400 line-through decoration-slate-300' : ''}`}>
                    <td className="p-3 font-bold text-slate-700">
                      {esCotizacion(documento)
                        ? (documento.numeroDocumento || '—')
                        : <span className={documento.numeroFactura ? '' : 'text-slate-400 font-medium text-xs'}>{referenciaFactura(documento)}</span>}
                    </td>
                    <td className="p-3 text-slate-500">{formatearFecha(documento.fecha)}</td>
                    <td className="p-3">
                      <p className="font-medium text-slate-700">{documento.cliente}</p>
                      {documento.empresa && <p className="text-xs text-slate-400">{documento.empresa}</p>}
                    </td>
                    <td className="p-3 text-right font-bold text-slate-700">C$ {formatearMonto(documento.total)}</td>
                    <td className="p-3 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{documento.formaPago}</span></td>
                    <td className="p-3 text-center">
                      {esCotizacion(documento) || esAnulado(documento)
                        ? <SelloEstado documento={documento} />
                        : <span className="text-slate-400 text-xs font-semibold">{documento.estadoPago && documento.estadoPago !== 'N/A' ? documento.estadoPago : '—'}</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-center gap-2">
                        <BotonVer documento={documento} />
                        {cotizacionFacturable(documento) && <BotonFacturar cotizacion={documento} />}
                        {rol === 'admin' && !esAnulado(documento) && <BotonAnular documento={documento} />}
                      </div>
                    </td>
                  </tr>
                ))}
                {listaActiva.length === 0 && !cargando && (
                  <tr><td colSpan="7" className="p-8 text-center text-slate-400">No hay documentos que coincidan.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-400 mt-3">
            Se muestran los últimos {LIMITE_DOCUMENTOS} documentos por fecha.
          </p>
        </div>
      </div>

      {documentoVisto && (
        <ModalDocumento documento={documentoVisto} onCerrar={() => setDocumentoVisto(null)} />
      )}

      {modalAnular.abierto && modalAnular.documento && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 p-2 sm:p-4 flex items-center justify-center print:hidden">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-red-700 text-white flex justify-between items-center">
              <h4 className="text-lg font-bold flex items-center gap-2"><Ban size={20} /> Anular documento</h4>
              <button onClick={cerrarAnulacion} className="text-red-100 hover:text-white font-bold text-xl leading-none">×</button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                <p className="font-bold text-slate-800">
                  {esCotizacion(modalAnular.documento) ? 'Cotización' : 'Factura'} de {modalAnular.documento.cliente}
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  {formatearFecha(modalAnular.documento.fecha)} · C$ {formatearMonto(modalAnular.documento.total)}
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[13px] text-amber-900 space-y-1">
                <p className="font-bold">Qué va a pasar:</p>
                {esCotizacion(modalAnular.documento) ? (
                  <p>La cotización queda anulada y ya no se podrá facturar. No afecta el inventario.</p>
                ) : (
                  <>
                    <p>Los repuestos vuelven al inventario.</p>
                    <p>El documento queda marcado como anulado y deja de contar en los totales del cliente.</p>
                    {modalAnular.documento.cotizacionId && <p>La cotización de origen vuelve a quedar abierta.</p>}
                  </>
                )}
                <p className="font-bold">No se borra nada y la acción no se puede deshacer.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Motivo de la anulación</label>
                <input
                  type="text"
                  value={motivoAnulacion}
                  onChange={(e) => { setMotivoAnulacion(e.target.value); setErrorAnular(''); }}
                  className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:border-red-500 text-slate-700"
                  placeholder="Ej: se facturó el repuesto equivocado"
                />
              </div>

              {errorAnular && <p className="text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg p-2">{errorAnular}</p>}
            </div>

            <div className="px-4 sm:px-6 py-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-2 bg-slate-50">
              <button onClick={cerrarAnulacion} disabled={anulando} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
              <button onClick={anular} disabled={anulando} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50">
                {anulando ? 'Anulando...' : 'Sí, anular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
