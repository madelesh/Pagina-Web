import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// PEGA AQUÍ TU CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const $ = (id) => document.getElementById(id);
const productsBox = $("products");
const adminPanel = $("adminPanel");
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const loginModal = $("loginModal");
const detailModal = $("detailModal");
const productForm = $("productForm");
let products = [];
let currentCategory = "Todos";
let currentUser = null;

loginBtn.onclick = () => loginModal.showModal();
$("closeLogin").onclick = () => loginModal.close();
logoutBtn.onclick = () => signOut(auth);
$("closeDetail").onclick = () => detailModal.close();

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("loginMsg").textContent = "Entrando...";
  try {
    await signInWithEmailAndPassword(auth, $("email").value, $("password").value);
    $("loginMsg").textContent = "";
    loginModal.close();
    e.target.reset();
  } catch (error) {
    $("loginMsg").textContent = "Correo o contraseña incorrectos.";
  }
};

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  adminPanel.classList.toggle("hidden", !user);
  loginBtn.classList.toggle("hidden", !!user);
  logoutBtn.classList.toggle("hidden", !user);
  renderProducts();
});

$("changePasswordBtn").onclick = async () => {
  const newPass = prompt("Escribe la nueva contraseña del administrador:");
  if (!newPass || newPass.length < 6) return alert("La contraseña debe tener mínimo 6 caracteres.");
  try {
    await updatePassword(auth.currentUser, newPass);
    alert("Contraseña actualizada correctamente.");
  } catch (error) {
    alert("Vuelve a iniciar sesión y luego cambia la contraseña.");
  }
};

document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentCategory = btn.dataset.category;
    renderProducts();
  };
});
$("searchInput").oninput = renderProducts;

const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderProducts();
});

productForm.onsubmit = async (e) => {
  e.preventDefault();
  if (!currentUser) return alert("Debes iniciar sesión.");
  $("formMsg").textContent = "Guardando...";
  try {
    const imageFile = $("image").files[0];
    const productId = $("productId").value;
    let imageUrl = null;
    let imagePath = null;

    if (imageFile) {
      imagePath = `products/${Date.now()}-${imageFile.name}`;
      const imageRef = ref(storage, imagePath);
      await uploadBytes(imageRef, imageFile);
      imageUrl = await getDownloadURL(imageRef);
    }

    const data = {
      name: $("name").value.trim(),
      price: Number($("price").value),
      category: $("category").value,
      tag: $("tag").value.trim(),
      description: $("description").value.trim(),
      colors: splitList($("colors").value),
      connections: splitList($("connections").value),
      grip: $("grip").value.trim(),
      sensor: $("sensor").value.trim(),
      dpi: $("dpi").value.trim(),
      weight: $("weight").value.trim(),
      updatedAt: serverTimestamp()
    };

    if (imageUrl) {
      data.imageUrl = imageUrl;
      data.imagePath = imagePath;
    }

    if (productId) {
      await updateDoc(doc(db, "products", productId), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "products"), data);
    }

    resetForm();
    $("formMsg").textContent = "Producto guardado correctamente.";
  } catch (error) {
    console.error(error);
    $("formMsg").textContent = "Error al guardar. Revisa la configuración de Firebase.";
  }
};

$("cancelEditBtn").onclick = resetForm;

function splitList(value) {
  return value.split(",").map(v => v.trim()).filter(Boolean);
}

function renderProducts() {
  const term = $("searchInput").value.toLowerCase();
  const filtered = products.filter(p => {
    const matchCategory = currentCategory === "Todos" || p.category === currentCategory;
    const matchSearch = (p.name || "").toLowerCase().includes(term) || (p.category || "").toLowerCase().includes(term);
    return matchCategory && matchSearch;
  });

  if (!filtered.length) {
    productsBox.innerHTML = `<div class="empty">No hay productos en esta categoría.</div>`;
    return;
  }

  productsBox.innerHTML = filtered.map(p => `
    <article class="card">
      <img src="${p.imageUrl || 'https://via.placeholder.com/400x300?text=Sin+Imagen'}" alt="${escapeHtml(p.name)}">
      <h3>${escapeHtml(p.name)}</h3>
      <div class="price">$${Number(p.price || 0).toFixed(2)}</div>
      <button class="small-link" data-detail="${p.id}">Ver ficha completa</button>
      ${currentUser ? `<div class="admin-actions">
        <button class="btn btn-blue" data-edit="${p.id}">Editar</button>
        <button class="btn btn-danger" data-delete="${p.id}">Eliminar</button>
      </div>` : ""}
    </article>
  `).join("");

  document.querySelectorAll("[data-detail]").forEach(b => b.onclick = () => showDetail(b.dataset.detail));
  document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editProduct(b.dataset.edit));
  document.querySelectorAll("[data-delete]").forEach(b => b.onclick = () => deleteProduct(b.dataset.delete));
}

function showDetail(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  $("detailContent").innerHTML = `
    <div class="detail">
      <img src="${p.imageUrl || 'https://via.placeholder.com/500x400?text=Sin+Imagen'}" alt="${escapeHtml(p.name)}">
      <div>
        <h2>${escapeHtml(p.name)}</h2>
        ${p.tag ? `<span class="pill">${escapeHtml(p.tag)}</span>` : ""}
        <p><b>Categoría:</b> ${escapeHtml(p.category || "")}</p>
        <div class="price">$${Number(p.price || 0).toFixed(2)}</div>
        <p>${escapeHtml(p.description || "")}</p>
        <div class="specs">
          <div class="spec"><b>Colores</b>${(p.colors || []).join(", ")}</div>
          <div class="spec"><b>Conexiones</b>${(p.connections || []).join(", ")}</div>
          <div class="spec"><b>Tipo de agarre</b>${escapeHtml(p.grip || "")}</div>
          <div class="spec"><b>Sensor</b>${escapeHtml(p.sensor || "")}</div>
          <div class="spec"><b>DPI máximo</b>${escapeHtml(p.dpi || "")}</div>
          <div class="spec"><b>Peso</b>${escapeHtml(p.weight || "")}</div>
        </div>
      </div>
    </div>`;
  detailModal.showModal();
}

function editProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  $("productId").value = p.id;
  $("name").value = p.name || "";
  $("price").value = p.price || "";
  $("category").value = p.category || "Mouse";
  $("tag").value = p.tag || "";
  $("description").value = p.description || "";
  $("colors").value = (p.colors || []).join(", ");
  $("connections").value = (p.connections || []).join(", ");
  $("grip").value = p.grip || "";
  $("sensor").value = p.sensor || "";
  $("dpi").value = p.dpi || "";
  $("weight").value = p.weight || "";
  window.scrollTo({ top: adminPanel.offsetTop - 80, behavior: "smooth" });
}

async function deleteProduct(id) {
  if (!confirm("¿Eliminar este producto?")) return;
  const p = products.find(x => x.id === id);
  try {
    await deleteDoc(doc(db, "products", id));
    if (p?.imagePath) await deleteObject(ref(storage, p.imagePath)).catch(() => {});
  } catch (error) {
    alert("No se pudo eliminar el producto.");
  }
}

function resetForm() {
  productForm.reset();
  $("productId").value = "";
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
