import { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { Package, FileText, Users, Clock, LogOut } from 'lucide-react';

import Login from './components/Login';
import ModuloInventario from './components/ModuloInventario';
import ModuloFacturacion from './components/ModuloFacturacion';
import ModuloCRM from './components/ModuloCRM';
import ModuloHistorial from './components/ModuloHistorial';

export default function App() {
  const [vistaActiva, setVistaActiva] = useState('facturas');
  const [usuario, setUsuario] = useState(null);
  const [rol, setRol] = useState('vendedor');
  const [nombreSeguro, setNombreSeguro] = useState(''); // Nuevo estado de seguridad
  const [cargandoAuth, setCargandoAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUsuario(user);
        try {
          const docRol = await getDoc(doc(db, "roles", user.email));
          if (docRol.exists()) {
            setRol(docRol.data().rol || 'vendedor');
            // Sacamos el nombre seguro de la BD, si no existe, usamos la primera parte de su correo
            setNombreSeguro(docRol.data().nombre || user.email.split('@')[0]);
          } else {
            setRol('vendedor');
            setNombreSeguro(user.email.split('@')[0]);
          }
        } catch (error) {
          console.error("Error obteniendo rol:", error);
          setRol('vendedor');
          setNombreSeguro(user.email.split('@')[0]);
        }
      } else {
        setUsuario(null);
      }
      setCargandoAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const registrarHistorialGlobal = async (tipo, descripcion) => {
    try {
      await addDoc(collection(db, "historial"), { 
        tipo, 
        descripcion, 
        usuario: nombreSeguro, // Usamos el nombre inmutable validado por Firebase
        fecha: new Date().toISOString() 
      });
    } catch (error) { console.error("Error guardando historial: ", error); }
  };

  if (cargandoAuth) return <div className="h-screen bg-slate-900"></div>;
  if (!usuario) return <Login />;

  return (
    <div className="flex h-screen bg-slate-50 font-sans print:bg-white">
      <div className="w-64 bg-slate-900 text-white flex flex-col shadow-xl print:hidden shrink-0">
        <div className="p-6 border-b border-slate-800">
          {/* Llama a la imagen desde la carpeta public */}
          <img src="/logo.jpg" alt="GLZ Logo" className="w-full h-auto object-contain bg-white rounded-xl p-4 mb-4 shadow-sm" />
          <span className="inline-block mt-2 text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded uppercase font-bold tracking-widest">
            Perfil: {rol}
          </span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setVistaActiva('inventario')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg ${vistaActiva === 'inventario' ? 'bg-emerald-600' : 'text-slate-400 hover:bg-slate-800'}`}><Package size={20} /><span className="font-medium">Inventario</span></button>
          <button onClick={() => setVistaActiva('facturas')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg ${vistaActiva === 'facturas' ? 'bg-emerald-600' : 'text-slate-400 hover:bg-slate-800'}`}><FileText size={20} /><span className="font-medium">Facturación</span></button>
          <button onClick={() => setVistaActiva('crm')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg ${vistaActiva === 'crm' ? 'bg-emerald-600' : 'text-slate-400 hover:bg-slate-800'}`}><Users size={20} /><span className="font-medium">Clientes</span></button>
          
          {rol === 'admin' && (
            <button onClick={() => setVistaActiva('historial')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg ${vistaActiva === 'historial' ? 'bg-emerald-600' : 'text-slate-400 hover:bg-slate-800'}`}><Clock size={20} /><span className="font-medium">Historial / BI</span></button>
          )}
        </nav>
        <div className="p-4 border-t border-slate-800 bg-slate-900">
           <p className="text-xs text-emerald-400 mb-3 truncate font-bold text-center uppercase tracking-wider">
             {nombreSeguro}
           </p>
           <button onClick={() => signOut(auth)} className="w-full flex items-center justify-center space-x-2 bg-red-500/10 text-red-400 py-2 rounded-lg hover:bg-red-600 hover:text-white transition-colors border border-red-500/20">
              <LogOut size={16} /> <span className="font-bold text-sm">Cerrar Sesión</span>
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
        {vistaActiva === 'inventario' && <ModuloInventario registrarHistorial={registrarHistorialGlobal} rol={rol} />}
        {vistaActiva === 'facturas' && <ModuloFacturacion registrarHistorial={registrarHistorialGlobal} />}
        {vistaActiva === 'crm' && <ModuloCRM registrarHistorial={registrarHistorialGlobal} rol={rol} />}
        {vistaActiva === 'historial' && rol === 'admin' && <ModuloHistorial />}
      </div>
    </div>
  );
}