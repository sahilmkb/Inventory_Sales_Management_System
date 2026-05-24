from sqlalchemy import String, Text, DateTime, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from backend.app.database import Base


# Stores sales transaction rows used by the dashboard analytics.
class TransactionInfo(Base):
    __tablename__ = "transaction_info"
    __table_args__ = {"schema": "Transactions"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    date_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    product_price: Mapped[float] = mapped_column(Numeric, nullable=False)
