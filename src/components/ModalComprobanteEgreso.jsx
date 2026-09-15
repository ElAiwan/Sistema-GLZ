import { Download, Printer } from 'lucide-react';
import PlantillaComprobanteEgreso from './PlantillaComprobanteEgreso';
import { imprimirDocumento } from '../utils/documentos';
import { codigoComprobante, esCompra, nombreArchivoComprobante } from '../utils/gastos';

// Vista previa del comprobante de una compra o un gasto. Igual que ModalDocumento, la
// plantilla `soloImpresion` va fuera del contenedor para que se imprima la hoja y no la ventana.
export default function ModalComprobanteEgreso({ egreso, onCerrar }) {
  if (!egreso) return null;

  const nombreArchivo = nombreArchivoComprobante(egreso);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 p-2 sm:p-4 flex items-center justify-center print:hidden">
        <div className="w-full max-w-5xl max-h-[95vh] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-800 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-lg font-bold">Comprobante de {esCompra(egreso) ? 'compra' : 'gasto'}</h4>
              <p className="text-xs text-slate-200 truncate">{codigoComprobante(egreso)} • {egreso.proveedor}</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => imprimirDocumento()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white font-bold hover:bg-emerald-600 w-full sm:w-auto"
              >
                <Printer size={16} /> Imprimir
              </button>
              <button
                onClick={() => imprimirDocumento(nombreArchivo)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white text-slate-800 font-bold hover:bg-slate-100 w-full sm:w-auto"
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

          <p className="px-4 sm:px-6 py-2 text-[11px] text-slate-500 bg-slate-100 border-b border-slate-200">
            Para descargar, elige <span className="font-bold">Destino → Guardar como PDF</span> en el diálogo. El archivo se nombra <span className="font-bold">{nombreArchivo}.pdf</span>.
          </p>

          <div className="p-2 sm:p-4 bg-slate-100 flex-1 min-h-0 overflow-hidden">
            <div className="h-full max-h-[60vh] sm:max-h-[68vh] overflow-auto border border-slate-300 rounded-lg bg-slate-300 p-3 sm:p-4">
              <PlantillaComprobanteEgreso egreso={egreso} />
            </div>
          </div>
        </div>
      </div>

      <PlantillaComprobanteEgreso egreso={egreso} soloImpresion />
    </>
  );
}
