// Utilidades del panel de reportes: rangos de fecha, agregaciones y descargas.

import { normalizarMoneda } from './documentos';

export const RANGOS = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'semana', etiqueta: 'Esta semana' },
  { clave: 'mes', etiqueta: 'Este mes' },
  { clave: 'mesPasado', etiqueta: 'Mes pasado' },
  { clave: 'anio', etiqueta: 'Este año' },
  { clave: 'personalizado', etiqueta: 'Personalizado' }
];

const aInicioDelDia = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 0, 0, 0, 0);
const aFinDelDia = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 59, 59, 999);

// La semana arranca el lunes, que es como se cuenta el trabajo acá.
const inicioDeSemana = (fecha) => {
  const dia = fecha.getDay();
  const retroceso = dia === 0 ? 6 : dia - 1;
  const inicio = new Date(fecha);
  inicio.setDate(fecha.getDate() - retroceso);
  return aInicioDelDia(inicio);
};

export const calcularRango = (clave, desdeManual, hastaManual) => {
  const hoy = new Date();

  if (clave === 'personalizado') {
    const desde = desdeManual ? aInicioDelDia(new Date(`${desdeManual}T12:00:00`)) : aInicioDelDia(hoy);
    const hasta = hastaManual ? aFinDelDia(new Date(`${hastaManual}T12:00:00`)) : aFinDelDia(hoy);
    return { desde, hasta };
  }

  if (clave === 'hoy') return { desde: aInicioDelDia(hoy), hasta: aFinDelDia(hoy) };
  if (clave === 'semana') return { desde: inicioDeSemana(hoy), hasta: aFinDelDia(hoy) };
  if (clave === 'mesPasado') {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const hasta = aFinDelDia(new Date(hoy.getFullYear(), hoy.getMonth(), 0));
    return { desde, hasta };
  }
  if (clave === 'anio') return { desde: new Date(hoy.getFullYear(), 0, 1), hasta: aFinDelDia(hoy) };

  return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: aFinDelDia(hoy) };
};

// Período inmediatamente anterior, del mismo largo, para comparar contra.
export const rangoAnterior = ({ desde, hasta }) => {
  const largo = hasta.getTime() - desde.getTime();
  return {
    desde: new Date(desde.getTime() - largo - 1),
    hasta: new Date(desde.getTime() - 1)
  };
};

export const dentroDe = (iso, { desde, hasta }) => {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return false;
  return fecha >= desde && fecha <= hasta;
};

export const variacion = (actual, anterior) => {
  if (!anterior) return actual > 0 ? 100 : 0;
  return Math.round(((actual - anterior) / anterior) * 100);
};

export const claveMes = (iso) => `${iso || ''}`.slice(0, 7);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const etiquetaMes = (clave) => {
  const [anio, mes] = `${clave}`.split('-');
  const indice = Number(mes) - 1;
  return `${MESES[indice] || '?'} ${String(anio).slice(2)}`;
};

// Los últimos N meses en orden cronológico, incluido el actual.
export const ultimosMeses = (cantidad) => {
  const hoy = new Date();
  const claves = [];
  for (let i = cantidad - 1; i >= 0; i -= 1) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    claves.push(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`);
  }
  return claves;
};

// ---------- Descarga de archivos ----------

const escaparCampo = (valor) => {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

export const construirCSV = (encabezados, filas) => {
  const lineas = [encabezados.map(escaparCampo).join(',')];
  filas.forEach((fila) => lineas.push(fila.map(escaparCampo).join(',')));
  // El BOM es lo que hace que Excel lea bien los acentos y la Ñ.
  return `\ufeff${lineas.join('\r\n')}`;
};

export const descargarArchivo = (nombre, contenido, tipo = 'text/csv;charset=utf-8') => {
  if (typeof window === 'undefined') return;
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const montoCSV = (valor) => normalizarMoneda(valor).toFixed(2);

export const fechaCSV = (iso) => {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toISOString().slice(0, 10);
};
