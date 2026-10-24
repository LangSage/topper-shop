(() => {
  "use strict";

  const STORAGE_KEY = "prime-topper-cart-v1";
  const UNIT_PRICE = 800;
  const ORDER_ENDPOINT = document.querySelector('meta[name="order-endpoint"]')?.content.trim() || "";
  const GOOGLE_FORM_FIELDS = {
    name: "entry.1573826088",
    phone: "entry.1891015766",
    address: "entry.16190507",
    order: "entry.637342470",
  };

  const productCards = [...document.querySelectorAll(".product-card")];
  const cartPanel = document.querySelector(".cart-panel");
  const cartBackdrop = document.querySelector(".cart-backdrop");
  const checkoutModal = document.querySelector(".checkout-modal");
  const checkoutBackdrop = document.querySelector(".modal-backdrop");
  const cartItems = document.querySelector("[data-cart-items]");
  const cartEmpty = document.querySelector("[data-cart-empty]");
  const cartFooter = document.querySelector("[data-cart-footer]");
  const checkoutForm = document.querySelector("[data-checkout-form]");
  const toast = document.querySelector(".toast");
  const imageLightbox = document.querySelector("[data-image-lightbox]");
  const lightboxImage = document.querySelector("[data-lightbox-image]");
  const lightboxCaption = document.querySelector("[data-lightbox-caption]");
  let lastFocusedElement = null;
  let lastLightboxTarget = null;
  let lightboxItems = [];
  let lightboxIndex = 0;
  let toastTimer = null;

  const products = productCards.map((card, index) => {
    const product = {
      id: card.dataset.productId || `product-${index + 1}`,
      name: card.querySelector("h3").textContent.trim(),
      price: UNIT_PRICE,
      image: card.querySelector(".product-gallery__main").getAttribute("src"),
    };

    const button = card.querySelector(".buy");
    button.dataset.productId = product.id;
    button.addEventListener("click", () => addToCart(product, button));
    return product;
  });

  initializeProductGalleries();

  // Filters only change visibility; product IDs and the cart stay unchanged.
  document.querySelectorAll("[data-product-filter]").forEach((filterButton) => {
    filterButton.addEventListener("click", () => {
      const selected = filterButton.dataset.productFilter;
      productCards.forEach((card) => {
        card.hidden = selected !== "all" && card.dataset.productType !== selected;
      });
      document.querySelectorAll("[data-product-filter]").forEach((button) => {
        const active = button === filterButton;
        button.classList.toggle("category--active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    });
  });

  let cart = loadCart();
  renderCart();

  document.querySelectorAll("[data-cart-open]").forEach((button) => {
    button.addEventListener("click", openCart);
  });

  document.querySelectorAll("[data-cart-close]").forEach((button) => {
    button.addEventListener("click", closeCart);
  });

  document.querySelector("[data-checkout-open]").addEventListener("click", openCheckout);
  document.querySelectorAll("[data-checkout-close]").forEach((button) => {
    button.addEventListener("click", closeCheckout);
  });

  document.addEventListener("keydown", (event) => {
    if (!imageLightbox.hidden && event.key === "ArrowLeft") navigateLightbox(-1);
    if (!imageLightbox.hidden && event.key === "ArrowRight") navigateLightbox(1);
    if (event.key !== "Escape") return;
    if (!imageLightbox.hidden) closeImageLightbox();
    else if (checkoutModal.classList.contains("is-open")) closeCheckout();
    else if (cartPanel.classList.contains("is-open")) closeCart();
  });

  cartItems.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cart-action]");
    if (!button) return;
    const item = cart.find((entry) => entry.id === button.dataset.productId);
    if (!item) return;

    if (button.dataset.cartAction === "increase") item.quantity = Math.min(20, item.quantity + 1);
    if (button.dataset.cartAction === "decrease") item.quantity -= 1;
    if (button.dataset.cartAction === "remove") item.quantity = 0;
    cart = cart.filter((entry) => entry.quantity > 0);
    saveAndRenderCart();
  });

  const phoneInput = checkoutForm.elements.phone;
  phoneInput.addEventListener("input", () => {
    const digits = phoneInput.value.replace(/\D/g, "").slice(0, 11);
    if (!digits) return;
    const normalized = digits[0] === "7" ? `8${digits.slice(1)}` : digits;
    const parts = [normalized.slice(0, 1), normalized.slice(1, 4), normalized.slice(4, 7), normalized.slice(7, 9), normalized.slice(9, 11)];
    phoneInput.value = [parts[0], parts[1] && ` ${parts[1]}`, parts[2] && ` ${parts[2]}`, parts[3] && `-${parts[3]}`, parts[4] && `-${parts[4]}`].filter(Boolean).join("");
  });

  checkoutForm.addEventListener("submit", submitOrder);

  document.querySelectorAll(".product-gallery").forEach((gallery) => {
    const images = [...gallery.querySelectorAll("img")];
    images.forEach((image) => setupInteractiveImage(image, images));
  });

  const heroImages = [...document.querySelectorAll(".hero__showcase img")];
  heroImages.forEach((image) => setupInteractiveImage(image, heroImages));
  document.querySelectorAll(".delivery__image > img").forEach((image) => setupInteractiveImage(image, [image]));

  document.querySelector("[data-lightbox-close]").addEventListener("click", closeImageLightbox);
  document.querySelector("[data-lightbox-prev]").addEventListener("click", () => navigateLightbox(-1));
  document.querySelector("[data-lightbox-next]").addEventListener("click", () => navigateLightbox(1));
  imageLightbox.addEventListener("click", (event) => {
    if (event.target === imageLightbox) closeImageLightbox();
  });

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!Array.isArray(saved)) return [];
      return saved
        .filter((item) => products.some((product) => product.id === item.id))
        .map((item) => ({ id: item.id, quantity: Math.min(20, Math.max(1, Number(item.quantity) || 1)) }));
    } catch {
      return [];
    }
  }

  function initializeProductGalleries() {
    document.querySelectorAll(".product-gallery").forEach((gallery) => {
      const images = [...gallery.querySelectorAll("img")];
      if (images.length < 2) return;

      const previousButton = document.createElement("button");
      previousButton.className = "gallery-nav gallery-nav--prev";
      previousButton.type = "button";
      previousButton.setAttribute("aria-label", "Предыдущая фотография");
      previousButton.textContent = "‹";

      const nextButton = document.createElement("button");
      nextButton.className = "gallery-nav gallery-nav--next";
      nextButton.type = "button";
      nextButton.setAttribute("aria-label", "Следующая фотография");
      nextButton.textContent = "›";

      const dots = document.createElement("div");
      dots.className = "gallery-dots";
      dots.setAttribute("aria-label", "Выбор фотографии");
      images.forEach((image, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", `Фотография ${index + 1}`);
        dot.addEventListener("click", (event) => {
          event.stopPropagation();
          setGalleryIndex(gallery, index);
        });
        dots.append(dot);
      });

      previousButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setGalleryIndex(gallery, Number(gallery.dataset.galleryIndex) - 1);
      });
      nextButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setGalleryIndex(gallery, Number(gallery.dataset.galleryIndex) + 1);
      });

      gallery.append(previousButton, nextButton, dots);
      setGalleryIndex(gallery, 0);
    });
  }

  function setGalleryIndex(gallery, requestedIndex) {
    const images = [...gallery.querySelectorAll("img")];
    const dots = [...gallery.querySelectorAll(".gallery-dots button")];
    const index = (requestedIndex + images.length) % images.length;
    gallery.dataset.galleryIndex = String(index);
    images.forEach((image, imageIndex) => {
      const active = imageIndex === index;
      image.classList.toggle("is-active", active);
      image.setAttribute("aria-hidden", String(!active));
      image.tabIndex = active ? 0 : -1;
    });
    dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === index));
  }

  function setupInteractiveImage(image, group) {
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", `Открыть фотографию: ${image.alt}`);
    image.addEventListener("click", () => openImageLightbox(image, group));
    image.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openImageLightbox(image, group);
    });
  }

  function openImageLightbox(sourceImage, group = [sourceImage]) {
    lastLightboxTarget = sourceImage;
    lightboxItems = group;
    lightboxIndex = Math.max(0, lightboxItems.indexOf(sourceImage));
    renderLightboxImage();
    document.querySelectorAll("[data-lightbox-prev], [data-lightbox-next]").forEach((button) => {
      button.hidden = lightboxItems.length < 2;
    });
    imageLightbox.hidden = false;
    imageLightbox.inert = false;
    imageLightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("overlay-open");
    imageLightbox.querySelector("[data-lightbox-close]").focus();
  }

  function navigateLightbox(direction) {
    if (lightboxItems.length < 2) return;
    lightboxIndex = (lightboxIndex + direction + lightboxItems.length) % lightboxItems.length;
    renderLightboxImage();
  }

  function renderLightboxImage() {
    const image = lightboxItems[lightboxIndex];
    if (!image) return;
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt;
    lightboxCaption.textContent = `${image.alt} · ${lightboxIndex + 1} из ${lightboxItems.length}`;
  }

  function closeImageLightbox() {
    imageLightbox.hidden = true;
    imageLightbox.inert = true;
    imageLightbox.setAttribute("aria-hidden", "true");
    lightboxImage.removeAttribute("src");
    lightboxItems = [];
    document.body.classList.remove("overlay-open");
    lastLightboxTarget?.focus?.();
  }

  function addToCart(product, button) {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) existing.quantity = Math.min(20, existing.quantity + 1);
    else cart.push({ id: product.id, quantity: 1 });

    saveAndRenderCart();
    const originalText = button.textContent;
    button.textContent = "Добавлено ✓";
    button.classList.add("is-added");
    window.setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("is-added");
    }, 1100);
    showToast(`${product.name} добавлен в корзину`);
  }

  function saveAndRenderCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    renderCart();
  }

  function getDetailedCart() {
    return cart.map((item) => ({ ...products.find((product) => product.id === item.id), quantity: item.quantity }));
  }

  function getCartCount() {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  function formatPrice(value) {
    return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
  }

  function renderCart() {
    const detailedCart = getDetailedCart();
    const count = getCartCount();
    const total = count * UNIT_PRICE;

    document.querySelectorAll("[data-cart-count]").forEach((element) => {
      element.textContent = count;
      element.hidden = count === 0;
    });
    document.querySelector("[data-cart-total]").textContent = formatPrice(total);
    document.querySelector("[data-checkout-total]").textContent = formatPrice(total);
    document.querySelector("[data-checkout-count]").textContent = pluralizePackages(count);
    cartEmpty.hidden = detailedCart.length > 0;
    cartFooter.hidden = detailedCart.length === 0;

    cartItems.innerHTML = detailedCart.map((item) => `
      <article class="cart-item">
        <img src="${item.image}" alt="" />
        <div class="cart-item__content">
          <strong>${escapeHtml(item.name)}</strong>
          <small>${formatPrice(item.price)} за упаковку</small>
          <div class="cart-item__controls">
            <div class="quantity" aria-label="Количество упаковок">
              <button type="button" data-cart-action="decrease" data-product-id="${item.id}" aria-label="Уменьшить количество">−</button>
              <span>${item.quantity}</span>
              <button type="button" data-cart-action="increase" data-product-id="${item.id}" aria-label="Увеличить количество">+</button>
            </div>
            <button class="cart-item__remove" type="button" data-cart-action="remove" data-product-id="${item.id}">Удалить</button>
          </div>
        </div>
        <b>${formatPrice(item.price * item.quantity)}</b>
      </article>
    `).join("");
  }

  function pluralizePackages(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    const word = mod10 === 1 && mod100 !== 11 ? "упаковка" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "упаковки" : "упаковок";
    return `${count} ${word}`;
  }

  function openCart() {
    lastFocusedElement = document.activeElement;
    cartPanel.inert = false;
    cartBackdrop.hidden = false;
    requestAnimationFrame(() => {
      cartPanel.classList.add("is-open");
      cartBackdrop.classList.add("is-open");
      cartPanel.setAttribute("aria-hidden", "false");
      document.body.classList.add("overlay-open");
      cartPanel.querySelector(".icon-button").focus();
    });
  }

  function closeCart() {
    cartPanel.classList.remove("is-open");
    cartBackdrop.classList.remove("is-open");
    cartPanel.setAttribute("aria-hidden", "true");
    cartPanel.inert = true;
    document.body.classList.remove("overlay-open");
    window.setTimeout(() => { cartBackdrop.hidden = true; }, 260);
    lastFocusedElement?.focus?.();
  }

  function openCheckout() {
    if (!cart.length) return;
    closeCart();
    resetCheckoutState();
    lastFocusedElement = document.activeElement;
    checkoutBackdrop.hidden = false;
    checkoutModal.hidden = false;
    checkoutModal.inert = false;
    requestAnimationFrame(() => {
      checkoutModal.classList.add("is-open");
      checkoutBackdrop.classList.add("is-open");
      checkoutModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("overlay-open");
      checkoutForm.elements.name.focus();
    });
  }

  function closeCheckout() {
    checkoutModal.classList.remove("is-open");
    checkoutBackdrop.classList.remove("is-open");
    checkoutModal.setAttribute("aria-hidden", "true");
    checkoutModal.inert = true;
    document.body.classList.remove("overlay-open");
    window.setTimeout(() => {
      checkoutBackdrop.hidden = true;
      checkoutModal.hidden = true;
    }, 220);
    lastFocusedElement?.focus?.();
  }

  function validateForm(formData) {
    const values = {
      name: String(formData.get("name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      address: String(formData.get("address") || "").trim(),
    };
    const errors = {};
    if (values.name.length < 2) errors.name = "Укажите имя.";
    if (values.phone.replace(/\D/g, "").length < 10) errors.phone = "Укажите полный номер телефона.";
    if (values.address.length < 8) errors.address = "Укажите полный адрес доставки.";
    if (!formData.get("consent")) errors.form = "Нужно согласие на обработку данных для оформления заказа.";
    return { values, errors };
  }

  async function submitOrder(event) {
    event.preventDefault();
    clearFormErrors();
    const formData = new FormData(checkoutForm);
    const { values, errors } = validateForm(formData);
    const firstError = Object.keys(errors)[0];

    if (firstError) {
      Object.entries(errors).forEach(([field, message]) => {
        const target = field === "form" ? document.querySelector("[data-form-error]") : document.querySelector(`[data-field-error="${field}"]`);
        if (target) target.textContent = message;
      });
      if (firstError !== "form") checkoutForm.elements[firstError].focus();
      return;
    }

    if (formData.get("company")) return;
    if (!ORDER_ENDPOINT) {
      document.querySelector("[data-form-error]").textContent = "Приём заявок ещё подключается. Пока оформите заказ по телефону 8 900 590-68-53.";
      return;
    }

    const submitButton = checkoutForm.querySelector(".checkout-submit");
    submitButton.disabled = true;
    submitButton.classList.add("is-loading");
    document.querySelector("[data-form-error]").textContent = "";

    try {
      const detailedCart = getDetailedCart();
      const orderNumber = `PT-${Date.now().toString(36).toUpperCase()}`;
      const orderDetails = {
        order_id: orderNumber,
        items: detailedCart.map(({ id, name, price, quantity }) => ({
          id,
          name,
          quantity,
          unit_price_rub: price,
          line_total_rub: price * quantity,
        })),
        package_count: getCartCount(),
        total_rub: getCartCount() * UNIT_PRICE,
        submitted_at: new Date().toISOString(),
        page_url: window.location.href,
      };
      const googleFormData = new URLSearchParams({
        [GOOGLE_FORM_FIELDS.name]: values.name,
        [GOOGLE_FORM_FIELDS.phone]: values.phone,
        [GOOGLE_FORM_FIELDS.address]: values.address,
        [GOOGLE_FORM_FIELDS.order]: JSON.stringify(orderDetails),
      });

      await fetch(ORDER_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        body: googleFormData,
      });

      cart = [];
      saveAndRenderCart();
      checkoutForm.reset();
      document.querySelector("[data-checkout-content]").hidden = true;
      document.querySelector("[data-checkout-success]").hidden = false;
    } catch {
      document.querySelector("[data-form-error]").textContent = "Не получилось отправить заказ. Проверьте интернет или позвоните по номеру 8 900 590-68-53.";
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove("is-loading");
    }
  }

  function clearFormErrors() {
    document.querySelectorAll("[data-field-error], [data-form-error]").forEach((element) => { element.textContent = ""; });
  }

  function resetCheckoutState() {
    clearFormErrors();
    document.querySelector("[data-checkout-content]").hidden = false;
    document.querySelector("[data-checkout-success]").hidden = true;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }
})();
