import { collection, doc } from 'firebase/firestore';

// Kardex: cada cambio de stock deja un documento en `movimientos`, escrito dentro de la
// misma transacción que cambia la cantidad (siempre después de todas las lecturas).

export const TIPO_MOVIMIENTO = {
  INICIAL: 'inicial',
  VENTA: 'venta',
  COMPRA: 'compra',
  ANULACION: 'anulacion',
  ANULACION_COMPRA: 'anulacion-compra',
  AJUSTE: 'ajuste',
  TRASLADO_SALIDA: 'traslado-salida',
  TRASLADO_ENTRADA: 'traslado-entrada',
  BAJA: 'baja'
};

export const ETIQUETA_MOVIMIENTO = {
  [TIPO_MOVIMIENTO.INICIAL]: 'Stock inicial',
  [TIPO_MOVIMIENTO.VENTA]: 'Venta',
  [TIPO_MOVIMIENTO.COMPRA]: 'Compra',
  [TIPO_MOVIMIENTO.ANULACION]: 'Devolución por anulación',
  [TIPO_MOVIMIENTO.ANULACION_COMPRA]: 'Anulación de compra',
  [TIPO_MOVIMIENTO.AJUSTE]: 'Ajuste',
  [TIPO_MOVIMIENTO.TRASLADO_SALIDA]: 'Traslado (salida)',
  [TIPO_MOVIMIENTO.TRASLADO_ENTRADA]: 'Traslado (entrada)',
  [TIPO_MOVIMIENTO.BAJA]: 'Baja del repuesto'
};

export const BODEGAS = ['Managua', 'Tecolostote'];

export const otraBodega = (bodega) => (bodega === 'Tecolostote' ? 'Managua' : 'Tecolostote');

const redondear = (valor) => Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100;

export const nuevoMovimientoRef = (db) => doc(collection(db, 'movimientos'));

export const construirMovimiento = ({
  idRepuesto,
  repuesto,
  tipo,
  stockAnterior,
  stockNuevo,
  referencia,
  motivo,
  usuario,
  idTraslado
}) => {
  const movimiento = {
    idRepuesto,
    codigo: repuesto?.codigo || '',
    descripcion: repuesto?.descripcion || '',
    localidad: repuesto?.localidad || 'Managua',
    tipo,
    cantidad: redondear(Number(stockNuevo) - Number(stockAnterior)),
    stockAnterior: redondear(stockAnterior),
    stockNuevo: redondear(stockNuevo),
    referencia: {
      coleccion: referencia?.coleccion || '',
      id: referencia?.id || '',
      texto: referencia?.texto || ''
    },
    motivo: `${motivo || ''}`.trim(),
    usuario: usuario || '',
    fecha: new Date().toISOString()
  };
  if (idTraslado) movimiento.idTraslado = idTraslado;
  return movimiento;
};
