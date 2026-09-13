import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { FileText, Receipt, Search, RefreshCw, Eye, ArrowRight, CheckCircle2 } from 'lucide-react';
import ModalDocumento from './ModalDocumento';
import {
  ESTADO_COTIZACION,
  cotizacionFacturable,
  esCotizacion,
  formatearMonto,
  normalizarDocumentoParaImpresion,
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

export default function ModuloDocumentos({ onFacturarCotizacion }) {
  const [pestaña, setPestaña] = useState('cotizaciones');
  const [documentos, setDocumentos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Abierta');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [documentoVisto, setDocumentoVisto] = useState(null);

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

  const listaActiva = pestaña === 'cotizaciones' ? cotizaciones : facturas;

  const BotonFacturar = ({ cotizacion, className = '' }) => (
    <button
      onClick={() => facturar(cotizacion)}
      className={`inline-flex items-center justify-center gap-1 text-xs font-bold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 ${className}`}
    >
      Facturar <ArrowRight size={14} />
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
                  {esCotizacion(documento) && <SelloEstado documento={documento} />}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <BotonVer documento={documento} className="flex-1" />
                  {cotizacionFacturable(documento) && <BotonFacturar cotizacion={documento} className="flex-1" />}
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
                  <tr key={documento.id} className="hover:bg-slate-50">
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
                      {esCotizacion(documento)
                        ? <SelloEstado documento={documento} />
                        : <span className="text-slate-400 text-xs font-semibold">{documento.estadoPago && documento.estadoPago !== 'N/A' ? documento.estadoPago : '—'}</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-center gap-2">
                        <BotonVer documento={documento} />
                        {cotizacionFacturable(documento) && <BotonFacturar cotizacion={documento} />}
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
    </>
  );
}
