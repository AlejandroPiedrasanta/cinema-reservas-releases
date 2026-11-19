"""Importa todo lo que usa app.py para que PyInstaller lo empaquete dentro del .app.

app.py se copia como archivo (no se analiza), asi que sus dependencias se declaran aqui.
Este modulo NUNCA se ejecuta; solo lo lee PyInstaller.
"""
# ruff: noqa
import bson, certifi, cryptography, dns.resolver, dotenv, httpx, mongomock_motor, motor.motor_asyncio
import multipart, openpyxl, pydantic, pymongo, pyzipper, resend, starlette, tzdata, uvicorn
import fastapi, fastapi.responses, fastapi.staticfiles, starlette.middleware.cors
import license_core, ssl_bootstrap
