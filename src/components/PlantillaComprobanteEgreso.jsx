import { formatearMonto, normalizarMoneda } from '../utils/documentos';
import {
  codigoComprobante,
  esCompra,
  esEgresoAnulado,
  esCreditoEgreso,
  obtenerEstadoEgreso,
  obtenerSaldoEgreso,
  obtenerTotalEgreso,
  obtenerTotalPagadoEgreso
} from '../utils/gastos';

const formatearFecha = (valor) => {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? '—'
    : fecha.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatearCantidad = (valor) => {
  const numero = normalizarMoneda(valor || 0);
  return Number.isInteger(numero) ? String(numero) : formatearMonto(numero);
};

function Dato({ etiqueta, valor, className = '' }) {
  return (
    <div className={`px-3 py-2 border-slate-300 ${className}`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{etiqueta}</p>
      <p className="text-sm font-medium text-slate-800 break-words leading-tight">{valor || '—'}</p>
    </div>
  );
}

function Firma({ etiqueta }) {
  return (
    <div className="text-center">
      <div className="h-14 border-b border-slate-500" />
      <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">{etiqueta}</p>
    </div>
  );
}

// Comprobante interno de una compra o un gasto. Mismo formato carta que la cotización.
export default function PlantillaComprobanteEgreso({ egreso, soloImpresion = false }) {
  const compra = esCompra(egreso);
  const credito = esCreditoEgreso(egreso);
  const items = Array.isArray(egreso?.items) ? egreso.items : [];
  const abonos = Array.isArray(egreso?.historialAbonos) ? egreso.historialAbonos : [];
  const total = obtenerTotalEgreso(egreso);
  const abonoInicial = normalizarMoneda(egreso?.abonoInicial || 0);

  return (
    <div className={soloImpresion ? 'hidden print:block' : 'block'}>
      <style>{`
        @media print {
          @page { size: letter; margin: 0; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .comprobante-tabla thead { display: table-header-group; }
          .comprobante-no-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <article className="relative mx-auto w-full max-w-[21.59cm] bg-white text-slate-800 border border-slate-300 shadow-sm p-4">
        {esEgresoAnulado(egreso) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <span className="border-[5px] border-red-600 text-red-600 text-5xl font-black tracking-[0.2em] px-10 py-4 -rotate-[18deg] opacity-80">
              ANULADO
            </span>
          </div>
        )}
        <header className="border border-slate-300 rounded-lg overflow-hidden grid grid-cols-1 sm:grid-cols-[1fr_auto]">
          <div className="p-3 flex items-center gap-3 border-b sm:border-b-0 sm:border-r border-slate-300">
            <img src="/logo.jpg" alt="GLZ" className="h-14 w-auto object-contain" />
            <div>
              <p className="text-base font-black text-slate-900 tracking-wide">
                {compra ? 'COMPROBANTE DE COMPRA' : 'COMPROBANTE DE GASTO'}
              </p>
              <p className="text-[11px] text-slate-500">Sistema GLZ Cloud · Documento interno</p>
            </div>
          </div>
          <div className="p-3 bg-slate-50 text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Comprobante</p>
            <p className="text-xl font-black text-slate-900 leading-tight">{codigoComprobante(egreso)}</p>
            <p className="text-[11px] text-slate-600 mt-0.5"><span className="font-bold">Fecha:</span> {formatearFecha(egreso?.fecha)}</p>
          </div>
        </header>

        {esEgresoAnulado(egreso) && (
          <p className="mt-3 border border-red-300 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-xs">
            <b>Anulado</b> el {formatearFecha(egreso?.anulacion?.fecha)} por {egreso?.anulacion?.usuario || '—'}. Motivo: {egreso?.anulacion?.motivo || '—'}
          </p>
        )}

        <section className="mt-3 border border-slate-300 rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider">
            {compra ? 'Datos de la compra' : 'Datos del gasto'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <Dato etiqueta="Proveedor" valor={egreso?.proveedor} className="border-b sm:border-r" />
            <Dato etiqueta="N° de documento del proveedor" valor={egreso?.numeroDocumento} className="border-b" />
            <Dato etiqueta={compra ? 'Detalle' : 'Categoría'} valor={compra ? egreso?.descripcion : egreso?.categoria} className="border-b sm:border-r" />
            <Dato etiqueta="Forma de pago" valor={egreso?.formaPago === 'Credito' ? 'Crédito' : egreso?.formaPago} className="border-b" />
            {!compra && <Dato etiqueta="Descripción" valor={egreso?.descripcion} className="border-b sm:col-span-2" />}
            <Dato etiqueta="Registrado por" valor={egreso?.usuarioCreador} className="sm:col-span-2" />
          </div>
        </section>

        {compra && (
          <section className="mt-3">
            <table className="comprobante-tabla w-full border border-slate-300 border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#11325a] text-white">
                  <th className="px-2.5 py-1.5 border border-slate-300 text-center w-[11%]">Cantidad</th>
                  <th className="px-2.5 py-1.5 border border-slate-300 text-center w-[20%]">Código</th>
                  <th className="px-2.5 py-1.5 border border-slate-300 text-left">Descripción</th>
                  <th className="px-2.5 py-1.5 border border-slate-300 text-right w-[16%]">Costo unit.</th>
                  <th className="px-2.5 py-1.5 border border-slate-300 text-right w-[16%]">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-2.5 py-4 border border-slate-300 text-center text-slate-400">Sin repuestos registrados.</td>
                  </tr>
                ) : items.map((item, indice) => (
                  <tr key={`${item.idRepuesto || item.codigo}-${indice}`} className="comprobante-no-break">
                    <td className="px-2.5 py-1.5 border border-slate-300 text-center">{formatearCantidad(item.cant)}</td>
                    <td className="px-2.5 py-1.5 border border-slate-300 text-center">{item.codigo}</td>
                    <td className="px-2.5 py-1.5 border border-slate-300">{item.desc}</td>
                    <td className="px-2.5 py-1.5 border border-slate-300 text-right">C$ {formatearMonto(item.costo)}</td>
                    <td className="px-2.5 py-1.5 border border-slate-300 text-right">C$ {formatearMonto(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="comprobante-no-break mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700">
              {credito ? 'Pagos al proveedor' : 'Notas'}
            </div>
            <div className="p-3 text-xs space-y-1">
              {credito ? (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600">Abono inicial · {formatearFecha(egreso?.fecha)}</span>
                    <span className="font-bold">C$ {formatearMonto(abonoInicial)}</span>
                  </div>
                  {abonos.map((abono, indice) => (
                    <div key={`${abono.fecha}-${indice}`} className="flex justify-between gap-2">
                      <span className="text-slate-600 min-w-0 break-words">
                        Abono · {formatearFecha(abono.fecha)}{abono.nota ? ` · ${abono.nota}` : ''}
                      </span>
                      <span className="font-bold shrink-0">C$ {formatearMonto(abono.monto)}</span>
                    </div>
                  ))}
                  {egreso?.notas && <p className="pt-1.5 text-slate-600 border-t border-slate-200"><b>Notas:</b> {egreso.notas}</p>}
                </>
              ) : (
                <p className="text-sm text-slate-700 break-words">{egreso?.notas || '—'}</p>
              )}
            </div>
          </div>

          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700">
              Resumen
            </div>
            <div className="p-3 text-sm">
              {credito && (
                <>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-600">Total pagado</span>
                    <span className="font-bold">C$ {formatearMonto(obtenerTotalPagadoEgreso(egreso))}</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-200">
                    <span className="text-slate-600">Saldo pendiente</span>
                    <span className="font-bold text-red-600">C$ {formatearMonto(obtenerSaldoEgreso(egreso))}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between pt-1.5 text-base">
                <span className="font-black text-slate-900">Total</span>
                <span className="font-black text-slate-900">C$ {formatearMonto(total)}</span>
              </div>
              <p className="text-right text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                Estado: {obtenerEstadoEgreso(egreso)}
              </p>
            </div>
          </div>
        </section>

        <section className="comprobante-no-break mt-10 grid grid-cols-2 gap-10 px-6">
          <Firma etiqueta="Entregado por" />
          <Firma etiqueta="Recibido por" />
        </section>
      </article>
    </div>
  );
}
