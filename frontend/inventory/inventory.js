// Inventory page controller: renders product stock data and applies stock adjustments.
document.addEventListener('DOMContentLoaded', () => {
  // API paths are relative because FastAPI serves frontend and backend on one port.
  const API_BASE = window.API_BASE || "/api";
  const statusModal = document.getElementById("statusModal");
  const closeModalBtn = document.querySelector(".close-btn-new");
  const inventoryTableBody = document.getElementById("inventoryTableBody");
  let currentRow = null;

  // === Utility: Determine CSS Class from Stock Status ===
  function getStatusClass(statusText) {
    const normalized = (statusText || "").toLowerCase();
    if (normalized.includes("out")) return "out-stock";
    if (normalized.includes("low")) return "low-stock";
    return "in-stock";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  // === Modal Controls ===
  const closeModal = () => {
    statusModal.style.display = "none";
    document.getElementById("statusForm").reset();
    currentRow = null;
  };

  closeModalBtn.addEventListener('click', closeModal);
  window.addEventListener('click', e => { if (e.target === statusModal) closeModal(); });

  // === Load Inventory Data ===
  async function loadInventory() {
    try {
      const res = await fetch(`${API_BASE}/product_info`);
      if (!res.ok) throw new Error("Failed to fetch products");
      const products = await res.json();

      inventoryTableBody.innerHTML = "";
      products.forEach(p => {
        const statusClass = getStatusClass(p.stock_status);
        const row = document.createElement("tr");
        row.dataset.productId = p.product_id;
        row.innerHTML = `
          <td>#${escapeHtml(p.product_id)}</td>
          <td>${escapeHtml(p.product_name)}</td>
          <td>${escapeHtml(p.category)}</td>
          <td data-stock="${p.stock}">${p.stock}</td>
          <td>₹${(p.price || 0).toLocaleString("en-IN")}</td>
          <td class="status-col">
            <button class="status-btn ${statusClass}" data-status-code="${statusClass}">
              ${escapeHtml(p.stock_status)}
            </button>
          </td>
        `;
        inventoryTableBody.appendChild(row);
      });
    } catch (err) {
      console.error("Error loading inventory:", err);
    }
  }

  // === Open Stock Update Modal ===
  inventoryTableBody.addEventListener('click', e => {
    const button = e.target.closest('.status-btn');
    if (!button) return;
    const row = button.closest('tr');
    currentRow = row;

    const productId = row.querySelector('td:first-child').textContent.replace('#', '');
    const currentStock = row.querySelector('td[data-stock]').getAttribute('data-stock');

    document.getElementById('modalProductId').textContent = `Update Stock for #${productId}`;
    document.getElementById('currentProductId').value = productId;
    document.getElementById('currentStockDisplay').value = currentStock;
    document.getElementById('stockAdjustment').value = 0;

    statusModal.style.display = "block";
  });

  // === Apply Stock Update (PUT request) ===
  document.getElementById("statusForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentRow) return;

    const productId = document.getElementById('currentProductId').value;
    const currentStock = parseInt(document.getElementById('currentStockDisplay').value);
    const adjustment = parseInt(document.getElementById('stockAdjustment').value);

    if (isNaN(adjustment)) {
      alert("⚠️ Please enter a valid stock adjustment number.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/update_stock/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: adjustment })
      });
      if (!res.ok) throw new Error("Failed to update stock");
      const data = await res.json();

      // Update the current row immediately after the backend confirms the change.
      const stockCell = currentRow.querySelector('td[data-stock]');
      stockCell.textContent = data.new_stock;
      stockCell.setAttribute('data-stock', data.new_stock);

      const statusBtn = currentRow.querySelector('.status-btn');
      const newClass = getStatusClass(data.stock_status);
      statusBtn.textContent = data.stock_status;
      statusBtn.className = `status-btn ${newClass}`;
      statusBtn.dataset.statusCode = newClass;

      localStorage.setItem("dashboardNeedsRefresh", "true");
      closeModal();
      alert(`✅ ${data.message}`);
    } catch (err) {
      console.error("Error updating stock:", err);
      alert("❌ Failed to update stock. Please try again.");
    }
  });

  // === Initial Load ===
  loadInventory();
});
