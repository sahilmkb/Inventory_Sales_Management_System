// =============================
// Retail POS Management Script
// =============================

// API paths are relative because FastAPI serves frontend and backend on one port.
const API_BASE = window.API_BASE || "/api";
let allProducts = []; // Global for filtering and refresh

// Escape database-backed strings before injecting table markup.
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

// --- Modal Control ---
function openModal(title, contentHTML) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = contentHTML;
    document.getElementById('actionModal').classList.add('active');
}

function closeModal() {
    document.getElementById('actionModal').classList.remove('active');
}

// --- Content Definitions ---
// Modal templates are injected into the shared action modal.
const addProductContent = `
    <p style="color:#7f8c8d; margin-bottom: 20px;">Fill product details below to add to inventory.</p>

    <div class="form-group">
        <label for="addProductId">Product ID (optional)</label>
        <input type="text" id="addProductId" class="modal-input-full" placeholder="Leave blank for auto ID">
    </div>

    <div class="form-group">
        <label for="addProductName">Product Name</label>
        <input type="text" id="addProductName" class="modal-input-full" placeholder="Enter product name" required>
    </div>

    <div class="form-group">
        <label for="addProductCategory">Category</label>
        <input type="text" id="addProductCategory" class="modal-input-full" placeholder="Enter category" required>
    </div>

    <div class="form-group">
        <label for="addProductSupplier">Supplier</label>
        <input type="text" id="addProductSupplier" class="modal-input-full" placeholder="Enter supplier name (optional)">
    </div>

    <div class="input-row">
        <div class="form-group">
            <label for="addProductPrice">Price (₹)</label>
            <input type="number" id="addProductPrice" value="0" min="0" step="0.01">
        </div>

        <div class="form-group">
            <label for="addProductStock">Stock</label>
            <input type="number" id="addProductStock" value="10" min="10">
        </div>
    </div>

    <button class="modal-submit-btn" id="confirmAddProductBtn">Add Product</button>
`;

const removeProductContent = `
    <p style="color:#e74c3c; margin-bottom: 20px;">Permanently delete a product entry from the system.</p>
    <div class="form-group">
        <label for="removeProductId">Product ID</label>
        <input type="text" id="removeProductId" class="modal-input-full" placeholder="Enter ID (e.g., P001)">
    </div>
    <div class="form-group">
        <label for="removeProductName">Product Name (Auto-Fetch)</label>
        <input type="text" id="removeProductName" class="modal-input-full" placeholder="Will auto-fill..." disabled>
    </div>
    <button class="modal-submit-btn" style="background-color: #e74c3c;" id="confirmRemoveProductBtn">
        Confirm Removal
    </button>
`;

const changePriceContent = `
    <p style="color:#f39c12; margin-bottom: 20px;">Update the retail price for an existing product.</p>

    <div class="form-group">
        <label for="priceChangeId">Product ID</label>
        <input type="text" id="priceChangeId" class="modal-input-full" placeholder="Enter product ID">
    </div>

    <div class="input-row">
        <div class="form-group">
            <label for="oldPrice">Current Price (₹)</label>
            <input type="text" id="oldPrice" value="-" disabled>
        </div>
        <div class="form-group">
            <label for="newPrice">New Price (₹)</label>
            <input type="number" id="newPrice" value="0" min="0">
        </div>
    </div>

    <button class="modal-submit-btn" id="updatePriceBtn">Update Price</button>
`;

const stockUpdateContent = `
    <p style="color:#3498db; margin-bottom: 20px;">Record a new stock delivery or adjustment.</p>
    <div class="form-group">
        <label for="stockUpdateId">Product ID</label>
        <input type="text" id="stockUpdateId" class="modal-input-full" placeholder="Enter product ID">
    </div>
    <div class="input-row">
        <div class="form-group">
            <label for="currentStock">Current Stock</label>
            <input type="text" id="currentStock" value="Fetching..." disabled>
        </div>
        <div class="form-group">
            <label for="quantityReceived">Quantity Received</label>
            <input type="number" id="quantityReceived" min="1" placeholder="e.g.(+10 or -10)">
        </div>
    </div>
    <button class="modal-submit-btn" id="confirmStockUpdateBtn">Apply Stock</button>
`;

const productHoldContent = `
    <div class="form-group">
        <label for="holdProductId">Product ID</label>
        <input type="text" id="holdProductId" class="modal-input-full" placeholder="Enter product ID">
    </div>
    <div class="form-group">
        <label for="holdQuantity">Quantity to Hold</label>
        <input type="number" id="holdQuantity" value="1" min="1">
    </div>
    <div class="form-group">
        <label for="unholdQuantity">Quantity to Unhold</label>
        <input type="number" id="unholdQuantity" value="1" min="1">
    </div>
    <button class="modal-submit-btn" onclick="alert('Product Hold for ID: ' + document.getElementById('holdProductId').value); closeModal();">Place Hold</button>
`;

// =============================
// GLOBAL TABLE FUNCTIONS
// =============================

async function loadPosProducts() {
    const tableBody = document.getElementById('inventoryTableBody');
    try {
        const response = await fetch(`${API_BASE}/pos_products`);
        if (!response.ok) throw new Error("Failed to fetch product data");

        const data = await response.json();
        allProducts = data.products || [];

        allProducts.sort((a, b) => {
            const idA = parseInt(a.product_id.replace(/\D/g, "")) || 0;
            const idB = parseInt(b.product_id.replace(/\D/g, "")) || 0;
            return idA - idB;
        });

        renderTable(allProducts);
    } catch (err) {
        console.error("❌ Error fetching products:", err);
        if (tableBody)
            tableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderTable(products) {
    const tableBody = document.getElementById('inventoryTableBody');
    if (!products.length) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">No products found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = products.map(p => `
        <tr>
            <td>#${escapeHtml(p.product_id)}</td>
            <td>${escapeHtml(p.product_name)}</td>
            <td>₹ ${Number(p.price).toLocaleString()}</td>
            <td>${p.stock}</td>
            <td>${escapeHtml(p.supplier || "-")}</td>
        </tr>
    `).join('');
}

// =============================
// DOMContentLoaded
// =============================
document.addEventListener('DOMContentLoaded', async function () {
    const searchInput = document.getElementById('productSearch');

    if (searchInput) {
        searchInput.addEventListener('keyup', () => {
            const q = searchInput.value.trim().toLowerCase();
            if (q === "") {
                renderTable(allProducts);
                return;
            }
            const filtered = allProducts.filter(p =>
                p.product_name.toLowerCase().includes(q) ||
                p.product_id.toLowerCase().includes(q)
            );
            renderTable(filtered);
        });
    }

    document.getElementById('addProductCard').addEventListener('click', () => openModal('Add New Product', addProductContent));
    document.getElementById('removeProductCard').addEventListener('click', () => openModal('Remove Product', removeProductContent));
    document.getElementById('changePriceCard').addEventListener('click', () => openModal('Change Price', changePriceContent));
    document.getElementById('updateStockCard').addEventListener('click', () => openModal('Stock Update', stockUpdateContent));
    document.getElementById('productHoldCard').addEventListener('click', () => openModal('Product Hold / Unhold', productHoldContent));

    document.getElementById('actionModal').addEventListener('click', (e) => {
        if (e.target.id === 'actionModal') closeModal();
    });

    await loadPosProducts();
    setInterval(loadPosProducts, 30000);
});

// =============================
// PRODUCT MUTATION HANDLERS
// =============================
// These delegated handlers process modal actions after dynamic content is inserted.
document.addEventListener("click", async function (e) {
    if (e.target && e.target.id === "confirmAddProductBtn") {
        const id = document.getElementById("addProductId").value.trim();
        const name = document.getElementById("addProductName").value.trim();
        const category = document.getElementById("addProductCategory").value.trim();
        const price = parseFloat(document.getElementById("addProductPrice").value);
        const stock = parseInt(document.getElementById("addProductStock").value);
        const supplier = document.getElementById("addProductSupplier").value.trim();

        if (!name || !category) {
            alert("❌ Please fill in Product Name and Category.");
            return;
        }

        if (isNaN(stock) || stock < 10) {
            alert("❌ Stock must be at least 10.");
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/add_product`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    product_id: id || null,
                    product_name: name,
                    category: category,
                    price: price,
                    stock: stock,
                    supplier: supplier || "-"
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || "Failed to add product.");

            alert(`✅ ${result.message}`);
            closeModal();
            await loadPosProducts();
        } catch (err) {
            console.error("❌ Error adding product:", err);
            alert(`❌ Error: ${err.message}`);
        }
    }
});


// --- Handle Remove Product ---
document.addEventListener("click", async function (e) {
    if (e.target && e.target.id === "confirmRemoveProductBtn") {
        const id = document.getElementById("removeProductId").value.trim();
        const nameConfirm = document.getElementById("removeProductName").value.trim();

        if (!id) {
            alert("❌ Please enter a Product ID.");
            return;
        }

        try {
            // 🟡 Step 1: Fetch product details for confirmation
            const fetchResponse = await fetch(`${API_BASE}/get_product/${id}`);
            const productData = await fetchResponse.json();

            if (!fetchResponse.ok) throw new Error(productData.detail || "Product not found.");

            const actualName = productData.product_name || "(Unknown)";
            document.getElementById("removeProductName").value = actualName;

            // 🟠 Step 2: Confirm deletion
            if (!confirm(`Are you sure you want to permanently delete "${actualName}" (ID: ${id})?`)) {
                return;
            }

            // 🔴 Step 3: Proceed with deletion
            const deleteResponse = await fetch(`${API_BASE}/remove_product/${id}`, {
                method: "DELETE"
            });

            const result = await deleteResponse.json();
            if (!deleteResponse.ok) throw new Error(result.detail || "Failed to delete product.");

            alert(`✅ ${result.message}`);
            closeModal();
            await loadPosProducts();

        } catch (err) {
            console.error("❌ Error removing product:", err);
            alert(`❌ Error: ${err.message}`);
        }
    }
});

// --- Auto-fetch product name as soon as user types ID ---
document.addEventListener("input", async function (e) {
    if (e.target && e.target.id === "removeProductId") {
        const id = e.target.value.trim();
        const nameInput = document.getElementById("removeProductName");
        if (!id) {
            nameInput.value = "";
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/get_product/${id}`);
            const data = await res.json();
            if (res.ok) {
                nameInput.value = data.product_name || "";
            } else {
                nameInput.value = "❌ Not found";
            }
        } catch (err) {
            nameInput.value = "⚠️ Error";
            console.error("Error fetching product name:", err);
        }
    }
});


// --- Handle Price Fetch & Update ---
document.addEventListener("input", async function (e) {
    if (e.target && e.target.id === "priceChangeId") {
        const id = e.target.value.trim();
        const oldPriceInput = document.getElementById("oldPrice");
        oldPriceInput.value = "Fetching...";

        if (!id) {
            oldPriceInput.value = "-";
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/get_product/${id}`);
            if (!response.ok) throw new Error("Product not found");

            const product = await response.json();
            oldPriceInput.value = `₹ ${product.price}`;
        } catch (err) {
            oldPriceInput.value = "Not Found";
        }
    }
});

document.addEventListener("click", async function (e) {
    if (e.target && e.target.id === "updatePriceBtn") {
        const id = document.getElementById("priceChangeId").value.trim();
        const newPrice = parseFloat(document.getElementById("newPrice").value);

        if (!id) {
            alert("❌ Please enter a Product ID.");
            return;
        }
        if (isNaN(newPrice) || newPrice <= 0) {
            alert("❌ Enter a valid new price greater than 0.");
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/update_price/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newPrice)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || "Failed to update price.");

            alert(`✅ ${result.message}`);
            closeModal();
            await loadPosProducts();
        } catch (err) {
            alert(`❌ Error: ${err.message}`);
        }
    }
});


// --- Fetch current stock when product ID entered ---
document.addEventListener("input", async function (e) {
    if (e.target && e.target.id === "stockUpdateId") {
        const id = e.target.value.trim();
        const stockInput = document.getElementById("currentStock");
        stockInput.value = "Fetching...";

        if (!id) {
            stockInput.value = "-";
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/get_product/${id}`);
            const data = await response.json();

            if (response.ok) {
                stockInput.value = data.stock;
            } else {
                stockInput.value = "❌ Not found";
            }
        } catch (err) {
            stockInput.value = "⚠️ Error";
            console.error("Error fetching stock:", err);
        }
    }
});

// --- Handle Stock Update (+/-) ---
document.addEventListener("click", async function (e) {
    if (e.target && e.target.id === "confirmStockUpdateBtn") {
        const id = document.getElementById("stockUpdateId").value.trim();
        const qty = parseInt(document.getElementById("quantityReceived").value);

        if (!id) {
            alert("❌ Please enter a Product ID.");
            return;
        }
        if (isNaN(qty) || qty === 0) {
            alert("❌ Enter a non-zero quantity. Positive adds stock, negative removes.");
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/update_stock/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quantity: qty })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || "Failed to update stock.");

            alert(`✅ ${result.message}`);
            closeModal();
            await loadPosProducts();
        } catch (err) {
            console.error("❌ Error updating stock:", err);
            alert(`❌ ${err.message}`);
        }
    }
});
