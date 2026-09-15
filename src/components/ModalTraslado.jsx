import { useState } from 'react';
import { db } from '../firebase';
import { collection, doc, getDocs, limit, query, runTransaction, where } from 'firebase/firestore';
import { ArrowLeftRight, X } from 'lucide-react';
import { normalizarMoneda } from '../utils/documentos';
import { TIPO_MOVIMIENTO, construirMovimiento, nuevoMovimientoRef, otraBodega } from '../utils/kardex';

const lanzar = (mensaje, code) => {
  const error = new Error(mensaje);
  error.code = code;
  throw error;
};

export default function ModalTraslado({ repuesto, usuarioActual, registrarHistorial, onCerrar, onTrasladado }) {
  const origen = repuesto.localidad || 'Managua';
  const destino = otraBodega(origen);
  const disponibleEnPantalla = Number(repuesto.cantidad || 0);

  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);

  const trasladar = async (e) => {
    e.preventDefault();
    setError('');
    const unidades = normalizarMoneda(Number(cantidad));
    if (!Number.isFinite(unidades) || unidades <= 0) {
      setError('Escriba cuántas unidades va a trasladar.');
      return;
    }
    if (unidades > disponibleEnPantalla) {
      setError(`Solo hay ${disponibleEnPantalla} und. en ${origen}.`);
      return;
    }

    setProcesando(true);
    try {
      // Las consultas no pueden ir dentro de una transacción: se ubica antes el mismo
      // código en la bodega destino y adentro se vuelve a leer ese documento.
      const coincidencias = await getDocs(query(
        collection(db, 'repuestos'),
        where('codigo', '==', repuesto.codigo),
        where('localidad', '==', destino),
        limit(1)
      ));
      const destinoPrevistoRef = coincidencias.empty ? null : coincidencias.docs[0].ref;
      const idTraslado = nuevoMovimientoRef(db).id;

      const resultado = await runTransaction(db, async (transaction) => {
        // ---------- LECTURAS ----------
        const origenRef = doc(db, 'repuestos', repuesto.id);
        const origenSnap = await transaction.get(origenRef);
        const destinoSnap = destinoPrevistoRef ? await transaction.get(destinoPrevistoRef) : null;

        // ---------- VALIDACIÓN ----------
        if (!origenSnap.exists()) lanzar('El repuesto ya no existe.', 'not-found');
        const datosOrigen = origenSnap.data();
        const stockOrigen = Number(datosOrigen.cantidad || 0);
        if (unidades > stockOrigen) lanzar(`Solo hay ${stockOrigen} und. en ${origen}.`, 'stock-insuficiente');

        const destinoExiste = Boolean(destinoSnap?.exists());
        const stockDestino = destinoExiste ? Number(destinoSnap.data().cantidad || 0) : 0;
        const nuevoStockOrigen = normalizarMoneda(stockOrigen - unidades);
        const nuevoStockDestino = normalizarMoneda(stockDestino + unidades);

        // ---------- ESCRITURAS ----------
        transaction.update(origenRef, { cantidad: nuevoStockOrigen });

        let destinoRef;
        let datosDestino;
        if (destinoExiste) {
          destinoRef = destinoPrevistoRef;
          datosDestino = destinoSnap.data();
          transaction.update(destinoRef, { cantidad: nuevoStockDestino });
        } else {
          // No existe en la otra bodega: se crea con los mismos datos y precios.
          destinoRef = doc(collection(db, 'repuestos'));
          // El aviso de cambio de costo cuenta piezas de esta bodega: no se copia a la otra.
          const { cambioCosto: _cambioCosto, ...datosSinCambioCosto } = datosOrigen;
          datosDestino = { ...datosSinCambioCosto, localidad: destino, cantidad: nuevoStockDestino };
          transaction.set(destinoRef, datosDestino);
        }

        const texto = `Traslado ${origen} → ${destino}`;
        transaction.set(nuevoMovimientoRef(db), construirMovimiento({
          idRepuesto: origenRef.id,
          repuesto: datosOrigen,
          tipo: TIPO_MOVIMIENTO.TRASLADO_SALIDA,
          stockAnterior: stockOrigen,
          stockNuevo: nuevoStockOrigen,
          referencia: { coleccion: 'repuestos', id: destinoRef.id, texto },
          motivo,
          usuario: usuarioActual,
          idTraslado
        }));
        transaction.set(nuevoMovimientoRef(db), construirMovimiento({
          idRepuesto: destinoRef.id,
          repuesto: { ...datosDestino, localidad: destino },
          tipo: TIPO_MOVIMIENTO.TRASLADO_ENTRADA,
          stockAnterior: stockDestino,
          stockNuevo: nuevoStockDestino,
          referencia: { coleccion: 'repuestos', id: origenRef.id, texto },
          motivo,
          usuario: usuarioActual,
          idTraslado
        }));

        return { creado: !destinoExiste };
      });

      try {
        await registrarHistorial(
          'Inventario',
          `Trasladó ${unidades} und. de ${repuesto.codigo} de ${origen} a ${destino}${resultado.creado ? ' (creado en destino)' : ''}${motivo.trim() ? `. Motivo: ${motivo.trim()}` : ''}`
        );
      } catch (errorHistorial) {
        console.error('No se pudo registrar el historial del traslado:', errorHistorial);
      }

      await onTrasladado();
      onCerrar();
    } catch (errorTraslado) {
      console.error('Error trasladando repuesto:', errorTraslado);
      setError(['not-found', 'stock-insuficiente'].includes(errorTraslado?.code)
        ? errorTraslado.message
        : 'No se pudo hacer el traslado. Intente de nuevo.');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden">
      <form onSubmit={trasladar} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl shadow-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-violet-600 flex items-center gap-1.5">
              <ArrowLeftRight size={14} /> Trasladar
            </p>
            <h3 className="text-lg font-bold text-slate-800 truncate">{repuesto.codigo} · {repuesto.descripcion}</h3>
          </div>
          <button type="button" onClick={onCerrar} className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center mb-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sale de</p>
            <p className="font-bold text-slate-800">{origen}</p>
            <p className="text-xs text-slate-500">Hay {disponibleEnPantalla} und.</p>
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-violet-500">Entra a</p>
            <p className="font-bold text-slate-800">{destino}</p>
          </div>
        </div>

        {error && (
          <div className="mb-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>
        )}

        <label className="block text-xs font-bold text-slate-500 mb-1">Unidades a trasladar</label>
        <input
          type="number"
          min="1"
          max={disponibleEnPantalla}
          step="1"
          required
          autoFocus
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="w-full border p-2.5 rounded-lg outline-none focus:border-violet-500 mb-3"
        />

        <label className="block text-xs font-bold text-slate-500 mb-1">Motivo (opcional)</label>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={120}
          placeholder="Ej: pedido de cliente en Tecolostote"
          className="w-full border p-2.5 rounded-lg outline-none focus:border-violet-500 mb-3"
        />

        <p className="text-[11px] text-slate-500 mb-4">
          Si el repuesto no existe en {destino}, se crea con el mismo código, descripción, costo y precios.
        </p>

        <button type="submit" disabled={procesando || disponibleEnPantalla <= 0} className="w-full bg-violet-600 text-white font-bold py-2.5 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50">
          {procesando ? 'Trasladando...' : disponibleEnPantalla <= 0 ? 'Sin stock para trasladar' : 'Trasladar'}
        </button>
      </form>
    </div>
  );
}
