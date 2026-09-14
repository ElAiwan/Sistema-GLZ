import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { Search, Trash2, Printer, X, AlertTriangle } from 'lucide-react';
import PlantillaDocumentoImpresion from './PlantillaDocumentoImpresion';
import { ESTADO_COTIZACION, obtenerEstadoCotizacion } from '../utils/documentos';

const NOTAS_SUGERIDAS = [
  'Entrega Inmediata',
  'Crédito a 15 días',
  'Crédito a 30 días',
  'Sujeto a disponibilidad',
  'Entrega parcial'
];

const normalizarMoneda = (valor) => {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return NaN;
  return Math.round((numero + Number.EPSILON) * 100) / 100;
};

// Los tres precios de lista de un repuesto. Sirve para detectar si el precio
// cotizado ya no coincide con ninguno de los vigentes.
const preciosEstandar = (item) => [item?.precioVerde, item?.precioAmarillo, item?.precioRojo].map(Number);

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ejecutarTransaccionConReintento = async (operacion, maxReintentos = 2) => {
  let intento = 0;
  while (true) {
    try {
      return await operacion();
    } catch (error) {
      if (error?.code !== 'aborted' || intento >= maxReintentos) throw error;
      intento += 1;
      await esperar(120 * intento);
    }
  }
};

const resolverMensajeErrorFacturacion = (error) => {
  if (error?.code === 'stock-insuficiente') return error.message;
  if (error?.code === 'cotizacion-invalida') return error.message;
  if (error?.code === 'invalid-argument') return 'Firestore rechazó la operación. Recarga la página e intenta de nuevo.';
  if (error?.code === 'permission-denied') return 'No tienes permisos para procesar este documento. Verifica las reglas de Firestore.';
  if (error?.code === 'failed-precondition') return 'La operación no se pudo completar por un conflicto de datos. Intenta nuevamente.';
  if (error?.code === 'aborted') return 'La transacción fue interrumpida por concurrencia. Reintenta en unos segundos.';
  if (error?.code === 'unavailable') return 'Firestore no está disponible en este momento. Revisa tu conexión e intenta de nuevo.';
  return 'No se pudo procesar el documento. Intenta nuevamente.';
};

export default function ModuloFacturacion({
  registrarHistorial,
  usuarioActual = '',
  cotizacionOrigen = null,
  onCotizacionProcesada
}) {
  const [inventario, setInventario] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  
  const [tipoTransaccion, setTipoTransaccion] = useState('Cotización');
  const [clienteId, setClienteId] = useState('');
  const [clienteStr, setClienteStr] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [telefono, setTelefono] = useState('');
  const [ruc, setRuc] = useState('');
  const [notas, setNotas] = useState('Entrega Inmediata');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [abonoInicial, setAbonoInicial] = useState('0');
  const [carrito, setCarrito] = useState([]);
  const [numDoc, setNumDoc] = useState(0);
  const [numDocEnProceso, setNumDocEnProceso] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [numeroFacturaFisica, setNumeroFacturaFisica] = useState('');
  const [cotizacionActiva, setCotizacionActiva] = useState(null);
  const [avisosCotizacion, setAvisosCotizacion] = useState([]);

  useEffect(() => {
    let activo = true;
    const cargarDatos = async () => {
      try {
        const [inv, cli] = await Promise.all([
          getDocs(collection(db, "repuestos")),
          getDocs(collection(db, "clientes"))
        ]);

        if (!activo) return;
        setInventario(inv.docs.map(d => ({ id: d.id, ...d.data() })));
        setClientes(cli.docs.map(d => ({ id: d.id, ...d.data() })));

        const docRef = doc(db, "sistema", "secuencia");
        const docSnap = await getDoc(docRef);
        if (!activo) return;
        if (docSnap.exists()) {
          setNumDoc(docSnap.data().siguiente);
          return;
        }

        await setDoc(docRef, { siguiente: 1 });
        if (activo) setNumDoc(1);
      } catch (error) {
        alert(`⚠️ Error al cargar datos iniciales: ${resolverMensajeErrorFacturacion(error)}`);
      }
    };
    cargarDatos();
    return () => { activo = false; };
  }, []);

  // Convierte una cotización guardada en un documento editable dentro del carrito.
  // Espera a que el inventario esté cargado para poder comparar precios y existencias.
  useEffect(() => {
    if (!cotizacionOrigen?.id) return;
    if (cotizacionActiva?.id === cotizacionOrigen.id) return;
    if (inventario.length === 0) return;

    const avisos = [];
    const itemsCotizados = Array.isArray(cotizacionOrigen.items) ? cotizacionOrigen.items : [];

    const nuevoCarrito = itemsCotizados.map((item, indice) => {
      const codigo = item.codigo || '';
      const descripcion = item.desc || item.descripcion || 'Sin descripción';
      const cantidad = Number(item.cant ?? item.cantVenta ?? 0) || 0;
      const precioCotizado = normalizarMoneda(item.precio ?? item.precioSel ?? 0);
      const repuesto = inventario.find((r) => r.id === item.idRepuesto)
        || (codigo ? inventario.find((r) => r.codigo === codigo) : null);

      if (!repuesto) {
        avisos.push(`${codigo || descripcion}: ya no existe en inventario. Quítalo del documento o créalo de nuevo antes de facturar.`);
        return {
          id: item.idRepuesto || `no-disponible-${indice}`,
          codigo,
          descripcion,
          alternateCode: (item.alternateCode || '').trim(),
          usarCodigoAlterno: Boolean(item.usarCodigoAlterno),
          cantidad: 0,
          precioVerde: precioCotizado,
          precioAmarillo: precioCotizado,
          precioRojo: precioCotizado,
          cantVenta: cantidad,
          precioSel: precioCotizado,
          noDisponible: true
        };
      }

      const precios = preciosEstandar(repuesto).map(normalizarMoneda);
      if (!precios.includes(precioCotizado)) {
        avisos.push(`${repuesto.codigo}: se cotizó a C$ ${precioCotizado.toLocaleString('en-US', { minimumFractionDigits: 2 })} y hoy los precios de lista son V/A/R C$ ${precios.map((p) => p.toLocaleString('en-US', { minimumFractionDigits: 2 })).join(' / ')}. Se respeta el precio cotizado.`);
      }

      const stockActual = Number(repuesto.cantidad || 0);
      if (stockActual <= 0) {
        avisos.push(`${repuesto.codigo}: AGOTADO. Se cotizaron ${cantidad} und. y no queda ninguna en existencia. Quita el renglón o ingresa stock antes de facturar.`);
      } else if (cantidad > stockActual) {
        avisos.push(`${repuesto.codigo}: solo quedan ${stockActual} und. de las ${cantidad} cotizadas. Baja la cantidad o ingresa stock antes de facturar.`);
      }

      return {
        ...repuesto,
        alternateCode: (item.alternateCode || repuesto.alternateCode || '').trim(),
        usarCodigoAlterno: Boolean(item.usarCodigoAlterno),
        cantVenta: cantidad,
        precioSel: precioCotizado
      };
    });

    setTipoTransaccion('Factura');
    setCarrito(nuevoCarrito);
    setAvisosCotizacion(avisos);
    setCotizacionActiva({ id: cotizacionOrigen.id, numeroDocumento: cotizacionOrigen.numeroDocumento || '' });
    setClienteId(cotizacionOrigen.idCliente || '');
    setClienteStr(cotizacionOrigen.cliente === 'Cliente Mostrador' ? '' : (cotizacionOrigen.cliente || ''));
    setEmpresa(cotizacionOrigen.empresa || '');
    setTelefono(cotizacionOrigen.telefono || '');
    setRuc(cotizacionOrigen.ruc || '');
    setNotas(cotizacionOrigen.notas || 'Entrega Inmediata');
    setFormaPago(cotizacionOrigen.formaPago || 'Efectivo');
    setAbonoInicial('0');
    setNumeroFacturaFisica('');
  }, [cotizacionOrigen, inventario, cotizacionActiva]);

  const formatoTelefono = (valor) => {
    let num = valor.replace(/\D/g, '');
    if (num.startsWith('505')) num = num.substring(3);
    num = num.substring(0, 8);
    if (num.length > 4) num = num.substring(0, 4) + '-' + num.substring(4);
    return num.length > 0 ? `+505 ${num}` : '';
  };

  const seleccionarCliente = (nombre) => {
    setClienteStr(nombre);
    const c = clientes.find(c => `${c.nombres} ${c.apellidos}` === nombre);
    if (c) {
      setClienteId(c.id || '');
      setEmpresa(c.empresa||'');
      setTelefono(c.telefono||'');
      setRuc(c.ruc||'');
      return;
    }

    setClienteId('');
  };

  const agregar = (prod) => {
    setCarrito((actual) => {
      if (actual.find(i => i.id === prod.id)) return actual;
      return [...actual, {
        ...prod,
        alternateCode: (prod.alternateCode || '').trim(),
        usarCodigoAlterno: false,
        cantVenta: 1,
        precioSel: prod.precioVerde
      }];
    });
  };

  const resolverCodigoImpresion = (item) => {
    const codigoAlterno = (item.alternateCode || '').trim();
    if (item.usarCodigoAlterno && codigoAlterno) return codigoAlterno;
    return item.codigo || '';
  };

  const actualizarInventarioLocal = (stockActualizado) => {
    setInventario((actual) => actual.map((item) => (
      Object.prototype.hasOwnProperty.call(stockActualizado, item.id)
        ? { ...item, cantidad: stockActualizado[item.id] }
        : item
    )));
  };

  const cancelarConversion = () => {
    setCotizacionActiva(null);
    setAvisosCotizacion([]);
    setCarrito([]);
    setClienteId('');
    setClienteStr('');
    setEmpresa('');
    setTelefono('');
    setRuc('');
    setNumeroFacturaFisica('');
    onCotizacionProcesada?.();
  };

  const total = normalizarMoneda(carrito.reduce((sum, i) => sum + (i.cantVenta * i.precioSel), 0));
  const numFormateadoVista = numDocEnProceso || String(numDoc).padStart(5, '0');
  const aplicaCredito = formaPago === 'Credito' && tipoTransaccion === 'Factura';
  const abonoInicialNum = aplicaCredito ? normalizarMoneda(abonoInicial === '' ? 0 : abonoInicial) : 0;
  const hayErrorAbono = aplicaCredito && (
    Number.isNaN(abonoInicialNum) || abonoInicialNum < 0 || abonoInicialNum > total
  );
  const saldoPendientePreview = aplicaCredito && !Number.isNaN(abonoInicialNum)
    ? normalizarMoneda(Math.max(0, total - abonoInicialNum))
    : 0;
  const hayItemsNoDisponibles = carrito.some((item) => item.noDisponible);

  const procesar = async () => {
    if (procesando) return;
    if (carrito.length === 0) return;

    const nombreFinal = clienteStr || 'Cliente Mostrador';
    const fechaDocumento = new Date().toISOString();
    const totalDocumento = normalizarMoneda(total);
    const esFactura = tipoTransaccion === 'Factura';
    // Una cotización no genera cuenta por cobrar aunque la forma de pago sea crédito.
    const esCredito = formaPago === 'Credito' && esFactura;
    let abonoInicialCalculado = 0;
    const cantidadesInvalidas = carrito.some((item) => !Number.isFinite(item.cantVenta) || item.cantVenta <= 0);

    if (cantidadesInvalidas) {
      alert('⚠️ Todas las cantidades deben ser mayores a 0.');
      return;
    }

    if (Number.isNaN(totalDocumento) || totalDocumento <= 0) {
      alert('⚠️ El total del documento no es válido.');
      return;
    }

    if (esCredito) {
      const valorAbono = abonoInicial === '' ? 0 : Number(abonoInicial);
      if (Number.isNaN(valorAbono) || valorAbono < 0) {
        alert('⚠️ El abono inicial debe ser un número válido mayor o igual a 0.');
        return;
      }

      abonoInicialCalculado = normalizarMoneda(valorAbono);
      if (abonoInicialCalculado > totalDocumento) {
        alert('⚠️ El abono inicial no puede ser mayor al total del documento.');
        return;
      }
    }

    const totalPagado = esFactura ? (esCredito ? abonoInicialCalculado : totalDocumento) : 0;
    const saldoPendiente = esCredito ? normalizarMoneda(totalDocumento - abonoInicialCalculado) : 0;
    const estadoPago = !esFactura
      ? 'N/A'
      : (esCredito ? (saldoPendiente === 0 ? 'Saldado' : 'Pendiente') : 'Pagado');
    const historialAbonos = esCredito && abonoInicialCalculado > 0
      ? [{ fecha: fechaDocumento, monto: abonoInicialCalculado, tipo: 'Abono Inicial', nota: 'Registrado al emitir el documento' }]
      : [];
    const itemsFactura = carrito.map(i => ({
      idRepuesto: i.id,
      codigo: i.codigo || '',
      alternateCode: (i.alternateCode || '').trim(),
      usarCodigoAlterno: Boolean(i.usarCodigoAlterno && (i.alternateCode || '').trim()),
      codigoImpresion: resolverCodigoImpresion(i),
      desc: i.descripcion,
      cant: i.cantVenta,
      precio: normalizarMoneda(i.precioSel),
      // Se guarda el costo del momento para poder calcular el margen real
      // después, aunque el costo del repuesto cambie más adelante.
      costo: normalizarMoneda(i.costo || 0),
      subtotal: normalizarMoneda(i.cantVenta * i.precioSel)
    }));

    setProcesando(true);

    try {
      const resultado = await ejecutarTransaccionConReintento(() =>
        runTransaction(db, async (transaction) => {
          // ---------- LECTURAS ----------
          // Firestore exige que TODAS las lecturas de una transacción ocurran antes
          // de cualquier escritura, por eso se resuelven primero y en bloque.
          const esDocumentoCotizacion = tipoTransaccion === 'Cotización';
          const secuenciaRef = doc(db, "sistema", "secuencia");

          let secuenciaActual = 0;
          if (esDocumentoCotizacion) {
            const secuenciaSnap = await transaction.get(secuenciaRef);
            secuenciaActual = secuenciaSnap.exists() ? Number(secuenciaSnap.data().siguiente) || 1 : 1;
          }

          let cotizacionRef = null;
          if (cotizacionActiva?.id) {
            cotizacionRef = doc(db, "facturas", cotizacionActiva.id);
            const cotizacionSnap = await transaction.get(cotizacionRef);

            if (!cotizacionSnap.exists()) {
              const error = new Error('La cotización de origen ya no existe.');
              error.code = 'cotizacion-invalida';
              throw error;
            }

            if (obtenerEstadoCotizacion(cotizacionSnap.data()) === ESTADO_COTIZACION.FACTURADA) {
              const error = new Error('Esta cotización ya fue facturada. Actualiza el listado de cotizaciones.');
              error.code = 'cotizacion-invalida';
              throw error;
            }
          }

          const lecturasStock = [];
          if (!esDocumentoCotizacion) {
            for (const item of carrito) {
              const repuestoRef = doc(db, "repuestos", item.id);
              lecturasStock.push({ item, repuestoRef, repuestoSnap: await transaction.get(repuestoRef) });
            }
          }

          // ---------- VALIDACIÓN ----------
          const stockActualizado = {};
          for (const { item, repuestoSnap } of lecturasStock) {
            if (!repuestoSnap.exists()) {
              const error = new Error(`El repuesto "${item.descripcion}" ya no existe en inventario.`);
              error.code = 'stock-insuficiente';
              throw error;
            }

            const cantidadDisponible = Number(repuestoSnap.data().cantidad || 0);
            if (item.cantVenta > cantidadDisponible) {
              const error = new Error(`Stock insuficiente para "${item.descripcion}". Disponible: ${cantidadDisponible}.`);
              error.code = 'stock-insuficiente';
              throw error;
            }

            stockActualizado[item.id] = Math.max(0, normalizarMoneda(cantidadDisponible - item.cantVenta));
          }

          // ---------- ESCRITURAS ----------
          for (const { item, repuestoRef } of lecturasStock) {
            transaction.update(repuestoRef, { cantidad: stockActualizado[item.id] });
          }

          const numeroDocumento = esDocumentoCotizacion ? String(secuenciaActual).padStart(5, '0') : '';
          const siguienteSecuencia = esDocumentoCotizacion ? secuenciaActual + 1 : 0;
          const facturaRef = doc(collection(db, "facturas"));

          const documento = {
            idCliente: clienteId || '',
            cliente: nombreFinal,
            empresa: empresa || '',
            telefono: telefono,
            ruc: ruc || '',
            notas: notas || '',
            usuarioCreador: usuarioActual || '',
            numeroDocumento,
            secuenciaDocumento: esDocumentoCotizacion ? secuenciaActual : 0,
            tipo: tipoTransaccion,
            total: totalDocumento,
            formaPago: formaPago,
            estadoPago: estadoPago,
            abonoInicial: esCredito ? abonoInicialCalculado : 0,
            totalPagado: totalPagado,
            saldoPendiente: saldoPendiente,
            historialAbonos: historialAbonos,
            fecha: fechaDocumento,
            items: itemsFactura
          };

          if (esDocumentoCotizacion) {
            documento.estadoCotizacion = ESTADO_COTIZACION.ABIERTA;
          } else {
            // Número del talonario preimpreso. Es opcional y no se imprime:
            // el papel ya trae su propia numeración registrada.
            documento.numeroFactura = numeroFacturaFisica.trim();
            documento.cotizacionId = cotizacionActiva?.id || '';
            documento.numeroCotizacion = cotizacionActiva?.numeroDocumento || '';
          }

          transaction.set(facturaRef, documento);

          if (esDocumentoCotizacion) {
            transaction.set(secuenciaRef, { siguiente: siguienteSecuencia }, { merge: true });
          }

          if (cotizacionRef) {
            transaction.update(cotizacionRef, {
              estadoCotizacion: ESTADO_COTIZACION.FACTURADA,
              facturaId: facturaRef.id,
              fechaFacturacion: fechaDocumento
            });
          }

          return {
            numeroDocumento,
            siguienteSecuencia,
            stockActualizado
          };
        })
      );

      setNumDocEnProceso(resultado.numeroDocumento);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const referenciaDocumento = tipoTransaccion === 'Cotización'
        ? `Cotización #${resultado.numeroDocumento}`
        : `Factura${numeroFacturaFisica.trim() ? ` N° ${numeroFacturaFisica.trim()}` : ''}`;
      const origenTexto = cotizacionActiva?.id
        ? ` (desde cotización #${cotizacionActiva.numeroDocumento || 's/n'})`
        : '';

      try {
        await registrarHistorial(tipoTransaccion, `${referenciaDocumento} a ${nombreFinal} por C$${totalDocumento.toLocaleString('en-US')}${origenTexto}`);
      } catch (errorHistorial) {
        console.error('No se pudo registrar el historial del documento:', errorHistorial);
      }

      if (tipoTransaccion === 'Factura') actualizarInventarioLocal(resultado.stockActualizado);
      window.print();
      if (resultado.siguienteSecuencia) setNumDoc(resultado.siguienteSecuencia);
      setCarrito([]);
      setClienteId('');
      setClienteStr('');
      setEmpresa('');
      setTelefono('');
      setRuc('');
      setAbonoInicial('0');
      setNumDocEnProceso('');
      setNumeroFacturaFisica('');
      setCotizacionActiva(null);
      setAvisosCotizacion([]);
      onCotizacionProcesada?.();
    } catch (error) {
      setNumDocEnProceso('');
      alert(`❌ ${resolverMensajeErrorFacturacion(error)}`);
    } finally {
      setProcesando(false);
    }
  };

  // En Factura solo se ofrece lo que tiene existencias. En Cotización se puede
  // cotizar cualquier repuesto del catálogo, aunque esté en cero.
  const textoBusqueda = busqueda.toLowerCase();
  const disponibles = inventario.filter(i =>
    (tipoTransaccion !== 'Factura' || Number(i.cantidad) > 0) &&
    (
      (i.codigo || '').toLowerCase().includes(textoBusqueda) ||
      (i.descripcion || '').toLowerCase().includes(textoBusqueda) ||
      (i.alternateCode || '').toLowerCase().includes(textoBusqueda)
    )
  );

  const hayErrorDeStock = tipoTransaccion === 'Factura' && carrito.some(item => item.cantVenta > item.cantidad);
  const documentoParaImpresion = {
    tipo: tipoTransaccion,
    numeroDocumento: tipoTransaccion === 'Cotización' ? numFormateadoVista : '',
    numeroFactura: numeroFacturaFisica.trim(),
    fecha: new Date().toISOString(),
    idCliente: clienteId || '',
    formaPago,
    cliente: clienteStr || 'Cliente Mostrador',
    empresa: empresa || '',
    telefono,
    ruc,
    notas,
    usuarioCreador: usuarioActual || '',
    total,
    items: carrito.map((item) => ({
      id: item.id,
      codigo: item.codigo,
      alternateCode: item.alternateCode || '',
      usarCodigoAlterno: Boolean(item.usarCodigoAlterno && (item.alternateCode || '').trim()),
      codigoImpresion: resolverCodigoImpresion(item),
      descripcion: item.descripcion,
      cantVenta: item.cantVenta,
      precioSel: item.precioSel,
      subtotal: normalizarMoneda(item.cantVenta * item.precioSel)
    }))
  };

  return (
    <>
      {/* VISTA DE PANTALLA: Se oculta al imprimir (print:hidden) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 print:hidden">
        <div className="lg:col-span-1 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold mb-4 border-b pb-2 text-slate-800">Catálogo Disponible</h2>
          <div className="mb-4 flex items-center bg-slate-50 border rounded-lg p-2"><Search className="text-slate-400 mr-2" size={18} /><input type="text" placeholder="Buscar repuesto..." className="w-full outline-none bg-transparent text-sm" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></div>
          <div className="overflow-y-auto pr-1 space-y-2 max-h-[320px] lg:max-h-[420px] xl:max-h-[560px]">
            {disponibles.map(item => (
              <div key={item.id} className="p-3 border rounded-lg bg-slate-50 flex justify-between items-center hover:border-emerald-300 transition-colors">
                <div><p className="font-bold text-sm text-slate-800">{item.codigo}</p><p className="text-xs text-slate-500 truncate max-w-[11rem] sm:max-w-none" title={item.descripcion}>{item.descripcion}</p><p className={`text-xs font-bold ${Number(item.cantidad) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>Stock: {item.cantidad || 0} <span className="text-[10px] text-slate-400 ml-1">({item.localidad})</span></p></div>
                <button
                  onClick={() => agregar(item)}
                  disabled={procesando}
                  className="bg-emerald-100 text-emerald-700 w-8 h-8 rounded-full font-bold hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            ))}
            {disponibles.length === 0 && <p className="text-xs text-center text-slate-400 mt-10">No hay coincidencias en stock.</p>}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-sm border-t-4 border-slate-800">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 border-b pb-4 shrink-0">
            <h2 className="text-2xl font-bold flex items-center flex-wrap gap-x-3 gap-y-1">
              Documento Comercial
              {tipoTransaccion === 'Cotización' && (
                <span className="text-lg font-medium bg-slate-100 px-3 py-1 rounded-md border text-slate-600">#{numFormateadoVista}</span>
              )}
            </h2>
            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button onClick={() => setTipoTransaccion('Cotización')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tipoTransaccion === 'Cotización' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>Cotización</button>
              <button onClick={() => setTipoTransaccion('Factura')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tipoTransaccion === 'Factura' ? 'bg-slate-800 shadow text-white' : 'text-slate-500'}`}>Factura (Venta Real)</button>
            </div>
          </div>
          
          {cotizacionActiva && (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-emerald-800 uppercase tracking-wide">
                    Facturando cotización #{cotizacionActiva.numeroDocumento || 's/n'}
                  </p>
                  <p className="text-xs text-emerald-700">
                    Se cargaron los productos y precios cotizados. Al procesar, la cotización queda marcada como facturada.
                  </p>
                </div>
                <button
                  onClick={cancelarConversion}
                  disabled={procesando}
                  className="inline-flex items-center justify-center gap-1 text-xs font-bold border border-emerald-300 bg-white text-emerald-700 px-3 py-2 rounded-lg hover:bg-emerald-100 disabled:opacity-50 shrink-0"
                >
                  <X size={14} /> Cancelar conversión
                </button>
              </div>

              {avisosCotizacion.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-emerald-200 pt-3">
                  {avisosCotizacion.map((aviso, indice) => (
                    <li key={indice} className="flex items-start gap-2 text-[11px] font-semibold text-amber-800">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span>{aviso}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 shrink-0">
            <div className="sm:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Cliente</label><input type="text" list="cli-list" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500" value={clienteStr} onChange={e => seleccionarCliente(e.target.value)} placeholder="Escribe o elige de la lista..." /><datalist id="cli-list">{clientes.map(c => <option key={c.id} value={`${c.nombres} ${c.apellidos}`} />)}</datalist></div>
            <div className="sm:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Empresa</label><input type="text" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500" value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Ej: Transportes S.A." /></div>
            <div className="sm:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Teléfono</label><input type="text" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500 font-medium" value={telefono} onChange={e => setTelefono(formatoTelefono(e.target.value))} placeholder="+505 XXXX-XXXX" /></div>
            <div className="sm:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">RUC</label><input type="text" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500 uppercase" value={ruc} onChange={e => setRuc(e.target.value)} placeholder="Ej: 0011402031003K" /></div>
            {tipoTransaccion === 'Factura' && (
              <div className="sm:col-span-2 xl:col-span-4">
                <label className="block text-xs font-bold text-slate-500 mb-1">N° de Factura preimpresa (opcional)</label>
                <input
                  type="text"
                  className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500 font-bold tracking-wide"
                  value={numeroFacturaFisica}
                  onChange={(e) => setNumeroFacturaFisica(e.target.value)}
                  placeholder="Ej: 004512"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Solo para cruzar el registro con el talonario físico. No se imprime: el papel ya trae su numeración.
                </p>
              </div>
            )}
            <div className="sm:col-span-2 xl:col-span-4">
              <label className="block text-xs font-bold text-slate-500 mb-1">Notas del Documento</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={NOTAS_SUGERIDAS.includes(notas) ? notas : ''}
                  onChange={(e) => e.target.value && setNotas(e.target.value)}
                  className="border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500 text-sm font-medium text-slate-700"
                >
                  <option value="">Sugerencias rápidas...</option>
                  {NOTAS_SUGERIDAS.map((nota) => <option key={nota} value={nota}>{nota}</option>)}
                </select>
                <input
                  type="text"
                  className="md:col-span-2 border p-2.5 rounded-lg bg-green-50 text-green-800 outline-none focus:border-emerald-500"
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Escribe una nota personalizada..."
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Selecciona una sugerencia o escribe texto libre.</p>
            </div>
          </div>

          <div className="overflow-y-auto border rounded-lg bg-slate-50 max-h-[320px] lg:max-h-[400px] xl:max-h-[500px]">
            <div className="md:hidden p-2 space-y-2">
              {carrito.map((item) => (
                <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-slate-800">{resolverCodigoImpresion(item)}</p>
                      <p className="text-xs text-slate-500">{item.descripcion}</p>
                    </div>
                    <button
                      onClick={() => setCarrito(carrito.filter(i => i.id !== item.id))}
                      disabled={procesando}
                      className="text-red-400 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={18}/>
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Cantidad</label>
                      <input
                        type="number"
                        min="1"
                        value={item.cantVenta}
                        disabled={procesando}
                        onChange={(e) => {
                          const nuevaCant = Number(e.target.value);
                          if (tipoTransaccion === 'Factura' && nuevaCant > item.cantidad) {
                            alert(`❌ Acción denegada: Stock insuficiente.\nSolo hay ${item.cantidad} unidades disponibles de este repuesto.`);
                            return;
                          }
                          setCarrito(carrito.map(i => i.id === item.id ? {...i, cantVenta: nuevaCant} : i));
                        }}
                        className="w-full border rounded p-2 text-center outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      {tipoTransaccion === 'Factura' && item.cantVenta > item.cantidad && (
                        <div className="text-red-500 text-[10px] font-bold mt-1 bg-red-50 p-1 rounded border border-red-100 text-center">
                          ⚠️ Stock: {item.cantidad || 0}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Precio</label>
                      <select
                        value={item.precioSel}
                        disabled={procesando}
                        onChange={(e) => setCarrito(carrito.map(i => i.id === item.id ? {...i, precioSel: Number(e.target.value)} : i))}
                        className="w-full border rounded p-2 outline-none bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {!preciosEstandar(item).includes(Number(item.precioSel)) && <option value={item.precioSel}>Cotizado: C${Number(item.precioSel).toLocaleString('en-US')}</option>}<option value={item.precioVerde}>V: C${item.precioVerde.toLocaleString('en-US')}</option>
                        <option value={item.precioAmarillo}>A: C${item.precioAmarillo.toLocaleString('en-US')}</option>
                        <option value={item.precioRojo}>R: C${item.precioRojo.toLocaleString('en-US')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-2">
                    <label className="text-[10px] font-bold text-slate-500 mr-1 uppercase">Imprimir:</label>
                    <select
                      value={item.usarCodigoAlterno ? 'alterno' : 'principal'}
                      onChange={(e) => setCarrito(carrito.map(i => i.id === item.id ? { ...i, usarCodigoAlterno: e.target.value === 'alterno' } : i))}
                      disabled={!item.alternateCode || procesando}
                      className="border border-slate-300 rounded p-1.5 text-[11px] font-bold bg-white outline-none disabled:bg-slate-100 disabled:text-slate-400 w-full"
                    >
                      <option value="principal">Código</option>
                      {item.alternateCode && <option value="alterno">Código Alterno</option>}
                    </select>
                  </div>

                  <div className="mt-2 text-right text-sm font-bold text-slate-700">
                    Subtotal: C$ {(item.cantVenta * item.precioSel).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}

              {carrito.length === 0 && (
                <p className="p-6 text-center text-slate-400 text-sm">
                  El documento está vacío. Selecciona repuestos del catálogo izquierdo.
                </p>
              )}
            </div>

            <table className="hidden md:table w-full text-left border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-200"><tr className="border-b border-slate-300"><th className="p-3">Producto</th><th className="p-3 w-24">Cant.</th><th className="p-3 w-40">Precio Aplicado</th><th className="p-3 text-right">Subtotal</th><th className="p-3"></th></tr></thead>
              <tbody>
                {carrito.map(item => (
                  <tr key={item.id} className="border-b bg-white">
                    <td className="p-3">
                      <p className="font-bold">{resolverCodigoImpresion(item)}</p>
                      <p className="text-xs text-slate-500">{item.descripcion}</p>
                      <div className="mt-1">
                        <label className="text-[10px] font-bold text-slate-500 mr-1 uppercase">Imprimir:</label>
                        <select
                          value={item.usarCodigoAlterno ? 'alterno' : 'principal'}
                          onChange={(e) => setCarrito(carrito.map(i => i.id === item.id ? { ...i, usarCodigoAlterno: e.target.value === 'alterno' } : i))}
                          disabled={!item.alternateCode || procesando}
                          className="border border-slate-300 rounded p-1 text-[10px] font-bold bg-white outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="principal">Código</option>
                          {item.alternateCode && <option value="alterno">Código Alterno</option>}
                        </select>
                      </div>
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        min="1"
                        value={item.cantVenta}
                        disabled={procesando}
                        onChange={(e) => {
                          const nuevaCant = Number(e.target.value);
                          if (tipoTransaccion === 'Factura' && nuevaCant > item.cantidad) {
                            alert(`❌ Acción denegada: Stock insuficiente.\nSolo hay ${item.cantidad} unidades disponibles de este repuesto.`);
                            return;
                          }
                          setCarrito(carrito.map(i => i.id === item.id ? {...i, cantVenta: nuevaCant} : i));
                        }}
                        className="w-full border rounded p-1.5 text-center outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      {tipoTransaccion === 'Factura' && item.cantVenta > item.cantidad && (
                        <div className="text-red-500 text-[10px] font-bold leading-tight mt-1 bg-red-50 p-1 rounded border border-red-100 text-center">
                          ⚠️ Stock: {item.cantidad || 0}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <select
                        value={item.precioSel}
                        disabled={procesando}
                        onChange={(e) => setCarrito(carrito.map(i => i.id === item.id ? {...i, precioSel: Number(e.target.value)} : i))}
                        className="w-full border rounded p-1.5 outline-none bg-slate-50 cursor-pointer font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {!preciosEstandar(item).includes(Number(item.precioSel)) && <option value={item.precioSel}>Cotizado: C${Number(item.precioSel).toLocaleString('en-US')}</option>}<option value={item.precioVerde}>V: C${item.precioVerde.toLocaleString('en-US')}</option>
                        <option value={item.precioAmarillo}>A: C${item.precioAmarillo.toLocaleString('en-US')}</option>
                        <option value={item.precioRojo}>R: C${item.precioRojo.toLocaleString('en-US')}</option>
                      </select>
                    </td>
                    <td className="p-3 text-right font-bold text-slate-700">C$ {(item.cantVenta * item.precioSel).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                    <td className="p-3">
                      <button
                        onClick={() => setCarrito(carrito.filter(i => i.id !== item.id))}
                        disabled={procesando}
                        className="text-red-400 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={18}/>
                      </button>
                    </td>
                  </tr>
                ))}
                {carrito.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400">El documento está vacío. Selecciona repuestos del catálogo izquierdo.</td></tr>}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 shrink-0 bg-slate-100 p-4 rounded-xl border border-slate-200">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mr-2 uppercase">Pago:</label>
                  <select className="border border-slate-300 p-2 rounded-lg bg-white outline-none font-bold text-slate-700 w-full sm:w-auto" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
                    <option>Efectivo</option><option>Contado</option><option>Credito</option><option>Transferencia</option>
                  </select>
                </div>

                {aplicaCredito && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Abono Inicial (C$)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={abonoInicial}
                      onChange={(e) => {
                        const valor = e.target.value.replace(',', '.');
                        if (/^\d*(\.\d{0,2})?$/.test(valor) || valor === '') setAbonoInicial(valor);
                      }}
                      className={`border p-2 rounded-lg bg-white outline-none font-bold text-slate-700 w-full sm:w-48 ${hayErrorAbono ? 'border-red-400' : 'border-slate-300 focus:border-emerald-500'}`}
                      placeholder="0.00"
                    />
                    {hayErrorAbono ? (
                      <p className="text-[11px] text-red-600 font-semibold mt-1">El abono inicial debe estar entre C$ 0.00 y C$ {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}.</p>
                    ) : (
                      <p className="text-[11px] text-slate-500 font-medium mt-1">Saldo pendiente estimado: C$ {saldoPendientePreview.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="text-left sm:text-right flex items-start sm:items-center">
                <span className="text-sm font-bold text-slate-500 mr-4 uppercase">Total Documento:</span>
                <span className="text-2xl sm:text-3xl font-black text-emerald-600">C$ {total.toLocaleString('en-US', {minimumFractionDigits:2})}</span>
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex justify-stretch sm:justify-end shrink-0">
            <button 
              onClick={procesar} 
              disabled={carrito.length === 0 || hayErrorDeStock || hayErrorAbono || hayItemsNoDisponibles || procesando} 
              className={`px-8 py-3.5 rounded-xl font-bold flex items-center justify-center shadow-lg transition-colors disabled:opacity-50 w-full sm:w-auto
                ${(hayErrorDeStock || hayErrorAbono || hayItemsNoDisponibles || procesando)
                  ? 'bg-slate-400 text-white cursor-not-allowed' 
                  : 'bg-slate-800 text-white hover:bg-slate-900'
                }`}
            >
              <Printer className="mr-2" size={20} /> 
              {procesando
                ? 'Procesando...'
                : (hayItemsNoDisponibles
                  ? '⚠️ Quita los productos que ya no existen'
                  : (hayErrorDeStock
                    ? '⚠️ Corrige el stock para facturar'
                    : (hayErrorAbono
                      ? '⚠️ Corrige el abono inicial'
                      : (tipoTransaccion === 'Factura' ? 'Procesar Venta e Imprimir' : 'Generar Cotización')
                    )
                  )
                )}
            </button>
          </div>
        </div>
      </div>

      <PlantillaDocumentoImpresion documento={documentoParaImpresion} soloImpresion />
    </>
  );
}
