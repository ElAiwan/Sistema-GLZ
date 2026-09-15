import { collection, getDocs } from 'firebase/firestore';
import { descargarArchivo, fechaArchivo } from './reportes';

// El plan Spark no tiene exportación ni respaldos automáticos de Firestore: este archivo es
// el respaldo. Lee cada colección una vez (una lectura por documento) y baja un JSON.
export const COLECCIONES_RESPALDO = [
  'clientes',
  'repuestos',
  'facturas',
  'gastos',
  'proveedores',
  'movimientos',
  'historial',
  'roles',
  'sistema'
];

export const generarRespaldo = async (db) => {
  const lecturas = await Promise.all(COLECCIONES_RESPALDO.map(async (nombre) => {
    const snap = await getDocs(collection(db, nombre));
    return [nombre, snap.docs.map((d) => ({ id: d.id, ...d.data() }))];
  }));

  const ahora = new Date();
  const totalDocumentos = lecturas.reduce((total, [, documentos]) => total + documentos.length, 0);
  const contenido = JSON.stringify({
    sistema: 'Sistema GLZ Cloud',
    proyecto: 'glz-sistema',
    generado: ahora.toISOString(),
    totalDocumentos,
    conteo: Object.fromEntries(lecturas.map(([nombre, documentos]) => [nombre, documentos.length])),
    colecciones: Object.fromEntries(lecturas)
  }, null, 2);

  const nombreArchivo = `respaldo-glz-${fechaArchivo(ahora)}.json`;
  descargarArchivo(nombreArchivo, contenido, 'application/json;charset=utf-8');
  return { nombreArchivo, totalDocumentos, bytes: new Blob([contenido]).size };
};
