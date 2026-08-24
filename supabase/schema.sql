-- Digiturno Jurídico UCC · Supabase PostgreSQL
-- Ejecute este archivo en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.servicios (
  id_servicio bigserial primary key,
  nombre_servicio text not null,
  prefijo varchar(8) not null,
  descripcion text,
  color varchar(20) default '#0A84FF',
  estado text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  prioridad integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.puntos_atencion (
  id_punto bigserial primary key,
  nombre_punto text not null,
  descripcion text,
  estado text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  created_at timestamptz not null default now()
);

create table if not exists public.perfiles (
  id_usuario uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text,
  rol text not null check (rol in ('Administrador','Asesor','Pantalla')),
  id_punto_atencion bigint references public.puntos_atencion(id_punto),
  estado text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  created_at timestamptz not null default now()
);

create table if not exists public.usuario_servicio (
  id bigserial primary key,
  id_usuario uuid not null references public.perfiles(id_usuario) on delete cascade,
  id_servicio bigint not null references public.servicios(id_servicio) on delete cascade,
  unique(id_usuario, id_servicio)
);

create table if not exists public.turnos (
  id_turno bigserial primary key,
  codigo_turno varchar(30) not null,
  id_servicio bigint not null references public.servicios(id_servicio),
  id_usuario_asesor uuid references public.perfiles(id_usuario),
  id_punto_atencion bigint references public.puntos_atencion(id_punto),
  estado text not null default 'En espera' check (estado in ('Generado','En espera','Llamado','En atención','Atendido','Ausente','Transferido','Cancelado')),
  fecha date not null default current_date,
  hora_generado timestamptz not null default now(),
  hora_llamado timestamptz,
  hora_inicio_atencion timestamptz,
  hora_fin_atencion timestamptz,
  tiempo_espera integer default 0,
  tiempo_atencion integer default 0,
  prioridad integer not null default 1,
  llamado_version integer not null default 0,
  observacion text
);

create index if not exists idx_turnos_fecha_estado on public.turnos(fecha, estado);
create index if not exists idx_turnos_servicio_fecha on public.turnos(id_servicio, fecha);
create index if not exists idx_turnos_asesor_estado on public.turnos(id_usuario_asesor, estado);

create table if not exists public.transferencias (
  id_transferencia bigserial primary key,
  id_turno bigint not null references public.turnos(id_turno) on delete cascade,
  id_servicio_origen bigint references public.servicios(id_servicio),
  id_servicio_destino bigint references public.servicios(id_servicio),
  id_usuario_origen uuid references public.perfiles(id_usuario),
  fecha_hora timestamptz not null default now(),
  observacion text
);

create table if not exists public.configuracion (
  id_configuracion integer primary key default 1,
  nombre_entidad text not null default 'Consultorio Jurídico y Centro de Conciliación',
  logo text default 'assets/img/logo_ucc_horizontal.png',
  logo_pantalla text default 'assets/img/logo_consultorio_juridico.png',
  mensaje_pantalla text default 'Bienvenido. Tome asiento y esté atento al llamado de su turno.',
  videos_pantalla text default 'assets/videos/Balance_social_2025.mp4',
  franja_inferior text default 'Consultorio Jurídico y Centro de Conciliación · Universidad Cooperativa de Colombia · Bienvenido al Digiturno · Consulte su turno en pantalla y diríjase al punto de atención indicado.',
  tiempo_actualizacion integer not null default 3000,
  color_principal varchar(20) default '#00ACC9',
  color_secundario varchar(20) default '#80BA27',
  updated_at timestamptz not null default now()
);

create table if not exists public.auditoria (
  id_auditoria bigserial primary key,
  id_usuario uuid,
  accion text not null,
  descripcion text,
  fecha_hora timestamptz not null default now(),
  ip text
);

-- Datos iniciales
insert into public.servicios (nombre_servicio, prefijo, descripcion, color, prioridad) values
('Asesoría Jurídica', 'ASE', 'Orientación jurídica inicial', '#0A84FF', 1),
('Conciliación', 'CON', 'Solicitud o información de conciliación', '#00B894', 1),
('Información General', 'INF', 'Orientación y recepción inicial', '#00ACC9', 1),
('Radicación', 'RAD', 'Radicación y gestión documental', '#FF9500', 1),
('Bienestar', 'BIE', 'Orientación de bienestar institucional', '#80BA27', 1)
on conflict do nothing;

insert into public.puntos_atencion (nombre_punto, descripcion) values
('Módulo 1', 'Punto de atención principal'),
('Módulo 2', 'Punto de atención secundario'),
('Módulo 3', 'Punto de atención general'),
('Consultorio 1', 'Consultorio de atención jurídica'),
('Consultorio 2', 'Consultorio de atención jurídica'),
('Centro de Conciliación', 'Punto especializado de conciliación')
on conflict do nothing;

insert into public.configuracion (id_configuracion) values (1)
on conflict (id_configuracion) do nothing;

-- Función para generar turnos de forma centralizada.
create or replace function public.generar_turno(p_id_servicio bigint)
returns public.turnos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio public.servicios%rowtype;
  v_consecutivo integer;
  v_codigo text;
  v_turno public.turnos%rowtype;
begin
  select * into v_servicio
  from public.servicios
  where id_servicio = p_id_servicio and estado = 'Activo';

  if not found then
    raise exception 'Servicio no disponible';
  end if;

  select coalesce(count(*),0) + 1 into v_consecutivo
  from public.turnos
  where id_servicio = p_id_servicio and fecha = current_date;

  v_codigo := v_servicio.prefijo || '-' || lpad(v_consecutivo::text, 3, '0');

  insert into public.turnos (codigo_turno, id_servicio, estado, fecha, hora_generado, prioridad)
  values (v_codigo, p_id_servicio, 'En espera', current_date, now(), coalesce(v_servicio.prioridad,1))
  returning * into v_turno;

  return v_turno;
end;
$$;

grant execute on function public.generar_turno(bigint) to anon, authenticated;

-- Habilitar realtime para la Pantalla TV.
alter publication supabase_realtime add table public.turnos;
alter publication supabase_realtime add table public.configuracion;
