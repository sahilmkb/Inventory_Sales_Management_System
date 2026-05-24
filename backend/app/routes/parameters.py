from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timedelta
import random, string, re, os
from backend.app.database import get_db
from backend.app import models
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from dotenv import load_dotenv

# =====================================================
# INITIAL SETUP
# =====================================================
load_dotenv()
router = APIRouter(prefix="/api", tags=["Dashboard, Inventory & Retail Management"])
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# =====================================================
# UTILITY FUNCTIONS
# =====================================================
def generate_unique_admin_id():
    """Generate a 7-character alphanumeric unique admin ID."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=7))

async def generate_available_admin_id(db: AsyncSession):
    """Generate an admin ID and verify it does not already exist."""
    for _ in range(10):
        admin_id = generate_unique_admin_id()
        result = await db.execute(select(models.AdminInfo).where(models.AdminInfo.admin_id == admin_id))
        if result.scalar_one_or_none() is None:
            return admin_id
    raise HTTPException(status_code=500, detail="Could not generate a unique Admin ID.")

def verify_password_strength(password: str):
    """Ensure password is alphanumeric, has symbol, number, alphabet, and is 8–12 chars."""
    if len(password) < 8 or len(password) > 12:
        return False
    if not re.search(r"[A-Za-z]", password):  # at least one letter
        return False
    if not re.search(r"\d", password):  # at least one number
        return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):  # at least one symbol
        return False
    return True

def send_email_via_sendgrid(to_email: str, subject: str, html_content: str):
    """Send formatted email via SendGrid."""
    sendgrid_api_key = os.getenv("SENDGRID_API_KEY")
    sender_email = os.getenv("FROM_EMAIL")
    if not sendgrid_api_key or not sender_email:
        print("❌ Missing SendGrid credentials.")
        return
    try:
        sg = SendGridAPIClient(sendgrid_api_key)
        message = Mail(from_email=sender_email, to_emails=to_email, subject=subject, html_content=html_content)
        sg.send(message)
        print(f"✅ Email sent successfully to {to_email}")
    except Exception as e:
        print(f"❌ Failed to send email: {e}")

# =====================================================
# PYDANTIC MODELS
# =====================================================
class RegisterAdmin(BaseModel):
    email: EmailStr
    password: str

class LoginAdmin(BaseModel):
    admin_id: str
    password: str

class AddProductRequest(BaseModel):
    product_id: str | None = Field(default=None)
    product_name: str
    category: str
    price: float
    stock: int
    supplier: str | None = "-"

class StockUpdate(BaseModel):
    quantity: int

# =====================================================
# 🧾 INVENTORY LIST ENDPOINT (SORTED BY STOCK STATUS)
# =====================================================
@router.get("/product_info")
async def get_all_products(db: AsyncSession = Depends(get_db)):
    """Return all products sorted by stock status (critical → low → in stock)."""
    result = await db.execute(select(models.ProductInfo))
    products = result.scalars().all()

    def stock_priority(p):
        if p.stock == 0:
            return 0
        elif p.stock < 10:
            return 1
        else:
            return 2

    products_sorted = sorted(products, key=stock_priority)

    return [
        {
            "product_id": p.product_id,
            "product_name": p.product_name,
            "category": p.category,
            "stock": p.stock,
            "price": p.price,
            "stock_status": p.stock_status
        }
        for p in products_sorted
    ]

# =====================================================
# 📦 UPDATE STOCK (Universal + / - Support)
# =====================================================
@router.put("/update_stock/{product_id}")
async def update_stock(
    product_id: str,
    payload: StockUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Updates product stock for both Inventory and POS.
    - Positive ➕ adds stock
    - Negative ➖ subtracts stock
    - Prevents stock below 0
    - Updates stock status automatically
    """
    try:
        result = await db.execute(
            select(models.ProductInfo).where(models.ProductInfo.product_id == product_id)
        )
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product '{product_id}' not found.")

        qty_change = payload.quantity
        if qty_change == 0:
            raise HTTPException(status_code=400, detail="Quantity cannot be 0.")

        new_stock = product.stock + qty_change
        if new_stock < 0:
            raise HTTPException(status_code=400, detail="❌ Cannot reduce stock below 0.")

        product.stock = new_stock
        product.stock_status = (
            "Out of Stock" if new_stock <= 0
            else "Low Stock" if new_stock < 10
            else "In Stock"
        )

        await db.commit()
        await db.refresh(product)

        action = "added to" if qty_change > 0 else "removed from"
        return {
            "message": f"📦 {abs(qty_change)} units {action} '{product.product_name}'. New stock: {product.stock}",
            "product_id": product.product_id,
            "new_stock": product.stock,
            "stock_status": product.stock_status
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# =====================================================
# 📊 DASHBOARD ENDPOINT
# =====================================================
@router.get("/dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    """Fetch dashboard analytics and summaries."""
    product_result = await db.execute(select(models.ProductInfo))
    transaction_result = await db.execute(select(models.TransactionInfo))
    products = product_result.scalars().all()
    transactions = transaction_result.scalars().all()

    total_sales = sum(t.product_price or 0 for t in transactions)
    total_products_sold = len(transactions)
    today = datetime.now().date()
    yesterday = today - timedelta(days=1)
    todays_sales = [t for t in transactions if t.date_time and t.date_time.date() == today]
    yesterdays_sales = [t for t in transactions if t.date_time and t.date_time.date() == yesterday]
    todays_sales_total = sum(t.product_price or 0 for t in todays_sales)
    todays_sales_count = len(todays_sales)
    yesterdays_sales_total = sum(t.product_price or 0 for t in yesterdays_sales)

    monthly_sales = [0] * 12
    for t in transactions:
        if t.date_time:
            monthly_sales[t.date_time.month - 1] += t.product_price or 0

    # Aggregate transaction rows into dashboard-friendly summaries.
    product_sales = {}
    for t in transactions:
        if t.product_name:
            product_sales[t.product_name] = product_sales.get(t.product_name, 0) + 1

    top_selling = []
    for name, count in sorted(product_sales.items(), key=lambda x: x[1], reverse=True)[:5]:
        product_obj = next((p for p in products if p.product_name == name), None)
        top_selling.append({
            "product_name": name,
            "units_sold": count,
            "reviews": getattr(product_obj, "reviews", 0) if product_obj else 0
        })

    stock_alerts = []
    for p in products:
        if p.stock == 0:
            level = "critical"
        elif p.stock < 10:
            level = "warning"
        else:
            continue
        stock_alerts.append({
            "product_name": p.product_name,
            "stock": p.stock,
            "level": level
        })
    stock_alerts.sort(key=lambda x: {"critical": 0, "warning": 1}[x["level"]])

    recent_purchases = sorted(transactions, key=lambda t: t.date_time or datetime.min, reverse=True)[:5]

    return {
        "metrics": {
            "total_products_sold": total_products_sold,
            "total_sales": total_sales,
            "todays_sales_total": todays_sales_total,
            "todays_sales_count": todays_sales_count,
        },
        "monthly_sales": monthly_sales,
        "top_selling": top_selling,
        "stock_alerts": stock_alerts,
        "recent_purchases": [
            {
                "user_id": t.user_id or "N/A",
                "product_name": t.product_name,
                "product_price": t.product_price,
                "date_time": t.date_time
            } for t in recent_purchases
        ]
    }

# =====================================================
# 👤 ADMIN REGISTER & LOGIN
# =====================================================
@router.post("/register_admin")
async def register_admin(data: RegisterAdmin, db: AsyncSession = Depends(get_db)):
    """Create an admin account and email the generated admin ID."""
    if not verify_password_strength(data.password):
        raise HTTPException(status_code=400, detail="Password must be alphanumeric, include a special symbol, 8–12 characters long.")
    result = await db.execute(select(models.AdminInfo).where(models.AdminInfo.admin_email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered.")
    admin_id = await generate_available_admin_id(db)
    hashed_password = pwd_context.hash(data.password)
    new_admin = models.AdminInfo(
        admin_id=admin_id,
        admin_email=data.email,
        password=hashed_password,
        created_at=datetime.now(),
    )
    db.add(new_admin)
    await db.commit()
    html_content = f"""
    <html><body><h2>Welcome to RetailDash!</h2>
    <p>Your unique Admin ID: <strong>{admin_id}</strong></p>
    <p>Use this ID + password to sign in.</p></body></html>
    """
    send_email_via_sendgrid(data.email, "Your RetailDash Admin ID", html_content)
    return {"message": "✅ Registration successful! Check your email for Admin ID.", "admin_id": admin_id}

@router.post("/login_admin")
async def login_admin(data: LoginAdmin, db: AsyncSession = Depends(get_db)):
    """Validate admin credentials for the retail management screen."""
    result = await db.execute(select(models.AdminInfo).where(models.AdminInfo.admin_id == data.admin_id))
    admin = result.scalar_one_or_none()
    if not admin or not pwd_context.verify(data.password, admin.password):
        raise HTTPException(status_code=401, detail="Invalid Admin ID or password.")
    return {"message": "✅ Login successful", "admin_id": admin.admin_id, "email": admin.admin_email}

# =====================================================
# 🧾 POS PRODUCT ROUTES
# =====================================================
@router.get("/pos_products")
async def get_pos_products(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(models.ProductInfo).order_by(models.ProductInfo.product_id.asc()))
        products = result.scalars().all()
        return {
            "products": [
                {
                    "product_id": p.product_id,
                    "product_name": p.product_name,
                    "category": p.category,
                    "price": p.price,
                    "stock": p.stock,
                    "supplier": getattr(p, "supplier", "-") or "-",
                    "stock_status": p.stock_status
                } for p in products
            ]
        }
    except Exception as e:
        print("❌ POS fetch error:", e)
        raise HTTPException(status_code=500, detail="Error fetching POS products")

@router.post("/add_product")
async def add_product(data: AddProductRequest, db: AsyncSession = Depends(get_db)):
    try:
        product_id = (data.product_id or "").strip()
        name = data.product_name.strip()
        category = data.category.strip()
        supplier = (data.supplier or "-").strip()
        price = float(data.price)
        stock = int(data.stock)

        if not name or not category:
            raise HTTPException(status_code=400, detail="Product Name and Category are required.")
        if stock < 10:
            raise HTTPException(status_code=400, detail="Stock must be at least 10.")
        if price <= 0:
            raise HTTPException(status_code=400, detail="Price must be greater than 0.")

        if not product_id:
            # Auto-generate the next P### ID when the user leaves product ID blank.
            result = await db.execute(select(models.ProductInfo.product_id))
            product_ids = result.scalars().all()
            numeric_ids = [
                int(match.group(1))
                for existing_id in product_ids
                if (match := re.fullmatch(r"P(\d+)", existing_id or ""))
            ]
            product_id = f"P{(max(numeric_ids) + 1) if numeric_ids else 1:03d}"
        else:
            existing = await db.execute(select(models.ProductInfo).where(models.ProductInfo.product_id == product_id))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail=f"Product ID '{product_id}' already exists.")

        stock_status = "In Stock" if stock >= 10 else "Low Stock"

        new_product = models.ProductInfo(
            product_id=product_id,
            product_name=name,
            category=category,
            supplier=supplier,
            price=price,
            stock=stock,
            stock_status=stock_status,
            created_at=datetime.now(),
            reviews=0
        )

        db.add(new_product)
        await db.commit()
        await db.refresh(new_product)

        return {"message": f"✅ Product '{name}' added successfully!", "product_id": product_id}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/get_product/{product_id}")
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.ProductInfo).where(models.ProductInfo.product_id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail=f"Product ID '{product_id}' not found.")
    return {
        "product_id": product.product_id,
        "product_name": product.product_name,
        "category": product.category,
        "price": product.price,
        "stock": product.stock,
        "supplier": getattr(product, "supplier", "-") or "-",
        "stock_status": product.stock_status
    }

@router.delete("/remove_product/{product_id}")
async def remove_product(product_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.ProductInfo).where(models.ProductInfo.product_id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail=f"Product ID '{product_id}' not found.")
    await db.delete(product)
    await db.commit()
    return {"message": f"🗑️ Product '{product.product_name}' (ID: {product_id}) deleted successfully."}

@router.put("/update_price/{product_id}")
async def update_price(product_id: str, new_price: float = Body(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.ProductInfo).where(models.ProductInfo.product_id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail=f"Product ID '{product_id}' not found.")
    if new_price <= 0:
        raise HTTPException(status_code=400, detail="Price must be greater than 0.")
    product.price = new_price
    await db.commit()
    await db.refresh(product)
    return {"message": f"💰 Price for '{product.product_name}' updated successfully.", "product_id": product.product_id, "new_price": product.price}
