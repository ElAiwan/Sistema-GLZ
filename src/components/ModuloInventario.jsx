import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { Trash2, Search, Edit2, Check, X, MapPin, History, ArrowLeftRight, BellRing, AlertTriangle, Tag } from 'lucide-react';
import ModalMovimientos from './ModalMovimientos';
import ModalTraslado from './ModalTraslado';
import ModalPrecios from './ModalPrecios';
import { formatearMonto, normalizarMoneda } from '../utils/documentos';
import { avisoCostoActivo, piezasPorCosto, textoPorcentaje, variacionCosto } from '../utils/costos';
import { TIPO_MOVIMIENTO, construirMovimiento, nuevoMovimientoRef } from '../utils/kardex';

const MOTIVO_MINIMO = 3;

// Un repuesto sin mínimo (0) nunca avisa. Con mínimo, avisa al llegar a esa cantidad o menos.
const esStockBajo = (item) => Number(item.stockMinimo || 0) > 0 && Number(item.cantidad || 0) <= Number(item.stockMinimo);

// Aviso de la última compra a otro costo, mientras queden piezas al costo anterior (solo admin).
function EtiquetaCambioCosto({ item, onAbrir }) {
  const variacion = variacionCosto(item.cambioCosto.costoAnterior, item.cambioCosto.costoNuevo);
  const piezas = piezasPorCosto(item);
  return (
    <button
      onClick={onAbrir}
      className={`mt-1 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${variacion.sube ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}
      title={`Última compra: C$ ${formatearMonto(variacion.anterior)} → C$ ${formatearMonto(variacion.nuevo)}. Quedan ${piezas.anteriores} al costo anterior y ${piezas.nuevas} al nuevo.`}
    >
      {variacion.sube ? '▲' : '▼'} Costo {textoPorcentaje(variacion.porcentaje)} · {piezas.anteriores} viejas
    </button>
  );
}

export default function ModuloInventario({ registrarHistorial, rol, usuarioActual = '' }) {
  const [repuestos, setRepuestos] = useState([]);
  const [nuevoRepuesto, setNuevoRepuesto] = useState({ codigo: '', alternateCode: '', descripcion: '', costo: '', precioVerde: '', precioAmarillo: '', precioRojo: '', cantidad: '', stockMinimo: '', localidad: 'Managua' });
  const [busqueda, setBusqueda] = useState('');
  const [filtroBodega, setFiltroBodega] = useState('Todas');
  const [editandoId, setEditandoId] = useState(null);
  const [cantidadEditada, setCantidadEditada] = useState(0);
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [repuestoMovimientos, setRepuestoMovimientos] = useState(null);
  const [repuestoTraslado, setRepuestoTraslado] = useState(null);
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const [repuestoPrecios, setRepuestoPrecios] = useState(null);

  const obtenerRepuestos = async () => {
    const snap = await getDocs(collection(db, "repuestos"));
    setRepuestos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };
  useEffect(() => {
    let activo = true;
    getDocs(collection(db, "repuestos"))
      .then((snap) => {
        if (!activo) return;
        setRepuestos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .catch((error) => {
        console.error('Error cargando inventario:', error);
      });

    return () => { activo = false; };
  }, []);

  const guardarRepuesto = async (e) => {
    e.preventDefault();
    if (rol !== 'admin') {
      alert('⚠️ Solo un administrador puede agregar repuestos.');
      return;
    }

    const datos = {
      ...nuevoRepuesto,
      alternateCode: (nuevoRepuesto.alternateCode || '').trim(),
      costo: Number(nuevoRepuesto.costo), precioVerde: Number(nuevoRepuesto.precioVerde),
      precioAmarillo: Number(nuevoRepuesto.precioAmarillo), precioRojo: Number(nuevoRepuesto.precioRojo),
      cantidad: Number(nuevoRepuesto.cantidad),
      stockMinimo: Math.max(0, Math.floor(Number(nuevoRepuesto.stockMinimo) || 0))
    };

    try {
      // El repuesto y su stock inicial en el kardex se guardan juntos o no se guarda ninguno.
      const repuestoRef = doc(collection(db, "repuestos"));
      const batch = writeBatch(db);
      batch.set(repuestoRef, datos);
      batch.set(nuevoMovimientoRef(db), construirMovimiento({
        idRepuesto: repuestoRef.id,
        repuesto: datos,
        tipo: TIPO_MOVIMIENTO.INICIAL,
        stockAnterior: 0,
        stockNuevo: datos.cantidad,
        motivo: 'Alta del repuesto',
        usuario: usuarioActual
      }));
      await batch.commit();
      await registrarHistorial("Inventario", `Ingresó: ${nuevoRepuesto.codigo} - ${nuevoRepuesto.cantidad} und. en ${nuevoRepuesto.localidad}`);
      setNuevoRepuesto({ codigo: '', alternateCode: '', descripcion: '', costo: '', precioVerde: '', precioAmarillo: '', precioRojo: '', cantidad: '', stockMinimo: '', localidad: 'Managua' });
      await obtenerRepuestos();
    } catch (error) {
      alert('❌ No se pudo guardar el repuesto. Intenta de nuevo.');
      console.error('Error guardando repuesto:', error);
    }
  };

  const eliminarRepuesto = async (item) => {
    if (rol !== 'admin') {
      alert('⚠️ Solo un administrador puede eliminar repuestos.');
      return;
    }
    if (!window.confirm("¿Seguro que deseas eliminarlo?\n\nSu kardex se conserva y queda registrada la baja del stock restante.")) return;

    try {
      await runTransaction(db, async (transaction) => {
        // ---------- LECTURAS ----------
        const repuestoRef = doc(db, "repuestos", item.id);
        const snap = await transaction.get(repuestoRef);
        if (!snap.exists()) return;

        // ---------- ESCRITURAS ----------
        transaction.set(nuevoMovimientoRef(db), construirMovimiento({
          idRepuesto: item.id,
          repuesto: snap.data(),
          tipo: TIPO_MOVIMIENTO.BAJA,
          stockAnterior: Number(snap.data().cantidad || 0),
          stockNuevo: 0,
          motivo: 'Repuesto eliminado del inventario',
          usuario: usuarioActual
        }));
        transaction.delete(repuestoRef);
      });
      await registrarHistorial("Inventario", `Eliminó repuesto: ${item.codigo}`);
      await obtenerRepuestos();
    } catch (error) {
      alert('❌ No se pudo eliminar el repuesto.');
      console.error('Error eliminando repuesto:', error);
    }
  };

  const empezarAjuste = (item) => {
    setEditandoId(item.id);
    setCantidadEditada(item.cantidad);
    setMotivoAjuste('');
  };

  const guardarCantidad = async (item) => {
    if (rol !== 'admin') {
      alert('⚠️ Solo un administrador puede ajustar stock.');
      return;
    }

    const motivo = motivoAjuste.trim();
    if (motivo.length < MOTIVO_MINIMO) {
      alert('Escriba el motivo del ajuste (por ejemplo: conteo físico, producto dañado).');
      return;
    }

    const cantidadNormalizada = Math.max(0, normalizarMoneda(Number(cantidadEditada) || 0));
    try {
      // Se compara contra el stock vigente en la base, no contra el de la pantalla:
      // si alguien facturó mientras tanto, el ajuste registra la diferencia real.
      const resultado = await runTransaction(db, async (transaction) => {
        // ---------- LECTURAS ----------
        const repuestoRef = doc(db, "repuestos", item.id);
        const snap = await transaction.get(repuestoRef);
        if (!snap.exists()) {
          const error = new Error('El repuesto ya no existe.');
          error.code = 'not-found';
          throw error;
        }
        const actual = Number(snap.data().cantidad || 0);
        if (actual === cantidadNormalizada) return { actual, cambio: false };

        // ---------- ESCRITURAS ----------
        transaction.update(repuestoRef, { cantidad: cantidadNormalizada });
        transaction.set(nuevoMovimientoRef(db), construirMovimiento({
          idRepuesto: item.id,
          repuesto: snap.data(),
          tipo: TIPO_MOVIMIENTO.AJUSTE,
          stockAnterior: actual,
          stockNuevo: cantidadNormalizada,
          motivo,
          usuario: usuarioActual
        }));
        return { actual, cambio: true };
      });

      if (resultado.cambio) {
        await registrarHistorial("Inventario", `Ajustó stock de ${item.codigo} de ${resultado.actual} a ${cantidadNormalizada} und. Motivo: ${motivo}`);
      }
      setEditandoId(null);
      await obtenerRepuestos();
    } catch (error) {
      alert(error?.code === 'not-found' ? '❌ El repuesto ya no existe.' : '❌ No se pudo actualizar el stock.');
      console.error('Error actualizando stock:', error);
    }
  };

  const definirStockMinimo = async (item) => {
    if (rol !== 'admin') return;
    const respuesta = window.prompt(
      `Stock mínimo para ${item.codigo} en ${item.localidad || 'Managua'}.\n\nCuando queden esa cantidad o menos, el repuesto aparece en "Stock bajo". Escriba 0 para no avisar.`,
      String(item.stockMinimo || 0)
    );
    if (respuesta === null) return;
    const minimo = Number(respuesta.trim());
    if (!Number.isInteger(minimo) || minimo < 0) {
      alert('El stock mínimo debe ser un número entero, 0 o mayor.');
      return;
    }
    try {
      await updateDoc(doc(db, "repuestos", item.id), { stockMinimo: minimo });
      await registrarHistorial("Inventario", `Definió stock mínimo de ${item.codigo} (${item.localidad || 'Managua'}) en ${minimo} und.`);
      await obtenerRepuestos();
    } catch (error) {
      alert('❌ No se pudo guardar el stock mínimo.');
      console.error('Error guardando stock mínimo:', error);
    }
  };

  const formatear = (num) => Number(num).toLocaleString('en-US', { minimumFractionDigits: 2 });

  const filtrados = repuestos.filter(item =>
    (
      item.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
      (item.alternateCode || '').toLowerCase().includes(busqueda.toLowerCase())
    ) &&
    (filtroBodega === 'Todas' || item.localidad === filtroBodega) &&
    (!soloStockBajo || esStockBajo(item))
  );

  const cantidadStockBajo = repuestos.filter((item) => (filtroBodega === 'Todas' || item.localidad === filtroBodega) && esStockBajo(item)).length;

  const campoMotivo = (clases) => (
    <input
      value={motivoAjuste}
      onChange={(e) => setMotivoAjuste(e.target.value)}
      placeholder="Motivo del ajuste"
      maxLength={120}
      className={`border p-2 rounded text-xs ${clases}`}
    />
  );

  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="mb-6 border-b pb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Gestión de Inventario</h2>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
        <button
          onClick={() => setSoloStockBajo((actual) => !actual)}
          className={`inline-flex items-center justify-center gap-1.5 text-sm font-bold rounded-lg px-3 py-2 border transition-colors ${soloStockBajo ? 'bg-amber-500 border-amber-500 text-white' : cantidadStockBajo > 0 ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100' : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-50'}`}
          title="Repuestos que llegaron a su stock mínimo"
        >
          <AlertTriangle size={15} /> Stock bajo ({cantidadStockBajo})
        </button>
        <select value={filtroBodega} onChange={e => setFiltroBodega(e.target.value)} className="text-sm border border-slate-300 rounded-lg p-2 bg-slate-50 outline-none text-slate-600 font-medium w-full sm:w-auto">
          <option value="Todas">🌍 Ver Todas las Bodegas</option>
          <option value="Managua">📍 Solo Managua</option>
          <option value="Tecolostote">📍 Solo Tecolostote</option>
        </select>
        </div>
      </div>

      {/* SEGURIDAD: Solo el Admin puede agregar repuestos nuevos */}
      {rol === 'admin' && (
        <form onSubmit={guardarRepuesto} className="mb-8 bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Código</label>
                <input required value={nuevoRepuesto.codigo} onChange={e => setNuevoRepuesto({...nuevoRepuesto, codigo: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Código Alterno</label>
                <input value={nuevoRepuesto.alternateCode} onChange={e => setNuevoRepuesto({...nuevoRepuesto, alternateCode: e.target.value})} placeholder="Opcional" className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" />
              </div>
            </div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Descripción</label><input required value={nuevoRepuesto.descripcion} onChange={e => setNuevoRepuesto({...nuevoRepuesto, descripcion: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" /></div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Bodega Destino</label>
              <select required value={nuevoRepuesto.localidad} onChange={e => setNuevoRepuesto({...nuevoRepuesto, localidad: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500 bg-white">
                <option value="Managua">Managua</option><option value="Tecolostote">Tecolostote</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Stock Inicial</label><input type="number" min="0" required value={nuevoRepuesto.cantidad} onChange={e => setNuevoRepuesto({...nuevoRepuesto, cantidad: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" /></div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1" title="Avisa en Stock bajo al llegar a esta cantidad">Stock mínimo</label><input type="number" min="0" step="1" value={nuevoRepuesto.stockMinimo} onChange={e => setNuevoRepuesto({...nuevoRepuesto, stockMinimo: e.target.value})} placeholder="Opcional" className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" /></div>
            </div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">P/Unitario (Costo)</label><input type="number" step="0.01" required value={nuevoRepuesto.costo} onChange={e => setNuevoRepuesto({...nuevoRepuesto, costo: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" /></div>
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
               <div><label className="block text-xs font-bold text-green-600 mb-1">P. Verde</label><input type="number" step="0.01" required value={nuevoRepuesto.precioVerde} onChange={e => setNuevoRepuesto({...nuevoRepuesto, precioVerde: e.target.value})} className="w-full border p-2 rounded-lg bg-green-50 outline-none" /></div>
               <div><label className="block text-xs font-bold text-yellow-600 mb-1">P. Amarillo</label><input type="number" step="0.01" required value={nuevoRepuesto.precioAmarillo} onChange={e => setNuevoRepuesto({...nuevoRepuesto, precioAmarillo: e.target.value})} className="w-full border p-2 rounded-lg bg-yellow-50 outline-none" /></div>
               <div><label className="block text-xs font-bold text-red-500 mb-1">P. Rojo</label><input type="number" step="0.01" required value={nuevoRepuesto.precioRojo} onChange={e => setNuevoRepuesto({...nuevoRepuesto, precioRojo: e.target.value})} className="w-full border p-2 rounded-lg bg-red-50 outline-none" /></div>
            </div>
          </div>
          <button type="submit" className="bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-600 shadow-sm transition-colors">Guardar Repuesto</button>
        </form>
      )}

      <div className="mb-4 flex items-center bg-white border border-slate-300 rounded-lg p-2 w-full md:w-1/2 focus-within:border-emerald-500 transition-colors">
        <Search className="text-slate-400 mr-2" size={20} />
        <input type="text" placeholder="Buscar por código o descripción..." className="w-full outline-none text-slate-700" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="md:hidden space-y-3">
        {filtrados.map((item) => (
          <div key={item.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-slate-800">{item.codigo}</p>
                {item.alternateCode && <p className="text-[11px] font-semibold text-slate-400">Alt: {item.alternateCode}</p>}
                <p className="text-xs text-slate-600 mt-1">{item.descripcion}</p>
                <p className="text-xs text-slate-500 mt-1 flex items-center"><MapPin size={12} className="mr-1"/>{item.localidad || 'Managua'}</p>
              </div>
              <span className={`text-sm font-black text-right ${!item.cantidad ? 'text-red-500' : esStockBajo(item) ? 'text-amber-600' : 'text-slate-800'}`}>
                {item.cantidad || 0}
                {esStockBajo(item) && <span className="block text-[10px] font-bold text-amber-700">Mín. {item.stockMinimo}</span>}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-white border border-slate-200 rounded p-2">
                <p className="font-bold text-green-700">Verde</p>
                <p>C$ {formatear(item.precioVerde)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded p-2">
                <p className="font-bold text-yellow-700">Amarillo</p>
                <p>C$ {formatear(item.precioAmarillo)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded p-2">
                <p className="font-bold text-red-600">Rojo</p>
                <p>C$ {formatear(item.precioRojo)}</p>
              </div>
            </div>
            {rol === 'admin' && avisoCostoActivo(item) && (
              <div className="mt-2 text-right">
                <EtiquetaCambioCosto item={item} onAbrir={() => setRepuestoPrecios(item)} />
              </div>
            )}

            {rol === 'admin' && (
              <div className="mt-3">
                {editandoId === item.id ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="number" value={cantidadEditada} onChange={(e) => setCantidadEditada(Number(e.target.value))} className="w-full text-center border p-2 rounded" />
                      <button onClick={() => guardarCantidad(item)} className="text-green-600 p-2 rounded bg-white border"><Check size={18} /></button>
                      <button onClick={() => setEditandoId(null)} className="text-red-400 p-2 rounded bg-white border"><X size={18} /></button>
                    </div>
                    {campoMotivo('w-full')}
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRepuestoMovimientos(item)} className="text-slate-600 p-2 rounded bg-white border border-slate-200" title="Movimientos"><History size={16} /></button>
                    <button onClick={() => setRepuestoTraslado(item)} className="text-violet-600 p-2 rounded bg-white border border-slate-200" title="Trasladar a otra bodega"><ArrowLeftRight size={16} /></button>
                    <button onClick={() => setRepuestoPrecios(item)} className="text-emerald-700 p-2 rounded bg-white border border-slate-200" title="Editar costo y precios"><Tag size={16} /></button>
                    <button onClick={() => definirStockMinimo(item)} className="text-amber-600 p-2 rounded bg-white border border-slate-200" title="Definir stock mínimo"><BellRing size={16} /></button>
                    <button onClick={() => empezarAjuste(item)} className="text-blue-500 p-2 rounded bg-white border border-slate-200" title="Ajustar Stock"><Edit2 size={16} /></button>
                    <button onClick={() => eliminarRepuesto(item)} className="text-red-400 p-2 rounded bg-white border border-slate-200" title="Eliminar"><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No hay repuestos para mostrar.</p>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto min-h-[300px]">
        <table className="hidden md:table w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="p-3 rounded-tl-lg">Código</th>
              <th className="p-3">Descripción</th>
              <th className="p-3 text-center">Stock</th>
              <th className="p-3">Bodega</th>
              {/* SEGURIDAD: Solo admin ve Costo */}
              {rol === 'admin' && <th className="p-3 text-right">P/Unitario</th>}
              <th className="p-3 text-center">Precios Venta (C$)</th>
              <th className="p-3 text-center rounded-tr-lg">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((item) => (
              <tr key={item.id} className="border-b hover:bg-slate-50">
                <td className="p-3">
                  <p className="font-bold text-slate-700">{item.codigo}</p>
                  {item.alternateCode && <p className="text-[11px] font-semibold text-slate-400">Alt: {item.alternateCode}</p>}
                </td>
                <td className="p-3 text-slate-600">{item.descripcion}</td>
                <td className="p-3 text-center">
                  {editandoId === item.id ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex justify-center space-x-1"><button onClick={() => setCantidadEditada(Math.max(0, cantidadEditada - 1))} className="bg-slate-200 px-2 rounded font-bold">-</button><input type="number" value={cantidadEditada} onChange={(e) => setCantidadEditada(Number(e.target.value))} className="w-16 text-center border p-1" /><button onClick={() => setCantidadEditada(cantidadEditada + 1)} className="bg-slate-200 px-2 rounded font-bold">+</button></div>
                      {campoMotivo('w-44')}
                    </div>
                  ) : (
                    <span className={`font-bold ${!item.cantidad ? 'text-red-500' : esStockBajo(item) ? 'text-amber-600' : 'text-slate-800'}`}>
                      {item.cantidad || 0}
                      {esStockBajo(item) && <span className="block text-[10px] font-bold text-amber-700">Mín. {item.stockMinimo}</span>}
                    </span>
                  )}
                </td>
                <td className="p-3"><span className="flex items-center text-xs font-semibold text-slate-500"><MapPin size={14} className="mr-1"/>{item.localidad || 'Managua'}</span></td>

                {/* SEGURIDAD: Solo admin ve Costo */}
                {rol === 'admin' && (
                  <td className="p-3 text-right font-medium text-slate-500">
                    {formatear(item.costo)}
                    {avisoCostoActivo(item) && (
                      <div><EtiquetaCambioCosto item={item} onAbrir={() => setRepuestoPrecios(item)} /></div>
                    )}
                  </td>
                )}

                <td className="p-3 text-center">
                  <select className="border border-slate-300 rounded p-1.5 font-bold outline-none cursor-pointer bg-white text-slate-700 text-xs">
                    <option className="bg-green-100 text-green-800">🟩 Verde: {formatear(item.precioVerde)}</option>
                    <option className="bg-yellow-100 text-yellow-800">🟨 Amar: {formatear(item.precioAmarillo)}</option>
                    <option className="bg-red-100 text-red-800">🟥 Rojo: {formatear(item.precioRojo)}</option>
                  </select>
                </td>
                <td className="p-3 text-center flex justify-center space-x-2">
                  {editandoId === item.id ? (
                    <><button onClick={() => guardarCantidad(item)} className="text-green-600" title="Guardar ajuste"><Check size={20} /></button><button onClick={() => setEditandoId(null)} className="text-red-400" title="Cancelar"><X size={20} /></button></>
                  ) : (
                    <>
                      {/* SEGURIDAD: Solo admin ve el kardex, traslada, ajusta stock y borra */}
                      {rol === 'admin' && (
                        <>
                          <button onClick={() => setRepuestoMovimientos(item)} className="text-slate-600 p-1" title="Movimientos"><History size={18} /></button>
                          <button onClick={() => setRepuestoTraslado(item)} className="text-violet-600 p-1" title="Trasladar a otra bodega"><ArrowLeftRight size={18} /></button>
                          <button onClick={() => setRepuestoPrecios(item)} className="text-emerald-700 p-1" title="Editar costo y precios"><Tag size={18} /></button>
                          <button onClick={() => definirStockMinimo(item)} className="text-amber-600 p-1" title="Definir stock mínimo"><BellRing size={18} /></button>
                          <button onClick={() => empezarAjuste(item)} className="text-blue-500 p-1" title="Ajustar Stock"><Edit2 size={18} /></button>
                          <button onClick={() => eliminarRepuesto(item)} className="text-red-400 p-1" title="Eliminar"><Trash2 size={18} /></button>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {repuestoMovimientos && (
        <ModalMovimientos repuesto={repuestoMovimientos} onCerrar={() => setRepuestoMovimientos(null)} />
      )}
      {repuestoPrecios && (
        <ModalPrecios
          repuesto={repuestoPrecios}
          repuestos={repuestos}
          registrarHistorial={registrarHistorial}
          onCerrar={() => setRepuestoPrecios(null)}
          onGuardado={obtenerRepuestos}
        />
      )}
      {repuestoTraslado && (
        <ModalTraslado
          repuesto={repuestoTraslado}
          usuarioActual={usuarioActual}
          registrarHistorial={registrarHistorial}
          onCerrar={() => setRepuestoTraslado(null)}
          onTrasladado={obtenerRepuestos}
        />
      )}
    </div>
  );
}
