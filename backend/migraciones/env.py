"""
Configuracion de Alembic para el planner.

Tres cosas importantes que hace este archivo:
1. Saca la conexion del .env (via config.py), nunca de alembic.ini.
2. Solo mira el schema PLN. La base AGP_Ingenieria tiene tablas de otros
   sistemas y sin este filtro Alembic querria BORRARLAS porque no las conoce.
3. Guarda su tabla de version en PLN.alembic_version. En dbo ya existe una
   alembic_version que es de Herramentales, y si la usamos le dañamos el control.
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import engine
from app.modelos import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

SCHEMA = get_settings().db_schema
target_metadata = Base.metadata


def solo_nuestro_schema(obj, nombre, tipo, reflejado, comparado_con):
    if tipo == "table":
        return obj.schema == SCHEMA
    return True


def incluir_schema(nombre):
    return nombre == SCHEMA


def run_migrations_online() -> None:
    with engine.connect() as conexion:
        # el schema tiene que existir antes de que Alembic cree su tabla de version
        conexion.execute(text(f"IF SCHEMA_ID('{SCHEMA}') IS NULL EXEC('CREATE SCHEMA {SCHEMA}')"))
        conexion.commit()

        context.configure(
            connection=conexion,
            target_metadata=target_metadata,
            include_schemas=True,
            include_name=lambda nombre, tipo, padre: incluir_schema(nombre) if tipo == "schema" else True,
            include_object=solo_nuestro_schema,
            version_table="alembic_version",
            version_table_schema=SCHEMA,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    raise SystemExit("Este proyecto solo corre migraciones online (contra la BD real).")

run_migrations_online()
