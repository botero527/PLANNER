"""password en texto plano

Revision ID: 6246ff048835
Revises: e8688d30c827
Create Date: 2026-09-28 11:33:19.308362

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6246ff048835'
down_revision: Union[str, Sequence[str], None] = 'e8688d30c827'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # decision del equipo: la clave se guarda tal cual. Se renombra la columna
    # para que el nombre no mienta (ya no es un hash).
    op.alter_column("USUARIOS", "password_hash", new_column_name="password", schema="PLN",
                    existing_type=sa.String(100), existing_nullable=False)
    op.alter_column("USUARIOS", "password", type_=sa.Unicode(100), schema="PLN",
                    existing_type=sa.String(100), existing_nullable=False)


def downgrade() -> None:
    op.alter_column("USUARIOS", "password", type_=sa.String(100), schema="PLN",
                    existing_type=sa.Unicode(100), existing_nullable=False)
    op.alter_column("USUARIOS", "password", new_column_name="password_hash", schema="PLN",
                    existing_type=sa.String(100), existing_nullable=False)
