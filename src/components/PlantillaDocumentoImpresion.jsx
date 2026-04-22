import PlantillaCotizacionComercial from './PlantillaCotizacionComercial';
import PlantillaDocumentoComercial from './PlantillaDocumentoComercial';

const esCotizacion = (tipo) => {
  const normalizado = `${tipo || ''}`.toLowerCase();
  return normalizado.includes('cotización') || normalizado.includes('cotizacion');
};

export default function PlantillaDocumentoImpresion({ documento, soloImpresion = false }) {
  if (esCotizacion(documento?.tipo)) {
    return <PlantillaCotizacionComercial documento={documento} soloImpresion={soloImpresion} />;
  }

  return <PlantillaDocumentoComercial documento={documento} soloImpresion={soloImpresion} />;
}

