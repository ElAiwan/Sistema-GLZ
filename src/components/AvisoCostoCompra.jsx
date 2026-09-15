import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatearMonto, normalizarMoneda } from '../utils/documentos';
import { margenSobrePrecio, textoPorcentaje, variacionCosto } from '../utils/costos';

// Aviso dentro de la compra cuando el costo que se está pagando no es el que tiene el repuesto.
export default function AvisoCostoCompra({ item, onAlternarActualizar }) {
  const costoCompra = normalizarMoneda(item.costo);
  const costoActual = normalizarMoneda(item.costoActual);
  if (!(costoCompra > 0) || costoCompra === costoActual) return null;

  if (costoActual <= 0) {
    return (
      <p className="text-[11px] text-slate-500">
        Este repuesto no tenía costo registrado: se guardará C$ {formatearMonto(costoCompra)}.
      </p>
    );
  }

  const variacion = variacionCosto(costoActual, costoCompra);
  const margenAntes = margenSobrePrecio(item.precioVerde, costoActual);
  const margenDespues = margenSobrePrecio(item.precioVerde, costoCompra);
  const Icono = variacion.sube ? TrendingUp : TrendingDown;

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${variacion.sube ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
      <p className="font-bold flex items-center gap-1.5">
        <Icono size={14} className="shrink-0" />
        {variacion.sube ? 'Sube' : 'Baja'} C$ {formatearMonto(Math.abs(variacion.diferencia))} ({textoPorcentaje(variacion.porcentaje)}):
        costo actual C$ {formatearMonto(costoActual)} → esta compra C$ {formatearMonto(costoCompra)}
      </p>
      <p>
        En bodega hay <b>{Number(item.existencia || 0)}</b> al costo anterior; entran <b>{Number(item.cantidad || 0)}</b> al costo nuevo.
      </p>
      {margenAntes !== null && (
        <p>
          Con el precio verde de C$ {formatearMonto(item.precioVerde)}, el margen pasa de {margenAntes} % a <b>{margenDespues} %</b>.
          {variacion.sube && ' Conviene revisar los precios de venta en Inventario.'}
        </p>
      )}
      <label className="inline-flex items-center gap-2 font-semibold cursor-pointer pt-0.5">
        <input
          type="checkbox"
          checked={Boolean(item.actualizarCosto)}
          onChange={onAlternarActualizar}
          className={variacion.sube ? 'accent-amber-600' : 'accent-emerald-600'}
        />
        Actualizar el costo del repuesto a C$ {formatearMonto(costoCompra)}
      </label>
    </div>
  );
}
