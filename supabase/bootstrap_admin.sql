-- Después de crear el usuario administrador en Supabase Authentication,

insert into public.perfiles (id_usuario, nombre, email, rol, estado)
values ('954f93e9-e283-4344-a756-1a0314dc0af8 'Administrador Digiturno', 'josejavierz@gmail.co', 'Administrador', 'Activo')
on conflict (id_usuario) do update set rol = 'Administrador', estado = 'Activo';
