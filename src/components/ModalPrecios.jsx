import { useState } from 'react';
import { db } from '../firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { Tag, TrendingDown, TrendingUp, X } from 'lucide-react';
import { formatearMonto, normalizarMoneda } from '../utils/documentos';
import { margenSobrePrecio, piezasPorCosto, textoPorcentaje, variacionCosto } from '../utils/costos';

const CAMPOS = [
  { clave: 'costo', etiqueta: 'Costo', clase: 'bg-white' },
  { clave: 'precioVerde', etiqueta: 'Precio verde', clase: 'bg-green-50' },
  { clave: 'precioAmarillo', etiqueta: 'Precio amarillo', clase: 'bg-yellow-50' },
  { clave: 'precioRojo', etiqueta: 'Precio rojo', clase: 'bg-red-50' }
];

const PRECIOS = ['precioVerde', 'precioAmarillo', 'precioRojo'];

const formatearFecha = (valor) => {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-NI');
};

// Editar costo y precios de venta de un repuesto (solo admin). Muestra el último cambio de
// costo por compra, para decidir el precio con las piezas viejas y nuevas a la vista.
export default function ModalPrecios({ repuesto, repuestos, registrarHistorial, onCerrar, onGuardado }) {
  const bodega = repuesto.localidad || 'Managua';
  const [valores, setValores] = useState(() => Object.fromEntries(
    CAMPOS.map((c) => [c.clave, String(repuesto[c.clave] ?? '')])
  ));
  const [aplicarOtraBodega, setAplicarOtraBodega] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Mismo código en la otra bodega: hoy son documentos separados con precios propios.
  const otraBodega = repuestos.find((r) => r.id !== repuesto.id && r.codigo === repuesto.codigo && (r.localidad || 'Managua') !== bodega);

  const numeros = Object.fromEntries(CAMPOS.map((c) => [c.clave, normalizarMoneda(valores[c.clave])]));
  const hayInvalidos = CAMPOS.some((c) => valores[c.clave] === '' || Number.isNaN(Number(valores[c.clave])) || Number(valores[c.clave]) < 0);

  const cambio = repuesto.cambioCosto;
  const piezas = piezasPorCosto(repuesto);
  const variacion = cambio ? variacionCosto(cambio.costoAnterior, cambio.costoNuevo) : null;

  const guardar = async () => {
    setError('');
    if (hayInvalidos) {
      setError('Todos los montos deben ser números de 0 en adelante.');
      return;
    }

    const modificados = CAMPOS.filter((c) => normalizarMoneda(repuesto[c.clave]) !== numeros[c.clave]);
    if (modificados.length === 0 && !aplicarOtraBodega) {
      onCerrar();
      return;
    }

    const debajoDelCosto = PRECIOS.filter((clave) => numeros[clave] < numeros.costo);
    if (debajoDelCosto.length > 0 && !window.confirm(
      `${debajoDelCosto.map((clave) => CAMPOS.find((c) => c.clave === clave).etiqueta).join(', ')} queda por debajo del costo. ¿Guardar igual?`
    )) return;

    const datos = Object.fromEntries(CAMPOS.map((c) => [c.clave, numeros[c.clave]]));
    setGuardando(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'repuestos', repuesto.id), datos);
      if (aplicarOtraBodega && otraBodega) batch.update(doc(db, 'repuestos', otraBodega.id), datos);
      await batch.commit();

      const detalle = modificados
        .map((c) => `${c.etiqueta} C$ ${formatearMonto(repuesto[c.clave])} → C$ ${formatearMonto(numeros[c.clave])}`)
        .join(', ');
      try {
        await registrarHistorial(
          'Inventario',
          `Actualizó precios de ${repuesto.codigo} (${bodega}${aplicarOtraBodega && otraBodega ? ` y ${otraBodega.localidad}` : ''}): ${detalle || 'igualó la otra bodega'}`
        );
      } catch (errorHistorial) {
        console.error('No se pudo registrar el cambio de precios:', errorHistorial);
      }
      await onGuardado();
      onCerrar();
    } catch (errorGuardado) {
      console.error('Error guardando precios:', errorGuardado);
      setError('No se pudieron guardar los precios. Intente de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const IconoVariacion = variacion?.sube ? TrendingUp : TrendingDown;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden">
      <div className="bg-white w-full sm:max-w-lg max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-xl shadow-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <Tag size={14} /> Costo y precios
            </p>
            <h3 className="text-lg font-bold text-slate-800 truncate">{repuesto.codigo} · {repuesto.descripcion}</h3>
            <p className="text-xs text-slate-500">{bodega} · Stock: {repuesto.cantidad || 0}</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {cambio && variacion && piezas && (
          <div className={`mb-4 rounded-lg border px-3 py-2.5 text-xs space-y-1 ${variacion.sube ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            <p className="font-bold flex items-center gap-1.5">
              <IconoVariacion size={14} className="shrink-0" />
              Última compra ({formatearFecha(cambio.fecha)}{cambio.proveedor ? ` · ${cambio.proveedor}` : ''}): costo C$ {formatearMonto(variacion.anterior)} → C$ {formatearMonto(variacion.nuevo)} ({textoPorcentaje(variacion.porcentaje)})
            </p>
            <p>
              Quedan <b>{piezas.anteriores}</b> al costo anterior y <b>{piezas.nuevas}</b> al costo nuevo
              {piezas.anteriores === 0 ? ': ya no quedan piezas viejas.' : '.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {CAMPOS.map((campo) => {
            const margen = campo.clave === 'costo' ? null : margenSobrePrecio(numeros[campo.clave], numeros.costo);
            return (
              <div key={campo.clave}>
                <label htmlFor={`precio-${campo.clave}`} className="block text-xs font-bold text-slate-500 mb-1">{campo.etiqueta} (C$)</label>
                <input
                  id={`precio-${campo.clave}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={valores[campo.clave]}
                  onChange={(e) => setValores((actual) => ({ ...actual, [campo.clave]: e.target.value }))}
                  className={`w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 font-bold text-slate-700 ${campo.clase}`}
                />
                {margen !== null && (
                  <p className={`text-[11px] font-semibold mt-1 ${margen < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                    Margen: {margen} %
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {otraBodega && (
          <label className="mt-4 flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={aplicarOtraBodega} onChange={(e) => setAplicarOtraBodega(e.target.checked)} className="mt-0.5 accent-emerald-600" />
            <span>Aplicar los mismos montos en <b>{otraBodega.localidad}</b> (mismo código, hoy con costo C$ {formatearMonto(otraBodega.costo)} y verde C$ {formatearMonto(otraBodega.precioVerde)}).</span>
          </label>
        )}

        {error && <p className="mt-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}

        <div className="mt-5 flex flex-col-reverse sm:flex-row justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando || hayInvalidos} className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar precios'}
          </button>
        </div>
      </div>
    </div>
  );
}
