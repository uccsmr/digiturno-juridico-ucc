import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIG_READY } from './supabase-config.js';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const app = $('#app');
const today = () => new Date().toISOString().slice(0,10);
const fmtTime = v => v ? new Date(v).toLocaleTimeString('es-CO') : '-';
const escapeHtml = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pad = n => String(n).padStart(2,'0');
const delay = ms => new Promise(r => setTimeout(r, ms));

let supabase = null;
let currentSession = null;
let currentProfile = null;
let appConfig = null;
let tvChannel = null;
let advisorTimer = null;
let tvTimer = null;
let soundEnabled = false;
let lastSpokenKey = null;
let playlist = [];
let playlistKey = '';
let currentVideoIndex = 0;

if (!SUPABASE_CONFIG_READY) {
  app.innerHTML = setupPendingView();
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  boot();
}

async function boot(){
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  await loadConfig();
  supabase.auth.onAuthStateChange(async (_event, session) => {
    currentSession = session;
    currentProfile = null;
    await loadConfig();
    renderRoute();
  });
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}

function setupPendingView(){
  return `<main class="login-page"><section class="login-card">
    <img src="assets/img/logo_ucc_horizontal.png" alt="UCC">
    <h1>Digiturno Supabase</h1>
    <div class="alert alert-info">Falta configurar Supabase.</div>
    <p>Abra <b>js/supabase-config.js</b>, pegue la URL y la llave pública anon, y cambie <b>SUPABASE_CONFIG_READY</b> a <b>true</b>.</p>
  </section></main>`;
}

async function loadConfig(){
  if (!supabase) return;
  const { data } = await supabase.from('configuracion').select('*').eq('id_configuracion', 1).maybeSingle();
  appConfig = data || {
    nombre_entidad:'Consultorio Jurídico y Centro de Conciliación',
    logo:'assets/img/logo_ucc_horizontal.png',
    logo_pantalla:'assets/img/logo_consultorio_juridico.png',
    mensaje_pantalla:'Bienvenido. Tome asiento y esté atento al llamado de su turno.',
    videos_pantalla:'assets/videos/Balance_social_2025.mp4',
    franja_inferior:'Consultorio Jurídico y Centro de Conciliación · Universidad Cooperativa de Colombia · Bienvenido al Digiturno',
    tiempo_actualizacion:3000
  };
}

async function loadProfile(){
  if (currentProfile) return currentProfile;
  if (!currentSession) return null;
  const { data, error } = await supabase
    .from('perfiles')
    .select('*, puntos_atencion(nombre_punto)')
    .eq('id_usuario', currentSession.user.id)
    .maybeSingle();
  if (error) console.warn(error.message);
  currentProfile = data;
  return currentProfile;
}

function routeName(){ return (location.hash || '#login').replace('#','').split('?')[0]; }
function isAdmin(){ return currentProfile?.rol === 'Administrador'; }
function isAdvisor(){ return ['Administrador','Asesor'].includes(currentProfile?.rol); }

async function renderRoute(){
  clearIntervals();
  const route = routeName();
  if (route === 'kiosco') return renderKiosk();
  if (route === 'pantalla') return renderScreen();
  if (!currentSession) return renderLogin();
  await loadProfile();
  if (!currentProfile) return renderNoProfile();
  if (route === 'login') location.hash = '#dashboard';
  const protectedRoutes = ['dashboard','asesor','servicios','puntos','usuarios','reportes','configuracion'];
  const finalRoute = protectedRoutes.includes(routeName()) ? routeName() : 'dashboard';
  renderLayout(finalRoute);
}

function clearIntervals(){
  if (advisorTimer) clearInterval(advisorTimer);
  if (tvTimer) clearInterval(tvTimer);
  advisorTimer = null; tvTimer = null;
  if (tvChannel) { supabase.removeChannel(tvChannel); tvChannel = null; }
}

function renderLogin(){
  app.innerHTML = `<main class="login-page"><section class="login-card">
    <img src="${appConfig?.logo || 'assets/img/logo_ucc_horizontal.png'}" alt="UCC">
    <h1>Digiturno Jurídico</h1>
    <p>Acceso para administradores y asesores.</p>
    <div id="loginMsg"></div>
    <form id="loginForm" class="form-stack">
      <label>Correo<input name="email" type="email" required placeholder="admin@correo.com" autocomplete="username"></label>
      <label>Contraseña<input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn btn-primary" type="submit">Ingresar</button>
    </form>
    <div class="action-row" style="justify-content:center;margin-top:16px">
      <a class="btn btn-outline" href="#kiosco">Abrir Kiosco</a>
      <a class="btn btn-outline" href="#pantalla">Abrir Pantalla TV</a>
    </div>
  </section></main>`;
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = $('#loginMsg');
    msg.innerHTML = '';
    const { error } = await supabase.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('password') });
    if (error) msg.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
  });
}

function renderNoProfile(){
  app.innerHTML = `<main class="login-page"><section class="login-card">
    <img src="${appConfig?.logo || 'assets/img/logo_ucc_horizontal.png'}" alt="UCC">
    <h1>Perfil pendiente</h1>
    <div class="alert alert-info">Su cuenta existe en Supabase Auth, pero todavía no tiene perfil en la tabla <b>perfiles</b>.</div>
    <p>Solicite al administrador crear su perfil con el ID:</p>
    <code>${currentSession.user.id}</code>
    <div class="action-row" style="justify-content:center;margin-top:18px"><button class="btn btn-danger" id="logoutBtn">Cerrar sesión</button></div>
  </section></main>`;
  $('#logoutBtn').addEventListener('click', () => supabase.auth.signOut());
}

function renderLayout(section){
  app.innerHTML = `<div class="app-layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo"><img src="${appConfig?.logo || 'assets/img/logo_ucc_horizontal.png'}" alt="UCC"></div>
        <div><strong>Digiturno Jurídico</strong><small>${escapeHtml(currentProfile.rol)}</small></div>
      </div>
      <nav>
        <a href="#dashboard" data-nav="dashboard">Inicio</a>
        ${isAdvisor()?'<a href="#asesor" data-nav="asesor">Panel Asesor</a>':''}
        ${isAdmin()?'<a href="#servicios" data-nav="servicios">Servicios</a><a href="#puntos" data-nav="puntos">Puntos de atención</a><a href="#usuarios" data-nav="usuarios">Usuarios</a><a href="#reportes" data-nav="reportes">Reportes</a><a href="#configuracion" data-nav="configuracion">Configuración</a>':''}
        <a href="#kiosco" target="_blank">Abrir Kiosco</a>
        <a href="#pantalla" target="_blank">Abrir Pantalla TV</a>
      </nav>
      <div class="sidebar-footer"><span>${escapeHtml(currentProfile.nombre || currentProfile.email || '')}</span><button class="btn btn-danger btn-small" id="logoutBtn">Cerrar sesión</button></div>
    </aside>
    <main class="content" id="content"></main>
  </div>`;
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === section));
  $('#logoutBtn').addEventListener('click', () => supabase.auth.signOut());
  if (section === 'dashboard') renderDashboard();
  if (section === 'asesor') renderAdvisor();
  if (section === 'servicios') renderServices();
  if (section === 'puntos') renderPoints();
  if (section === 'usuarios') renderUsers();
  if (section === 'reportes') renderReports();
  if (section === 'configuracion') renderConfig();
}

async function renderDashboard(){
  const c = $('#content');
  const { data: turns } = await supabase.from('turnos').select('estado,id_turno').eq('fecha', today());
  const total = turns?.length || 0;
  const espera = turns?.filter(t => t.estado === 'En espera').length || 0;
  const llamados = turns?.filter(t => t.estado === 'Llamado').length || 0;
  const atendidos = turns?.filter(t => t.estado === 'Atendido').length || 0;
  c.innerHTML = `<div class="topbar"><div><h1>Inicio</h1><p>Panel Principal Digiturno Consultorio Jurídico.</p></div></div>
  <section class="grid stats-grid">
    <article class="stat-card"><span>Turnos hoy</span><strong>${total}</strong></article>
    <article class="stat-card"><span>En espera</span><strong>${espera}</strong></article>
    <article class="stat-card"><span>Llamados</span><strong>${llamados}</strong></article>
    <article class="stat-card"><span>Atendidos</span><strong>${atendidos}</strong></article>
  </section>
  <section class="grid two-columns">
    <article class="panel"><h2>Arquitectura</h2><p>Dashboard Digiturno Consultorio Jurídico - Santa Marta.</p></article>
    <article class="panel"><h2>Accesos rápidos</h2><div class="action-row"><a class="btn btn-primary" href="#kiosco">Kiosco</a><a class="btn btn-secondary" href="#pantalla">Pantalla TV</a><a class="btn btn-outline" href="#asesor">Panel Asesor</a></div></article>
  </section>`;
}

async function renderKiosk(){
  await loadConfig();
  const { data: services } = await supabase.from('servicios').select('*').eq('estado','Activo').order('prioridad').order('nombre_servicio');
  app.innerHTML = `<main class="kiosk-page"><section class="kiosk">
    <header class="kiosk-header"><div><img src="${appConfig.logo_pantalla || appConfig.logo || 'assets/img/logo_consultorio_juridico.png'}" alt="Consultorio Jurídico"><h1>Solicite su turno</h1><p>Seleccione el servicio que necesita.</p></div><a class="btn btn-outline" href="#login">Administración</a></header>
    <section class="service-grid">${(services||[]).map(s => `<button class="service-button" style="--service-color:${s.color || '#0A84FF'}" data-service="${s.id_servicio}"><span class="service-prefix">${escapeHtml(s.prefijo)}</span><strong>${escapeHtml(s.nombre_servicio)}</strong><small>${escapeHtml(s.descripcion || '')}</small></button>`).join('')}</section>
  </section></main>`;
  $$('.service-button').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const { data, error } = await supabase.rpc('generar_turno', { p_id_servicio: Number(btn.dataset.service) });
      if (error) throw error;
      showTicket(data.codigo_turno, services.find(s => s.id_servicio == btn.dataset.service)?.nombre_servicio || 'Servicio');
    } catch(err) { alert(err.message); }
    btn.disabled = false;
  }));
}

function showTicket(codigo, servicio){
  const modal = document.createElement('div');
  modal.className = 'ticket-modal';
  modal.innerHTML = `<section class="ticket-card"><h3>Turno generado</h3><h2>${escapeHtml(codigo)}</h2><p>${escapeHtml(servicio)}</p><p class="muted">Tome asiento y esté atento al llamado en pantalla.</p><button class="btn btn-primary" id="closeTicket">Aceptar</button></section>`;
  document.body.appendChild(modal);
  $('#closeTicket', modal).addEventListener('click', () => modal.remove());
  setTimeout(() => modal.remove(), 9000);
}

async function renderAdvisor(){
  const c = $('#content');
  c.innerHTML = `<div class="topbar"><div><h1>Panel Asesor</h1><p>Gestión del llamado, atención y cierre de turnos.</p></div></div><div id="advisorContent"></div>`;
  await loadAdvisor();
  advisorTimer = setInterval(loadAdvisor, 3000);
}

async function advisorServiceIds(){
  if (isAdmin()) {
    const { data } = await supabase.from('servicios').select('id_servicio').eq('estado','Activo');
    return (data || []).map(x => x.id_servicio);
  }
  const { data } = await supabase.from('usuario_servicio').select('id_servicio').eq('id_usuario', currentProfile.id_usuario);
  return (data || []).map(x => x.id_servicio);
}

async function loadAdvisor(){
  await loadProfile();
  const box = $('#advisorContent');
  if (!box) return;
  if (!currentProfile.id_punto_atencion) {
    box.innerHTML = `<div class="alert alert-danger">Este asesor no tiene punto de atención asignado. Así se evita que el sistema muestre “Punto pendiente”.</div>`;
    return;
  }
  const serviceIds = await advisorServiceIds();
  if (!serviceIds.length) {
    box.innerHTML = `<div class="alert alert-danger">Este asesor no tiene servicios asignados.</div>`;
    return;
  }
  const { data: active } = await supabase.from('turnos').select('*, servicios(nombre_servicio,prefijo), puntos_atencion(nombre_punto)').eq('id_usuario_asesor', currentProfile.id_usuario).in('estado',['Llamado','En atención']).order('hora_llamado',{ascending:false}).limit(1).maybeSingle();
  const { data: pending } = await supabase.from('turnos').select('*, servicios(nombre_servicio,prefijo)').eq('fecha', today()).in('estado',['En espera','Transferido']).in('id_servicio', serviceIds).order('prioridad',{ascending:false}).order('hora_generado',{ascending:true}).limit(20);
  const { data: history } = await supabase.from('turnos').select('*, servicios(nombre_servicio,prefijo)').eq('fecha', today()).eq('id_usuario_asesor', currentProfile.id_usuario).in('estado',['Atendido','Ausente']).order('hora_fin_atencion',{ascending:false}).limit(8);
  box.innerHTML = `<section class="grid two-columns">
    <article class="panel"><div class="panel-header"><h2>Turno actual</h2><span class="badge">${escapeHtml(currentProfile.puntos_atencion?.nombre_punto || 'Sin punto')}</span></div>${renderCurrentTurn(active)}</article>
    <article class="panel"><h2>Acciones</h2><div class="action-row">
      <button class="btn btn-primary" id="btnCallNext" ${active?'disabled':''}>Llamar siguiente</button>
      <button class="btn btn-warning" id="btnRepeat" ${!active?'disabled':''}>Repetir llamado</button>
      <button class="btn btn-secondary" id="btnStart" ${!active || active.estado !== 'Llamado'?'disabled':''}>Usuario presente</button>
      <button class="btn btn-primary" id="btnFinish" ${!active?'disabled':''}>Finalizar</button>
      <button class="btn btn-danger" id="btnAbsent" ${!active?'disabled':''}>Ausente</button>
    </div><p class="muted">Mientras tenga un turno llamado o en atención, finalícelo o márquelo ausente antes de llamar el siguiente.</p></article>
  </section>
  <section class="panel"><div class="panel-header"><h2>Turnos pendientes</h2><span class="badge">${pending?.length || 0}</span></div><div class="table-responsive"><table><thead><tr><th>Turno</th><th>Servicio</th><th>Hora</th><th>Acción</th></tr></thead><tbody>${(pending||[]).map(t => `<tr><td><b>${escapeHtml(t.codigo_turno)}</b></td><td>${escapeHtml(t.servicios?.nombre_servicio || '')}</td><td>${fmtTime(t.hora_generado)}</td><td><button class="btn btn-small btn-primary" data-call="${t.id_turno}" ${active?'disabled':''}>Llamar</button></td></tr>`).join('') || '<tr><td colspan="4">No hay turnos pendientes.</td></tr>'}</tbody></table></div></section>
  <section class="panel"><h2>Historial del día</h2><div class="table-responsive"><table><thead><tr><th>Turno</th><th>Servicio</th><th>Estado</th><th>Fin</th></tr></thead><tbody>${(history||[]).map(t => `<tr><td><b>${escapeHtml(t.codigo_turno)}</b></td><td>${escapeHtml(t.servicios?.nombre_servicio || '')}</td><td><span class="badge">${escapeHtml(t.estado)}</span></td><td>${fmtTime(t.hora_fin_atencion)}</td></tr>`).join('') || '<tr><td colspan="4">Sin historial.</td></tr>'}</tbody></table></div></section>`;
  $('#btnCallNext')?.addEventListener('click', () => callNext(pending?.[0]?.id_turno));
  $('#btnRepeat')?.addEventListener('click', () => repeatCall(active?.id_turno, active?.llamado_version || 0));
  $('#btnStart')?.addEventListener('click', () => startAttention(active?.id_turno));
  $('#btnFinish')?.addEventListener('click', () => closeTurn(active?.id_turno, 'Atendido'));
  $('#btnAbsent')?.addEventListener('click', () => closeTurn(active?.id_turno, 'Ausente'));
  $$('[data-call]').forEach(b => b.addEventListener('click', () => callNext(Number(b.dataset.call))));
}

function renderCurrentTurn(t){
  if (!t) return `<div class="alert alert-info">No hay turno activo.</div>`;
  return `<div style="font-size:52px;font-weight:950;color:#0A84FF">${escapeHtml(t.codigo_turno)}</div><p><b>${escapeHtml(t.servicios?.nombre_servicio || '')}</b></p><p>Estado: <span class="badge">${escapeHtml(t.estado)}</span></p><p>Punto: <b>${escapeHtml(t.puntos_atencion?.nombre_punto || currentProfile.puntos_atencion?.nombre_punto || '')}</b></p>`;
}

async function callNext(idTurno){
  if (!idTurno) return alert('No hay turnos pendientes.');
  const { data: active } = await supabase.from('turnos').select('id_turno').eq('id_usuario_asesor', currentProfile.id_usuario).in('estado',['Llamado','En atención']).limit(1);
  if (active?.length) return alert('Tiene un turno activo. Finalícelo o márquelo ausente antes de llamar otro.');
  const now = new Date();
  const { data: turno } = await supabase.from('turnos').select('hora_generado,llamado_version').eq('id_turno', idTurno).single();
  const wait = turno?.hora_generado ? Math.max(0, Math.round((now - new Date(turno.hora_generado))/1000)) : 0;
  const { error } = await supabase.from('turnos').update({
    estado:'Llamado', id_usuario_asesor:currentProfile.id_usuario, id_punto_atencion:currentProfile.id_punto_atencion,
    hora_llamado:now.toISOString(), tiempo_espera:wait, llamado_version:(turno?.llamado_version || 0) + 1
  }).eq('id_turno', idTurno);
  if (error) return alert(error.message);
  await loadAdvisor();
}
async function repeatCall(idTurno, version){
  if (!idTurno) return;
  const { error } = await supabase.from('turnos').update({ hora_llamado:new Date().toISOString(), llamado_version:version + 1 }).eq('id_turno', idTurno);
  if (error) alert(error.message); else await loadAdvisor();
}
async function startAttention(idTurno){
  if (!idTurno) return;
  const { error } = await supabase.from('turnos').update({ estado:'En atención', hora_inicio_atencion:new Date().toISOString() }).eq('id_turno', idTurno);
  if (error) alert(error.message); else await loadAdvisor();
}
async function closeTurn(idTurno, estado){
  if (!idTurno) return;
  const now = new Date();
  const { data: turno } = await supabase.from('turnos').select('hora_inicio_atencion').eq('id_turno', idTurno).single();
  const attention = turno?.hora_inicio_atencion ? Math.max(0, Math.round((now - new Date(turno.hora_inicio_atencion))/1000)) : 0;
  const { error } = await supabase.from('turnos').update({ estado, hora_fin_atencion:now.toISOString(), tiempo_atencion:attention }).eq('id_turno', idTurno);
  if (error) alert(error.message); else await loadAdvisor();
}

async function renderScreen(){
  await loadConfig();
  app.innerHTML = `<main class="screen-page"><section class="tv-screen"><div class="tv-shell">
    <header class="tv-header"><div class="tv-header-left"><img src="${appConfig.logo_pantalla || appConfig.logo || 'assets/img/logo_consultorio_juridico.png'}" class="tv-logo" alt="Logo"><div class="tv-title-wrap"><h1>${escapeHtml(appConfig.nombre_entidad || 'Digiturno Jurídico')}</h1><p id="tvMensaje">${escapeHtml(appConfig.mensaje_pantalla || '')}</p></div></div><div class="tv-clock-box"><div class="tv-clock-time" id="clock">--:--:--</div><div class="tv-clock-date" id="currentDate">--</div></div></header>
    <section class="tv-layout"><aside class="tv-sidebar"><div class="tv-panel-heading"><span class="tv-panel-icon">🔊</span><span>Turnos en pantalla</span></div><div class="tv-last-list" id="lastCallsBody"><article class="tv-last-card empty">Sin turnos</article></div></aside>
      <section class="tv-main"><div class="tv-panel-heading"><span class="tv-panel-icon">▶</span><span>Información institucional</span></div><section class="tv-video-card"><div class="tv-video-stage"><video id="tvVideoPlayer" class="hidden" autoplay muted controls playsinline></video><iframe id="tvVideoFrame" class="hidden" allow="autoplay; encrypted-media" allowfullscreen></iframe><div class="tv-video-placeholder" id="tvVideoPlaceholder">Configure videos desde administración.</div></div></section>
      <section class="tv-call-banner" id="calledCard"><div class="tv-call-left"><div class="tv-call-label">📢 LLAMANDO:</div><div class="tv-call-service" id="calledService">En espera de llamados</div><div class="tv-call-point">Diríjase a: <strong id="calledPoint">---</strong></div></div><div class="tv-call-right"><div class="tv-call-code" id="calledTurn">---</div><button id="enableSound" class="btn btn-secondary tv-sound-btn" type="button">Activar sonido</button></div></section></section></section>
    <section class="tv-ticker"><div class="tv-ticker-track"><span id="tickerText">${escapeHtml(appConfig.franja_inferior || '')}</span></div></section></div></section></main>`;
  $('#enableSound').addEventListener('click', () => { soundEnabled = true; $('#enableSound').textContent = 'Sonido activo'; speak('Sonido activado.'); });
  updateTvClock(); loadTvData(); setupPlaylist();
  tvTimer = setInterval(() => { updateTvClock(); loadTvData(); }, Number(appConfig.tiempo_actualizacion || 3000));
  tvChannel = supabase.channel('turnos-tv').on('postgres_changes', { event:'*', schema:'public', table:'turnos' }, loadTvData).subscribe();
}

function updateTvClock(){
  const now = new Date();
  $('#clock') && ($('#clock').textContent = now.toLocaleTimeString('es-CO'));
  $('#currentDate') && ($('#currentDate').textContent = now.toLocaleDateString('es-CO',{weekday:'long',year:'numeric',month:'long',day:'numeric'}));
}
async function loadTvData(){
  const { data: actual } = await supabase.from('turnos').select('*, servicios(nombre_servicio,prefijo), puntos_atencion(nombre_punto)').eq('fecha', today()).eq('estado','Llamado').not('hora_llamado','is',null).order('hora_llamado',{ascending:false}).limit(1).maybeSingle();
  const { data: listado } = await supabase.from('turnos').select('*, servicios(nombre_servicio,prefijo), puntos_atencion(nombre_punto)').eq('fecha', today()).in('estado',['En espera','Llamado','En atención']).order('hora_llamado',{ascending:false, nullsFirst:false}).order('hora_generado',{ascending:false}).limit(6);
  if (actual) {
    $('#calledTurn').textContent = actual.codigo_turno;
    $('#calledService').textContent = actual.servicios?.nombre_servicio || 'Servicio';
    $('#calledPoint').textContent = actual.puntos_atencion?.nombre_punto || 'Punto pendiente';
    const key = `${actual.id_turno}-${actual.llamado_version}`;
    if (lastSpokenKey && lastSpokenKey !== key) flashCall();
    if (lastSpokenKey !== key) { lastSpokenKey = key; speakTurn(actual); }
  } else {
    $('#calledTurn').textContent = '---'; $('#calledService').textContent = 'En espera de llamados'; $('#calledPoint').textContent = '---';
  }
  const list = $('#lastCallsBody');
  list.innerHTML = (listado||[]).map((t,i)=>`<article class="tv-last-card"><div class="tv-last-number">${pad(i+1)}</div><div class="tv-last-info"><div class="tv-last-title">${escapeHtml(t.servicios?.nombre_servicio || '')}</div><div class="tv-last-code">${escapeHtml(t.codigo_turno)}</div><div class="tv-last-point">${escapeHtml(t.puntos_atencion?.nombre_punto || (t.estado === 'En espera' ? 'En espera' : '-'))}</div></div></article>`).join('') || '<article class="tv-last-card empty">Sin turnos</article>';
}
function flashCall(){ $('#calledCard')?.classList.add('flash'); setTimeout(()=>$('#calledCard')?.classList.remove('flash'),1400); }
function codeToSpeech(code=''){
  const [pre='', num=''] = String(code).split('-');
  const digits = {'0':'cero','1':'uno','2':'dos','3':'tres','4':'cuatro','5':'cinco','6':'seis','7':'siete','8':'ocho','9':'nueve'};
  return `${pre.split('').join(' ')}, ${num.split('').map(d=>digits[d]||d).join(' ')}`;
}
function speak(text){
  if (!soundEnabled || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text); utter.lang='es-CO'; utter.rate=.88; utter.pitch=1; window.speechSynthesis.speak(utter);
}
function speakTurn(t){
  const point = t.puntos_atencion?.nombre_punto || 'punto pendiente';
  speak(`Turno ${codeToSpeech(t.codigo_turno)}. ${t.servicios?.nombre_servicio || ''}. Dirigirse a ${point}.`);
}
function setupPlaylist(){
  const items = String(appConfig.videos_pantalla || '').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const key = JSON.stringify(items); if (key === playlistKey) return; playlistKey = key; playlist = items; currentVideoIndex=0; playVideo(0);
}
function assetUrl(url){ if (!url) return ''; if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url; return url; }
function youtubeEmbed(url){ try { if (/youtu\.be\//i.test(url)) return `https://www.youtube.com/embed/${url.split('youtu.be/')[1].split(/[?&]/)[0]}?autoplay=1&mute=1&rel=0`; const u = new URL(url); const id = u.searchParams.get('v'); if (/youtube\.com$/i.test(u.hostname) || /www\.youtube\.com$/i.test(u.hostname)) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0`; } catch(e){} return ''; }
function playVideo(i){
  const video=$('#tvVideoPlayer'), frame=$('#tvVideoFrame'), ph=$('#tvVideoPlaceholder'); if (!video) return;
  if (!playlist.length) { ph.classList.remove('hidden'); video.classList.add('hidden'); frame.classList.add('hidden'); return; }
  currentVideoIndex = i % playlist.length; const item=playlist[currentVideoIndex], yt=youtubeEmbed(item); ph.classList.add('hidden');
  if (yt) { video.classList.add('hidden'); frame.classList.remove('hidden'); frame.src=yt; setTimeout(()=>playVideo(currentVideoIndex+1),45000); return; }
  frame.classList.add('hidden'); frame.src=''; video.classList.remove('hidden'); video.src=assetUrl(item); video.load(); video.play().catch(()=>{}); video.onended=()=>playlist.length>1&&playVideo(currentVideoIndex+1);
}

async function renderServices(){
  if (!isAdmin()) return forbidden();
  const c=$('#content'); const { data=[] } = await supabase.from('servicios').select('*').order('nombre_servicio');
  c.innerHTML = `<div class="topbar"><div><h1>Servicios</h1><p>Gestión de servicios y prefijos.</p></div></div><section class="grid two-columns"><article class="panel"><h2>Crear / editar</h2><form id="serviceForm" class="form-stack"><input type="hidden" name="id_servicio"><label>Nombre<input name="nombre_servicio" required></label><label>Prefijo<input name="prefijo" maxlength="5" required></label><label>Descripción<textarea name="descripcion"></textarea></label><label>Color<input type="color" name="color" value="#0A84FF"></label><label>Estado<select name="estado"><option>Activo</option><option>Inactivo</option></select></label><button class="btn btn-primary">Guardar</button></form></article><article class="panel"><h2>Listado</h2><div class="table-responsive"><table><thead><tr><th>Servicio</th><th>Prefijo</th><th>Estado</th><th></th></tr></thead><tbody>${data.map(s=>`<tr><td>${escapeHtml(s.nombre_servicio)}</td><td><b>${escapeHtml(s.prefijo)}</b></td><td>${escapeHtml(s.estado)}</td><td><button class="btn btn-small btn-outline" data-edit-service='${JSON.stringify(s).replace(/'/g,"&#39;")}'>Editar</button></td></tr>`).join('')}</tbody></table></div></article></section>`;
  $('#serviceForm').addEventListener('submit', saveService);
  $$('[data-edit-service]').forEach(b=>b.addEventListener('click',()=>fillForm('serviceForm', JSON.parse(b.dataset.editService))));
}
async function saveService(e){ e.preventDefault(); const fd=Object.fromEntries(new FormData(e.target)); fd.prioridad=1; const id=fd.id_servicio; delete fd.id_servicio; const q=id?supabase.from('servicios').update(fd).eq('id_servicio',id):supabase.from('servicios').insert(fd); const {error}=await q; if(error) alert(error.message); else renderServices(); }

async function renderPoints(){
  if (!isAdmin()) return forbidden();
  const c=$('#content'); const {data=[]}=await supabase.from('puntos_atencion').select('*').order('nombre_punto');
  c.innerHTML=`<div class="topbar"><div><h1>Puntos de atención</h1><p>Módulos, consultorios o ventanillas.</p></div></div><section class="grid two-columns"><article class="panel"><h2>Crear / editar</h2><form id="pointForm" class="form-stack"><input type="hidden" name="id_punto"><label>Nombre<input name="nombre_punto" required></label><label>Descripción<textarea name="descripcion"></textarea></label><label>Estado<select name="estado"><option>Activo</option><option>Inactivo</option></select></label><button class="btn btn-primary">Guardar</button></form></article><article class="panel"><h2>Listado</h2><table><tbody>${data.map(p=>`<tr><td><b>${escapeHtml(p.nombre_punto)}</b><br><span class="muted">${escapeHtml(p.descripcion||'')}</span></td><td>${escapeHtml(p.estado)}</td><td><button class="btn btn-small btn-outline" data-edit-point='${JSON.stringify(p).replace(/'/g,"&#39;")}'>Editar</button></td></tr>`).join('')}</tbody></table></article></section>`;
  $('#pointForm').addEventListener('submit', savePoint);
  $$('[data-edit-point]').forEach(b=>b.addEventListener('click',()=>fillForm('pointForm', JSON.parse(b.dataset.editPoint))));
}
async function savePoint(e){ e.preventDefault(); const fd=Object.fromEntries(new FormData(e.target)); const id=fd.id_punto; delete fd.id_punto; const q=id?supabase.from('puntos_atencion').update(fd).eq('id_punto',id):supabase.from('puntos_atencion').insert(fd); const {error}=await q; if(error) alert(error.message); else renderPoints(); }
function fillForm(id, data){ const f=$(`#${id}`); Object.entries(data).forEach(([k,v])=>{ if(f.elements[k]) f.elements[k].value=v??''; }); }

async function renderUsers(){
  if (!isAdmin()) return forbidden();
  const c=$('#content');
  const [{data:profiles=[]},{data:points=[]},{data:services=[]}] = await Promise.all([
    supabase.from('perfiles').select('*, puntos_atencion(nombre_punto)').order('nombre'),
    supabase.from('puntos_atencion').select('*').eq('estado','Activo').order('nombre_punto'),
    supabase.from('servicios').select('*').eq('estado','Activo').order('nombre_servicio')
  ]);
  c.innerHTML=`<div class="topbar"><div><h1>Usuarios</h1><p>Perfiles y asignación de roles. Cree primero el usuario en Supabase Authentication.</p></div></div><section class="panel"><form id="profileForm" class="form-grid"><label>ID Auth User<input name="id_usuario" required placeholder="UUID de Supabase Auth"></label><label>Nombre<input name="nombre" required></label><label>Email<input name="email" type="email"></label><label>Rol<select name="rol"><option>Administrador</option><option>Asesor</option><option>Pantalla</option></select></label><label>Punto<select name="id_punto_atencion"><option value="">Sin punto</option>${points.map(p=>`<option value="${p.id_punto}">${escapeHtml(p.nombre_punto)}</option>`).join('')}</select></label><label>Estado<select name="estado"><option>Activo</option><option>Inactivo</option></select></label><div class="full"><b>Servicios asignados</b><div class="checkbox-grid">${services.map(s=>`<label><input type="checkbox" name="servicios" value="${s.id_servicio}"> ${escapeHtml(s.nombre_servicio)}</label>`).join('')}</div></div><div class="full action-row"><button class="btn btn-primary">Guardar perfil</button></div></form></section><section class="panel"><h2>Perfiles</h2><table><thead><tr><th>Usuario</th><th>Rol</th><th>Punto</th><th>Estado</th></tr></thead><tbody>${profiles.map(p=>`<tr><td><b>${escapeHtml(p.nombre)}</b><br><span class="muted">${escapeHtml(p.email||p.id_usuario)}</span></td><td>${escapeHtml(p.rol)}</td><td>${escapeHtml(p.puntos_atencion?.nombre_punto||'-')}</td><td>${escapeHtml(p.estado)}</td></tr>`).join('')}</tbody></table></section>`;
  $('#profileForm').addEventListener('submit', saveProfile);
}
async function saveProfile(e){
  e.preventDefault(); const fd=new FormData(e.target); const id=fd.get('id_usuario');
  const perfil={id_usuario:id,nombre:fd.get('nombre'),email:fd.get('email'),rol:fd.get('rol'),id_punto_atencion:fd.get('id_punto_atencion')||null,estado:fd.get('estado')};
  const servicios=fd.getAll('servicios').map(Number);
  const {error}=await supabase.from('perfiles').upsert(perfil,{onConflict:'id_usuario'}); if(error) return alert(error.message);
  await supabase.from('usuario_servicio').delete().eq('id_usuario',id);
  if(servicios.length) await supabase.from('usuario_servicio').insert(servicios.map(s=>({id_usuario:id,id_servicio:s})));
  renderUsers();
}

async function renderReports(){
  if (!isAdmin()) return forbidden();
  const c=$('#content'); c.innerHTML=`<div class="topbar"><div><h1>Reportes</h1><p>Indicadores por rango de fecha.</p></div></div><section class="panel"><form id="reportForm" class="form-grid"><label>Desde<input type="date" name="desde" value="${today()}"></label><label>Hasta<input type="date" name="hasta" value="${today()}"></label><div class="action-row"><button class="btn btn-primary">Consultar</button><button type="button" class="btn btn-outline" id="exportCsv">Exportar CSV</button></div></form></section><section id="reportResult"></section>`;
  $('#reportForm').addEventListener('submit', e=>{e.preventDefault(); loadReports();}); $('#exportCsv').addEventListener('click', exportCsv); loadReports();
}
async function loadReports(){
  const fd=new FormData($('#reportForm')); const desde=fd.get('desde'), hasta=fd.get('hasta');
  const {data=[]}=await supabase.from('turnos').select('*, servicios(nombre_servicio)').gte('fecha',desde).lte('fecha',hasta).order('fecha');
  const byStatus=Object.groupBy ? Object.groupBy(data,t=>t.estado) : data.reduce((a,t)=>(a[t.estado]=[...(a[t.estado]||[]),t],a),{});
  const byService=data.reduce((a,t)=>(a[t.servicios?.nombre_servicio||'Sin servicio']=(a[t.servicios?.nombre_servicio||'Sin servicio']||0)+1,a),{});
  $('#reportResult').innerHTML=`<section class="grid stats-grid"><article class="stat-card"><span>Total</span><strong>${data.length}</strong></article><article class="stat-card"><span>Atendidos</span><strong>${byStatus.Atendido?.length||0}</strong></article><article class="stat-card"><span>Ausentes</span><strong>${byStatus.Ausente?.length||0}</strong></article><article class="stat-card"><span>En espera</span><strong>${byStatus['En espera']?.length||0}</strong></article></section><section class="grid two-columns"><article class="panel"><h2>Por servicio</h2><table><tbody>${Object.entries(byService).map(([k,v])=>`<tr><td>${escapeHtml(k)}</td><td><b>${v}</b></td></tr>`).join('')}</tbody></table></article><article class="panel"><h2>Detalle</h2><div class="table-responsive"><table><thead><tr><th>Fecha</th><th>Turno</th><th>Servicio</th><th>Estado</th></tr></thead><tbody>${data.map(t=>`<tr><td>${t.fecha}</td><td>${escapeHtml(t.codigo_turno)}</td><td>${escapeHtml(t.servicios?.nombre_servicio||'')}</td><td>${escapeHtml(t.estado)}</td></tr>`).join('')}</tbody></table></div></article></section>`;
}
async function exportCsv(){
  const fd=new FormData($('#reportForm')); const {data=[]}=await supabase.from('turnos').select('*, servicios(nombre_servicio)').gte('fecha',fd.get('desde')).lte('fecha',fd.get('hasta')).order('fecha');
  const rows=[['fecha','turno','servicio','estado','hora_generado','hora_llamado'],...data.map(t=>[t.fecha,t.codigo_turno,t.servicios?.nombre_servicio||'',t.estado,t.hora_generado||'',t.hora_llamado||''])];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'); const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='reporte_digiturno.csv'; a.click(); URL.revokeObjectURL(a.href);
}

async function renderConfig(){
  if (!isAdmin()) return forbidden(); await loadConfig(); const c=$('#content');
  c.innerHTML=`<div class="topbar"><div><h1>Configuración</h1><p>Identidad, pantalla TV, video institucional y franja inferior.</p></div></div><section class="panel"><form id="configForm" class="form-grid"><label>Nombre entidad<input name="nombre_entidad" value="${escapeHtml(appConfig.nombre_entidad||'')}"></label><label>Logo menú<input name="logo" value="${escapeHtml(appConfig.logo||'')}"></label><label>Logo pantalla<input name="logo_pantalla" value="${escapeHtml(appConfig.logo_pantalla||'')}"></label><label>Tiempo actualización ms<input type="number" name="tiempo_actualizacion" value="${appConfig.tiempo_actualizacion||3000}"></label><label class="full">Mensaje pantalla<textarea name="mensaje_pantalla">${escapeHtml(appConfig.mensaje_pantalla||'')}</textarea></label><label class="full">Videos pantalla, una ruta o URL por línea<textarea name="videos_pantalla" rows="4">${escapeHtml(appConfig.videos_pantalla||'')}</textarea></label><label class="full">Franja inferior<textarea name="franja_inferior" rows="2">${escapeHtml(appConfig.franja_inferior||'')}</textarea></label><div class="full action-row"><button class="btn btn-primary">Guardar configuración</button></div></form></section>`;
  $('#configForm').addEventListener('submit', async e=>{e.preventDefault(); const fd=Object.fromEntries(new FormData(e.target)); fd.id_configuracion=1; fd.tiempo_actualizacion=Number(fd.tiempo_actualizacion||3000); const {error}=await supabase.from('configuracion').upsert(fd,{onConflict:'id_configuracion'}); if(error) alert(error.message); else {await loadConfig(); alert('Configuración guardada.');}});
}
function forbidden(){ $('#content').innerHTML='<div class="alert alert-danger">No tiene permisos para este módulo.</div>'; }
