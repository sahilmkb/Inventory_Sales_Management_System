import datetime
import decimal

from sqlalchemy import DateTime, Numeric, PrimaryKeyConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


# Stores sellable inventory items and their current stock state.
class ProductInfo(Base):
    __tablename__ = 'product_info'
    __table_args__ = (
        PrimaryKeyConstraint('product_id', name='product_info_pkey'),
        {'schema': 'Products'}
    )

    product_id: Mapped[str] = mapped_column(String, primary_key=True)
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    stock: Mapped[decimal.Decimal] = mapped_column(Numeric, nullable=False)
    stock_status: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[decimal.Decimal] = mapped_column(Numeric, nullable=False)
    supplier: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    reviews: Mapped[decimal.Decimal] = mapped_column(Numeric(2, 1), nullable=False)
