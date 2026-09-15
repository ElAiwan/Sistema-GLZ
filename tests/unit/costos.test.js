// Pruebas del aviso de cambio de costo por compra.
import { describe, expect, it } from 'vitest';
import {
  avisoCostoActivo,
  cambiosPorCompra,
  margenSobrePrecio,
  piezasPorCosto,
  textoPorcentaje,
  variacionCosto
} from '../../src/utils/costos';

describe('variación y margen', () => {
  it('calcula cuánto sube o baja el costo', () => {
    expect(variacionCosto(450, 520)).toEqual({ anterior: 450, nuevo: 520, diferencia: 70, porcentaje: 15.6, sube: true, baja: false });
    expect(variacionCosto(520, 450).baja).toBe(true);
    expect(variacionCosto(0, 100).porcentaje).toBeNull();
  });

  it('calcula el margen sobre el precio de venta', () => {
    expect(margenSobrePrecio(600, 450)).toBe(25);
    expect(margenSobrePrecio(600, 520)).toBe(13.3);
    expect(margenSobrePrecio(400, 520)).toBe(-30);
    expect(margenSobrePrecio(0, 520)).toBeNull();
  });

  it('muestra porcentajes con signo', () => {
    expect(textoPorcentaje(15.6)).toBe('+15.6 %');
    expect(textoPorcentaje(-3)).toBe('-3 %');
    expect(textoPorcentaje(null)).toBe('');
  });
});

describe('piezas al costo anterior y al nuevo', () => {
  const cambioCosto = { costoAnterior: 450, costoNuevo: 520, cantidadComprada: 10 };

  it('las piezas viejas salen primero', () => {
    expect(piezasPorCosto({ cantidad: 22, cambioCosto })).toEqual({ anteriores: 12, nuevas: 10 });
    expect(piezasPorCosto({ cantidad: 15, cambioCosto })).toEqual({ anteriores: 5, nuevas: 10 });
    expect(piezasPorCosto({ cantidad: 7, cambioCosto })).toEqual({ anteriores: 0, nuevas: 7 });
    expect(piezasPorCosto({ cantidad: 5 })).toBeNull();
  });

  it('el aviso dura mientras quedan piezas viejas', () => {
    expect(avisoCostoActivo({ cantidad: 22, cambioCosto })).toBe(true);
    expect(avisoCostoActivo({ cantidad: 10, cambioCosto })).toBe(false);
    expect(avisoCostoActivo({ cantidad: 22, cambioCosto: { ...cambioCosto, costoNuevo: 450 } })).toBe(false);
    expect(avisoCostoActivo({ cantidad: 22 })).toBe(false);
  });
});

describe('lo que guarda la compra en el repuesto', () => {
  const base = { idCompra: 'g1', proveedor: 'Repuestos del Norte', fecha: '2026-09-15T18:00:00.000Z' };

  it('compra más cara con la casilla marcada: actualiza el costo y registra el cambio', () => {
    const cambios = cambiosPorCompra({ ...base, datos: { costo: 450, cantidad: 12 }, item: { costo: 520, cantidad: 10, actualizarCosto: true } });
    expect(cambios.costo).toBe(520);
    expect(cambios.cambioCosto).toEqual({ ...base, costoAnterior: 450, costoNuevo: 520, cantidadComprada: 10 });
  });

  it('con la casilla desmarcada no toca el costo, pero igual avisa', () => {
    const cambios = cambiosPorCompra({ ...base, datos: { costo: 450 }, item: { costo: 520, cantidad: 10, actualizarCosto: false } });
    expect(cambios).not.toHaveProperty('costo');
    expect(cambios.cambioCosto.costoNuevo).toBe(520);
  });

  it('otra compra al mismo costo nuevo suma a las piezas nuevas', () => {
    const datos = { costo: 520, cambioCosto: { ...base, costoAnterior: 450, costoNuevo: 520, cantidadComprada: 10 } };
    const cambios = cambiosPorCompra({ ...base, idCompra: 'g2', datos, item: { costo: 520, cantidad: 4, actualizarCosto: true } });
    expect(cambios.cambioCosto.cantidadComprada).toBe(14);
    expect(cambios.cambioCosto.idCompra).toBe('g1');
    expect(cambios).not.toHaveProperty('costo');
  });

  it('al mismo costo y sin cambio previo no guarda nada extra', () => {
    expect(cambiosPorCompra({ ...base, datos: { costo: 450 }, item: { costo: 450, cantidad: 3, actualizarCosto: true } })).toEqual({});
  });

  it('un repuesto sin costo toma el de la compra sin aviso de piezas viejas', () => {
    expect(cambiosPorCompra({ ...base, datos: { costo: 0 }, item: { costo: 300, cantidad: 5, actualizarCosto: true } })).toEqual({ costo: 300 });
  });
});
