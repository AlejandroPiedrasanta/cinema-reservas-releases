#!/bin/bash
# Cierra el servidor local de Cinema Reservas por si quedara abierto (normalmente se
# cierra solo al cerrar la ventana de la app). Tus datos no se tocan.
pkill -f "CinemaReservas.*--server" 2>/dev/null
lsof -nP -t -iTCP:8001 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
echo "Cinema Reservas se cerro. Ya puedes cerrar esta ventana."
