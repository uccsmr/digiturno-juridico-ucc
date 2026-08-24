-- Digiturno Jurídico UCC · Políticas RLS iniciales
-- Ejecute después de schema.sql.

alter table public.servicios enable row level security;
alter table public.puntos_atencion enable row level security;
alter table public.perfiles enable row level security;
alter table public.usuario_servicio enable row level security;
alter table public.turnos enable row level security;
alter table public.transferencias enable row level security;
alter table public.configuracion enable row level security;
alter table public.auditoria enable row level security;

create or replace function public.mi_rol()
returns text
language sql
security definer
set search_path = public
as $$
  select rol from public.perfiles where id_usuario = auth.uid() and estado = 'Activo' limit 1;
$$;

create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.mi_rol() = 'Administrador', false);
$$;

create or replace function public.es_asesor()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.mi_rol() in ('Administrador','Asesor'), false);
$$;

-- Servicios y puntos: lectura pública para kiosco/pantalla; administración protegida.
drop policy if exists "servicios_select" on public.servicios;
create policy "servicios_select" on public.servicios for select using (true);
drop policy if exists "servicios_admin_all" on public.servicios;
create policy "servicios_admin_all" on public.servicios for all using (public.es_admin()) with check (public.es_admin());

drop policy if exists "puntos_select" on public.puntos_atencion;
create policy "puntos_select" on public.puntos_atencion for select using (true);
drop policy if exists "puntos_admin_all" on public.puntos_atencion;
create policy "puntos_admin_all" on public.puntos_atencion for all using (public.es_admin()) with check (public.es_admin());

-- Configuración: lectura pública; edición solo admin.
drop policy if exists "config_select" on public.configuracion;
create policy "config_select" on public.configuracion for select using (true);
drop policy if exists "config_admin_all" on public.configuracion;
create policy "config_admin_all" on public.configuracion for all using (public.es_admin()) with check (public.es_admin());

-- Perfiles: cada usuario ve su perfil; admin gestiona todo.
drop policy if exists "perfiles_select" on public.perfiles;
create policy "perfiles_select" on public.perfiles for select using (id_usuario = auth.uid() or public.es_admin());
drop policy if exists "perfiles_admin_all" on public.perfiles;
create policy "perfiles_admin_all" on public.perfiles for all using (public.es_admin()) with check (public.es_admin());

-- Relación asesor-servicio.
drop policy if exists "usuario_servicio_select" on public.usuario_servicio;
create policy "usuario_servicio_select" on public.usuario_servicio for select using (id_usuario = auth.uid() or public.es_admin());
drop policy if exists "usuario_servicio_admin_all" on public.usuario_servicio;
create policy "usuario_servicio_admin_all" on public.usuario_servicio for all using (public.es_admin()) with check (public.es_admin());

-- Turnos: lectura pública para pantalla; inserción pública para kiosco; actualización solo asesores/admin.
drop policy if exists "turnos_select" on public.turnos;
create policy "turnos_select" on public.turnos for select using (true);
drop policy if exists "turnos_insert_public" on public.turnos;
create policy "turnos_insert_public" on public.turnos for insert with check (true);
drop policy if exists "turnos_update_asesor" on public.turnos;
create policy "turnos_update_asesor" on public.turnos for update using (public.es_asesor()) with check (public.es_asesor());
drop policy if exists "turnos_delete_admin" on public.turnos;
create policy "turnos_delete_admin" on public.turnos for delete using (public.es_admin());

-- Transferencias y auditoría.
drop policy if exists "transferencias_select" on public.transferencias;
create policy "transferencias_select" on public.transferencias for select using (public.es_asesor());
drop policy if exists "transferencias_insert" on public.transferencias;
create policy "transferencias_insert" on public.transferencias for insert with check (public.es_asesor());

drop policy if exists "auditoria_select" on public.auditoria;
create policy "auditoria_select" on public.auditoria for select using (public.es_admin());
drop policy if exists "auditoria_insert" on public.auditoria;
create policy "auditoria_insert" on public.auditoria for insert with check (true);
