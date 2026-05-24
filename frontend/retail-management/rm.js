// Retail management access page: handles admin registration, verification view, and login.
document.addEventListener('DOMContentLoaded', function () {
    // API paths are relative because FastAPI serves frontend and backend on one port.
    const API_BASE = window.API_BASE || "/api";

    // Show exactly one auth form at a time.
    function showForm(formId) {
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active-form');
            form.classList.add('hidden-form');
        });
        const target = document.getElementById(formId);
        if (target) {
            target.classList.remove('hidden-form');
            target.classList.add('active-form');
        }
    }

    function setActiveTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function isStrongPassword(password) {
        // Must be 8–12 chars, include letter, number, and symbol.
        return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,12}$/.test(password);
    }

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const verificationForm = document.getElementById('verificationForm');
    const goToLoginBtn = document.getElementById('goToLoginBtn');
    const tabButtonsContainer = document.querySelector('.tab-buttons');

    // Initialize default view
    setActiveTab('login');
    showForm('loginForm');

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', function () {
            const tab = this.dataset.tab;
            setActiveTab(tab);
            if (tab === 'login') showForm('loginForm');
            else if (tab === 'register') {
                showForm('registerForm');
                registerForm.reset();
            }
        });
    });

    // Register
    registerForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value.trim();

        if (!isValidEmail(email)) return alert("❌ Invalid email address.");
        if (!isStrongPassword(password)) {
            alert("❌ Password must be alphanumeric, include one special symbol, and be 8–12 characters long.");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/register_admin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Registration failed");

            alert(`✅ ${data.message}`);
            tabButtonsContainer.style.display = 'none';
            showForm('verificationForm');
        } catch (err) {
            alert(`❌ ${err.message}`);
        }
    });

    goToLoginBtn.addEventListener('click', () => {
        tabButtonsContainer.style.display = 'flex';
        setActiveTab('login');
        showForm('loginForm');
    });

    // Login
    loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const adminId = document.getElementById('loginUniqueId').value.trim();
        const password = document.getElementById('loginPassword').value.trim();

        if (!adminId || !password) return alert("⚠️ Enter Admin ID and password.");

        try {
            const res = await fetch(`${API_BASE}/login_admin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ admin_id: adminId, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Login failed");

            alert("✅ Login successful! Redirecting...");
            localStorage.setItem("admin_id", data.admin_id);
            localStorage.setItem("admin_email", data.email);
            window.location.href = "./pos.html";
        } catch (err) {
            alert(`❌ ${err.message}`);
        }
    });
});
