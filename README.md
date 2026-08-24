# digiturno-juridico-ucc
# Digiturno Jurídico UCC · GitHub Pages + Supabase

Versión inicial migrada desde PHP/MySQL/XAMPP hacia una arquitectura estática con **HTML, CSS, JavaScript y Supabase**.

## Arquitectura

- **Frontend:** GitHub Pages
- **Autenticación:** Supabase Auth
- **Base de datos:** Supabase PostgreSQL
- **Tiempo real:** Supabase Realtime sobre tabla `turnos`
- **Pantalla TV:** escucha cambios en tiempo real y pronuncia el turno con Web Speech API

## Estructura

```text
digiturno_supabase_github_v1/
├── index.html
├── css/styles.css
├── js/app.js
├── js/supabase-config.js
├── assets/img/
├── assets/videos/
└── supabase/
    ├── schema.sql
    ├── rls_policies.sql
    └── bootstrap_admin.sql
```

## 1. Crear proyecto Supabase

1. Entre a Supabase.
2. Cree un nuevo proyecto.
3. Cree/active la base de datos.
4. En **SQL Editor**, ejecute en este orden:

```text
supabase/schema.sql
supabase/rls_policies.sql
```

## 2. Crear usuario administrador

1. Vaya a **Authentication > Users**.
2. Cree un usuario con correo y contraseña.
3. Copie el UUID del usuario.
4. Abra `supabase/bootstrap_admin.sql`.
5. Reemplace `REEMPLACE_UUID_AUTH_USER` por el UUID real.
6. Ejecute el script en **SQL Editor**.

## 3. Configurar el frontend

Abra:

```text
js/supabase-config.js
```

Pegue los datos del proyecto:

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'xxxxx';
export const SUPABASE_CONFIG_READY = true;
```

## 4. Probar localmente

Por seguridad de módulos ES, use un servidor local simple:

```bash
python -m http.server 8080
```

Abra:

```text
http://localhost:8080
```

## 5. Publicar en GitHub Pages

1. Cree un repositorio, por ejemplo `digiturno-juridico`.
2. Suba todos los archivos de esta carpeta.
3. En GitHub: **Settings > Pages**.
4. Seleccione rama `main` y carpeta `/root`.
5. Publique.

## Rutas de la aplicación

```text
#/login          Acceso administrador/asesor
#/dashboard      Inicio
#/asesor         Panel asesor
#/servicios      Gestión de servicios
#/puntos         Gestión de puntos
#/usuarios       Perfiles y asignaciones
#/reportes       Reportes básicos
#/configuracion  Configuración general
#/kiosco         Toma de turnos
#/pantalla       Pantalla TV
```

## Flujo operativo

1. El usuario toma un turno desde `#/kiosco`.
2. El turno se guarda en Supabase con estado `En espera`.
3. La Pantalla TV `#/pantalla` muestra turnos generados y llamados.
4. El asesor entra a `#/asesor`.
5. El asesor llama el siguiente turno disponible de sus servicios asignados.
6. La Pantalla TV actualiza el bloque **LLAMANDO** y pronuncia el turno.
7. El asesor puede repetir llamado, iniciar atención, finalizar o marcar ausente.

## Llamado inclusivo

La pantalla usa el sintetizador de voz del navegador. Debe presionar una vez:

```text
Activar sonido
```

Esto es obligatorio por políticas del navegador contra audio automático.

## Configuración de video

En `#/configuracion`, campo **Videos pantalla**, escriba una ruta por línea:

```text
assets/videos/Balance_social_2025.mp4
```

Si el video es pesado, se recomienda subirlo a un servicio de video o almacenamiento y colocar la URL directa.

## Nota importante sobre usuarios

Desde una app estática en GitHub Pages no se debe crear usuarios de Supabase Auth directamente con permisos de administrador desde el navegador. Por eso el flujo recomendado es:

1. Crear el usuario en **Supabase Authentication**.
2. Crear/asignar su perfil en el módulo **Usuarios** usando el UUID.

Esto mantiene separada la autenticación real de los perfiles y roles del Digiturno.
