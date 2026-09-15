import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { History, MapPin, X } from 'lucide-react';
import { ETIQUETA_MOVIMIENTO } from '../utils/kardex';

const PAGINA = 50;

const consultaMovimientos = (idRepuesto, ultimo) => {
  const partes = [where('idRepuesto', '==', idRepuesto), orderBy('fecha', 'desc')];
  if (ultimo) partes.push(startAfter(ultimo));
  partes.push(limit(PAGINA));
  return query(collection(db, 'movimientos'), ...partes);
};

const mensajeError = (error) => (error?.code === 'failed-precondition'
  ? 'El índice del kardex todavía se está creando en Firebase. Intente de nuevo en unos minutos.'
  : 'No se pudieron cargar los movimientos.');

const formatearFecha = (valor) => {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? '—'
    : fecha.toLocaleString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatearCantidad = (valor) => {
  const numero = Number(valor || 0);
  return `${numero > 0 ? '+' : ''}${numero.toLocaleString('en-US')}`;
};

export default function ModalMovimientos({ repuesto, onCerrar }) {
  const [movimientos, setMovimientos] = useState([]);
  const [ultimo, setUltimo] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    getDocs(consultaMovimientos(repuesto.id))
      .then((snap) => {
        if (!activo) return;
        setMovimientos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setUltimo(snap.docs[snap.docs.length - 1] || null);
        setHayMas(snap.docs.length === PAGINA);
      })
      .catch((errorCarga) => {
        console.error('Error cargando movimientos:', errorCarga);
        if (activo) setError(mensajeError(errorCarga));
      })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [repuesto.id]);

  const cargarMas = async () => {
    setCargando(true);
    try {
      const snap = await getDocs(consultaMovimientos(repuesto.id, ultimo));
      setMovimientos((actual) => [...actual, ...snap.docs.map((d) => ({ id: d.id, ...d.data() }))]);
      setUltimo(snap.docs[snap.docs.length - 1] || ultimo);
      setHayMas(snap.docs.length === PAGINA);
    } catch (errorCarga) {
      console.error('Error cargando más movimientos:', errorCarga);
      setError(mensajeError(errorCarga));
    } finally {
      setCargando(false);
    }
  };

  const colorCantidad = (valor) => (Number(valor) < 0 ? 'text-red-600' : 'text-emerald-600');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden">
      <div className="bg-white w-full sm:max-w-4xl max-h-[92vh] rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col">
        <div className="shrink-0 flex items-start justify-between gap-3 p-4 sm:p-5 border-b">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History size={14} /> Movimientos
            </p>
            <h3 className="text-lg font-bold text-slate-800 truncate">{repuesto.codigo} · {repuesto.descripcion}</h3>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <MapPin size={12} /> {repuesto.localidad || 'Managua'} · Stock actual: <b className="text-slate-700">{repuesto.cantidad || 0}</b>
            </p>
          </div>
          <button onClick={onCerrar} className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          {error && (
            <div className="mb-4 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>
          )}

          {!cargando && !error && movimientos.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10">
              Todavía no hay movimientos para este repuesto. El kardex registra los cambios de stock desde que se activó.
            </p>
          )}

          <div className="md:hidden space-y-2">
            {movimientos.map((m) => (
              <div key={m.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{ETIQUETA_MOVIMIENTO[m.tipo] || m.tipo}</p>
                    <p className="text-[11px] text-slate-500">{formatearFecha(m.fecha)} · {m.usuario || '—'}</p>
                  </div>
                  <p className={`font-black text-sm ${colorCantidad(m.cantidad)}`}>{formatearCantidad(m.cantidad)}</p>
                </div>
                <p className="text-xs text-slate-600 mt-1">Stock: {m.stockAnterior} → <b>{m.stockNuevo}</b></p>
                {m.referencia?.texto && <p className="text-xs text-slate-500 mt-1 break-words">{m.referencia.texto}</p>}
                {m.motivo && <p className="text-xs text-slate-500 italic mt-1 break-words">{m.motivo}</p>}
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            {movimientos.length > 0 && (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="p-2.5 rounded-tl-lg">Fecha</th>
                    <th className="p-2.5">Movimiento</th>
                    <th className="p-2.5 text-right">Cantidad</th>
                    <th className="p-2.5 text-center">Stock</th>
                    <th className="p-2.5">Documento / motivo</th>
                    <th className="p-2.5 rounded-tr-lg">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-b align-top">
                      <td className="p-2.5 text-xs text-slate-500 whitespace-nowrap">{formatearFecha(m.fecha)}</td>
                      <td className="p-2.5 font-semibold text-slate-700">{ETIQUETA_MOVIMIENTO[m.tipo] || m.tipo}</td>
                      <td className={`p-2.5 text-right font-black ${colorCantidad(m.cantidad)}`}>{formatearCantidad(m.cantidad)}</td>
                      <td className="p-2.5 text-center text-slate-600 whitespace-nowrap">{m.stockAnterior} → <b>{m.stockNuevo}</b></td>
                      <td className="p-2.5 text-xs text-slate-600">
                        {m.referencia?.texto && <p>{m.referencia.texto}</p>}
                        {m.motivo && <p className="italic text-slate-500">{m.motivo}</p>}
                        {!m.referencia?.texto && !m.motivo && '—'}
                      </td>
                      <td className="p-2.5 text-xs text-slate-600">{m.usuario || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {cargando && <p className="text-sm text-slate-400 text-center py-4">Cargando movimientos...</p>}

          {hayMas && !cargando && (
            <div className="text-center mt-4">
              <button onClick={cargarMas} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-600 hover:bg-slate-100">
                Cargar más
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
