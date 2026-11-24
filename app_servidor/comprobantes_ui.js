/* Panel «Conectar con Comprobantes» en Base de Datos (lo inyecta app.py en index.html).
   Se dibuja debajo de la tarjeta «¿Dónde guardamos tus datos?» con las mismas clases,
   así respeta el tema elegido. Habla con /api/comprobantes/*. */
(function () {
  "use strict";
  var API = "/api/comprobantes";
  var ID = "cp-comprobantes-card";
  var ocupado = false, aviso = "", ultimoEstado = null, timer = null;

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function hora(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function pedir(ruta, cuerpo) {
    return fetch(API + ruta, cuerpo === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json(); });
  }

  var ICONO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" class="text-indigo-600"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>' +
    '<path d="M8 8h8M8 12h8M8 16h5"/></svg>';

  function crear() {
    var c = el("div", "rounded-[28px] border border-slate-200/70 bg-white px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4");
    c.id = ID;
    c.style.marginTop = "16px";
    var izq = el("div", "flex items-center gap-4 min-w-0 flex-1");
    var ic = el("div", "w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0");
    ic.innerHTML = ICONO;
    var txt = el("div", "min-w-0");
    var t = el("p", "text-[15px] font-black text-slate-900", "Conectar con Comprobantes");
    t.style.fontFamily = "Cabinet Grotesk, sans-serif";
    var linea = el("p", "text-xs text-slate-500");
    linea.setAttribute("data-cp", "estado");
    var punto = el("span");
    punto.style.cssText = "display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;background:#94a3b8";
    punto.setAttribute("data-cp", "punto");
    var lineaTxt = el("span", null, "Revisando…");
    lineaTxt.setAttribute("data-cp", "texto");
    linea.appendChild(punto); linea.appendChild(lineaTxt);
    var ruta = el("p", "text-xs text-slate-500 font-mono truncate");
    ruta.setAttribute("data-cp", "ruta");
    txt.appendChild(t); txt.appendChild(linea); txt.appendChild(ruta);
    izq.appendChild(ic); izq.appendChild(txt);

    var bot = el("div", "flex flex-wrap gap-2 shrink-0");
    var bUbic = el("button", "px-3.5 py-2 rounded-full text-[11px] font-black text-slate-700 bg-white border border-slate-200 hover:border-slate-300", "Ubicación");
    bUbic.type = "button"; bUbic.title = "Elegir dónde está historial.db de Comprobantes";
    bUbic.onclick = cambiarRuta;
    var bResync = el("button", "px-3.5 py-2 rounded-full text-[11px] font-black text-slate-700 bg-white border border-slate-200 hover:border-slate-300", "Resincronizar todo");
    bResync.type = "button"; bResync.setAttribute("data-cp", "resync");
    bResync.title = "Vuelve a pasar todos los clientes, pagos e imágenes de comprobante en los dos sentidos";
    bResync.onclick = resincronizar;
    var bCon = el("button", "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-black text-white bg-slate-900 hover:bg-slate-800", "Conectar");
    bCon.type = "button"; bCon.setAttribute("data-cp", "conectar");
    bCon.onclick = alternar;
    bot.appendChild(bUbic); bot.appendChild(bResync); bot.appendChild(bCon);
    c.appendChild(izq); c.appendChild(bot);
    return c;
  }

  function q(card, k) { return card.querySelector('[data-cp="' + k + '"]'); }

  function pintar(s) {
    var card = document.getElementById(ID);
    if (!card || !s) return;
    ultimoEstado = s;
    var color = "#94a3b8", texto;
    if (!s.disponible) { texto = "No disponible en esta versión"; }
    else if (!s.encontrado) { color = "#f59e0b"; texto = "No se encontró Comprobantes en este equipo (instálalo o elige la ubicación)"; }
    else if (!s.conectado) { texto = "Desconectado · los cambios no se pasan entre los programas"; }
    else if (s.error) { color = "#ef4444"; texto = "Error: " + s.error; }
    else {
      color = "#10b981";
      texto = "Conectado · " + (s.enlazados || 0) + " de " + (s.clientes || 0) + " clientes enlazados" +
        (s.ultima ? " · revisado " + hora(s.ultima) : "");
    }
    if (aviso) texto = aviso;
    q(card, "punto").style.background = color;
    q(card, "texto").textContent = texto;
    var r = q(card, "ruta");
    r.textContent = s.ruta || "";
    r.title = s.ruta || "";
    var bc = q(card, "conectar");
    bc.textContent = s.conectado ? "Desconectar" : "Conectar";
    bc.disabled = ocupado || !s.encontrado;
    bc.style.opacity = bc.disabled ? ".5" : "";
    var br = q(card, "resync");
    br.disabled = ocupado || !s.encontrado;
    br.style.opacity = br.disabled ? ".5" : "";
  }

  function refrescar() {
    if (!document.getElementById(ID)) return;
    pedir("/sync").then(pintar).catch(function () {});
  }

  function trabajar(promesa, msgOk) {
    ocupado = true; aviso = "Sincronizando…"; pintar(ultimoEstado);
    promesa.then(function (s) {
      aviso = typeof msgOk === "function" ? msgOk(s) : msgOk;
      ocupado = false; pintar(s);
      setTimeout(function () { aviso = ""; refrescar(); }, 5000);
    }).catch(function (e) {
      ocupado = false; aviso = "No se pudo: " + e; pintar(ultimoEstado);
      setTimeout(function () { aviso = ""; refrescar(); }, 6000);
    });
  }

  function alternar() {
    var encender = !(ultimoEstado && ultimoEstado.conectado);
    trabajar(pedir(encender ? "/conectar" : "/desconectar", {}),
      encender ? "Conectado: Reservas y Comprobantes ya están iguales" : "Desconectado");
  }

  function resincronizar() {
    if (!confirm("¿Resincronizar todo con Comprobantes?\n\nSe vuelven a pasar todos los clientes, pagos e imágenes " +
      "de comprobante en los dos sentidos. Lo que se había borrado en un solo programa se vuelve a crear.")) return;
    trabajar(pedir("/resincronizar", {}), function (s) {
      return "Listo: " + (s.hechos || 0) + " cambio(s) · " + (s.enlazados || 0) + " clientes enlazados";
    });
  }

  function cambiarRuta() {
    var actual = ultimoEstado && ultimoEstado.ruta || "";
    var r = prompt("Ruta de historial.db de Comprobantes (o su carpeta).\nDéjalo vacío para usar la ubicación normal.", actual);
    if (r === null) return;
    trabajar(pedir("/ubicacion", { ruta: r.trim() }), "Ubicación guardada");
  }

  function revisar() {
    var enPagina = location.pathname.indexOf("/base-de-datos") === 0;
    var existe = document.getElementById(ID);
    if (!enPagina) {
      if (timer) { clearInterval(timer); timer = null; }
      return;
    }
    var ancla = document.querySelector('[data-testid="data-location-card"]');
    if (!ancla) return;
    if (!existe || existe.previousElementSibling !== ancla) {
      if (existe) existe.remove();
      ancla.insertAdjacentElement("afterend", crear());
      refrescar();
    }
    if (!timer) timer = setInterval(refrescar, 5000);
  }

  new MutationObserver(function () { revisar(); }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", revisar);
  setInterval(revisar, 1500);
})();
