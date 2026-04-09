# 🛠️ Sistema GLZ Cloud - ERP & POS

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)

Plataforma integral de gestión empresarial desarrollada a medida. Diseñada para centralizar y optimizar las operaciones de venta, control de stock y análisis de clientes, con arquitectura en la nube y persistencia de datos en tiempo real.

## ✨ Módulos Principales

* 📦 **Gestión de Inventario (Multi-Sucursal):** Control de stock segmentado por localidades, estructuración de costos y categorización visual de precios de venta (Verde, Amarillo, Rojo).
* 📄 **Facturación Inteligente:** Sistema POS con cálculo de subtotales, catálogo dinámico con buscador en tiempo real y generación de documentos para impresión por coordenadas (formato oficial).
* 👥 **CRM (Directorio de Clientes):** Registro detallado de clientes con formato estandarizado, historial de transacciones y seguimiento de líneas de crédito.
* 📊 **Business Intelligence (BI):** Panel analítico con KPIs por cliente, detección de productos estrella, consolidado de compras y gestión de deudas/abonos.
* 🔐 **Seguridad y RBAC:** Autenticación por Firebase Auth con Control de Acceso Basado en Roles (Administrador vs. Vendedor) para proteger datos financieros y acciones destructivas.

## 🚀 Instalación y Despliegue Local

Para correr este proyecto en un entorno de desarrollo local:

1. Clonar el repositorio:
   ```bash
   git clone [https://github.com/ElAiwan/Sistema-GLZ.git](https://github.com/ElAiwan/Sistema-GLZ.git)

2. Instalar las dependencias:
    ```bash
    npm install

3. Configurar las variables de entorno de Firebase creando un archivo .env en la raíz del proyecto.

4. Iniciar el servidor local:
    ```bash
    npm run dev

🏗️ Arquitectura
* Frontend: React (Hooks, Functional Components) + Tailwind CSS para UI/UX responsive.

* Backend & BaaS: Firebase Cloud Firestore (Base de datos NoSQL) y Firebase Authentication.

* Estructura: Modularizada por componentes de negocio para alta mantenibilidad y escalabilidad.