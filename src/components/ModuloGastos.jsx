import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, deleteField, doc, getDocs, limit, orderBy, query, runTransaction } from 'firebase/firestore';
import { ShoppingCart, Receipt, AlertCircle, Search, Trash2, Plus, RefreshCw, FileText, Ban } from 'lucide-react';
import ModalComprobanteEgreso from './ModalComprobanteEgreso';
import AvisoCostoCompra from './AvisoCostoCompra';
import { cambiosPorCompra } from '../utils/costos';
import { normalizarMoneda, formatearMonto } from '../utils/documentos';
import {
  CATEGORIAS_GASTO,
  FORMAS_PAGO_EGRESO,
  TIPO_EGRESO,
  esCompra,
  esCreditoEgreso,
  esEgresoAnulado,
  etiquetaEgreso,
  obtenerEstadoEgreso,
  obtenerSaldoEgreso,
  obtenerTotalEgreso,
  obtenerTotalPagadoEgreso,
  resolverMensajeErrorEgreso
} from '../utils/gastos';
import { TIPO_MOVIMIENTO, construirMovimiento, nuevoMovimientoRef } from '../utils/kardex';

const LIMITE = 300;

const hoyISO = () => new Date().toISOString().slice(0, 10);

// El input de fecha entrega YYYY-MM-DD. Se fija el mediodía para que el cambio
// de zona horaria no mueva el registro al día anterior.
const fechaDesdeInput = (valor) => new Date(`${valor || hoyISO()}T12:00:00`).toISOString();

const formatearFecha = (valor) => {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-NI');
};

const lanzar = (mensaje, code) => {
  const error = new Error(mensaje);
  error.code = code;
  throw error;
};

export default function ModuloGastos({ registrarHistorial, usuarioActual = '' }) {
  const [pestaña, setPestaña] = useState('compras');
  const [egresos, setEgresos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [ultimoRegistroId, setUltimoRegistroId] = useState('');
  const [modalAnular, setModalAnular] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [errorAnulacion, setErrorAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);

  // Formulario común
  const [proveedorStr, setProveedorStr] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [abonoInicial, setAbonoInicial] = useState('0');
  const [notas, setNotas] = useState('');

  // Compra
  const [busquedaRepuesto, setBusquedaRepuesto] = useState('');
  const [itemsCompra, setItemsCompra] = useState([]);

  // Gasto
  const [categoria, setCategoria] = useState(CATEGORIAS_GASTO[0]);
  const [descripcion, setDescripcion] = useState('');
  const [montoGasto, setMontoGasto] = useState('');

  // Abonos
  const [modalAbono, setModalAbono] = useState({ abierto: false, egreso: null });
  const [montoAbono, setMontoAbono] = useState('');
  const [notaAbono, setNotaAbono] = useState('');
  const [errorAbono, setErrorAbono] = useState('');
  const [guardandoAbono, setGuardandoAbono] = useState(false);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [snapEgresos, snapProv, snapInv] = await Promise.all([
        getDocs(query(collection(db, 'gastos'), orderBy('fecha', 'desc'), limit(LIMITE))),
        getDocs(collection(db, 'proveedores')),
        getDocs(collection(db, 'repuestos'))
      ]);

      setEgresos(snapEgresos.docs.map((d) => ({ id: d.id, ...d.data() })));
      setProveedores(snapProv.docs.map((d) => ({ id: d.id, ...d.data() })));
      setInventario(snapInv.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError('');
    } catch (errorCarga) {
      console.error('Error cargando compras y gastos:', errorCarga);
      setError(resolverMensajeErrorEgreso(errorCarga));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // En Gastos el texto es libre: no se ata a la lista de proveedores ni guarda su id.
  const escribirPagadoA = (nombre) => {
    setProveedorStr(nombre);
    setProveedorId('');
  };

  const seleccionarProveedor = (nombre) => {
    setProveedorStr(nombre);
    const encontrado = proveedores.find((p) => p.nombre === nombre);
    setProveedorId(encontrado?.id || '');
  };

  const limpiarFormulario = () => {
    setProveedorStr('');
    setProveedorId('');
    setNumeroDocumento('');
    setFecha(hoyISO());
    setFormaPago('Efectivo');
    setAbonoInicial('0');
    setNotas('');
    setItemsCompra([]);
    setBusquedaRepuesto('');
    setDescripcion('');
    setMontoGasto('');
  };

  // ---------- Totales ----------
  const totalCompra = normalizarMoneda(itemsCompra.reduce((sum, i) => sum + (i.cantidad * i.costo), 0));
  const totalActual = pestaña === 'compras' ? totalCompra : normalizarMoneda(montoGasto === '' ? 0 : Number(montoGasto));
  const esCredito = formaPago === 'Credito';
  const abonoNum = esCredito ? normalizarMoneda(abonoInicial === '' ? 0 : Number(abonoInicial)) : 0;
  const errorAbonoInicial = esCredito && (Number.isNaN(abonoNum) || abonoNum < 0 || abonoNum > totalActual);
  const saldoPreview = esCredito && !errorAbonoInicial ? normalizarMoneda(Math.max(0, totalActual - abonoNum)) : 0;

  // ---------- Catálogo para compras ----------
  const repuestosFiltrados = useMemo(() => {
    const texto = busquedaRepuesto.trim().toLowerCase();
    if (!texto) return [];
    return inventario.filter((r) => (
      (r.codigo || '').toLowerCase().includes(texto) ||
      (r.descripcion || '').toLowerCase().includes(texto) ||
      (r.alternateCode || '').toLowerCase().includes(texto)
    )).slice(0, 8);
  }, [inventario, busquedaRepuesto]);

  const agregarItem = (repuesto) => {
    setItemsCompra((actual) => {
      if (actual.find((i) => i.id === repuesto.id)) return actual;
      return [...actual, {
        id: repuesto.id,
        codigo: repuesto.codigo || '',
        descripcion: repuesto.descripcion || '',
        localidad: repuesto.localidad || 'Managua',
        existencia: Number(repuesto.cantidad || 0),
        cantidad: 1,
        costo: normalizarMoneda(repuesto.costo || 0),
        // Para avisar si la compra entra a otro costo y cómo cambia el margen.
        costoActual: normalizarMoneda(repuesto.costo || 0),
        precioVerde: normalizarMoneda(repuesto.precioVerde || 0),
        actualizarCosto: true
      }];
    });
    setBusquedaRepuesto('');
  };

  const actualizarItem = (id, campo, valor) => {
    setItemsCompra((actual) => actual.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)));
  };

  // ---------- Registro ----------
  const construirDatosPago = (total) => {
    const totalPagado = esCredito ? abonoNum : total;
    const saldoPendiente = esCredito ? normalizarMoneda(total - abonoNum) : 0;
    return {
      formaPago,
      total,
      estadoPago: esCredito ? (saldoPendiente === 0 ? 'Saldado' : 'Pendiente') : 'Pagado',
      abonoInicial: esCredito ? abonoNum : 0,
      totalPagado,
      saldoPendiente,
      historialAbonos: esCredito && abonoNum > 0
        ? [{ fecha: fechaDesdeInput(fecha), monto: abonoNum, tipo: 'Abono Inicial', nota: 'Registrado al crear el documento' }]
        : []
    };
  };

  const registrar = async () => {
    if (procesando) return;
    setError('');
    setAviso('');

    const esCompraNueva = pestaña === 'compras';
    const total = normalizarMoneda(totalActual);

    if (Number.isNaN(total) || total <= 0) {
      setError('El monto debe ser mayor a C$ 0.00.');
      return;
    }
    if (errorAbonoInicial) {
      setError('El abono inicial debe estar entre C$ 0.00 y el total.');
      return;
    }
    if (esCompraNueva && itemsCompra.some((i) => !Number.isFinite(Number(i.cantidad)) || Number(i.cantidad) <= 0)) {
      setError('Todas las cantidades deben ser mayores a 0.');
      return;
    }
    if (!esCompraNueva && !descripcion.trim()) {
      setError('Escribe una descripción del gasto.');
      return;
    }

    const fechaISO = fechaDesdeInput(fecha);
    const base = {
      tipo: esCompraNueva ? TIPO_EGRESO.COMPRA : TIPO_EGRESO.GASTO,
      categoria: esCompraNueva ? 'Mercadería' : categoria,
      descripcion: esCompraNueva ? `Compra de ${itemsCompra.length} repuesto(s)` : descripcion.trim(),
      idProveedor: esCompraNueva ? (proveedorId || '') : '',
      proveedor: proveedorStr.trim() || 'Sin proveedor',
      numeroDocumento: numeroDocumento.trim(),
      fecha: fechaISO,
      notas: notas.trim(),
      usuarioCreador: usuarioActual || '',
      ...construirDatosPago(total)
    };

    setProcesando(true);
    try {
      const idRegistrado = await runTransaction(db, async (transaction) => {
        // ---------- LECTURAS ----------
        // Todas antes de cualquier escritura: Firestore lo exige.
        const lecturas = [];
        if (esCompraNueva) {
          for (const item of itemsCompra) {
            const ref = doc(db, 'repuestos', item.id);
            lecturas.push({ item, ref, snap: await transaction.get(ref) });
          }
        }

        // ---------- VALIDACIÓN ----------
        const nuevosStocks = {};
        for (const { item, snap } of lecturas) {
          if (!snap.exists()) lanzar(`El repuesto "${item.codigo}" ya no existe en inventario.`, 'datos-invalidos');
          const actual = Number(snap.data().cantidad || 0);
          nuevosStocks[item.id] = Math.max(0, normalizarMoneda(actual + Number(item.cantidad)));
        }

        // ---------- ESCRITURAS ----------
        const egresoRef = doc(collection(db, 'gastos'));
        const fechaRegistro = new Date().toISOString();
        // La compra suma existencias y, si entró a otro costo, deja el cambio anotado en el
        // repuesto (y actualiza el costo cuando la casilla está marcada).
        const cambiosCosto = {};
        for (const { item, ref, snap } of lecturas) {
          cambiosCosto[item.id] = cambiosPorCompra({
            datos: snap.data(),
            item,
            idCompra: egresoRef.id,
            proveedor: base.proveedor,
            fecha: fechaRegistro
          });
          transaction.update(ref, { cantidad: nuevosStocks[item.id], ...cambiosCosto[item.id] });
        }
        transaction.set(egresoRef, {
          ...base,
          items: esCompraNueva
            ? itemsCompra.map((i) => ({
              idRepuesto: i.id,
              codigo: i.codigo,
              desc: i.descripcion,
              cant: Number(i.cantidad),
              costo: normalizarMoneda(i.costo),
              subtotal: normalizarMoneda(Number(i.cantidad) * i.costo)
            }))
            : []
        });

        // Kardex: una entrada por artículo, enlazada a la compra.
        const textoCompra = `Compra a ${base.proveedor}${base.numeroDocumento ? ` · Doc ${base.numeroDocumento}` : ''}`;
        for (const { item, ref, snap } of lecturas) {
          transaction.set(nuevoMovimientoRef(db), construirMovimiento({
            idRepuesto: ref.id,
            repuesto: snap.data(),
            tipo: TIPO_MOVIMIENTO.COMPRA,
            stockAnterior: Number(snap.data().cantidad || 0),
            stockNuevo: nuevosStocks[item.id],
            referencia: { coleccion: 'gastos', id: egresoRef.id, texto: textoCompra },
            motivo: cambiosCosto[item.id].cambioCosto?.idCompra === egresoRef.id
              ? `Costo C$ ${formatearMonto(cambiosCosto[item.id].cambioCosto.costoAnterior)} → C$ ${formatearMonto(cambiosCosto[item.id].cambioCosto.costoNuevo)}`
              : '',
            usuario: usuarioActual
          }));
        }

        return egresoRef.id;
      });

      try {
        await registrarHistorial(
          esCompraNueva ? 'Compras' : 'Gastos',
          `${etiquetaEgreso(base)} a ${base.proveedor} por C$${total.toLocaleString('en-US')}`
        );
      } catch (errorHistorial) {
        console.error('No se pudo registrar el historial:', errorHistorial);
      }

      setAviso(esCompraNueva
        ? 'Compra registrada. Las existencias ya fueron actualizadas.'
        : 'Gasto registrado.');
      setUltimoRegistroId(idRegistrado);
      limpiarFormulario();
      await cargarDatos();
    } catch (errorRegistro) {
      console.error('Error registrando egreso:', errorRegistro);
      setError(resolverMensajeErrorEgreso(errorRegistro));
    } finally {
      setProcesando(false);
    }
  };

  // ---------- Abonos ----------
  const registrarAbono = async () => {
    const actual = modalAbono.egreso;
    if (!actual?.id) return;

    const valor = Number(montoAbono);
    if (Number.isNaN(valor) || valor <= 0) {
      setErrorAbono('El abono debe ser mayor que C$ 0.00.');
      return;
    }
    const monto = normalizarMoneda(valor);

    setGuardandoAbono(true);
    try {
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, 'gastos', actual.id);
        const snap = await transaction.get(ref);
        if (!snap.exists()) lanzar('El registro ya no existe.', 'not-found');

        const vigente = { id: snap.id, ...snap.data() };
        const saldo = obtenerSaldoEgreso(vigente);
        if (monto > saldo) {
          lanzar(`El abono no puede superar el saldo pendiente (C$ ${formatearMonto(saldo)}).`, 'monto-invalido');
        }

        const total = obtenerTotalEgreso(vigente);
        const nuevoPagado = normalizarMoneda(Math.min(total, obtenerTotalPagadoEgreso(vigente) + monto));
        const nuevoSaldo = normalizarMoneda(Math.max(0, total - nuevoPagado));

        transaction.update(ref, {
          totalPagado: nuevoPagado,
          saldoPendiente: nuevoSaldo,
          estadoPago: nuevoSaldo === 0 ? 'Saldado' : 'Pendiente',
          abonoInicial: normalizarMoneda(vigente.abonoInicial || 0),
          historialAbonos: [
            ...(Array.isArray(vigente.historialAbonos) ? vigente.historialAbonos : []),
            { fecha: new Date().toISOString(), monto, tipo: 'Abono', nota: notaAbono.trim() }
          ]
        });
      });

      // El abono ya quedó guardado. Si falla la bitácora no se revierte ni se
      // muestra como error, solo se deja constancia en consola.
      try {
        await registrarHistorial('Cuentas por pagar', `Abonó C$${monto.toLocaleString('en-US')} a ${etiquetaEgreso(actual)} de ${actual.proveedor}`);
      } catch (errorHistorial) {
        console.error('No se pudo registrar el historial del abono:', errorHistorial);
      }

      setModalAbono({ abierto: false, egreso: null });
      setMontoAbono('');
      setNotaAbono('');
      setErrorAbono('');
      await cargarDatos();
    } catch (errorAbonoRegistro) {
      setErrorAbono(resolverMensajeErrorEgreso(errorAbonoRegistro));
    } finally {
      setGuardandoAbono(false);
    }
  };

  // ---------- Anulación ----------
  // Una sola vía, igual que las facturas. La compra devuelve lo que sumó al inventario; si parte
  // de esa mercadería ya salió de bodega, no se anula hasta ajustar el inventario, para no dejar
  // stock negativo ni un kardex que no cuadre.
  const cerrarAnulacion = () => {
    setModalAnular(null);
    setMotivoAnulacion('');
    setErrorAnulacion('');
  };

  const anularEgreso = async () => {
    const objetivo = modalAnular;
    const motivo = motivoAnulacion.trim();
    if (!objetivo?.id) return;
    if (motivo.length < 5) {
      setErrorAnulacion('Escriba el motivo de la anulación (mínimo 5 caracteres).');
      return;
    }

    setAnulando(true);
    try {
      const resultado = await runTransaction(db, async (transaction) => {
        // ---------- LECTURAS ----------
        const ref = doc(db, 'gastos', objetivo.id);
        const snap = await transaction.get(ref);
        if (!snap.exists()) lanzar('El registro ya no existe.', 'not-found');
        const vigente = snap.data();
        if (esEgresoAnulado(vigente)) lanzar('Este registro ya fue anulado.', 'datos-invalidos');

        const compra = esCompra(vigente);
        const items = compra && Array.isArray(vigente.items) ? vigente.items : [];
        const lecturas = [];
        for (const item of items) {
          if (!item?.idRepuesto) continue;
          const repuestoRef = doc(db, 'repuestos', item.idRepuesto);
          lecturas.push({ item, repuestoRef, repuestoSnap: await transaction.get(repuestoRef) });
        }

        // ---------- VALIDACIÓN ----------
        for (const { item, repuestoSnap } of lecturas) {
          if (!repuestoSnap.exists()) continue;
          const actual = Number(repuestoSnap.data().cantidad || 0);
          if (actual < Number(item.cant || 0)) {
            lanzar(`No se puede anular: esta compra ingresó ${item.cant} und. de ${item.codigo} y hoy solo hay ${actual}. Parte ya salió de bodega; ajuste el inventario antes de anular.`, 'datos-invalidos');
          }
        }

        // ---------- ESCRITURAS ----------
        const texto = `Anulación de compra a ${vigente.proveedor || 'proveedor'}${vigente.numeroDocumento ? ` · Doc ${vigente.numeroDocumento}` : ''}`;
        let revertidos = 0;
        let faltantes = 0;
        for (const { item, repuestoRef, repuestoSnap } of lecturas) {
          if (!repuestoSnap.exists()) { faltantes += 1; continue; }
          const actual = Number(repuestoSnap.data().cantidad || 0);
          const nuevo = normalizarMoneda(actual - Number(item.cant || 0));
          // Si esta compra fue la que cambió el costo y nadie lo tocó después, vuelve al anterior.
          const datosRepuesto = repuestoSnap.data();
          const cambioDeEstaCompra = datosRepuesto.cambioCosto?.idCompra === objetivo.id ? datosRepuesto.cambioCosto : null;
          const revertirCosto = {};
          if (cambioDeEstaCompra) {
            if (normalizarMoneda(datosRepuesto.costo) === normalizarMoneda(cambioDeEstaCompra.costoNuevo)) {
              revertirCosto.costo = normalizarMoneda(cambioDeEstaCompra.costoAnterior);
            }
            revertirCosto.cambioCosto = deleteField();
          }
          transaction.update(repuestoRef, { cantidad: nuevo, ...revertirCosto });
          transaction.set(nuevoMovimientoRef(db), construirMovimiento({
            idRepuesto: repuestoRef.id,
            repuesto: repuestoSnap.data(),
            tipo: TIPO_MOVIMIENTO.ANULACION_COMPRA,
            stockAnterior: actual,
            stockNuevo: nuevo,
            referencia: { coleccion: 'gastos', id: objetivo.id, texto },
            motivo,
            usuario: usuarioActual
          }));
          revertidos += 1;
        }

        transaction.update(ref, {
          estadoDocumento: 'Anulado',
          anulacion: { fecha: new Date().toISOString(), usuario: usuarioActual || '', motivo },
          saldoPendiente: 0,
          estadoPago: 'Anulado'
        });

        return { compra, revertidos, faltantes };
      });

      try {
        await registrarHistorial(
          resultado.compra ? 'Compras' : 'Gastos',
          `Anuló ${etiquetaEgreso(objetivo)} de ${objetivo.proveedor}. Motivo: ${motivo}`
        );
      } catch (errorHistorial) {
        console.error('No se pudo registrar la anulación en el historial:', errorHistorial);
      }

      setError('');
      setUltimoRegistroId('');
      setAviso(resultado.compra
        ? `Compra anulada. Se descontaron del inventario ${resultado.revertidos} repuesto(s)${resultado.faltantes ? ` (${resultado.faltantes} ya no existían)` : ''} y quedó registrado en el kardex.`
        : 'Gasto anulado. Ya no cuenta en reportes ni en cuentas por pagar.');
      cerrarAnulacion();
      await cargarDatos();
    } catch (errorAnular) {
      console.error('Error anulando egreso:', errorAnular);
      setErrorAnulacion(resolverMensajeErrorEgreso(errorAnular));
    } finally {
      setAnulando(false);
    }
  };

  // ---------- Listados ----------
  const listaFiltrada = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const coincide = (e) => !texto || [e.proveedor, e.numeroDocumento, e.descripcion, e.categoria]
      .join(' ').toLowerCase().includes(texto);

    if (pestaña === 'porPagar') {
      return egresos.filter((e) => esCreditoEgreso(e) && obtenerSaldoEgreso(e) > 0 && coincide(e));
    }
    const quiereCompra = pestaña === 'compras';
    return egresos.filter((e) => esCompra(e) === quiereCompra && coincide(e));
  }, [egresos, busqueda, pestaña]);

  const totalPorPagar = useMemo(
    () => egresos.reduce((sum, e) => sum + obtenerSaldoEgreso(e), 0),
    [egresos]
  );

  // El aviso de éxito ofrece el comprobante del registro recién guardado, ya recargado desde Firestore.
  const egresoRegistrado = ultimoRegistroId ? egresos.find((e) => e.id === ultimoRegistroId) : null;

  const esGastoOperativo = pestaña === 'gastos';
  const esFormulario = pestaña !== 'porPagar';

  const Tab = ({ id, etiqueta, icono, contador }) => {
    // Se asigna a una variable en mayúscula para poder usarla como componente.
    const Icono = icono;
    return (
      <button
        onClick={() => { setPestaña(id); setError(''); setAviso(''); }}
        className={`pb-2.5 sm:pb-3 px-2 font-bold text-sm sm:text-base flex items-center justify-center sm:justify-start border-b-2 transition-colors ${pestaña === id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
      >
        <Icono size={18} className="mr-2" /> {etiqueta}
        {contador > 0 && <span className="ml-2 bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 rounded-full">{contador}</span>}
      </button>
    );
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="flex flex-col sm:flex-row border-b bg-slate-50 px-3 sm:px-6 pt-3 sm:pt-4 gap-2 sm:gap-6">
          <Tab id="compras" etiqueta="Compras" icono={ShoppingCart} contador={0} />
          <Tab id="gastos" etiqueta="Gastos" icono={Receipt} contador={0} />
          <Tab id="porPagar" etiqueta="Por pagar" icono={AlertCircle} contador={listaFiltradaPendientes(egresos)} />
        </div>

        <div className="p-3 sm:p-6 space-y-6">
          {error && <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>}
          {aviso && (
            <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>{aviso}</span>
              {egresoRegistrado && (
                <button onClick={() => setComprobante(egresoRegistrado)} className="inline-flex items-center justify-center gap-1.5 bg-white border border-emerald-300 text-emerald-700 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100">
                  <FileText size={14} /> Ver comprobante
                </button>
              )}
            </div>
          )}

          {esFormulario && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
              <h3 className="text-lg font-bold text-slate-800">
                {pestaña === 'compras' ? 'Registrar compra de mercadería' : 'Registrar gasto del negocio'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="egreso-pagado-a" className="block text-xs font-bold text-slate-500 mb-1">
                    {esGastoOperativo ? '¿A quién se le pagó?' : 'Proveedor'} <span className="font-medium text-slate-400">(opcional)</span>
                  </label>
                  <input
                    id="egreso-pagado-a"
                    type="text"
                    list={esGastoOperativo ? undefined : 'prov-list'}
                    value={proveedorStr}
                    onChange={(e) => (esGastoOperativo ? escribirPagadoA(e.target.value) : seleccionarProveedor(e.target.value))}
                    placeholder={esGastoOperativo ? 'Ej: mercado, un cliente, don Julio...' : 'Escribe o elige de la lista...'}
                    className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500"
                  />
                  {esGastoOperativo
                    ? <p className="text-[11px] text-slate-500 mt-1">Escríbalo libremente: no hace falta que esté en la lista de proveedores ni que haya factura.</p>
                    : <datalist id="prov-list">{proveedores.map((p) => <option key={p.id} value={p.nombre} />)}</datalist>}
                </div>
                <div>
                  <label htmlFor="egreso-documento" className="block text-xs font-bold text-slate-500 mb-1">
                    N° de documento <span className="font-medium text-slate-400">(opcional)</span>
                  </label>
                  <input
                    id="egreso-documento"
                    type="text"
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
                    placeholder={esGastoOperativo ? 'Recibo, referencia o nada' : 'Factura del proveedor'}
                    className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Fecha</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500" />
                </div>

                {pestaña === 'gastos' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label>
                      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500">
                        {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Descripción</label>
                      <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: Recibo de energía de agosto" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Monto (C$)</label>
                      <input type="text" inputMode="decimal" value={montoGasto} onChange={(e) => { const v = e.target.value.replace(',', '.'); if (/^\d*(\.\d{0,2})?$/.test(v) || v === '') setMontoGasto(v); }} placeholder="0.00" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500 font-bold" />
                    </div>
                  </>
                )}
              </div>

              {pestaña === 'compras' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Agregar repuesto</label>
                    <div className="flex items-center bg-white border rounded-lg p-2">
                      <Search className="text-slate-400 mr-2" size={18} />
                      <input type="text" value={busquedaRepuesto} onChange={(e) => setBusquedaRepuesto(e.target.value)} placeholder="Buscar por código o descripción..." className="w-full outline-none text-sm" />
                    </div>
                    {repuestosFiltrados.length > 0 && (
                      <div className="mt-2 border border-slate-200 rounded-lg bg-white divide-y">
                        {repuestosFiltrados.map((r) => (
                          <button key={r.id} onClick={() => agregarItem(r)} className="w-full text-left p-2.5 hover:bg-emerald-50 flex justify-between items-center">
                            <span>
                              <span className="font-bold text-sm text-slate-800">{r.codigo}</span>
                              <span className="text-xs text-slate-500 ml-2">{r.descripcion}</span>
                            </span>
                            <span className="text-xs text-slate-400">{r.localidad} · {r.cantidad || 0} und. <Plus size={14} className="inline text-emerald-600" /></span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-slate-500 mt-1">Si el repuesto no aparece, créalo primero en Inventario.</p>
                  </div>

                  {itemsCompra.length > 0 && (
                    <div className="border rounded-lg overflow-x-auto bg-white">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-200">
                          <tr>
                            <th className="p-2.5">Repuesto</th>
                            <th className="p-2.5 w-28">Cantidad</th>
                            <th className="p-2.5 w-36">Costo unitario</th>
                            <th className="p-2.5 text-right">Subtotal</th>
                            <th className="p-2.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemsCompra.map((i) => (
                            <Fragment key={i.id}>
                            <tr className="border-b">
                              <td className="p-2.5">
                                <p className="font-bold">{i.codigo}</p>
                                <p className="text-xs text-slate-500">{i.descripcion}</p>
                                <p className="text-[11px] text-slate-400">{i.localidad} · hoy hay {i.existencia}</p>
                              </td>
                              <td className="p-2.5">
                                <input type="number" min="1" value={i.cantidad} onChange={(e) => actualizarItem(i.id, 'cantidad', Number(e.target.value))} className="w-full border rounded p-1.5 text-center outline-none" />
                              </td>
                              <td className="p-2.5">
                                <input type="number" min="0" step="0.01" value={i.costo} onChange={(e) => actualizarItem(i.id, 'costo', Number(e.target.value))} className="w-full border rounded p-1.5 text-right outline-none" />
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-700">C$ {formatearMonto(i.cantidad * i.costo)}</td>
                              <td className="p-2.5">
                                <button onClick={() => setItemsCompra((a) => a.filter((x) => x.id !== i.id))} className="text-red-400 p-1"><Trash2 size={16} /></button>
                              </td>
                            </tr>
                            {normalizarMoneda(i.costo) > 0 && normalizarMoneda(i.costo) !== normalizarMoneda(i.costoActual) && (
                              <tr className="border-b">
                                <td colSpan="5" className="px-2.5 pb-2.5">
                                  <AvisoCostoCompra item={i} onAlternarActualizar={() => actualizarItem(i.id, 'actualizarCosto', !i.actualizarCosto)} />
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500">
                    La compra suma existencias. Si un repuesto entra a <span className="font-bold">otro costo</span>, debajo aparece el aviso con la opción de actualizarlo; los precios de venta se cambian en Inventario con el botón de etiqueta.
                  </p>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mr-2 uppercase">Forma de pago:</label>
                    <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className="border border-slate-300 p-2 rounded-lg bg-white outline-none font-bold text-slate-700 w-full sm:w-auto">
                      {FORMAS_PAGO_EGRESO.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  {esCredito && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Abono inicial (C$)</label>
                      <input type="text" inputMode="decimal" value={abonoInicial} onChange={(e) => { const v = e.target.value.replace(',', '.'); if (/^\d*(\.\d{0,2})?$/.test(v) || v === '') setAbonoInicial(v); }} className={`border p-2 rounded-lg bg-white outline-none font-bold text-slate-700 w-full sm:w-48 ${errorAbonoInicial ? 'border-red-400' : 'border-slate-300'}`} placeholder="0.00" />
                      {errorAbonoInicial
                        ? <p className="text-[11px] text-red-600 font-semibold mt-1">Debe estar entre C$ 0.00 y C$ {formatearMonto(totalActual)}.</p>
                        : <p className="text-[11px] text-slate-500 font-medium mt-1">Quedará debiendo: C$ {formatearMonto(saldoPreview)}</p>}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Notas</label>
                    <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" className="border border-slate-300 p-2 rounded-lg bg-white outline-none w-full sm:w-72" />
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="block text-sm font-bold text-slate-500 uppercase">Total</span>
                  <span className="text-2xl sm:text-3xl font-black text-slate-800">C$ {formatearMonto(totalActual)}</span>
                </div>
              </div>

              <div className="flex justify-stretch sm:justify-end">
                <button
                  onClick={registrar}
                  disabled={procesando || totalActual <= 0 || errorAbonoInicial || (pestaña === 'compras' && itemsCompra.length === 0)}
                  className="px-8 py-3 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-900 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  {procesando ? 'Guardando...' : (pestaña === 'compras' ? 'Registrar compra e ingresar a bodega' : 'Registrar gasto')}
                </button>
              </div>
            </div>
          )}

          {pestaña === 'porPagar' && (
            <div className="bg-slate-800 text-white rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-300 font-bold">Total que le debe a proveedores</p>
                <p className="text-3xl font-black text-red-300">C$ {formatearMonto(totalPorPagar)}</p>
              </div>
              <button onClick={cargarDatos} disabled={cargando} className="inline-flex items-center justify-center gap-2 text-sm font-bold border border-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-700 disabled:opacity-50">
                <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center bg-white border border-slate-300 rounded-lg p-2 mb-4 md:w-1/2 focus-within:border-emerald-500">
              <Search className="text-slate-400 mr-2" size={20} />
              <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por proveedor, documento o descripción..." className="w-full outline-none text-sm text-slate-700" />
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Detalle</th>
                    <th className="p-3">{esGastoOperativo ? 'Pagado a' : 'Proveedor'}</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Pago</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listaFiltrada.map((e) => (
                    <tr key={e.id} className={`hover:bg-slate-50 ${esEgresoAnulado(e) ? 'bg-slate-50/60 text-slate-400' : ''}`}>
                      <td className="p-3 text-slate-500 whitespace-nowrap">{formatearFecha(e.fecha)}</td>
                      <td className="p-3">
                        <p className="font-medium text-slate-700">{e.descripcion || e.categoria}</p>
                        <p className="text-[11px] text-slate-400">{etiquetaEgreso(e)}{e.items?.length ? ` · ${e.items.length} repuesto(s)` : ''}</p>
                      </td>
                      <td className="p-3 text-slate-600">{e.proveedor}</td>
                      <td className="p-3 text-right font-bold text-slate-700 whitespace-nowrap">C$ {formatearMonto(obtenerTotalEgreso(e))}</td>
                      <td className="p-3 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{e.formaPago}</span></td>
                      <td className="p-3 text-center">
                        {esEgresoAnulado(e) ? (
                          <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-xs font-bold" title={e.anulacion?.motivo ? `Motivo: ${e.anulacion.motivo}` : undefined}>Anulado</span>
                        ) : esCreditoEgreso(e) ? (
                          obtenerEstadoEgreso(e) === 'Pendiente' ? (
                            <>
                              <button onClick={() => { setModalAbono({ abierto: true, egreso: e }); setMontoAbono(''); setNotaAbono(''); setErrorAbono(''); }} className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-red-200">Pendiente (Abonar)</button>
                              <p className="text-[10px] text-slate-500 font-semibold mt-1">Debe: C$ {formatearMonto(obtenerSaldoEgreso(e))}</p>
                            </>
                          ) : <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Saldado</span>
                        ) : <span className="text-slate-400 text-xs font-semibold">Pagado</span>}
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => setComprobante(e)} className="inline-flex items-center gap-1 text-slate-600 border border-slate-200 bg-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-slate-100" title="Ver e imprimir comprobante">
                          <FileText size={14} /> Ver
                        </button>
                        {!esEgresoAnulado(e) && (
                          <button
                            onClick={() => { setModalAnular(e); setMotivoAnulacion(''); setErrorAnulacion(''); }}
                            className="ml-1.5 inline-flex items-center gap-1 text-red-600 border border-red-200 bg-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-red-50"
                            title={esCompra(e) ? 'Anular compra y descontar del inventario' : 'Anular gasto'}
                          >
                            <Ban size={14} /> Anular
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {listaFiltrada.length === 0 && !cargando && (
                    <tr><td colSpan="7" className="p-8 text-center text-slate-400">
                      {pestaña === 'porPagar' ? 'No hay cuentas pendientes con proveedores.' : 'Todavía no hay registros.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Se muestran los últimos {LIMITE} registros por fecha.</p>
          </div>
        </div>
      </div>

      <ModalComprobanteEgreso egreso={comprobante} onCerrar={() => setComprobante(null)} />

      {modalAnular && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 p-2 sm:p-4 flex items-center justify-center print:hidden">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-800 text-white flex justify-between items-center">
              <h4 className="text-lg font-bold">Anular {esCompra(modalAnular) ? 'compra' : 'gasto'}</h4>
              <button onClick={cerrarAnulacion} disabled={anulando} className="text-slate-200 hover:text-white font-bold text-xl leading-none disabled:opacity-50" aria-label="Cerrar">×</button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 border rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">{esCompra(modalAnular) ? 'Proveedor' : 'Pagado a'}</p><p className="font-bold text-slate-700">{modalAnular.proveedor}</p></div>
                <div className="bg-slate-50 border rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Documento</p><p className="font-bold text-slate-700">{etiquetaEgreso(modalAnular)}</p></div>
                <div className="bg-slate-50 border rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Fecha</p><p className="font-bold text-slate-700">{formatearFecha(modalAnular.fecha)}</p></div>
                <div className="bg-slate-50 border rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Total</p><p className="font-bold text-slate-700">C$ {formatearMonto(obtenerTotalEgreso(modalAnular))}</p></div>
              </div>

              <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {esCompra(modalAnular)
                  ? `Se descontarán del inventario los ${modalAnular.items?.length || 0} repuesto(s) que ingresó esta compra, y quedará registrado en el kardex. `
                  : ''}
                La anulación no se puede deshacer. El registro queda visible como anulado, pero deja de contar en reportes y en cuentas por pagar.
              </p>

              <div>
                <label htmlFor="motivo-anulacion-egreso" className="block text-xs font-bold text-slate-500 mb-1 uppercase">Motivo</label>
                <input
                  id="motivo-anulacion-egreso"
                  type="text"
                  value={motivoAnulacion}
                  onChange={(ev) => { setMotivoAnulacion(ev.target.value); setErrorAnulacion(''); }}
                  maxLength={160}
                  className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:border-red-500"
                  placeholder="Ej: el proveedor anuló la factura, se registró dos veces"
                />
              </div>

              {errorAnulacion && <p className="text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg p-2">{errorAnulacion}</p>}
            </div>

            <div className="px-4 sm:px-6 py-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 bg-slate-50">
              <button onClick={cerrarAnulacion} disabled={anulando} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
              <button onClick={anularEgreso} disabled={anulando} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50">{anulando ? 'Anulando...' : 'Anular definitivamente'}</button>
            </div>
          </div>
        </div>
      )}

      {modalAbono.abierto && modalAbono.egreso && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 p-2 sm:p-4 flex items-center justify-center print:hidden">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-800 text-white flex justify-between items-center">
              <h4 className="text-lg font-bold">Abonar a proveedor</h4>
              <button onClick={() => setModalAbono({ abierto: false, egreso: null })} className="text-slate-200 hover:text-white font-bold text-xl leading-none">×</button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 border rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">{esCompra(modalAbono.egreso) ? 'Proveedor' : 'Pagado a'}</p><p className="font-bold text-slate-700">{modalAbono.egreso.proveedor}</p></div>
                <div className="bg-slate-50 border rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Documento</p><p className="font-bold text-slate-700">{etiquetaEgreso(modalAbono.egreso)}</p></div>
                <div className="bg-slate-50 border rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Total</p><p className="font-bold text-slate-700">C$ {formatearMonto(obtenerTotalEgreso(modalAbono.egreso))}</p></div>
                <div className="bg-slate-50 border rounded-lg p-3"><p className="text-xs font-bold text-slate-500 uppercase">Saldo pendiente</p><p className="font-bold text-red-600">C$ {formatearMonto(obtenerSaldoEgreso(modalAbono.egreso))}</p></div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Monto del abono (C$)</label>
                <input type="text" inputMode="decimal" value={montoAbono} onChange={(e) => { const v = e.target.value.replace(',', '.'); if (/^\d*(\.\d{0,2})?$/.test(v) || v === '') { setMontoAbono(v); setErrorAbono(''); } }} className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:border-emerald-500 font-bold text-slate-700" placeholder="0.00" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Nota (opcional)</label>
                <input type="text" value={notaAbono} onChange={(e) => setNotaAbono(e.target.value)} className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:border-emerald-500" placeholder="Ej: pago por transferencia" />
              </div>

              {errorAbono && <p className="text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg p-2">{errorAbono}</p>}
            </div>

            <div className="px-4 sm:px-6 py-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 bg-slate-50">
              <button onClick={() => setModalAbono({ abierto: false, egreso: null })} disabled={guardandoAbono} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
              <button onClick={registrarAbono} disabled={guardandoAbono} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50">{guardandoAbono ? 'Guardando...' : 'Guardar abono'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Cantidad de documentos con saldo pendiente, para el contador de la pestaña.
function listaFiltradaPendientes(egresos) {
  return egresos.filter((e) => esCreditoEgreso(e) && obtenerSaldoEgreso(e) > 0).length;
}
