import { formatearMonto, normalizarMoneda } from '../utils/documentos';
import { esCompra, obtenerSaldoEgreso, obtenerTotalEgreso } from '../utils/gastos';

const DIA_MS = 24 * 60 * 60 * 1000;

const formatearFecha = (valor) => {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? '—'
    : fecha.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const sumar = (lista, obtener) => normalizarMoneda(lista.reduce((total, item) => total + obtener(item), 0));

const monto = (valor) => `C$ ${formatearMonto(valor)}`;

function Indicador({ etiqueta, valor, detalle, destacado = false }) {
  return (
    <div className={`border rounded-lg px-3 py-2 ${destacado ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300'}`}>
      <p className={`text-[9px] font-black uppercase tracking-wider ${destacado ? 'text-slate-300' : 'text-slate-500'}`}>{etiqueta}</p>
      <p className="text-base font-black tabular-nums leading-tight mt-0.5">{monto(valor)}</p>
      {detalle && <p className={`text-[9px] mt-0.5 leading-tight ${destacado ? 'text-slate-300' : 'text-slate-500'}`}>{detalle}</p>}
    </div>
  );
}

function Seccion({ titulo, subtitulo, nuevaPagina = false, children }) {
  return (
    <section className={`mt-4 ${nuevaPagina ? 'reporte-nueva-pagina' : ''}`}>
      <div className="px-3 py-1.5 bg-slate-800 text-white rounded-t-lg">
        <p className="text-[11px] font-black uppercase tracking-wider">{titulo}</p>
        {subtitulo && <p className="text-[10px] text-slate-300">{subtitulo}</p>}
      </div>
      {children}
    </section>
  );
}

function Tabla({ columnas, filas, pie, vacio }) {
  return (
    <table className="reporte-tabla w-full border border-slate-300 border-collapse text-[10px]">
      <thead>
        <tr className="bg-slate-100 text-slate-700">
          {columnas.map((c) => (
            <th key={c.titulo} className={`px-2 py-1 border border-slate-300 font-bold ${c.derecha ? 'text-right' : 'text-left'}`}>{c.titulo}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 ? (
          <tr><td colSpan={columnas.length} className="px-2 py-3 border border-slate-300 text-center text-slate-400">{vacio}</td></tr>
        ) : filas.map((fila, indice) => (
          <tr key={indice} className="reporte-fila">
            {fila.map((celda, i) => (
              <td key={i} className={`px-2 py-1 border border-slate-300 align-top ${columnas[i].derecha ? 'text-right tabular-nums' : ''}`}>{celda}</td>
            ))}
          </tr>
        ))}
      </tbody>
      {pie && filas.length > 0 && (
        <tfoot>
          <tr className="bg-slate-50 font-black">
            {pie.map((celda, i) => (
              <td key={i} className={`px-2 py-1 border border-slate-300 ${columnas[i].derecha ? 'text-right tabular-nums' : ''}`}>{celda}</td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

// Reporte del negocio para el período elegido en el panel. `inventario` es null mientras no se cargó.
export default function PlantillaReporte({ datos, secciones, inventario, soloImpresion = false }) {
  const { rango, actual, variacionVentas, serieMensual, topProductos, porCobrar, porPagar, cuentasPorCobrar } = datos;
  const ventas = [...actual.listaVentas].sort((a, b) => `${a.fecha}`.localeCompare(`${b.fecha}`));
  const egresos = [...actual.listaEgresos].sort((a, b) => `${a.fecha}`.localeCompare(`${b.fecha}`));
  const cobrar = [...cuentasPorCobrar].sort((a, b) => `${a.fecha}`.localeCompare(`${b.fecha}`));
  const ahora = new Date();

  const conStock = (inventario || [])
    .filter((r) => Number(r.cantidad || 0) > 0)
    .sort((a, b) => `${a.localidad || 'Managua'}${a.codigo}`.localeCompare(`${b.localidad || 'Managua'}${b.codigo}`));
  const valorDe = (r) => normalizarMoneda(Number(r.cantidad || 0) * Number(r.costo || 0));
  const bodegas = [...new Set(conStock.map((r) => r.localidad || 'Managua'))];

  return (
    <div className={soloImpresion ? 'hidden print:block' : 'block'}>
      <style>{`
        @media print {
          @page { size: letter; margin: 1cm 0; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .reporte-tabla thead { display: table-header-group; }
          .reporte-fila, .reporte-no-break { break-inside: avoid; page-break-inside: avoid; }
          .reporte-nueva-pagina { break-before: page; page-break-before: always; }
        }
      `}</style>

      <article className="mx-auto w-full max-w-[21.59cm] bg-white text-slate-800 border border-slate-300 shadow-sm px-4 pb-4 pt-2">
        <header className="reporte-no-break flex items-center justify-between gap-3 border-b-2 border-slate-800 pb-2">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.jpg" alt="GLZ" className="h-12 w-auto object-contain" />
            <div className="min-w-0">
              <p className="text-base font-black text-slate-900 tracking-wide">REPORTE DEL NEGOCIO</p>
              <p className="text-[11px] text-slate-600">Del {formatearFecha(rango.desde)} al {formatearFecha(rango.hasta)}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 text-right shrink-0">
            Generado<br />{ahora.toLocaleString('es-NI', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </header>

        <div className="reporte-no-break mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Indicador
            destacado
            etiqueta="Ventas del período"
            valor={actual.ventas}
            detalle={`${variacionVentas >= 0 ? '+' : ''}${variacionVentas}% vs. período anterior · ${actual.documentos} factura(s)`}
          />
          <Indicador
            etiqueta="Utilidad bruta"
            valor={actual.utilidadBruta}
            detalle={actual.documentosSinCosto > 0
              ? `${actual.documentosSinCosto} factura(s) sin costo registrado`
              : `Costo de lo vendido: ${monto(actual.costoVentas)}`}
          />
          <Indicador etiqueta="Gastos del negocio" valor={actual.gastos} detalle="Sin compras de mercadería" />
          <Indicador etiqueta="Utilidad estimada" valor={actual.utilidadEstimada} detalle="Ventas − costo − gastos" />
          <Indicador etiqueta="Compras de mercadería" valor={actual.compras} detalle="Entró a bodega" />
          <Indicador etiqueta="Por cobrar a clientes" valor={porCobrar} detalle="Total histórico" />
          <Indicador etiqueta="Por pagar a proveedores" valor={porPagar} detalle="Total histórico" />
          <Indicador etiqueta="Ticket promedio" valor={actual.documentos ? actual.ventas / actual.documentos : 0} detalle="Venta promedio por factura" />
        </div>

        <div className="reporte-no-break mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Últimos 6 meses</p>
            <Tabla
              columnas={[{ titulo: 'Mes' }, { titulo: 'Ventas', derecha: true }, { titulo: 'Egresos', derecha: true }, { titulo: 'Diferencia', derecha: true }]}
              filas={serieMensual.map((m) => [m.etiqueta.toUpperCase(), monto(m.ventas), monto(m.egresos), monto(m.ventas - m.egresos)])}
              vacio="Sin datos."
            />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Lo más vendido del período</p>
            <Tabla
              columnas={[{ titulo: 'Código' }, { titulo: 'Descripción' }, { titulo: 'Und.', derecha: true }, { titulo: 'Importe', derecha: true }]}
              filas={topProductos.map((p) => [p.codigo, p.descripcion, p.cantidad, monto(p.importe)])}
              vacio="No hubo ventas en este período."
            />
          </div>
        </div>

        {secciones.ventas && (
          <Seccion nuevaPagina titulo="Detalle de ventas" subtitulo={`${ventas.length} factura(s) · sin cotizaciones ni anuladas`}>
            <Tabla
              columnas={[{ titulo: 'Fecha' }, { titulo: 'N° factura' }, { titulo: 'Cliente' }, { titulo: 'Pago' }, { titulo: 'Total', derecha: true }, { titulo: 'Saldo', derecha: true }]}
              filas={ventas.map((f) => [
                formatearFecha(f.fecha),
                f.numeroFactura || '—',
                f.empresa ? `${f.cliente} (${f.empresa})` : (f.cliente || '—'),
                f.formaPago || '—',
                monto(f.total || 0),
                monto(f.saldoPendiente || 0)
              ])}
              pie={['Total', '', '', '', monto(actual.ventas), monto(sumar(ventas, (f) => Number(f.saldoPendiente || 0)))]}
              vacio="No hubo ventas en este período."
            />
          </Seccion>
        )}

        {secciones.egresos && (
          <Seccion nuevaPagina titulo="Detalle de compras y gastos" subtitulo={`${egresos.length} registro(s)`}>
            <Tabla
              columnas={[{ titulo: 'Fecha' }, { titulo: 'Tipo' }, { titulo: 'Proveedor' }, { titulo: 'Documento' }, { titulo: 'Total', derecha: true }, { titulo: 'Saldo', derecha: true }]}
              filas={egresos.map((e) => [
                formatearFecha(e.fecha),
                esCompra(e) ? 'Compra' : (e.categoria || 'Gasto'),
                e.proveedor || '—',
                e.numeroDocumento || '—',
                monto(obtenerTotalEgreso(e)),
                monto(obtenerSaldoEgreso(e))
              ])}
              pie={['Total', '', '', '', monto(actual.egresos), monto(sumar(egresos, obtenerSaldoEgreso))]}
              vacio="No hubo compras ni gastos en este período."
            />
          </Seccion>
        )}

        {secciones.cobrar && (
          <Seccion nuevaPagina titulo="Cuentas por cobrar" subtitulo="Todas las facturas con saldo pendiente, sin importar el período">
            <Tabla
              columnas={[{ titulo: 'Cliente' }, { titulo: 'N° factura' }, { titulo: 'Fecha' }, { titulo: 'Días', derecha: true }, { titulo: 'Total', derecha: true }, { titulo: 'Saldo', derecha: true }]}
              filas={cobrar.map((f) => [
                f.empresa ? `${f.cliente} (${f.empresa})` : (f.cliente || '—'),
                f.numeroFactura || '—',
                formatearFecha(f.fecha),
                Number.isNaN(new Date(f.fecha).getTime()) ? '—' : Math.max(0, Math.floor((ahora - new Date(f.fecha)) / DIA_MS)),
                monto(f.total || 0),
                monto(f.saldoPendiente || 0)
              ])}
              pie={['Total', '', '', '', '', monto(porCobrar)]}
              vacio="No hay cuentas por cobrar."
            />
          </Seccion>
        )}

        {secciones.inventario && (
          <Seccion nuevaPagina titulo="Inventario valorizado" subtitulo="Existencias actuales × costo unitario. Solo repuestos con stock.">
            {inventario === null ? (
              <p className="px-3 py-4 border border-slate-300 text-center text-xs text-slate-400">Cargando inventario...</p>
            ) : (
              <>
                <Tabla
                  columnas={[{ titulo: 'Bodega' }, { titulo: 'Código' }, { titulo: 'Descripción' }, { titulo: 'Stock', derecha: true }, { titulo: 'Costo', derecha: true }, { titulo: 'Valor', derecha: true }]}
                  filas={conStock.map((r) => [
                    r.localidad || 'Managua',
                    r.codigo || '—',
                    r.descripcion || '—',
                    Number(r.cantidad || 0),
                    monto(r.costo || 0),
                    monto(valorDe(r))
                  ])}
                  pie={['Total general', '', '', sumar(conStock, (r) => Number(r.cantidad || 0)), '', monto(sumar(conStock, valorDe))]}
                  vacio="No hay repuestos con stock."
                />
                {bodegas.length > 0 && (
                  <div className="reporte-no-break mt-2 flex flex-wrap justify-end gap-2">
                    {bodegas.map((bodega) => (
                      <p key={bodega} className="text-[10px] border border-slate-300 rounded px-2 py-1">
                        <span className="font-bold">{bodega}:</span> {monto(sumar(conStock.filter((r) => (r.localidad || 'Managua') === bodega), valorDe))}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </Seccion>
        )}
      </article>
    </div>
  );
}
