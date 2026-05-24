import datetime
from sqlalchemy import DateTime, PrimaryKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


# Stores administrator login credentials and generated admin IDs.
class AdminInfo(Base):
    __tablename__ = 'admin_info'
    __table_args__ = (
        PrimaryKeyConstraint('admin_id', name='admin_info_pkey'),
        {'schema': 'Admins'}
    )

    admin_id: Mapped[str] = mapped_column(String(10), primary_key=True)  
    admin_email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True) 
    password: Mapped[str] = mapped_column(String(255), nullable=False)  
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
