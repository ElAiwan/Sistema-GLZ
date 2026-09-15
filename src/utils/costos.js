import { normalizarMoneda } from './documentos';

// Cambios de costo por compra. Cuando una compra entra a un costo distinto, el repuesto
// guarda `cambioCosto` ({ fecha, idCompra, proveedor, costoAnterior, costoNuevo,
// cantidadComprada }) para mostrar cuántas piezas quedan a cada costo.

export const variacionCosto = (anterior, nuevo) => {
  const costoAnterior = normalizarMoneda(anterior);
  const costoNuevo = normalizarMoneda(nuevo);
  const diferencia = normalizarMoneda(costoNuevo - costoAnterior);
  return {
    anterior: costoAnterior,
    nuevo: costoNuevo,
    diferencia,
    porcentaje: costoAnterior > 0 ? Math.round((diferencia / costoAnterior) * 1000) / 10 : null,
    sube: diferencia > 0,
    baja: diferencia < 0
  };
};

// Margen sobre el precio de venta, en porcentaje con un decimal. Sin precio no hay margen.
export const margenSobrePrecio = (precio, costo) => {
  const precioVenta = Number(precio || 0);
  if (!(precioVenta > 0)) return null;
  return Math.round(((precioVenta - Number(costo || 0)) / precioVenta) * 1000) / 10;
};

// Se asume que salen primero las piezas viejas: mientras el stock supere lo que entró al
// costo nuevo, la diferencia sigue siendo del costo anterior. Un ajuste manual o un traslado
// posterior puede correr un poco la cuenta.
export const piezasPorCosto = (repuesto) => {
  const cambio = repuesto?.cambioCosto;
  if (!cambio) return null;
  const stock = Math.max(0, Number(repuesto.cantidad || 0));
  const compradas = Math.max(0, Number(cambio.cantidadComprada || 0));
  return {
    anteriores: Math.max(0, stock - compradas),
    nuevas: Math.min(stock, compradas)
  };
};

// El aviso en Inventario dura hasta que no quedan piezas al costo anterior.
export const avisoCostoActivo = (repuesto) => {
  const piezas = piezasPorCosto(repuesto);
  if (!piezas || piezas.anteriores <= 0) return false;
  const { costoAnterior, costoNuevo } = repuesto.cambioCosto;
  return normalizarMoneda(costoAnterior) !== normalizarMoneda(costoNuevo);
};

export const textoPorcentaje = (valor) => (valor === null || valor === undefined
  ? ''
  : `${valor > 0 ? '+' : ''}${valor.toLocaleString('en-US', { maximumFractionDigits: 1 })} %`);

// Qué debe guardar la compra sobre el repuesto. `datos` es el repuesto leído en la
// transacción; `item` trae el costo de la compra, la cantidad y si se actualiza el costo.
export const cambiosPorCompra = ({ datos, item, idCompra, proveedor, fecha }) => {
  const costoActual = normalizarMoneda(datos?.costo || 0);
  const costoCompra = normalizarMoneda(item?.costo || 0);
  const cantidad = Math.max(0, Number(item?.cantidad || 0));
  const cambios = {};

  if (costoCompra > 0 && costoCompra !== costoActual) {
    if (item?.actualizarCosto) cambios.costo = costoCompra;
    // Sin costo anterior no hay "piezas viejas" que seguir.
    if (costoActual > 0) {
      cambios.cambioCosto = { fecha, idCompra, proveedor, costoAnterior: costoActual, costoNuevo: costoCompra, cantidadComprada: cantidad };
    }
  } else if (datos?.cambioCosto && normalizarMoneda(datos.cambioCosto.costoNuevo) === costoCompra) {
    // Otra compra al mismo costo nuevo: esas piezas también cuentan como nuevas.
    cambios.cambioCosto = {
      ...datos.cambioCosto,
      cantidadComprada: Math.max(0, Number(datos.cambioCosto.cantidadComprada || 0)) + cantidad
    };
  }

  return cambios;
};
