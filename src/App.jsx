import { useState, useEffect, lazy, Suspense } from 'react';
import { db, auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { Package, FileText, Users, Clock, LogOut, Menu, X, ClipboardList, Truck, Wallet, BarChart3, UserCog, ShieldAlert } from 'lucide-react';

import Login from './components/Login';

// Cada módulo se descarga recién la primera vez que se abre: la carga inicial trae solo
// el login, el menú y el módulo con el que se arranca.
const ModuloInventario = lazy(() => import('./components/ModuloInventario'));
const ModuloFacturacion = lazy(() => import('./components/ModuloFacturacion'));
const ModuloCRM = lazy(() => import('./components/ModuloCRM'));
const ModuloDocumentos = lazy(() => import('./components/ModuloDocumentos'));
const ModuloProveedores = lazy(() => import('./components/ModuloProveedores'));
const ModuloGastos = lazy(() => import('./components/ModuloGastos'));
const ModuloReportes = lazy(() => import('./components/ModuloReportes'));
const ModuloHistorial = lazy(() => import('./components/ModuloHistorial'));
const ModuloEmpleados = lazy(() => import('./components/ModuloEmpleados'));

function CargandoModulo() {
  return <p className="text-sm font-semibold text-slate-400 p-6 print:hidden">Cargando módulo...</p>;
}

const ROLES_VALIDOS = ['admin', 'vendedor'];

// Sin documento en `roles` (o con un perfil desconocido) no hay acceso: las reglas
// de Firestore rechazarían cualquier lectura, así que no se deja pasar como vendedor.
async function consultarAcceso(email) {
  try {
    const docRol = await getDoc(doc(db, "roles", email));
    const datos = docRol.exists() ? docRol.data() : null;
    if (!datos || !ROLES_VALIDOS.includes(datos.rol)) return { estado: 'sin-rol' };
    // Sacamos el nombre seguro de la BD, si no existe, usamos la primera parte de su correo
    return { estado: 'ok', rol: datos.rol, nombre: datos.nombre || email.split('@')[0] };
  } catch (error) {
    console.error("Error obteniendo rol:", error);
    return { estado: 'error' };
  }
}

export default function App() {
  const [vistaActiva, setVistaActiva] = useState('facturas');
  const [usuario, setUsuario] = useState(null);
  const [rol, setRol] = useState(null);
  const [nombreSeguro, setNombreSeguro] = useState(''); // Nuevo estado de seguridad
  const [estadoAcceso, setEstadoAcceso] = useState('sin-rol'); // ok | sin-rol | error
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [cotizacionParaFacturar, setCotizacionParaFacturar] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCargandoAuth(true);
      if (user) {
        const acceso = await consultarAcceso(user.email);
        setRol(acceso.rol || null);
        setNombreSeguro(acceso.nombre || '');
        setEstadoAcceso(acceso.estado);
      } else {
        setRol(null);
        setNombreSeguro('');
      }
      setUsuario(user);
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
  if (estadoAcceso !== 'ok') return <PantallaSinAcceso estado={estadoAcceso} correo={usuario.email} />;

  const opcionesNavegacion = [
    { id: 'inventario', etiqueta: 'Inventario', icono: Package, visible: true },
    { id: 'facturas', etiqueta: 'Facturación', icono: FileText, visible: true },
    { id: 'documentos', etiqueta: 'Cotizaciones / Facturas', icono: ClipboardList, visible: true },
    { id: 'crm', etiqueta: 'Clientes', icono: Users, visible: true },
    { id: 'proveedores', etiqueta: 'Proveedores', icono: Truck, visible: rol === 'admin' },
    { id: 'gastos', etiqueta: 'Compras / Gastos', icono: Wallet, visible: rol === 'admin' },
    { id: 'reportes', etiqueta: 'Panel y reportes', icono: BarChart3, visible: rol === 'admin' },
    { id: 'historial', etiqueta: 'Historial / BI', icono: Clock, visible: rol === 'admin' },
    { id: 'empleados', etiqueta: 'Empleados', icono: UserCog, visible: rol === 'admin' }
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
        <div className="shrink-0 p-4 border-b border-slate-800">
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
          <img src="/logo.jpg" alt="GLZ Logo" className="w-full max-h-28 object-contain bg-white rounded-xl p-3 mb-3 shadow-sm" />
          <span className="inline-block text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded uppercase font-bold tracking-widest">
            Perfil: {rol}
          </span>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
          {opcionesNavegacion.map((opcion) => {
            const Icono = opcion.icono;
            return (
              <button
                key={opcion.id}
                onClick={() => cambiarVista(opcion.id)}
                className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-left ${vistaActiva === opcion.id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                <Icono size={20} className="shrink-0" />
                <span className="font-medium">{opcion.etiqueta}</span>
              </button>
            );
          })}
        </nav>
        <div className="shrink-0 p-3 border-t border-slate-800 bg-slate-900">
           <p className="text-xs text-emerald-400 mb-3 truncate font-bold text-center uppercase tracking-wider">
             {nombreSeguro}
           </p>
           <button onClick={() => signOut(auth)} className="w-full flex items-center justify-center space-x-2 bg-red-500/10 text-red-400 py-2 rounded-lg hover:bg-red-600 hover:text-white transition-colors border border-red-500/20">
              <LogOut size={16} /> <span className="font-bold text-sm">Cerrar Sesión</span>
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 print:p-0 print:overflow-visible">
        <Suspense fallback={<CargandoModulo />}>
        {vistaActiva === 'inventario' && <ModuloInventario registrarHistorial={registrarHistorialGlobal} rol={rol} usuarioActual={nombreSeguro} />}
        {vistaActiva === 'facturas' && (
          <ModuloFacturacion
            registrarHistorial={registrarHistorialGlobal}
            usuarioActual={nombreSeguro}
            cotizacionOrigen={cotizacionParaFacturar}
            onCotizacionProcesada={() => setCotizacionParaFacturar(null)}
          />
        )}
        {vistaActiva === 'documentos' && (
          <ModuloDocumentos
            onFacturarCotizacion={facturarCotizacion}
            rol={rol}
            usuarioActual={nombreSeguro}
            registrarHistorial={registrarHistorialGlobal}
          />
        )}
        {vistaActiva === 'crm' && <ModuloCRM registrarHistorial={registrarHistorialGlobal} rol={rol} />}
        {vistaActiva === 'proveedores' && rol === 'admin' && <ModuloProveedores registrarHistorial={registrarHistorialGlobal} rol={rol} />}
        {vistaActiva === 'gastos' && rol === 'admin' && <ModuloGastos registrarHistorial={registrarHistorialGlobal} usuarioActual={nombreSeguro} />}
        {vistaActiva === 'reportes' && rol === 'admin' && <ModuloReportes registrarHistorial={registrarHistorialGlobal} />}
        {vistaActiva === 'historial' && rol === 'admin' && <ModuloHistorial />}
        {vistaActiva === 'empleados' && rol === 'admin' && (
          <ModuloEmpleados registrarHistorial={registrarHistorialGlobal} correoActual={usuario.email} />
        )}
        </Suspense>
      </div>
    </div>
  );
}

function PantallaSinAcceso({ estado, correo }) {
  const sinRol = estado === 'sin-rol';

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
        <ShieldAlert size={44} className="mx-auto text-amber-500 mb-4" />
        <h1 className="text-xl font-black text-slate-800 mb-2">
          {sinRol ? 'Su usuario no tiene acceso al sistema' : 'No se pudo verificar su acceso'}
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          {sinRol ? (
            <>La cuenta <b className="text-slate-700 break-all">{correo}</b> no tiene un perfil asignado. Un administrador debe darle acceso desde el módulo Empleados.</>
          ) : (
            'Revise su conexión a internet e intente de nuevo.'
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {!sinRol && (
            <button onClick={() => window.location.reload()} className="bg-emerald-500 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-emerald-600 transition-colors">
              Reintentar
            </button>
          )}
          <button onClick={() => signOut(auth)} className="bg-red-500/10 text-red-600 font-bold py-2.5 px-5 rounded-lg hover:bg-red-600 hover:text-white transition-colors border border-red-500/20">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
