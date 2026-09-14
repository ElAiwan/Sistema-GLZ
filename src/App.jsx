import { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { Package, FileText, Users, Clock, LogOut, Menu, X, ClipboardList, Truck, Wallet } from 'lucide-react';

import Login from './components/Login';
import ModuloInventario from './components/ModuloInventario';
import ModuloFacturacion from './components/ModuloFacturacion';
import ModuloCRM from './components/ModuloCRM';
import ModuloDocumentos from './components/ModuloDocumentos';
import ModuloProveedores from './components/ModuloProveedores';
import ModuloGastos from './components/ModuloGastos';
import ModuloHistorial from './components/ModuloHistorial';

export default function App() {
  const [vistaActiva, setVistaActiva] = useState('facturas');
  const [usuario, setUsuario] = useState(null);
  const [rol, setRol] = useState('vendedor');
  const [nombreSeguro, setNombreSeguro] = useState(''); // Nuevo estado de seguridad
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [cotizacionParaFacturar, setCotizacionParaFacturar] = useState(null);

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

  const opcionesNavegacion = [
    { id: 'inventario', etiqueta: 'Inventario', icono: Package, visible: true },
    { id: 'facturas', etiqueta: 'Facturación', icono: FileText, visible: true },
    { id: 'documentos', etiqueta: 'Cotizaciones / Facturas', icono: ClipboardList, visible: true },
    { id: 'crm', etiqueta: 'Clientes', icono: Users, visible: true },
    { id: 'proveedores', etiqueta: 'Proveedores', icono: Truck, visible: rol === 'admin' },
    { id: 'gastos', etiqueta: 'Compras / Gastos', icono: Wallet, visible: rol === 'admin' },
    { id: 'historial', etiqueta: 'Historial / BI', icono: Clock, visible: rol === 'admin' }
  ].filter((opcion) => opcion.visible);

  const cambiarVista = (vista) => {
    setVistaActiva(vista);
    setMenuMovilAbierto(false);
  };

  // Lleva la cotización seleccionada al módulo de Facturación para convertirla en factura.
  const facturarCotizacion = (cotizacion) => {
    setCotizacionParaFacturar(cotizacion);
    cambiarVista('facturas');
  };

  return (
    <div className="h-screen bg-slate-50 font-sans print:bg-white md:flex md:overflow-hidden">
      <header className="md:hidden sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 px-3 py-2 flex items-center justify-between print:hidden">
        <button
          onClick={() => setMenuMovilAbierto(true)}
          className="w-10 h-10 rounded-lg border border-slate-700 flex items-center justify-center"
          aria-label="Abrir menú"
        >
          <Menu size={18} />
        </button>
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-slate-300 font-bold">Sistema GLZ</p>
          <p className="text-[11px] text-emerald-300 font-semibold truncate max-w-[180px]">{nombreSeguro}</p>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="px-2.5 py-2 text-[11px] rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 font-bold"
        >
          Salir
        </button>
      </header>

      {menuMovilAbierto && (
        <button
          onClick={() => setMenuMovilAbierto(false)}
          className="fixed inset-0 z-30 bg-slate-900/55 md:hidden print:hidden"
          aria-label="Cerrar menú"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[88vw] bg-slate-900 text-white flex flex-col shadow-2xl print:hidden transition-transform duration-200 md:static md:translate-x-0 md:w-64 md:shadow-xl ${
          menuMovilAbierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-slate-800">
          <div className="flex justify-end md:hidden mb-3">
            <button
              onClick={() => setMenuMovilAbierto(false)}
              className="w-8 h-8 rounded-md border border-slate-700 flex items-center justify-center"
              aria-label="Cerrar menú lateral"
            >
              <X size={16} />
            </button>
          </div>
          {/* Llama a la imagen desde la carpeta public */}
          <img src="/logo.jpg" alt="GLZ Logo" className="w-full h-auto object-contain bg-white rounded-xl p-4 mb-4 shadow-sm" />
          <span className="inline-block mt-2 text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded uppercase font-bold tracking-widest">
            Perfil: {rol}
          </span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {opcionesNavegacion.map((opcion) => {
            const Icono = opcion.icono;
            return (
              <button
                key={opcion.id}
                onClick={() => cambiarVista(opcion.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg ${vistaActiva === opcion.id ? 'bg-emerald-600' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                <Icono size={20} />
                <span className="font-medium">{opcion.etiqueta}</span>
              </button>
            );
          })}
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

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 print:p-0 print:overflow-visible">
        {vistaActiva === 'inventario' && <ModuloInventario registrarHistorial={registrarHistorialGlobal} rol={rol} />}
        {vistaActiva === 'facturas' && (
          <ModuloFacturacion
            registrarHistorial={registrarHistorialGlobal}
            usuarioActual={nombreSeguro}
            cotizacionOrigen={cotizacionParaFacturar}
            onCotizacionProcesada={() => setCotizacionParaFacturar(null)}
          />
        )}
        {vistaActiva === 'documentos' && <ModuloDocumentos onFacturarCotizacion={facturarCotizacion} />}
        {vistaActiva === 'crm' && <ModuloCRM registrarHistorial={registrarHistorialGlobal} rol={rol} />}
        {vistaActiva === 'proveedores' && rol === 'admin' && <ModuloProveedores registrarHistorial={registrarHistorialGlobal} rol={rol} />}
        {vistaActiva === 'gastos' && rol === 'admin' && <ModuloGastos registrarHistorial={registrarHistorialGlobal} usuarioActual={nombreSeguro} />}
        {vistaActiva === 'historial' && rol === 'admin' && <ModuloHistorial />}
      </div>
    </div>
  );
}
