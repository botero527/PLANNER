"""
Se carga antes que los tests. Las pruebas corren contra la base real, donde ya hay
personas reales (Laura, Alejandro...). Con esto los tests SOLO pueden generar
correos para direcciones .invalid: nunca le llega un correo de prueba a nadie de verdad.
"""
import os

os.environ["PLN_CORREO_SOLO_DOMINIOS"] = ".invalid"
os.environ["PLN_CORREO_MODO"] = "simulado"
