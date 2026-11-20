# Cinema Reservas con un NAS UGREEN

Con la base de datos en el NAS, **todas las computadoras ven las mismas reservas y socios**
y los datos quedan en el NAS (con sus copias y discos en espejo).
Funciona en la red de la oficina/casa; no hace falta internet.

> Por defecto la app guarda todo en la propia computadora:
> - Windows: `%LOCALAPPDATA%\CinemaProductions\app\cinema_data.json`
> - Mac: `~/Library/Application Support/CinemaProductions/app/cinema_data.json`
> (más `backups\` y `uploads\` en la misma carpeta).

---

## 1. Instalar MongoDB en el NAS (una sola vez)

1. En el NAS (UGOS Pro) abre **Centro de aplicaciones** e instala **Docker**.
2. Abre **Docker → Proyecto → Crear**. Nombre: `cinema-reservas`. Carpeta: por ejemplo
   `/docker/cinema-reservas`.
3. Pega esto (cambia la contraseña):

```yaml
services:
  mongodb:
    image: mongo:8.0
    container_name: cinema-mongodb
    restart: always
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: cinema
      MONGO_INITDB_ROOT_PASSWORD: CAMBIA_ESTA_CLAVE
    volumes:
      - ./datos:/data/db
```

4. **Crear / Desplegar**. En unos segundos el contenedor `cinema-mongodb` queda «En ejecución».

Consejos:
- Usa una contraseña **sin** los símbolos `@ : / ? # %` (o la dirección no se entenderá).
- Dale al NAS una **IP fija** (en el router o en *Panel de control → Red* del NAS), p. ej. `192.168.1.50`.
- Si el contenedor se reinicia una y otra vez (algunos NAS con procesador antiguo o ARM),
  cambia `mongo:8.0` por `mongo:4.4` y vuelve a desplegar.
- **No abras el puerto 27017 a internet** en el router. Para usarlo fuera de la oficina,
  usa una VPN (por ejemplo Tailscale).

## 2. Conectar la app

En cada computadora con Cinema Reservas:

1. **Ajustes → Base de datos**.
2. Dirección:
   `mongodb://cinema:TU_CLAVE@192.168.1.50:27017/?authSource=admin`
   (cambia la IP por la de tu NAS y `TU_CLAVE` por la contraseña del paso 1).
3. **Probar conexión** → debe decir «Conexión exitosa». Luego **Conectar**.

Si algo falla, la app explica el motivo: contraseña incorrecta, NAS apagado o fuera de la red, etc.
Mientras el NAS no responda, la app abre con los datos locales de esa computadora.

## 3. Pasar tus reservas actuales al NAS

Antes de conectar (en la computadora que ya tiene los datos):

1. **Descarga un respaldo** (Ajustes → respaldos → descargar). Guarda el `.json`.
2. Conecta al NAS (paso 2).
3. **Restaura** ese respaldo. Las reservas conservan sus socios asignados.

Hazlo **una sola vez** y desde **una sola** computadora; las demás solo se conectan.

## 4. Volver a la base local

**Ajustes → Base de datos → Local**. Vuelven los datos que esa computadora tenía guardados
antes de conectarse al NAS (no se borran al cambiar).

---

Recuerda: cada licencia vale para **2 computadoras**.
