import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { BarChart3, Download, RefreshCw, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import ModalReporte from './ModalReporte';
import { esAnulado, esCotizacion, formatearMonto, normalizarMoneda } from '../utils/documentos';
import { esCompra, obtenerSaldoEgreso, obtenerTotalEgreso } from '../utils/gastos';
import {
  RANGOS,
  calcularRango,
  claveMes,
  construirCSV,
  dentroDe,
  descargarArchivo,
  etiquetaMes,
  fechaArchivo,
  fechaCSV,
  montoCSV,
  rangoAnterior,
  ultimosMeses,
  variacion
} from '../utils/reportes';

const LIMITE = 1500;
const MESES_GRAFICO = 6;

// Par validado para daltonismo: separación ΔE 23.4 en protanopia.
// Deliberadamente distinto del verde de la interfaz, para que una barra
// nunca se confunda con un botón.
const COLOR_VENTAS = '#0284c7';
const COLOR_EGRESOS = '#ea580c';

const hoyISO = () => new Date().toISOString().slice(0, 10);

const sumar = (lista, obtener) => normalizarMoneda(lista.reduce((total, item) => total + obtener(item), 0));

export default function ModuloReportes() {
  const [rangoClave, setRangoClave] = useState('mes');
  const [desdeManual, setDesdeManual] = useState(hoyISO());
  const [hastaManual, setHastaManual] = useState(hoyISO());
  const [facturas, setFacturas] = useState([]);
  const [egresos, setEgresos] = useState([]);
  const [porCobrar, setPorCobrar] = useState(0);
  const [porPagar, setPorPagar] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mesActivo, setMesActivo] = useState(null);
  const [cuentasPorCobrar, setCuentasPorCobrar] = useState([]);
  const [reporteAbierto, setReporteAbierto] = useState(false);

  const rango = useMemo(
    () => calcularRango(rangoClave, desdeManual, hastaManual),
    [rangoClave, desdeManual, hastaManual]
  );

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      // Se baja una sola ventana que cubra el rango elegido y los seis meses
      // del gráfico, y todo lo demás se calcula en memoria.
      const hoy = new Date();
      const inicioGrafico = new Date(hoy.getFullYear(), hoy.getMonth() - (MESES_GRAFICO - 1), 1);
      const desdeConsulta = (rango.desde < inicioGrafico ? rango.desde : inicioGrafico).toISOString();
      const hastaConsulta = (rango.hasta > hoy ? rango.hasta : hoy).toISOString();

      const [snapFacturas, snapEgresos, snapCobrar, snapPagar] = await Promise.all([
        getDocs(query(
          collection(db, 'facturas'),
          where('fecha', '>=', desdeConsulta),
          where('fecha', '<=', hastaConsulta),
          orderBy('fecha', 'desc'),
          limit(LIMITE)
        )),
        getDocs(query(
          collection(db, 'gastos'),
          where('fecha', '>=', desdeConsulta),
          where('fecha', '<=', hastaConsulta),
          orderBy('fecha', 'desc'),
          limit(LIMITE)
        )),
        // La cartera no depende del rango: se piden solo los que tienen saldo.
        getDocs(query(collection(db, 'facturas'), where('saldoPendiente', '>', 0), limit(LIMITE))),
        getDocs(query(collection(db, 'gastos'), where('saldoPendiente', '>', 0), limit(LIMITE)))
      ]);

      setFacturas(snapFacturas.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEgresos(snapEgresos.docs.map((d) => ({ id: d.id, ...d.data() })));

      const pendientesVenta = snapCobrar.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((f) => !esCotizacion(f) && !esAnulado(f));
      setCuentasPorCobrar(pendientesVenta);
      setPorCobrar(sumar(pendientesVenta, (f) => normalizarMoneda(f.saldoPendiente || 0)));

      const pendientesCompra = snapPagar.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPorPagar(sumar(pendientesCompra, (e) => obtenerSaldoEgreso(e)));

      setError('');
    } catch (errorCarga) {
      console.error('Error cargando reportes:', errorCarga);
      setError('No se pudieron cargar los datos. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  }, [rango.desde, rango.hasta]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ---------- Agregaciones ----------
  const ventasValidas = useMemo(
    () => facturas.filter((f) => !esCotizacion(f) && !esAnulado(f)),
    [facturas]
  );

  const calcularPeriodo = useCallback((limites) => {
    const ventas = ventasValidas.filter((f) => dentroDe(f.fecha, limites));
    const egresosPeriodo = egresos.filter((e) => dentroDe(e.fecha, limites));

    let costoVentas = 0;
    let documentosSinCosto = 0;
    ventas.forEach((factura) => {
      const items = Array.isArray(factura.items) ? factura.items : [];
      const conCosto = items.filter((i) => typeof i.costo === 'number');
      if (conCosto.length !== items.length) documentosSinCosto += 1;
      conCosto.forEach((i) => { costoVentas += Number(i.cant || 0) * Number(i.costo || 0); });
    });

    const totalVentas = sumar(ventas, (f) => normalizarMoneda(f.total || 0));
    const compras = sumar(egresosPeriodo.filter(esCompra), obtenerTotalEgreso);
    const gastos = sumar(egresosPeriodo.filter((e) => !esCompra(e)), obtenerTotalEgreso);

    return {
      ventas: totalVentas,
      documentos: ventas.length,
      costoVentas: normalizarMoneda(costoVentas),
      utilidadBruta: normalizarMoneda(totalVentas - costoVentas),
      compras,
      gastos,
      egresos: normalizarMoneda(compras + gastos),
      utilidadEstimada: normalizarMoneda(totalVentas - costoVentas - gastos),
      documentosSinCosto,
      listaVentas: ventas,
      listaEgresos: egresosPeriodo
    };
  }, [ventasValidas, egresos]);

  const actual = useMemo(() => calcularPeriodo(rango), [calcularPeriodo, rango]);
  const previo = useMemo(() => calcularPeriodo(rangoAnterior(rango)), [calcularPeriodo, rango]);

  const serieMensual = useMemo(() => {
    const claves = ultimosMeses(MESES_GRAFICO);
    return claves.map((clave) => {
      const ventas = sumar(
        ventasValidas.filter((f) => claveMes(f.fecha) === clave),
        (f) => normalizarMoneda(f.total || 0)
      );
      const salidas = sumar(
        egresos.filter((e) => claveMes(e.fecha) === clave),
        obtenerTotalEgreso
      );
      return { clave, etiqueta: etiquetaMes(clave), ventas, egresos: salidas };
    });
  }, [ventasValidas, egresos]);

  const maximoSerie = Math.max(1, ...serieMensual.flatMap((m) => [m.ventas, m.egresos]));

  const topProductos = useMemo(() => {
    const acumulado = new Map();
    actual.listaVentas.forEach((factura) => {
      (Array.isArray(factura.items) ? factura.items : []).forEach((item) => {
        const clave = item.codigo || item.desc || 'Sin código';
        const previoItem = acumulado.get(clave) || { codigo: clave, descripcion: item.desc || '', cantidad: 0, importe: 0 };
        previoItem.cantidad += Number(item.cant || 0);
        previoItem.importe += Number(item.subtotal || 0);
        acumulado.set(clave, previoItem);
      });
    });
    return [...acumulado.values()].sort((a, b) => b.importe - a.importe).slice(0, 10);
  }, [actual.listaVentas]);

  const variacionVentas = variacion(actual.ventas, previo.ventas);
  const lectura = mesActivo
    ? serieMensual.find((m) => m.clave === mesActivo)
    : serieMensual[serieMensual.length - 1];

  // ---------- Descargas ----------
  const sufijo = `${fechaArchivo(rango.desde)}_a_${fechaArchivo(rango.hasta)}`;

  const descargarVentas = () => {
    const filas = actual.listaVentas.map((f) => [
      fechaCSV(f.fecha), f.numeroFactura || '', f.cliente || '', f.empresa || '',
      f.formaPago || '', f.estadoPago || '', montoCSV(f.total), montoCSV(f.saldoPendiente || 0), f.usuarioCreador || ''
    ]);
    descargarArchivo(`ventas_${sufijo}.csv`, construirCSV(
      ['Fecha', 'N° Factura', 'Cliente', 'Empresa', 'Forma de pago', 'Estado', 'Total', 'Saldo pendiente', 'Usuario'],
      filas
    ));
  };

  const descargarProductos = () => {
    const filas = [];
    actual.listaVentas.forEach((f) => {
      (Array.isArray(f.items) ? f.items : []).forEach((i) => {
        filas.push([
          fechaCSV(f.fecha), f.cliente || '', i.codigo || '', i.desc || '',
          Number(i.cant || 0), montoCSV(i.precio), montoCSV(i.subtotal),
          typeof i.costo === 'number' ? montoCSV(i.costo) : ''
        ]);
      });
    });
    descargarArchivo(`productos_vendidos_${sufijo}.csv`, construirCSV(
      ['Fecha', 'Cliente', 'Código', 'Descripción', 'Cantidad', 'Precio', 'Subtotal', 'Costo unitario'],
      filas
    ));
  };

  const descargarEgresos = () => {
    const filas = actual.listaEgresos.map((e) => [
      fechaCSV(e.fecha), e.tipo || '', e.categoria || '', e.proveedor || '',
      e.numeroDocumento || '', e.descripcion || '', e.formaPago || '',
      montoCSV(e.total), montoCSV(obtenerSaldoEgreso(e))
    ]);
    descargarArchivo(`compras_y_gastos_${sufijo}.csv`, construirCSV(
      ['Fecha', 'Tipo', 'Categoría', 'Proveedor', 'N° Documento', 'Descripción', 'Forma de pago', 'Total', 'Saldo pendiente'],
      filas
    ));
  };

  // ---------- Piezas ----------
  const Kpi = ({ etiqueta, valor, detalle, acento = 'text-slate-800' }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{etiqueta}</p>
      <p className={`text-2xl font-black mt-1 tabular-nums ${acento}`}>C$ {formatearMonto(valor)}</p>
      {detalle && <p className="text-[11px] text-slate-500 mt-1">{detalle}</p>}
    </div>
  );

  const etiquetaRango = `${rango.desde.toLocaleDateString('es-NI')} — ${rango.hasta.toLocaleDateString('es-NI')}`;

  return (
    <>
    {/* El panel no se imprime: al imprimir solo sale el reporte del modal. */}
    <div className="space-y-6 print:hidden">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b pb-4 mb-4">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={24} className="text-slate-500" /> Panel y reportes
          </h2>
          <button onClick={cargarDatos} disabled={cargando} className="inline-flex items-center justify-center gap-2 text-sm font-bold border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-50">
            <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {RANGOS.map((r) => (
            <button
              key={r.clave}
              onClick={() => setRangoClave(r.clave)}
              className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${rangoClave === r.clave ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
            >
              {r.etiqueta}
            </button>
          ))}

          {rangoClave === 'personalizado' && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Desde</label>
                <input type="date" value={desdeManual} onChange={(e) => setDesdeManual(e.target.value)} className="border border-slate-300 p-2 rounded-lg outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Hasta</label>
                <input type="date" value={hastaManual} onChange={(e) => setHastaManual(e.target.value)} className="border border-slate-300 p-2 rounded-lg outline-none focus:border-emerald-500" />
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 mt-3">Período analizado: <span className="font-bold text-slate-700">{etiquetaRango}</span></p>

        {error && <div className="mt-4 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>}
        {cargando && <div className="mt-4 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg">Calculando...</div>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-slate-800 text-white rounded-xl p-4">
          <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Ventas del período</p>
          <p className="text-3xl font-black mt-1 tabular-nums">C$ {formatearMonto(actual.ventas)}</p>
          <p className="text-[11px] mt-2 flex items-center gap-1 font-semibold">
            {variacionVentas >= 0
              ? <><TrendingUp size={13} className="text-emerald-400" /><span className="text-emerald-400">+{variacionVentas}%</span></>
              : <><TrendingDown size={13} className="text-red-400" /><span className="text-red-400">{variacionVentas}%</span></>}
            <span className="text-slate-400">contra el período anterior</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{actual.documentos} factura(s) emitida(s)</p>
        </div>

        <Kpi
          etiqueta="Utilidad bruta"
          valor={actual.utilidadBruta}
          acento="text-emerald-600"
          detalle={actual.documentosSinCosto > 0
            ? `${actual.documentosSinCosto} factura(s) sin costo registrado`
            : `Costo de lo vendido: C$ ${formatearMonto(actual.costoVentas)}`}
        />

        <Kpi etiqueta="Gastos del negocio" valor={actual.gastos} acento="text-orange-600" detalle="Sin contar compras de mercadería" />

        <Kpi
          etiqueta="Utilidad estimada"
          valor={actual.utilidadEstimada}
          acento={actual.utilidadEstimada >= 0 ? 'text-emerald-600' : 'text-red-600'}
          detalle="Ventas menos costo y gastos"
        />

        <Kpi etiqueta="Compras de mercadería" valor={actual.compras} detalle="Entró a bodega, no es gasto del período" />
        <Kpi etiqueta="Por cobrar a clientes" valor={porCobrar} acento="text-red-600" detalle="Total histórico, no del período" />
        <Kpi etiqueta="Por pagar a proveedores" valor={porPagar} acento="text-red-600" detalle="Total histórico, no del período" />
        <Kpi etiqueta="Ticket promedio" valor={actual.documentos ? actual.ventas / actual.documentos : 0} detalle="Venta promedio por factura" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Ventas contra egresos</h3>
            <p className="text-xs text-slate-500">Últimos {MESES_GRAFICO} meses. Egresos incluye compras de mercadería y gastos del negocio.</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COLOR_VENTAS }} />Ventas</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COLOR_EGRESOS }} />Egresos</span>
          </div>
        </div>

        {lectura && (
          <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-l-2 border-slate-200 pl-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{lectura.etiqueta}</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: COLOR_VENTAS }}>Ventas C$ {formatearMonto(lectura.ventas)}</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: COLOR_EGRESOS }}>Egresos C$ {formatearMonto(lectura.egresos)}</span>
          </div>
        )}

        <div className="flex items-end justify-between gap-2 sm:gap-4 h-44 border-b border-slate-200">
          {serieMensual.map((mes, indice) => {
            const activo = mesActivo === mes.clave || (!mesActivo && indice === serieMensual.length - 1);
            return (
              <div
                key={mes.clave}
                className="flex-1 h-full flex flex-col justify-end items-center cursor-default"
                onMouseEnter={() => setMesActivo(mes.clave)}
                onMouseLeave={() => setMesActivo(null)}
                onFocus={() => setMesActivo(mes.clave)}
                tabIndex={0}
              >
                <div className="w-full h-full flex items-end justify-center gap-[2px]">
                  <div
                    className="w-3 sm:w-5 rounded-t transition-opacity"
                    style={{
                      height: `${Math.max(2, (mes.ventas / maximoSerie) * 100)}%`,
                      background: COLOR_VENTAS,
                      opacity: activo ? 1 : 0.55
                    }}
                  />
                  <div
                    className="w-3 sm:w-5 rounded-t transition-opacity"
                    style={{
                      height: `${Math.max(2, (mes.egresos / maximoSerie) * 100)}%`,
                      background: COLOR_EGRESOS,
                      opacity: activo ? 1 : 0.55
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between gap-2 sm:gap-4 mt-2">
          {serieMensual.map((mes) => (
            <span key={mes.clave} className="flex-1 text-center text-[11px] font-semibold text-slate-500 uppercase">{mes.etiqueta}</span>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Ventas y egresos por mes</caption>
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="p-2.5">Mes</th>
                <th className="p-2.5 text-right">Ventas</th>
                <th className="p-2.5 text-right">Egresos</th>
                <th className="p-2.5 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {serieMensual.map((mes) => {
                const diferencia = normalizarMoneda(mes.ventas - mes.egresos);
                return (
                  <tr key={mes.clave} className="hover:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-700 uppercase">{mes.etiqueta}</td>
                    <td className="p-2.5 text-right tabular-nums">C$ {formatearMonto(mes.ventas)}</td>
                    <td className="p-2.5 text-right tabular-nums">C$ {formatearMonto(mes.egresos)}</td>
                    <td className={`p-2.5 text-right tabular-nums font-bold ${diferencia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      C$ {formatearMonto(diferencia)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-1">Lo que más se vendió</h3>
        <p className="text-xs text-slate-500 mb-4">Diez primeros por importe, dentro del período analizado.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="p-2.5">Código</th>
                <th className="p-2.5">Descripción</th>
                <th className="p-2.5 text-right">Unidades</th>
                <th className="p-2.5 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topProductos.map((p) => (
                <tr key={p.codigo} className="hover:bg-slate-50">
                  <td className="p-2.5 font-bold text-slate-700">{p.codigo}</td>
                  <td className="p-2.5 text-slate-600">{p.descripcion}</td>
                  <td className="p-2.5 text-right tabular-nums">{p.cantidad}</td>
                  <td className="p-2.5 text-right tabular-nums font-bold">C$ {formatearMonto(p.importe)}</td>
                </tr>
              ))}
              {topProductos.length === 0 && (
                <tr><td colSpan="4" className="p-8 text-center text-slate-400">No hubo ventas en este período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 print:hidden">
        <h3 className="text-lg font-bold text-slate-800 mb-1">Descargar</h3>
        <p className="text-xs text-slate-500 mb-4">
          Los CSV se abren directo en Excel. El reporte PDF trae el resumen y los detalles que se marquen. Todo corresponde al período analizado.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={descargarVentas} className="inline-flex items-center gap-2 text-sm font-bold bg-slate-800 text-white px-4 py-2.5 rounded-lg hover:bg-slate-900">
            <Download size={16} /> Ventas
          </button>
          <button onClick={descargarProductos} className="inline-flex items-center gap-2 text-sm font-bold bg-slate-800 text-white px-4 py-2.5 rounded-lg hover:bg-slate-900">
            <Download size={16} /> Productos vendidos
          </button>
          <button onClick={descargarEgresos} className="inline-flex items-center gap-2 text-sm font-bold bg-slate-800 text-white px-4 py-2.5 rounded-lg hover:bg-slate-900">
            <Download size={16} /> Compras y gastos
          </button>
          <button onClick={() => setReporteAbierto(true)} className="inline-flex items-center gap-2 text-sm font-bold border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-100">
            <FileText size={16} /> Reporte PDF
          </button>
        </div>
      </div>
    </div>

    {reporteAbierto && (
      <ModalReporte
        datos={{
          rango,
          etiquetaRango,
          actual,
          variacionVentas,
          serieMensual,
          topProductos,
          porCobrar,
          porPagar,
          cuentasPorCobrar
        }}
        onCerrar={() => setReporteAbierto(false)}
      />
    )}
    </>
  );
}
