// Utilidades de egresos: compras de mercadería y gastos operativos.
// La lógica de crédito es espejo de la que ya usan las facturas de venta.

import { limpiarParaArchivo, normalizarMoneda } from './documentos';

export const TIPO_EGRESO = {
  COMPRA: 'Compra',
  GASTO: 'Gasto'
};

// Las compras siempre entran a bodega; los gastos operativos no tocan inventario.
export const CATEGORIAS_GASTO = [
  'Alquiler',
  'Servicios básicos',
  'Combustible',
  'Planilla',
  'Transporte',
  'Mantenimiento',
  'Impuestos y trámites',
  'Papelería',
  'Otros'
];

export const FORMAS_PAGO_EGRESO = ['Efectivo', 'Transferencia', 'Cheque', 'Credito'];

export const esCompra = (egreso) => `${egreso?.tipo || ''}`.toLowerCase() === 'compra';

export const esCreditoEgreso = (egreso) => egreso?.formaPago === 'Credito';

export const obtenerTotalEgreso = (egreso) => normalizarMoneda(egreso?.total || 0);

export const obtenerTotalPagadoEgreso = (egreso) => {
  if (typeof egreso?.totalPagado === 'number') return normalizarMoneda(egreso.totalPagado);
  if (esCreditoEgreso(egreso)) return normalizarMoneda(egreso?.abonoInicial || 0);
  return obtenerTotalEgreso(egreso);
};

export const obtenerSaldoEgreso = (egreso) => {
  if (!esCreditoEgreso(egreso)) return 0;
  if (typeof egreso?.saldoPendiente === 'number') return Math.max(0, normalizarMoneda(egreso.saldoPendiente));
  return Math.max(0, normalizarMoneda(obtenerTotalEgreso(egreso) - obtenerTotalPagadoEgreso(egreso)));
};

export const obtenerEstadoEgreso = (egreso) => {
  if (!esCreditoEgreso(egreso)) return 'Pagado';
  return obtenerSaldoEgreso(egreso) === 0 ? 'Saldado' : 'Pendiente';
};

// Etiqueta corta para listados y bitácora.
export const etiquetaEgreso = (egreso) => {
  const referencia = (egreso?.numeroDocumento || '').trim();
  const base = esCompra(egreso) ? 'Compra' : (egreso?.categoria || 'Gasto');
  return referencia ? `${base} N° ${referencia}` : base;
};

export const resolverMensajeErrorEgreso = (error) => {
  if (error?.code === 'datos-invalidos') return error.message;
  if (error?.code === 'monto-invalido') return error.message;
  if (error?.code === 'not-found') return 'El registro ya no existe o fue eliminado.';
  if (error?.code === 'permission-denied') return 'No tienes permisos para esta operación. Solo un administrador puede registrar compras y gastos.';
  if (error?.code === 'failed-precondition') return 'La operación no se pudo completar por un conflicto de datos. Intenta nuevamente.';
  if (error?.code === 'aborted') return 'La operación fue interrumpida por concurrencia. Reintenta en unos segundos.';
  if (error?.code === 'unavailable') return 'Firestore no está disponible. Revisa tu conexión e intenta de nuevo.';
  return 'No se pudo completar la operación. Intenta nuevamente.';
};

// Los egresos no tienen correlativo: el comprobante usa un código corto y estable del id.
export const codigoComprobante = (egreso) => `EG-${`${egreso?.id || ''}`.slice(0, 6).toUpperCase() || 'SINID'}`;

export const nombreArchivoComprobante = (egreso) => [
  'Comprobante',
  codigoComprobante(egreso),
  limpiarParaArchivo(egreso?.proveedor),
  `${egreso?.fecha || ''}`.slice(0, 10)
].filter(Boolean).join('-');
