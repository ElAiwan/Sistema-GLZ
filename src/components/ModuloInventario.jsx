import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Trash2, Search, Edit2, Check, X, MapPin } from 'lucide-react';

export default function ModuloInventario({ registrarHistorial, rol }) {
  const [repuestos, setRepuestos] = useState([]);
  const [nuevoRepuesto, setNuevoRepuesto] = useState({ codigo: '', descripcion: '', costo: '', precioVerde: '', precioAmarillo: '', precioRojo: '', cantidad: '', localidad: 'Managua' });
  const [busqueda, setBusqueda] = useState('');
  const [filtroBodega, setFiltroBodega] = useState('Todas');
  const [editandoId, setEditandoId] = useState(null);
  const [cantidadEditada, setCantidadEditada] = useState(0);

  const obtenerRepuestos = async () => {
    const snap = await getDocs(collection(db, "repuestos"));
    setRepuestos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };
  useEffect(() => { obtenerRepuestos(); }, []);

  const guardarRepuesto = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "repuestos"), {
      ...nuevoRepuesto, costo: Number(nuevoRepuesto.costo), precioVerde: Number(nuevoRepuesto.precioVerde), 
      precioAmarillo: Number(nuevoRepuesto.precioAmarillo), precioRojo: Number(nuevoRepuesto.precioRojo), 
      cantidad: Number(nuevoRepuesto.cantidad)
    });
    await registrarHistorial("Inventario", `Ingresó: ${nuevoRepuesto.codigo} - ${nuevoRepuesto.cantidad} und. en ${nuevoRepuesto.localidad}`);
    setNuevoRepuesto({ codigo: '', descripcion: '', costo: '', precioVerde: '', precioAmarillo: '', precioRojo: '', cantidad: '', localidad: 'Managua' });
    obtenerRepuestos(); 
  };

  const eliminarRepuesto = async (item) => {
    if (window.confirm("¿Seguro que deseas eliminarlo?")) {
      await deleteDoc(doc(db, "repuestos", item.id)); 
      await registrarHistorial("Inventario", `Eliminó repuesto: ${item.codigo}`);
      obtenerRepuestos();
    }
  };

  const guardarCantidad = async (item) => {
    await updateDoc(doc(db, "repuestos", item.id), { cantidad: Number(cantidadEditada) });
    await registrarHistorial("Inventario", `Actualizó stock de ${item.codigo} a ${cantidadEditada} und.`);
    setEditandoId(null); obtenerRepuestos();
  };

  const formatear = (num) => Number(num).toLocaleString('en-US', { minimumFractionDigits: 2 });
  
  const filtrados = repuestos.filter(item => 
    (item.codigo.toLowerCase().includes(busqueda.toLowerCase()) || item.descripcion.toLowerCase().includes(busqueda.toLowerCase())) &&
    (filtroBodega === 'Todas' || item.localidad === filtroBodega)
  );

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4 flex justify-between items-center">
        Gestión de Inventario
        <select value={filtroBodega} onChange={e => setFiltroBodega(e.target.value)} className="text-sm border border-slate-300 rounded-lg p-2 bg-slate-50 outline-none text-slate-600 font-medium">
          <option value="Todas">🌍 Ver Todas las Bodegas</option>
          <option value="Managua">📍 Solo Managua</option>
          <option value="Tecolostote">📍 Solo Tecolostote</option>
        </select>
      </h2>

      {/* SEGURIDAD: Solo el Admin puede agregar repuestos nuevos */}
      {rol === 'admin' && (
        <form onSubmit={guardarRepuesto} className="mb-8 bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div><label className="block text-xs font-bold text-slate-500 mb-1">Código</label><input required value={nuevoRepuesto.codigo} onChange={e => setNuevoRepuesto({...nuevoRepuesto, codigo: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" /></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Descripción</label><input required value={nuevoRepuesto.descripcion} onChange={e => setNuevoRepuesto({...nuevoRepuesto, descripcion: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" /></div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Bodega Destino</label>
              <select required value={nuevoRepuesto.localidad} onChange={e => setNuevoRepuesto({...nuevoRepuesto, localidad: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500 bg-white">
                <option value="Managua">Managua</option><option value="Tecolostote">Tecolostote</option>
              </select>
            </div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">Stock Inicial</label><input type="number" min="0" required value={nuevoRepuesto.cantidad} onChange={e => setNuevoRepuesto({...nuevoRepuesto, cantidad: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">P/Unitario (Costo)</label><input type="number" step="0.01" required value={nuevoRepuesto.costo} onChange={e => setNuevoRepuesto({...nuevoRepuesto, costo: e.target.value})} className="w-full border p-2 rounded-lg outline-none focus:border-emerald-500" /></div>
            <div className="md:col-span-2 flex gap-2">
               <div className="w-1/3"><label className="block text-xs font-bold text-green-600 mb-1">P. Verde</label><input type="number" step="0.01" required value={nuevoRepuesto.precioVerde} onChange={e => setNuevoRepuesto({...nuevoRepuesto, precioVerde: e.target.value})} className="w-full border p-2 rounded-lg bg-green-50 outline-none" /></div>
               <div className="w-1/3"><label className="block text-xs font-bold text-yellow-600 mb-1">P. Amarillo</label><input type="number" step="0.01" required value={nuevoRepuesto.precioAmarillo} onChange={e => setNuevoRepuesto({...nuevoRepuesto, precioAmarillo: e.target.value})} className="w-full border p-2 rounded-lg bg-yellow-50 outline-none" /></div>
               <div className="w-1/3"><label className="block text-xs font-bold text-red-500 mb-1">P. Rojo</label><input type="number" step="0.01" required value={nuevoRepuesto.precioRojo} onChange={e => setNuevoRepuesto({...nuevoRepuesto, precioRojo: e.target.value})} className="w-full border p-2 rounded-lg bg-red-50 outline-none" /></div>
            </div>
          </div>
          <button type="submit" className="bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-600 shadow-sm transition-colors">Guardar Repuesto</button>
        </form>
      )}

      <div className="mb-4 flex items-center bg-white border border-slate-300 rounded-lg p-2 w-full md:w-1/2 focus-within:border-emerald-500 transition-colors">
        <Search className="text-slate-400 mr-2" size={20} />
        <input type="text" placeholder="Buscar por código o descripción..." className="w-full outline-none text-slate-700" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left border-collapse text-sm">
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
                <td className="p-3 font-bold text-slate-700">{item.codigo}</td>
                <td className="p-3 text-slate-600">{item.descripcion}</td>
                <td className="p-3 text-center">
                  {editandoId === item.id ? (
                    <div className="flex justify-center space-x-1"><button onClick={() => setCantidadEditada(Math.max(0, cantidadEditada - 1))} className="bg-slate-200 px-2 rounded font-bold">-</button><input type="number" value={cantidadEditada} onChange={(e) => setCantidadEditada(Number(e.target.value))} className="w-16 text-center border p-1" /><button onClick={() => setCantidadEditada(cantidadEditada + 1)} className="bg-slate-200 px-2 rounded font-bold">+</button></div>
                  ) : (<span className={`font-bold ${!item.cantidad ? 'text-red-500' : 'text-slate-800'}`}>{item.cantidad || 0}</span>)}
                </td>
                <td className="p-3"><span className="flex items-center text-xs font-semibold text-slate-500"><MapPin size={14} className="mr-1"/>{item.localidad || 'Managua'}</span></td>
                
                {/* SEGURIDAD: Solo admin ve Costo */}
                {rol === 'admin' && <td className="p-3 text-right font-medium text-slate-500">{formatear(item.costo)}</td>}
                
                <td className="p-3 text-center">
                  <select className="border border-slate-300 rounded p-1.5 font-bold outline-none cursor-pointer bg-white text-slate-700 text-xs">
                    <option className="bg-green-100 text-green-800">🟩 Verde: {formatear(item.precioVerde)}</option>
                    <option className="bg-yellow-100 text-yellow-800">🟨 Amar: {formatear(item.precioAmarillo)}</option>
                    <option className="bg-red-100 text-red-800">🟥 Rojo: {formatear(item.precioRojo)}</option>
                  </select>
                </td>
                <td className="p-3 text-center flex justify-center space-x-2">
                  {editandoId === item.id ? (
                    <><button onClick={() => guardarCantidad(item)} className="text-green-600"><Check size={20} /></button><button onClick={() => setEditandoId(null)} className="text-red-400"><X size={20} /></button></>
                  ) : (
                    <>
                      {/* SEGURIDAD: Solo admin puede ajustar stock y borrar */}
                      {rol === 'admin' && (
                        <>
                          <button onClick={() => { setEditandoId(item.id); setCantidadEditada(item.cantidad); }} className="text-blue-500 p-1" title="Ajustar Stock"><Edit2 size={18} /></button>
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
    </div>
  );
}