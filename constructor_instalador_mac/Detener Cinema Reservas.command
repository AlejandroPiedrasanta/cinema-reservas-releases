#!/bin/bash
# Cierra el servidor local de Cinema Reservas (queda corriendo en segundo plano
# despues de abrir la app). Tus datos no se tocan.
pkill -f "CinemaReservas.*--server" 2>/dev/null
lsof -ti tcp:8001 2>/dev/null | xargs kill 2>/dev/null
echo "Cinema Reservas se cerro. Ya puedes cerrar esta ventana."
