import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Download, Printer } from 'lucide-react';
import PlantillaReporte from './PlantillaReporte';
import { imprimirDocumento } from '../utils/documentos';
import { fechaArchivo } from '../utils/reportes';

const SECCIONES = [
  { clave: 'ventas', etiqueta: 'Detalle de ventas' },
  { clave: 'egresos', etiqueta: 'Detalle de compras y gastos' },
  { clave: 'cobrar', etiqueta: 'Cuentas por cobrar' },
  { clave: 'inventario', etiqueta: 'Inventario valorizado' }
];

// Vista previa del reporte del período. Como en ModalDocumento, la plantilla `soloImpresion`
// va fuera del contenedor para que se imprima la hoja y no la ventana.
export default function ModalReporte({ datos, onCerrar }) {
  const [secciones, setSecciones] = useState({ ventas: true, egresos: true, cobrar: true, inventario: true });
  const [inventario, setInventario] = useState(null);
  const [errorInventario, setErrorInventario] = useState('');

  // El inventario solo se lee si se va a incluir, y una sola vez por apertura.
  const debeCargarInventario = secciones.inventario && inventario === null && !errorInventario;

  useEffect(() => {
    if (!debeCargarInventario) return undefined;
    let activo = true;
    getDocs(collection(db, 'repuestos'))
      .then((snap) => { if (activo) setInventario(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); })
      .catch((error) => {
        console.error('Error cargando inventario para el reporte:', error);
        if (activo) setErrorInventario('No se pudo cargar el inventario. Desmarque la sección o intente de nuevo.');
      });
    return () => { activo = false; };
  }, [debeCargarInventario]);

  const nombreArchivo = `Reporte-GLZ-${fechaArchivo(datos.rango.desde)}-a-${fechaArchivo(datos.rango.hasta)}`;
  const esperandoInventario = secciones.inventario && inventario === null;

  const alternar = (clave) => {
    setSecciones((actual) => ({ ...actual, [clave]: !actual[clave] }));
    if (clave === 'inventario') setErrorInventario('');
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 p-2 sm:p-4 flex items-center justify-center print:hidden">
        <div className="w-full max-w-5xl max-h-[95vh] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-800 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-lg font-bold">Reporte del negocio</h4>
              <p className="text-xs text-slate-200 truncate">{datos.etiquetaRango}</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => imprimirDocumento()}
                disabled={esperandoInventario}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white font-bold hover:bg-emerald-600 disabled:opacity-50 w-full sm:w-auto"
              >
                <Printer size={16} /> Imprimir
              </button>
              <button
                onClick={() => imprimirDocumento(nombreArchivo)}
                disabled={esperandoInventario}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white text-slate-800 font-bold hover:bg-slate-100 disabled:opacity-50 w-full sm:w-auto"
                title={`Se guardará como ${nombreArchivo}.pdf`}
              >
                <Download size={16} /> Descargar PDF
              </button>
              <button
                onClick={onCerrar}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-transparent text-white font-bold hover:bg-slate-700 w-full sm:w-auto"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="px-4 sm:px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-col gap-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Incluir:</span>
              {SECCIONES.map((s) => (
                <label key={s.clave} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={secciones[s.clave]} onChange={() => alternar(s.clave)} className="accent-emerald-600" />
                  {s.etiqueta}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              El resumen va siempre en la primera hoja; cada sección marcada empieza en hoja nueva. Para descargar, elija <span className="font-bold">Destino → Guardar como PDF</span>. El archivo se nombra <span className="font-bold">{nombreArchivo}.pdf</span>.
            </p>
            {errorInventario && (
              <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">{errorInventario}</p>
            )}
          </div>

          <div className="p-2 sm:p-4 bg-slate-100 flex-1 min-h-0 overflow-hidden">
            <div className="h-full max-h-[55vh] sm:max-h-[62vh] overflow-auto border border-slate-300 rounded-lg bg-slate-300 p-3 sm:p-4">
              <PlantillaReporte datos={datos} secciones={secciones} inventario={inventario} />
            </div>
          </div>
        </div>
      </div>

      <PlantillaReporte datos={datos} secciones={secciones} inventario={inventario} soloImpresion />
    </>
  );
}
